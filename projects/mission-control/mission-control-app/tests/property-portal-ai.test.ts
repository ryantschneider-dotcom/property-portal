import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { interpretBrokerEditRequest, interpretBrokerEditRequestDeterministic } from "../src/lib/broker-edit-interpreter";
import { normalizeIncomingBrokerReviewDraft } from "../src/lib/broker-review-draft-normalizer";
import {
  buildBrokerReviewState,
  buildModificationDeltaPrompt,
  buildNewListingEnrichmentPrompt,
  createModificationReviewDraft,
  createNewListingReviewDraft,
  parseCloudWriterJson,
  reviseBrokerReviewDraft,
  type PropertyPortalCloudWriter,
} from "../src/lib/property-portal-ai";

const deterministicInterpreter = async (currentListing: Record<string, unknown>, instructions: string) => interpretBrokerEditRequestDeterministic(currentListing, instructions);
process.env.OPENAI_API_KEY ||= "test-openai-key";
test("frontier broker-edit-interpreter parses multiline property and location description blocks", async () => {
  const instructions = `Replace the property description and neighborhood description as follow;
Property Description
Newly refeshed 2nd floor office space and two ground level flex/office/storage spaces available for lease at 42 W. Montgomery Cross Road, Savannah, GA. Situated in the vibrant and re-devloping area of metro Savannah, Chatham County, this property offers a central location for businesses seeking a convenient central Savannah address with convenient access to key roadways and local amenities.

The property features three distinct suites, each designed to accommodate a variety of business needs. With flexible leasing options and competitive rates, these spaces are ideal for companies looking to establish or expand their presence in Savannah.

Location Description
Located in the immediate area of dining and shopping.  New apartments, a regional mall, and several power centers are within 1/2 to 1.5 miles of the property.  Re-development continues in the neighborhood due to a shortage of available land and spaces for lease`;

  const result = interpretBrokerEditRequestDeterministic(
    { visibility: { transactionLabel: "For Lease" }, content: { leaseDescription: "Old property copy", locationDescription: "Old location copy" } },
    instructions,
  );

  const content = result.updatePayload.content as Record<string, unknown>;
  assert.equal(
    content.leaseDescription,
    "Newly refeshed 2nd floor office space and two ground level flex/office/storage spaces available for lease at 42 W. Montgomery Cross Road, Savannah, GA. Situated in the vibrant and re-devloping area of metro Savannah, Chatham County, this property offers a central location for businesses seeking a convenient central Savannah address with convenient access to key roadways and local amenities. The property features three distinct suites, each designed to accommodate a variety of business needs. With flexible leasing options and competitive rates, these spaces are ideal for companies looking to establish or expand their presence in Savannah.",
  );
  assert.equal(
    content.locationDescription,
    "Located in the immediate area of dining and shopping. New apartments, a regional mall, and several power centers are within 1/2 to 1.5 miles of the property. Re-development continues in the neighborhood due to a shortage of available land and spaces for lease.",
  );
});

test("broker edit interpreter applies Rent + Utilities across whole lease listing", () => {
  const result = interpretBrokerEditRequestDeterministic(
    {
      visibility: { transactionLabel: "For Lease", leaseActive: true },
      pricing: { rateType: "Modified Gross", leaseType: "Modified Gross", askingPriceRatePerSf: 28 },
      admin: {
        suites: [
          { suiteNumber: "Suite 1", availableSqFt: "1250", baseRent: "28", rentType: "Modified Gross" },
          { suiteNumber: "Suite 2", availableSqFt: "1250", baseRent: "28", rentType: "Modified Gross" },
        ],
      },
    },
    "Change the rent type to Rent + Utilities and keep the $28/SF rate.",
  );

  const pricing = result.updatePayload.pricing as Record<string, unknown>;
  const admin = result.updatePayload.admin as Record<string, unknown>;
  const suites = admin.suites as Record<string, unknown>[];
  assert.equal(pricing.rateType, "Rent + Utilities");
  assert.equal(pricing.leaseType, "Rent + Utilities");
  assert.equal(pricing.askingPriceRatePerSf, 28);
  assert.equal(pricing.leaseRate, "$28/SF Rent + Utilities");
  assert.deepEqual(suites.map((suite) => suite.rentType), ["Rent + Utilities", "Rent + Utilities"]);
});


test("frontier writer polished narrative wins over broker vibe copy unless exact wording is requested", async () => {
  const instruction = "Update the property description to say this is newly refeshed office space in a re-devloping area with good access";
  const fakeFetch = async () => Response.json({
    choices: [{
      message: {
        content: JSON.stringify({
          summary: ["Polished the broker's property-description direction for review."],
          flags: [],
          confidence: "high",
          updatePayload: {
            content: {
              leaseDescription: "Newly refreshed office space in a redeveloping Savannah corridor with convenient access to nearby roadways and amenities.",
            },
          },
        }),
      },
    }],
  });

  const result = await interpretBrokerEditRequest(
    { visibility: { transactionLabel: "For Lease" }, content: { leaseDescription: "Old copy" } },
    instruction,
    { provider: "openai", model: "gpt-4.1", fetchImpl: fakeFetch as typeof fetch, timeoutMs: 2_000 },
  );

  const content = result.updatePayload.content as Record<string, unknown>;
  assert.equal(
    content.leaseDescription,
    "Newly refreshed office space in a redeveloping Savannah corridor with convenient access to nearby roadways and amenities.",
  );
});

test("modification draft uses frontier-polished narrative for broker vibe code before review", async () => {
  const instruction = "Change property description to say newly refeshed office in a re-devloping area with good access";
  const currentListing = { visibility: { transactionLabel: "For Lease" }, content: { leaseDescription: "Old copy" } };
  const writer: PropertyPortalCloudWriter = async () => ({
    title: "42 W. Montgomery Cross Road",
    descriptionHtml: "<p>Review-ready draft.</p>",
    highlights: [],
    structuredUpdates: {
      content: {
        leaseDescription: "Newly refreshed office space in a redeveloping Savannah corridor with convenient access.",
      },
    },
    mediaNotes: [],
  });
  const fetchImpl = async () => Response.json(currentListing);

  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "42-west-montgomery-cross-road",
    instructions: instruction,
    writer,
    fetchImpl: fetchImpl as typeof fetch,
    interpreter: deterministicInterpreter,
  });

  const content = draft.structuredUpdates.content as Record<string, unknown>;
  assert.equal(content.leaseDescription, "Newly refreshed office space in a redeveloping Savannah corridor with convenient access.");
});

test("modification draft preserves exact broker wording only for explicit exact instructions", async () => {
  const instruction = "Put this property description in exactly: Newly refeshed office space in a re-devloping area";
  const currentListing = { visibility: { transactionLabel: "For Lease" }, content: { leaseDescription: "Old copy" } };
  const writer: PropertyPortalCloudWriter = async () => ({
    title: "42 W. Montgomery Cross Road",
    descriptionHtml: "<p>Review-ready draft.</p>",
    highlights: [],
    structuredUpdates: {
      content: {
        leaseDescription: "Newly refreshed office space in a redeveloping area.",
      },
    },
    mediaNotes: [],
  });
  const fetchImpl = async () => Response.json(currentListing);

  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "42-west-montgomery-cross-road",
    instructions: instruction,
    writer,
    fetchImpl: fetchImpl as typeof fetch,
    interpreter: deterministicInterpreter,
  });

  const content = draft.structuredUpdates.content as Record<string, unknown>;
  assert.equal(content.leaseDescription, "Newly refeshed office space in a re-devloping area");
});

test("frontier broker-edit-interpreter fortifies batch rent plus description when LLM summary drops string payload", async () => {
  const instruction = "Change rent to $8 and update description to say it hasn't been rented for years";
  const fakeFetch = async () => Response.json({
    choices: [{
      message: {
        content: JSON.stringify({
          summary: ["Updated asking rent to $8/SF.", "Description updated to say it hasn't been rented for years."],
          flags: [],
          confidence: "high",
          updatePayload: { pricing: { askingPriceRatePerSf: 8, listingPriceVisibility: "per_sf" } },
        }),
      },
    }],
  });

  const result = await interpretBrokerEditRequest(
    { visibility: { transactionLabel: "For Lease" }, content: { saleDescription: "Old copy" }, pricing: { askingPriceRatePerSf: 12 } },
    instruction,
    { provider: "openai", model: "gpt-4.1", fetchImpl: fakeFetch as typeof fetch, timeoutMs: 2_000 },
  );

  const content = result.updatePayload.content as Record<string, unknown>;
  assert.equal((result.updatePayload.pricing as Record<string, unknown>).askingPriceRatePerSf, 8);
  assert.equal(content.leaseDescription, "It hasn't been rented for years.");
  assert.equal(content.saleDescription, "Old copy");
  assert.ok(result.summary.some((item) => /property description|lease description|description/i.test(item)));
});

test("frontier broker-edit prompt requires requested batch strings in updatePayload, not summary only", async () => {
  const fakeFetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const prompt = JSON.stringify(body);
    assert.match(prompt, /Every requested value in a batch command must be present in updatePayload/i);
    assert.match(prompt, /description to say/i);
    assert.match(prompt, /Summary is non-authoritative/i);
    return Response.json({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: ["Updated asking rent and description."],
            flags: [],
            confidence: "high",
            updatePayload: {
              pricing: { askingPriceRatePerSf: 8, listingPriceVisibility: "per_sf" },
              content: { leaseDescription: "It hasn't been rented for years." },
            },
          }),
        },
      }],
    });
  };

  const result = await interpretBrokerEditRequest(
    { visibility: { transactionLabel: "For Lease" }, content: {}, pricing: {} },
    "Change rent to $8 and update description to say it hasn't been rented for years",
    { provider: "openai", model: "gpt-4.1", fetchImpl: fakeFetch as typeof fetch, timeoutMs: 2_000 },
  );
  assert.equal(((result.updatePayload.content as Record<string, unknown>).leaseDescription), "It hasn't been rented for years.");
});

test("frontier broker-edit-interpreter preserves exact suite capitalization h to H", async () => {
  const calls: string[] = [];
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url));
    const body = JSON.parse(String(init?.body ?? "{}"));
    assert.match(JSON.stringify(body), /capitalize/i);
    return Response.json({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: ["Renamed Suite h to H using frontier semantic mapping."],
            flags: [],
            confidence: "high",
            updatePayload: {
              admin: { suites: [{ suiteNumber: "H", availableSqFt: "1200", baseRent: "22", rentType: "NNN" }] },
              pricing: { availableSqFt: 1200, suiteNumbers: "H" },
            },
          }),
        },
      }],
    });
  };

  const result = await interpretBrokerEditRequest(
    { visibility: { transactionLabel: "For Lease" }, admin: { suites: [{ suiteNumber: "h", availableSqFt: "1200", baseRent: "22", rentType: "NNN" }] } },
    "capitalize suite h to H",
    { provider: "openai", model: "gpt-4.1", fetchImpl: fakeFetch as typeof fetch, timeoutMs: 2_000 },
  );

  const suites = ((result.updatePayload.admin as Record<string, unknown>).suites as Array<Record<string, unknown>>);
  assert.equal(calls[0], "https://api.openai.com/v1/chat/completions");
  assert.equal(suites[0].suiteNumber, "H");
});

test("frontier broker-edit-interpreter deletes null-data suite literally named space", async () => {
  const fakeFetch = async () => Response.json({
    choices: [{
      message: {
        content: JSON.stringify({
          summary: ["Removed the null-data suite literally named space."],
          flags: [],
          confidence: "high",
          updatePayload: {
            admin: { suites: [{ suiteNumber: "A", availableSqFt: "1400", baseRent: "24", rentType: "NNN" }] },
            pricing: { availableSqFt: 1400, suiteNumbers: "A" },
          },
        }),
      },
    }],
  });

  const result = await interpretBrokerEditRequest(
    {
      visibility: { transactionLabel: "For Lease" },
      admin: { suites: [
        { suiteNumber: "A", availableSqFt: "1400", baseRent: "24", rentType: "NNN" },
        { suiteNumber: "space", availableSqFt: "", baseRent: "", rentType: "" },
      ] },
    },
    "delete the null-data suite literally named space",
    { provider: "openai", model: "gpt-4.1", fetchImpl: fakeFetch as typeof fetch, timeoutMs: 2_000 },
  );

  const suites = ((result.updatePayload.admin as Record<string, unknown>).suites as Array<Record<string, unknown>>);
  assert.deepEqual(suites.map((suite) => suite.suiteNumber), ["A"]);
});

test("frontier broker-edit-interpreter blocks results that fail exact requested casing", async () => {
  const fakeFetch = async () => Response.json({
    choices: [{
      message: {
        content: JSON.stringify({
          summary: ["Renamed Suite h."],
          flags: [],
          confidence: "high",
          updatePayload: { admin: { suites: [{ suiteNumber: "a", availableSqFt: "1200", baseRent: "22", rentType: "NNN" }] } },
        }),
      },
    }],
  });

  await assert.rejects(
    () => interpretBrokerEditRequest(
      { admin: { suites: [{ suiteNumber: "h", availableSqFt: "1200", baseRent: "22", rentType: "NNN" }] } },
      "capitalize suite h to H",
      { provider: "openai", model: "gpt-4.1", fetchImpl: fakeFetch as typeof fetch, timeoutMs: 2_000 },
    ),
    /expected Suite h to become exact suiteNumber "H"/,
  );
});

test("broker review draft normalizer preserves review rendering for partial graphic-design AI output", () => {
  const draft = normalizeIncomingBrokerReviewDraft(
    {
      kind: "modification",
      title: "12 W State Street",
      description: "Please use the submitted graphic/image direction for the listing media.",
      highlights: "not-an-array",
      mediaNotes: "also-not-an-array",
      review: {
        interpreter: {
          confidence: "unexpected",
          summary: "image-only request",
          flags: "needs human design review",
        },
        deltaPreview: {
          before: null,
          after: "bad-shape",
        },
      },
    },
    { kind: "modification", title: "12 W State Street", sourceInput: { propertyIdOrSlug: "12-w-state-street" } },
  );

  assert.equal(draft.title, "12 W State Street");
  assert.equal(draft.kind, "modification");
  assert.equal(Array.isArray(draft.highlights), true);
  assert.equal(Array.isArray(draft.mediaNotes), true);
  assert.equal(draft.review.interpreter?.confidence, "low");
  assert.deepEqual(draft.review.interpreter?.summary, []);
  assert.deepEqual(draft.review.deltaPreview?.before, {});
  assert.deepEqual(draft.review.deltaPreview?.after, {});
  assert.match(draft.descriptionHtml, /graphic\/image direction|partial draft/i);
  assert.ok(draft.review.checklist.listingStreamReady.includes("Approval controls"));
});

test("missing AI draft still normalizes into a publishable review shell", () => {
  const draft = normalizeIncomingBrokerReviewDraft(undefined, { kind: "modification", title: "Fallback Listing" });

  assert.equal(draft.title, "Fallback Listing");
  assert.equal(draft.status, "ready_for_broker_review");
  assert.equal(draft.publishLive, false);
  assert.match(draft.descriptionHtml, /partial draft/i);
  assert.ok(draft.review.checklist.needsManualInput.length > 0);
});

test("cloud writer parser accepts fenced or prefixed JSON instead of throwing raw parse errors", () => {
  const parsed = parseCloudWriterJson([
    "Here is the draft:",
    "```json",
    JSON.stringify({
      title: "Leased Draft",
      descriptionHtml: "<p>Status updated.</p>",
      highlights: ["Leased"],
      structuredUpdates: { status: "leased" },
      mediaNotes: [],
    }),
    "```",
  ].join("\n"));

  assert.equal(parsed.title, "Leased Draft");
  assert.equal(parsed.structuredUpdates.status, "leased");
});

test("cloud writer parser surfaces clear invalid-json errors", () => {
  assert.throws(
    () => parseCloudWriterJson("not json at all"),
    /Cloud writer returned invalid JSON/,
  );
});

test("ready_for_broker_review wrapper normalizes into visible review draft payload", () => {
  const draft = normalizeIncomingBrokerReviewDraft(
    {
      ready_for_broker_review: {
        kind: "modification",
        title: "12 W State Street",
        descriptionHtml: "<p>Status changed to under contract.</p>",
        structuredUpdates: { status: "under_contract" },
        review: {
          checklist: { listingStreamReady: ["Status flag"] },
        },
      },
    },
    { kind: "modification", title: "Fallback" },
  );

  assert.equal(draft.title, "12 W State Street");
  assert.equal(draft.status, "ready_for_broker_review");
  assert.deepEqual(draft.structuredUpdates, { status: "under_contract" });
  assert.ok(draft.review.checklist.listingStreamReady.includes("Status flag"));
});

test("new listing enrichment prompt requires CCIM-level premium brokerage copy", () => {
  const prompt = buildNewListingEnrichmentPrompt({
    address: "2812 Williams Street, Savannah, GA",
    basicSpecs: "12,000 SF flex industrial building on 1.4 acres",
    priceContext: "$22/SF NNN",
    rawNotes: "New TPO roof in May 2026, contractor office fit, fenced yard.",
  });

  assert.match(prompt, /CCIM-level brokerage/i);
  assert.match(prompt, /professional, data-driven/i);
  assert.match(prompt, /investment or tenant value propositions/i);
  assert.match(prompt, /Return strict JSON/i);
  assert.match(prompt, /premium fully formatted commercial real estate property description/i);
  assert.match(prompt, /spaceType/i);
  assert.match(prompt, /Office|Retail|Industrial|Warehouse|Storage/i);
});

test("new listing AI draft becomes broker review state and never publishes automatically", async () => {
  const writer: PropertyPortalCloudWriter = async () => ({
    title: "Premium Flex Industrial Opportunity | Savannah, GA",
    descriptionHtml: "<p>Premium commercial real estate description.</p>",
    highlights: ["New TPO roof", "Fenced yard", "Contractor-ready layout"],
    structuredUpdates: { content: { saleDescription: "Premium commercial real estate description." } },
    mediaNotes: ["Use uploaded exterior photo as hero."],
  });

  const draft = await createNewListingReviewDraft({
    input: {
      address: "2812 Williams Street, Savannah, GA",
      basicSpecs: "12,000 SF flex industrial building on 1.4 acres",
      priceContext: "$22/SF NNN",
      rawNotes: "New TPO roof in May 2026, contractor office fit, fenced yard.",
    },
    writer,
  });

  assert.equal(draft.kind, "new-listing");
  assert.equal(draft.status, "ready_for_broker_review");
  assert.equal(draft.publishLive, false);
  assert.equal(draft.review.approved, false);
  assert.match(draft.descriptionHtml, /Premium commercial real estate description/);
});

test("new listing draft carries Mack review checklist for enrichment outcomes", async () => {
  const draft = await createNewListingReviewDraft({
    input: {
      addressStreet: "2812 Williams Street",
      city: "Savannah",
      state: "GA",
      county: "Chatham",
      parcelId: "2-0000-00-000",
      propertyType: "Flex",
      transactionType: "Lease",
      neighborhoodDescription: "Close to Truman Parkway and Victory Drive.",
    },
    writer: async () => ({
      title: "Williams Street Flex Opportunity",
      descriptionHtml: "<p>Premium copy generated from broker seeds.</p>",
      highlights: ["Flexible suite layout"],
      structuredUpdates: {
        property: { buildingSizeSf: 12000, zoning: "IL" },
        locationIntelligence: { corridor: "East Savannah", nearbyDrivers: ["Truman Parkway"] },
        reviewFlags: {
          autoFilled: ["Building size", "Zoning", "Corridor context"],
          needsManualInput: ["Confirm parking count"],
          failedScrapes: ["Assessor parking field unavailable"],
          listingStreamReady: ["Required primary fields", "Hero media staged", "Premium marketing copy"],
        },
      },
      mediaNotes: ["Use uploaded hero photo."],
    }),
  });

  assert.deepEqual(draft.review.checklist.autoFilled, ["Building size", "Zoning", "Corridor context"]);
  assert.deepEqual(draft.review.checklist.needsManualInput, ["Confirm parking count"]);
  assert.deepEqual(draft.review.checklist.failedScrapes, ["Assessor parking field unavailable"]);
  assert.deepEqual(draft.review.checklist.listingStreamReady, ["Required primary fields", "Hero media staged", "Premium marketing copy"]);
});

test("modification interpreter mutates structured fields before AI copy refinement", async () => {
  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "2812-williams-street",
    instructions: "Suite 100 is leased. Change Suite 200 rent to $22/SF. Update zoning to IL.",
    baseUrl: "https://portal.example.com",
    interpreter: deterministicInterpreter,
    fetchImpl: async () => Response.json({
      slug: "2812-williams-street",
      visibility: { transactionLabel: "For Lease" },
      pricing: { availableSqFt: 8000, askingPriceRatePerSf: 24, suiteNumbers: "100, 200" },
      property: { zoning: "PUD" },
      content: { leaseDescription: "Existing description" },
      admin: {
        suites: [
          { suiteNumber: "100", availableSqFt: "3000", baseRent: "24", rentType: "NNN" },
          { suiteNumber: "200", availableSqFt: "5000", baseRent: "24", rentType: "NNN" },
        ],
      },
    }),
    writer: async (prompt) => {
      assert.match(prompt, /Removed Suite 100/);
      assert.match(prompt, /Updated zoning to IL/);
      return {
        title: "Updated Listing Draft",
        descriptionHtml: "<p>Suite 200 remains available at the revised asking rate.</p>",
        highlights: ["Suite 200 available"],
        structuredUpdates: { content: { leaseDescription: "Suite 200 remains available at the revised asking rate." } },
        mediaNotes: [],
      };
    },
  });

  assert.equal(draft.review.interpreter?.confidence, "high");
  assert.match(draft.review.interpreter?.summary.join(" ") ?? "", /Removed Suite 100/);
  assert.deepEqual((draft.structuredUpdates.admin as { suites: Array<{ suiteNumber: string; baseRent: string }> }).suites, [
    { suiteNumber: "200", availableSqFt: "5000", baseRent: "22", rentType: "NNN", unpriced: false },
  ]);
  assert.deepEqual(draft.review.deltaPreview?.before.pricing, { availableSqFt: 8000, askingPriceRatePerSf: 24, suiteNumbers: "100, 200" });
  assert.deepEqual(draft.review.deltaPreview?.after.pricing, { availableSqFt: 5000, askingPriceRatePerSf: 22, suiteNumbers: "200", listingPriceVisibility: "per_sf" });
});

test("plain-English add-suite instructions create nested suite rows instead of overwriting parent listing data", async () => {
  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "parrott-plaza",
    instructions: "Add Suite A with 2,400 SF at $22/SF NNN.",
    baseUrl: "https://portal.example.com",
    interpreter: deterministicInterpreter,
    fetchImpl: async () => Response.json({
      slug: "parrott-plaza",
      title: "Parrott Plaza",
      visibility: { transactionLabel: "For Lease" },
      pricing: { availableSqFt: 10000, askingPriceRatePerSf: 24 },
      media: { heroImageUrl: "https://example.com/main-hero.jpg", photos: [{ url: "https://example.com/main-hero.jpg" }] },
      admin: { suites: [{ suiteNumber: "B", availableSqFt: "1600", baseRent: "20", rentType: "Gross", suitePhotos: ["https://example.com/b.jpg"], suiteFloorPlans: [] }] },
    }),
    writer: async (prompt) => {
      assert.match(prompt, /Added Suite A/i);
      return {
        title: "Parrott Plaza",
        descriptionHtml: "<p>Suite A added.</p>",
        highlights: ["Suite A available"],
        structuredUpdates: {},
        mediaNotes: [],
      };
    },
  });

  const admin = draft.structuredUpdates.admin as { suites: Array<Record<string, unknown>> };
  assert.deepEqual(admin.suites, [
    { suiteNumber: "B", availableSqFt: "1600", baseRent: "20", rentType: "Gross", unpriced: false, suitePhotos: ["https://example.com/b.jpg"], suiteFloorPlans: [] },
    { suiteNumber: "A", availableSqFt: "2400", baseRent: "22", rentType: "NNN", unpriced: false, suitePhotos: [], suiteFloorPlans: [] },
  ]);
  assert.equal((draft.structuredUpdates.media as unknown), undefined);
  assert.equal((draft.structuredUpdates.pricing as Record<string, unknown>).availableSqFt, 4000);
  assert.equal((draft.structuredUpdates.pricing as Record<string, unknown>).suiteNumbers, "B, A");
});

test("plain-English suite updates extract explicit Available Sq. Ft. and Rent Rate values", async () => {
  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "parrott-plaza",
    instructions: "Add Suite C. Available Sq. Ft.: 1,900. Rent Rate: $1,900/month plus utilities.",
    baseUrl: "https://portal.example.com",
    interpreter: deterministicInterpreter,
    fetchImpl: async () => Response.json({
      slug: "parrott-plaza",
      title: "Parrott Plaza",
      visibility: { transactionLabel: "For Lease" },
      admin: { suites: [] },
    }),
    writer: async (prompt) => {
      assert.match(prompt, /Available Sq\. Ft\./i);
      assert.match(prompt, /Rent Rate/i);
      return {
        title: "Parrott Plaza",
        descriptionHtml: "<p>Suite C added.</p>",
        highlights: ["Suite C available"],
        structuredUpdates: {},
        mediaNotes: [],
      };
    },
  });

  const suites = (draft.structuredUpdates.admin as { suites: Array<Record<string, unknown>> }).suites;
  assert.equal(suites[0].suiteNumber, "C");
  assert.equal(suites[0].availableSqFt, "1900");
  assert.equal(suites[0].baseRent, "1900");
  assert.equal(suites[0].rentType, "Plus Utilities");
  assert.equal((draft.structuredUpdates.pricing as Record<string, unknown>).availableSqFt, 1900);
  assert.equal((draft.structuredUpdates.pricing as Record<string, unknown>).askingPriceRatePerSf, 1900);
});

test("semantic suite instruction capitalizes suite h to H and self-verifies before delta preview", async () => {
  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "parrott-plaza",
    instructions: "Change suite h to H.",
    baseUrl: "https://portal.example.com",
    interpreter: deterministicInterpreter,
    fetchImpl: async () => Response.json({
      slug: "parrott-plaza",
      visibility: { transactionLabel: "For Lease" },
      pricing: { availableSqFt: 3000, suiteNumbers: "h, P" },
      admin: {
        suites: [
          { suiteNumber: "h", availableSqFt: "1100", baseRent: "1100", rentType: "Monthly" },
          { suiteNumber: "P", availableSqFt: "1900", baseRent: "1900", rentType: "Monthly" },
        ],
      },
    }),
    writer: async (prompt) => {
      assert.match(prompt, /semantically map/i);
      assert.match(prompt, /Change suite h to H/);
      return {
        title: "Parrott Plaza",
        descriptionHtml: "<p>Suite h capitalization corrected.</p>",
        highlights: ["Suite label corrected"],
        structuredUpdates: {},
        mediaNotes: [],
      };
    },
  });

  const suites = (draft.structuredUpdates.admin as { suites: Array<Record<string, unknown>> }).suites;
  assert.deepEqual(suites.map((suite) => suite.suiteNumber), ["H", "P"]);
  assert.equal((draft.structuredUpdates.pricing as Record<string, unknown>).suiteNumbers, "H, P");
  assert.match(draft.review.interpreter?.summary.join(" ") ?? "", /Renamed Suite h to H/i);
  assert.match(JSON.stringify(draft.structuredUpdates.reviewFlags), /Autonomous revision QA passed/);
  assert.deepEqual(((draft.review.deltaPreview?.after.admin as { suites: Array<Record<string, unknown>> }).suites).map((suite) => suite.suiteNumber), ["H", "P"]);
});

test("semantic suite instruction removes mistaken no-data suite without low confidence", async () => {
  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "parrott-plaza",
    instructions: "Remove the suite put in by mistake with no data.",
    baseUrl: "https://portal.example.com",
    interpreter: deterministicInterpreter,
    fetchImpl: async () => Response.json({
      slug: "parrott-plaza",
      visibility: { transactionLabel: "For Lease" },
      pricing: { availableSqFt: 3000, suiteNumbers: "M, space, P" },
      admin: {
        suites: [
          { suiteNumber: "M", availableSqFt: "1100", baseRent: "1100", rentType: "Monthly" },
          { suiteNumber: "space", availableSqFt: "", baseRent: "", rentType: "" },
          { suiteNumber: "P", availableSqFt: "1900", baseRent: "1900", rentType: "Monthly" },
        ],
      },
    }),
    writer: async (prompt) => {
      assert.match(prompt, /current property-portal listing payload/i);
      assert.match(prompt, /semantic/i);
      return {
        title: "Parrott Plaza",
        descriptionHtml: "<p>Mistaken no-data suite removed.</p>",
        highlights: ["Suite stack cleaned"],
        structuredUpdates: {},
        mediaNotes: [],
      };
    },
  });

  assert.notEqual(draft.review.interpreter?.confidence, "low");
  const suites = (draft.structuredUpdates.admin as { suites: Array<Record<string, unknown>> }).suites;
  assert.deepEqual(suites.map((suite) => suite.suiteNumber), ["M", "P"]);
  assert.equal((draft.structuredUpdates.pricing as Record<string, unknown>).availableSqFt, 3000);
  assert.equal((draft.structuredUpdates.pricing as Record<string, unknown>).suiteNumbers, "M, P");
  assert.match(draft.review.interpreter?.summary.join(" ") ?? "", /semantically removed Suite space/i);
  assert.match(JSON.stringify(draft.structuredUpdates.reviewFlags), /Autonomous revision QA passed/);
});

test("partial suite use-type updates preserve unmentioned suites", async () => {
  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "parrott-plaza",
    instructions: "Change the use type on Suite M to storage.",
    baseUrl: "https://portal.example.com",
    interpreter: deterministicInterpreter,
    fetchImpl: async () => Response.json({
      slug: "parrott-plaza",
      visibility: { transactionLabel: "For Lease" },
      pricing: { availableSqFt: 3000, suiteNumbers: "M, P" },
      admin: {
        suites: [
          { suiteNumber: "M", availableSqFt: "1100", baseRent: "1100", rentType: "Monthly", spaceType: "Office/Retail" },
          { suiteNumber: "P", availableSqFt: "1900", baseRent: "1900", rentType: "Monthly", spaceType: "Office/Retail" },
        ],
      },
    }),
    writer: async () => ({
      title: "Parrott Plaza",
      descriptionHtml: "<p>Suite M use type updated.</p>",
      highlights: ["Suite M storage use"],
      structuredUpdates: {
        admin: {
          suites: [
            { suiteNumber: "M", spaceType: "Storage" },
          ],
        },
      },
      mediaNotes: [],
    }),
  });

  const suites = (draft.structuredUpdates.admin as { suites: Array<Record<string, unknown>> }).suites;
  assert.deepEqual(suites.map((suite) => suite.suiteNumber), ["M", "P"]);
  assert.deepEqual(suites, [
    { suiteNumber: "M", availableSqFt: "1100", baseRent: "1100", rentType: "Monthly", spaceType: "Storage", unpriced: false },
    { suiteNumber: "P", availableSqFt: "1900", baseRent: "1900", rentType: "Monthly", spaceType: "Office/Retail", unpriced: false },
  ]);
  assert.equal((draft.structuredUpdates.pricing as Record<string, unknown>).suiteNumbers, "M, P");
  assert.equal((draft.structuredUpdates.pricing as Record<string, unknown>).availableSqFt, 3000);
});

test("plain-English suite instructions extract architectural space type into nested suite rows", async () => {
  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "parrott-plaza",
    instructions: "Add Suite D as a warehouse storage suite with 4,000 SF at $12/SF NNN.",
    baseUrl: "https://portal.example.com",
    interpreter: deterministicInterpreter,
    fetchImpl: async () => Response.json({
      slug: "parrott-plaza",
      title: "Parrott Plaza",
      visibility: { transactionLabel: "For Lease" },
      admin: { suites: [] },
    }),
    writer: async (prompt) => {
      assert.match(prompt, /spaceType/i);
      return {
        title: "Parrott Plaza",
        descriptionHtml: "<p>Suite D added.</p>",
        highlights: ["Suite D available"],
        structuredUpdates: {},
        mediaNotes: [],
      };
    },
  });

  const suites = (draft.structuredUpdates.admin as { suites: Array<Record<string, unknown>> }).suites;
  assert.equal(suites[0].suiteNumber, "D");
  assert.equal(suites[0].spaceType, "Warehouse");
});

test("plain-English status changes produce ListingStream status fields before AI copy refinement", async () => {
  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "12-west-state-street",
    instructions: "Change this property to Leased.",
    baseUrl: "https://portal.example.com",
    interpreter: deterministicInterpreter,
    fetchImpl: async () => Response.json({
      slug: "12-west-state-street",
      title: "12 West State Street",
      visibility: { transactionLabel: "For Lease" },
      content: { leaseDescription: "Existing lease copy." },
    }),
    writer: async (prompt) => {
      assert.match(prompt, /status-only change/i);
      assert.match(prompt, /statusBadgeLabel/i);
      assert.match(prompt, /data\.leased/i);
      return {
        title: "12 West State Street",
        descriptionHtml: "",
        highlights: [],
        structuredUpdates: {},
        mediaNotes: [],
      };
    },
  });

  assert.equal(draft.review.interpreter?.confidence, "medium");
  assert.equal(draft.structuredUpdates.status, "leased");
  assert.equal(draft.structuredUpdates.statusBadgeLabel, "Leased");
  assert.equal(draft.structuredUpdates.leased, true);
  assert.equal(draft.structuredUpdates.sold, false);
  assert.equal(draft.structuredUpdates.underContract, false);
  assert.deepEqual(draft.structuredUpdates.visibility, {
    status: "leased",
    leaseActive: true,
    saleActive: false,
    listingStatus: "leased",
    availabilityStatus: "leased",
    transactionStatus: "leased",
    dealStatus: "leased",
    statusBadgeLabel: "Leased",
    statusLabel: "Leased",
    leased: true,
    sold: false,
    underContract: false,
  });
  assert.equal((draft.review.deltaPreview?.after as Record<string, unknown>).status, "leased");
});



test("plain-English archive modification creates high-confidence lifecycle review without cloud writer", async () => {
  let writerCalled = false;
  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "3-mall-ter",
    instructions: "remove this listing and archive it",
    baseUrl: "https://portal.example.com",
    interpreter: deterministicInterpreter,
    fetchImpl: async () => Response.json({
      slug: "3-mall-ter",
      title: "3 Mall Ter",
      content: { saleDescription: "Existing description" },
      visibility: { transactionLabel: "For Sale" },
    }),
    writer: async () => {
      writerCalled = true;
      throw new Error("writer should not be called for lifecycle-only archive requests");
    },
  });

  assert.equal(writerCalled, false);
  assert.equal(draft.review.interpreter?.confidence, "high");
  assert.equal(draft.review.interpreter?.lifecycleAction, "archive");
  assert.deepEqual(draft.structuredUpdates.lifecycle, { action: "archive", requestedByPlainEnglish: true });
  assert.match(draft.title, /Archive Listing: 3 Mall Ter/);
});

test("polite archive and removal instructions remain high-confidence lifecycle requests", async () => {
  const { interpretBrokerEditRequestDeterministic } = await import("../src/lib/broker-edit-interpreter");
  for (const instructions of [
    "please remove this listing and archive it",
    "please take this listing down and archive it",
    "pull this property from the live site",
    "delist this listing from public listings",
  ]) {
    const result = interpretBrokerEditRequestDeterministic({ title: "3 Mall Ter", visibility: { transactionLabel: "For Sale" } }, instructions);
    assert.equal(result.confidence, "high", instructions);
    assert.equal(result.lifecycleAction, "archive", instructions);
    assert.deepEqual(result.updatePayload.lifecycle, { action: "archive", requestedByPlainEnglish: true });
  }
});

test("suite removal or replacement instructions do not become archive lifecycle requests", async () => {
  const { interpretBrokerEditRequestDeterministic } = await import("../src/lib/broker-edit-interpreter");
  const result = interpretBrokerEditRequestDeterministic(
    {
      title: "Parrott Plaza",
      visibility: { transactionLabel: "For Lease" },
      admin: { suites: [{ suiteNumber: "P", availableSqFt: "1900", baseRent: "1900", rentType: "Monthly" }] },
    },
    "Remove Suite P and add Suite Q. Available Sq. Ft.: 2,100. Rent Rate: $2,100/month.",
  );

  assert.equal(result.lifecycleAction, undefined);
  assert.equal((result.updatePayload.lifecycle as unknown), undefined);
  assert.equal(((result.updatePayload.admin as Record<string, unknown>).suites as Array<Record<string, unknown>>).some((suite) => suite.suiteNumber === "Q"), true);
});


test("pier-manager copy names ListingStream backend instead of deprecated property-portal payload", async () => {
  const source = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  assert.match(source, /wired directly to the ListingStream backend/i);
  assert.doesNotMatch(source, /current property-portal payload/i);
  assert.doesNotMatch(source, /loaded from property-portal|active property-portal listings|Select active property-portal listing/i);
});

test("modification delta prompt includes current listing payload and broker instruction only", () => {
  const prompt = buildModificationDeltaPrompt({
    currentListing: {
      slug: "2812-williams-street",
      content: { saleDescription: "Old roof language." },
      pricing: { askingPriceRatePerSf: 24 },
    },
    instructions: "Remove old roof language, add new TPO roof, and drop asking rate to $22/SF.",
  });

  assert.match(prompt, /current property-portal listing payload/i);
  assert.match(prompt, /plain-text broker instruction/i);
  assert.match(prompt, /update specs/i);
  assert.match(prompt, /flag media changes/i);
  assert.match(prompt, /drop asking rate to \$22\/SF/i);
});

test("modification prompt prohibits Call fallback and requires suite preservation unless explicitly removed", () => {
  const prompt = buildModificationDeltaPrompt({
    currentListing: { title: "Parrott Plaza", admin: { suites: [{ suiteNumber: "M", baseRent: "Call" }] } },
    instructions: "Update Suite M. Available Sq. Ft.: 1,900. Rent Rate: $1,900/month.",
    deterministicResult: {
      summary: ["Updated Suite M."],
      flags: [],
      confidence: "high",
      updatePayload: { admin: { suites: [{ suiteNumber: "M", availableSqFt: "1900", baseRent: "1900", rentType: "Monthly" }] } },
    },
  } as Parameters<typeof buildModificationDeltaPrompt>[0] & { deterministicResult: unknown });

  assert.match(prompt, /Call\" fallback is strictly prohibited/i);
  assert.match(prompt, /preserve every existing suite not explicitly mentioned/i);
  assert.match(prompt, /Only omit\/delete suite rows when the broker explicitly says/i);
  assert.match(prompt, /Rent Rate: \$1,900\/month/i);
});

test("deterministic suite parser overwrites duplicated AI suite arrays and preserves explicit pricing", async () => {
  const currentListing = {
    title: "Parrott Plaza",
    admin: {
      suites: [
        { suiteNumber: "M", availableSqFt: "1800", baseRent: "Call", rentType: "NNN", suitePhotos: ["https://example.com/m.jpg"], suiteFloorPlans: [] },
        { suiteNumber: "N", availableSqFt: "2200", baseRent: "24", rentType: "NNN", suitePhotos: [], suiteFloorPlans: [] },
      ],
    },
  };
  const writer: PropertyPortalCloudWriter = async () => ({
    title: "Parrott Plaza",
    descriptionHtml: "",
    highlights: [],
    structuredUpdates: { admin: { suites: [
      { suiteNumber: "M", availableSqFt: "1800", baseRent: "Call" },
      { suiteNumber: "M", availableSqFt: "1900", baseRent: "Call" },
    ] } },
    mediaNotes: [],
  });

  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "parrott-plaza",
    instructions: "Update Suite M. Available Sq. Ft.: 1,900. Rent Rate: $1,900/month.",
    baseUrl: "https://portal.example.com",
    interpreter: deterministicInterpreter,
    fetchImpl: async () => Response.json(currentListing),
    writer,
  });

  const suites = (draft.structuredUpdates as any).admin.suites;
  assert.equal(suites.filter((suite: any) => suite.suiteNumber === "M").length, 1);
  assert.equal(suites.find((suite: any) => suite.suiteNumber === "M").availableSqFt, "1900");
  assert.equal(suites.find((suite: any) => suite.suiteNumber === "M").baseRent, "1900");
  assert.equal(suites.find((suite: any) => suite.suiteNumber === "M").rentType, "NNN");
  assert.equal(suites.find((suite: any) => suite.suiteNumber === "M").unpriced, false);
});


test("modification AI draft fetches current listing from property-portal before writing delta", async () => {
  const previousInternalToken = process.env.PROPERTY_PORTAL_INTERNAL_TOKEN;
  process.env.PROPERTY_PORTAL_INTERNAL_TOKEN = "test-internal-token";
  const calls: Array<{ url: string; headers: HeadersInit | undefined }> = [];
  const writer: PropertyPortalCloudWriter = async (prompt) => {
    assert.match(prompt, /Existing description/);
    return {
      title: "Updated Listing Draft",
      descriptionHtml: "<p>Updated with the new TPO roof and revised rate.</p>",
      highlights: ["New TPO roof", "$22/SF asking rate"],
      structuredUpdates: { pricing: { askingPriceRatePerSf: 22 } },
      mediaNotes: ["Attach uploaded roof warranty document."],
    };
  };

  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "2812-williams-street",
    instructions: "Add new TPO roof and drop asking rate to $22/SF.",
    baseUrl: "https://portal.example.com",
    interpreter: deterministicInterpreter,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), headers: init?.headers });
      return Response.json({ slug: "2812-williams-street", content: { saleDescription: "Existing description" } });
    },
    writer,
  });

  assert.match(calls[0].url, /^https:\/\/portal\.example\.com\/api\/properties\/2812-williams-street\?fresh=\d+$/);
  assert.equal((calls[0].headers as Record<string, string>)["x-pier-manager-internal"], "test-internal-token");
  process.env.PROPERTY_PORTAL_INTERNAL_TOKEN = previousInternalToken;
  assert.equal(draft.kind, "modification");
  assert.equal(draft.status, "ready_for_broker_review");
  assert.deepEqual(draft.structuredUpdates.pricing, { askingPriceRatePerSf: 22, listingPriceVisibility: "per_sf" });
});

test("broker revise loop strips lease-listing public clutter from AI revisions", async () => {
  const initial = buildBrokerReviewState({
    kind: "new-listing",
    sourceInput: { address: "340 Eisenhower Drive" },
    writerResult: {
      title: "Initial Draft",
      descriptionHtml: "<p>Initial description.</p>",
      highlights: ["Initial"],
      structuredUpdates: {},
      mediaNotes: [],
    },
  });

  const revised = await reviseBrokerReviewDraft({
    draft: initial,
    feedback: "This is a listing for lease. Remove flood zone, past sales, parcel ID, building size, structured facts, deal drivers, and market context.",
    writer: async () => ({
      title: "1,250–2,500 SF Professional Office Suites for Lease",
      descriptionHtml: "<p>Two suites are available for lease.</p>",
      highlights: ["Two suites available", "FEMA Flood Zone X", "Last sale was $1,400,000"],
      structuredUpdates: {
        content: {
          leaseDescription: "Two suites are available for lease.",
          marketContext: "Savannah office market paragraph.",
        },
        property: { parcelId: "2049006009", buildingSize: "10,000 SF building", floodZone: "FEMA Flood Zone X" },
        structuredFacts: { floodZone: "Flood Zone X", parcelId: "2049006009" },
        nearbyAnchors: [{ name: "County Office" }],
        dealDrivers: ["Market stat"],
        marketContext: "Long market context.",
        visibility: { saleActive: true },
      },
      mediaNotes: [],
    }),
  });

  const serialized = JSON.stringify({
    title: revised.title,
    descriptionHtml: revised.descriptionHtml,
    highlights: revised.highlights,
    structuredUpdates: revised.structuredUpdates,
  });
  assert.doesNotMatch(serialized, /Flood|FEMA|2049006009|10,000 SF building|1,400,000|Last sale/i);
  assert.deepEqual(revised.structuredUpdates.transactionTypes, ["lease"]);
  assert.equal((revised.structuredUpdates.visibility as Record<string, unknown>).leaseActive, true);
  assert.equal((revised.structuredUpdates.visibility as Record<string, unknown>).saleActive, false);
  assert.deepEqual(revised.structuredUpdates.structuredFacts, {});
  assert.deepEqual(revised.structuredUpdates.nearbyAnchors, []);
  assert.deepEqual(revised.structuredUpdates.dealDrivers, []);
  assert.deepEqual(revised.highlights, ["Two suites available"]);
});

test("broker revise loop sends existing draft plus feedback back through AI", async () => {
  const initial = buildBrokerReviewState({
    kind: "new-listing",
    sourceInput: { address: "2812 Williams Street" },
    writerResult: {
      title: "Initial Draft",
      descriptionHtml: "<p>Initial description.</p>",
      highlights: ["Initial"],
      structuredUpdates: {},
      mediaNotes: [],
    },
  });

  const revised = await reviseBrokerReviewDraft({
    draft: initial,
    feedback: "Make the tenant value proposition stronger and mention fenced yard.",
    writer: async (prompt) => {
      assert.match(prompt, /Make the tenant value proposition stronger/i);
      assert.match(prompt, /Initial description/i);
      return {
        title: "Revised Draft",
        descriptionHtml: "<p>Revised description with stronger tenant value proposition.</p>",
        highlights: ["Fenced yard"],
        structuredUpdates: { content: { saleDescription: "Revised description with stronger tenant value proposition." } },
        mediaNotes: [],
      };
    },
  });

  assert.equal(revised.title, "Revised Draft");
  assert.equal(revised.review.revisionCount, 1);
  assert.equal(revised.publishLive, false);
});

test("approve helper executes true ListingStream publish path and bypasses WordPress", async () => {
  const { approvePropertyPortalReviewDraft } = await import("../src/lib/property-portal-client");
  const calls: Array<{ url: string; body: unknown }> = [];

  const result = await approvePropertyPortalReviewDraft({
    baseUrl: "https://portal.example.com",
    draft: buildBrokerReviewState({
      kind: "modification",
      sourceInput: { slug: "2812-williams-street" },
      writerResult: {
        title: "Approved Draft",
        descriptionHtml: "<p>Approved description.</p>",
        highlights: ["Approved"],
        structuredUpdates: { slug: "2812-williams-street", content: { saleDescription: "Approved description." } },
        mediaNotes: [],
      },
    }),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      if (String(url).includes("/launch-package")) return Response.json({ success: true, save: { success: true, slug: "2812-williams-street" }, result: { publicCollection: "public_listings", publishStatus: "published" }, sync: { success: true, listingStatus: "Active", dealStatus: "Open" } });
      throw new Error(`Unexpected URL ${url}`);
    },
  });

  assert.equal(calls[0].url, "https://portal.example.com/api/admin/properties/launch-package");
  assert.equal((calls[0].body as Record<string, unknown>).slug, "2812-williams-street");
  assert.equal((calls[0].body as Record<string, unknown>).action, "publish-live");
  assert.equal(((calls[0].body as Record<string, unknown>).approvedPayload as Record<string, unknown>).workflowStatus, "approved");
  assert.deepEqual(calls.map((call) => call.url).filter((url) => /wordpress|wp-json|wp\/v2/i.test(url)), []);
  const launchPayload = result.launch.result as Record<string, unknown>;
  assert.equal(launchPayload.publicCollection, "public_listings");
  assert.equal(result.ascendix?.success, true);
});

test("approve helper publishes status-change payload through ListingStream launch-package", async () => {
  const { approvePropertyPortalReviewDraft } = await import("../src/lib/property-portal-client");
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];

  const result = await approvePropertyPortalReviewDraft({
    baseUrl: "https://portal.example.com",
    draft: buildBrokerReviewState({
      kind: "modification",
      sourceInput: { propertyIdOrSlug: "12-west-state-street" },
      currentListing: { slug: "12-west-state-street", title: "12 West State Street", visibility: { transactionLabel: "For Lease" } },
      writerResult: {
        title: "12 West State Street",
        descriptionHtml: "",
        highlights: [],
        structuredUpdates: {
          status: "leased",
          statusBadgeLabel: "Leased",
          leased: true,
          sold: false,
          underContract: false,
          visibility: { status: "leased", statusBadgeLabel: "Leased", leased: true, sold: false, underContract: false },
        },
        mediaNotes: [],
      },
    }),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({ success: true, save: { success: true, slug: "12-west-state-street", id: "12-west-state-street" }, result: { previewUrl: "/preview/12-west-state-street" }, sync: null });
    },
  });

  const approvedPayload = calls[0].body.approvedPayload as Record<string, unknown>;
  assert.equal(calls[0].url, "https://portal.example.com/api/admin/properties/launch-package");
  assert.equal(calls[0].body.action, "publish-live");
  assert.equal(approvedPayload.status, "leased");
  assert.equal(approvedPayload.statusBadgeLabel, "Leased");
  assert.equal(approvedPayload.leased, true);
  assert.equal((approvedPayload.visibility as Record<string, unknown>).status, "leased");
  assert.equal(result.save.success, true);
});

test("draft preview helper saves ListingStream draft and explicitly bypasses Ascendix", async () => {
  const { approvePropertyPortalReviewDraft } = await import("../src/lib/property-portal-client");
  const previousToken = process.env.PROPERTY_PORTAL_INTERNAL_TOKEN;
  process.env.PROPERTY_PORTAL_INTERNAL_TOKEN = "dummy";
  const calls: Array<{ url: string; headers: Headers; body: Record<string, unknown> | FormData | null }> = [];

  try {
    const result = await approvePropertyPortalReviewDraft({
      mode: "draft-preview",
      baseUrl: "https://portal.example.com",
      assets: [new File(["hero"], "hero.jpg", { type: "image/jpeg" })],
      draft: buildBrokerReviewState({
        kind: "new-listing",
        sourceInput: { slug: "safe-test-preview" },
        writerResult: {
          title: "Safe Test Preview",
          descriptionHtml: "<p>Draft-only preview.</p>",
          highlights: ["Draft only"],
          structuredUpdates: { slug: "safe-test-preview", content: { saleDescription: "Draft-only preview." } },
          mediaNotes: [],
        },
      }),
      fetchImpl: async (url, init) => {
        const headers = new Headers(init?.headers);
        const body = init?.body instanceof FormData ? init.body : init?.body ? JSON.parse(String(init.body)) : null;
        calls.push({ url: String(url), headers, body });
        return Response.json({ success: true, save: { success: true, slug: "safe-test-preview" }, result: { publicCollection: "public_listings", publishStatus: "draft", previewUrl: "/properties/safe-test-preview", ascendixBypassed: true }, sync: null, ascendixBypassed: true });
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://portal.example.com/api/admin/properties/launch-package");
    assert.equal(calls[0].headers.get("x-pier-manager-internal"), "dummy");
    const launchBody = calls[0].body as Record<string, unknown>;
    assert.equal(launchBody.action, "save-draft");
    assert.equal((launchBody.approvedPayload as Record<string, unknown>).status, "draft");
    assert.equal((launchBody.approvedPayload as Record<string, unknown>).workflowStatus, "draft_preview");
    assert.equal((result.launch.result as Record<string, unknown>).publishStatus, "draft");
    assert.equal(result.ascendix, null);
    assert.equal(result.previewUrl, "https://portal.example.com/preview/safe-test-preview");
  } finally {
    if (previousToken === undefined) delete process.env.PROPERTY_PORTAL_INTERNAL_TOKEN;
    else process.env.PROPERTY_PORTAL_INTERNAL_TOKEN = previousToken;
  }
});

test("draft lifecycle helper can delete draft or make it live through explicit actions", async () => {
  const { changePropertyPortalDraftLifecycle } = await import("../src/lib/property-portal-client");
  const calls: Array<Record<string, unknown>> = [];

  await changePropertyPortalDraftLifecycle({
    baseUrl: "https://portal.example.com",
    propertyIdOrSlug: "safe-test-preview",
    action: "delete-draft",
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      return Response.json({ success: true, result: { publishStatus: "deleted" }, sync: null, ascendixBypassed: true });
    },
  });

  await changePropertyPortalDraftLifecycle({
    baseUrl: "https://portal.example.com",
    propertyIdOrSlug: "safe-test-preview",
    action: "make-live",
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      return Response.json({ success: true, result: { publishStatus: "published" }, sync: { success: true } });
    },
  });

  assert.equal(calls[0].action, "delete-draft");
  assert.equal(calls[1].action, "make-live");
});


test("approve helper surfaces ListingStream and Ascendix transient failures clearly", async () => {
  const { approvePropertyPortalReviewDraft } = await import("../src/lib/property-portal-client");

  await assert.rejects(
    approvePropertyPortalReviewDraft({
      baseUrl: "https://portal.example.com",
      draft: buildBrokerReviewState({
        kind: "new-listing",
        sourceInput: { slug: "rate-limited-listing" },
        writerResult: {
          title: "Rate Limited Draft",
          descriptionHtml: "<p>Approved description.</p>",
          highlights: [],
          structuredUpdates: { slug: "rate-limited-listing" },
          mediaNotes: [],
        },
      }),
      fetchImpl: async () => Response.json({ error: "Firestore rate limit while publishing to public_listings" }, { status: 429 }),
    }),
    /temporarily unreachable|rate limit|ListingStream/i,
  );
});

test("Mission Control login submits password with Enter key through a form", async () => {
  const source = await readFile("src/app/login/page.tsx", "utf8");

  assert.match(source, /async function handleLogin\(event\?: FormEvent<HTMLFormElement>\)/);
  assert.match(source, /event\?\.preventDefault\(\)/);
  assert.match(source, /<form[^>]*onSubmit=\{handleLogin\}/);
  assert.match(source, /type="submit"/);
  assert.doesNotMatch(source, /onClick=\{handleLogin\}/);
});

test("broker listing console uses premium broker hub styling and functional search defaults", async () => {
  const source = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  assert.match(source, /data-testid="broker-hub-premium-header"/);
  assert.match(source, /bg-\[radial-gradient\(circle_at_top_left,rgba\(203,82,30,0\.22\),transparent_34%\),linear-gradient\(135deg,#111827_0%,#172033_58%,#263245_100%\)\]/);
  assert.match(source, /text-white/);
  assert.match(source, /The PIER Big Brain is Working/);
  assert.match(source, /Broker Note/);

  assert.match(source, /data-testid="listing-picker-panel"/);
  assert.match(source, /data-testid="listing-filter-input"/);
  assert.match(source, /Type to filter, or scroll the full property list below/);
  assert.match(source, /const \[listingSearchText, setListingSearchText\] = useState\(""\)/);
  assert.doesNotMatch(source, /setListingSearchText\(\(current\) => current \|\|/);
  assert.match(source, /function searchableListingText\(listing: PropertyPortalActiveListing\) \{\n\s+return \[listing\.address, listing\.title/);
  assert.match(source, /Generate Revised Listing Draft/);
  assert.match(source, /The PIER Commercial Big Brain is wired directly to the ListingStream backend/);
  assert.doesNotMatch(source, /Generate AI Delta Draft/);
  assert.doesNotMatch(source, /Hermes fetches/);
});

test("broker listing console flows headers then explanatory cards before functional forms", async () => {
  const source = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  const headerIndex = source.indexOf('data-testid="broker-hub-premium-header"');
  const workingIndex = source.indexOf("The PIER Big Brain is Working");
  const noteIndex = source.indexOf("Broker Note");
  const intakeIndex = source.indexOf("New Listing Intake");
  const modificationIndex = source.indexOf("Existing Listing Modification");

  assert.notEqual(headerIndex, -1);
  assert.notEqual(workingIndex, -1);
  assert.notEqual(noteIndex, -1);
  assert.notEqual(intakeIndex, -1);
  assert.notEqual(modificationIndex, -1);
  assert.ok(headerIndex < workingIndex, "premium header should render before explanatory cards");
  assert.ok(workingIndex < intakeIndex, "explanatory cards should render before intake form");
  assert.ok(noteIndex < modificationIndex, "broker note should render before modification form");
});

test("broker review UI exposes Mack checklist and before/after delta review", async () => {
  const source = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  assert.match(source, /Review Checklist/);
  assert.match(source, /Auto-filled/);
  assert.match(source, /Needs manual input/);
  assert.match(source, /Failed \/ blocked scrapes/);
  assert.match(source, /ListingStream-ready/);
  assert.match(source, /Before \/ After Delta/);
  assert.match(source, /Interpreter Confidence/);
});

test("broker review UI exposes Review Draft, Draft Preview, Publish Live, Revise Draft, assessor fields, and no raw payload preview", async () => {
  const source = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  assert.match(source, /Review Draft/);
  assert.match(source, /Save as Draft & Preview/);
  assert.match(source, /draftPreviewUrl/);
  assert.match(source, /View Draft Preview/);
  assert.match(source, /Open the clickable Draft Preview link below/);
  assert.match(source, /Approve & Publish Live/);
  assert.match(source, /Delete Draft/);
  assert.match(source, /Make Live/);
  assert.match(source, /Delete Listing/);
  assert.match(source, /runListingLifecycle\("delete-property"\)/);
  assert.match(source, /ListingStream cache is clear/);
  assert.match(source, /Remove<\/button>/);
  assert.match(source, /removeSuite\(index\)/);
  assert.match(source, /Revise Draft/);
  assert.match(source, /revisionFeedback/);
  assert.match(source, /Assessor Data Review/);
  assert.match(source, /Year Built/);
  assert.match(source, /Total Sq\. Ft\./);
  assert.match(source, /Lot Size/);
  assert.match(source, /Zoning/);
  assert.doesNotMatch(source, /Full data payload preview/);
  assert.doesNotMatch(source, /data-testid="payload-preview"/);
  assert.match(source, /getDraftReviewChecklist/);
  assert.match(source, /defaultReviewChecklist/);
  assert.match(source, /Editable public-record fields before publish/);
  assert.match(source, /These fields always remain available for manual broker entry/);
});

test("broker review UI rasterizes PDF floor plans client-side before upload/transit", async () => {
  const source = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  assert.match(source, /import\("pdfjs-dist"\)/);
  assert.match(source, /PDFJS_WORKER_VERSION\s*=\s*"6\.0\.227"/);
  assert.match(source, /GlobalWorkerOptions\.workerSrc\s*=/);
  assert.match(source, /unpkg\.com\/pdfjs-dist@\$\{PDFJS_WORKER_VERSION\}\/[\s\S]*build\/pdf\.worker\.mjs/);
  assert.match(source, /configurePdfJsWorker\(pdfjs\)/);
  assert.match(source, /safePdfJsTeardown/);
  assert.match(source, /resources\.page[\s\S]*cleanup\?\.\(\)/);
  assert.match(source, /resources\.loadingTask[\s\S]*destroy\?\.\(\)/);
  assert.match(source, /console\.warn\("Ignored PDF\.js cleanup failure after successful floor plan render"/);
  assert.match(source, /finally \{[\s\S]*await safePdfJsTeardown\(\{ page, pdf, loadingTask \}\);[\s\S]*\}/);
  assert.match(source, /document\.createElement\("canvas"\)/);
  assert.match(source, /context\.fillStyle\s*=\s*"#fff"/);
  assert.match(source, /annotationMode:\s*pdfjs\.AnnotationMode\?\.ENABLE_FORMS/);
  assert.match(source, /assertCanvasHasVisiblePdfContent\(canvas\)/);
  assert.match(source, /canvas\.toBlob\([\s\S]*"image\/jpeg"/);
  assert.match(source, /uploadClientFloorPlanImageViaMissionControl/);
  assert.match(source, /fetch\("\/api\/listingstream\/client-floorplan-upload"/);
  assert.match(source, /formData\.set\("file", file\)/);
  assert.match(source, /suiteFloorPlans:\s*\[/);
  assert.match(source, /prepareClientSideSuiteFloorPlanImages\(\{ draft: reviewDraft, assets: stagedAssets/);
  assert.doesNotMatch(source, /import\("firebase\/storage"\)/);
  assert.doesNotMatch(source, /uploadBytes\(/);
  assert.doesNotMatch(source, /formData\.append\("assets", asset\).*pdf/i);
});

test("broker review UI compresses draft preview media before posting to Vercel approval route", async () => {
  const source = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  assert.match(source, /MAX_DRAFT_PREVIEW_UPLOAD_BYTES/);
  assert.match(source, /compressImageForDraftPreview/);
  assert.match(source, /createImageBitmap/);
  assert.match(source, /prepareDraftPreviewAssets\(assetsForApi, mode\)/);
  assert.match(source, /Skipped oversized extras/);
});

test("all roles hide raw JSON payload preview and see clean delta summaries", async () => {
  const pageSource = await readFile("src/app/pier-manager/page.tsx", "utf8");
  const source = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  assert.match(pageSource, /getAuthSession/);
  assert.match(pageSource, /userRole=\{session\?\.role \?\? "broker"\}/);
  assert.match(source, /export function PierManagerListingConsole\(\{ userRole, activeBrokerId = "ryan" \}: \{ userRole: AuthRole; activeBrokerId\?: string \}\)/);
  assert.match(source, /data-testid="delta-summary-list"/);
  assert.doesNotMatch(source, /data-testid="delta-raw-json"/);
  assert.doesNotMatch(source, /data-testid="payload-preview"/);
});

test("publish buttons expose clear success feedback and live publish clears review state", async () => {
  const source = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  assert.match(source, /data-testid="publish-success-banner"/);
  assert.match(source, /Success! Modifications have been published and will be live on the website shortly\./);
  assert.match(source, /Success! Draft preview saved/);
  assert.match(source, /Draft URL:/);
  assert.match(source, /setReviewDraft\(null\)/);
  assert.match(source, /setModificationInstructions\(""\)/);
});

test("broker review draft has explicit visible panels and does not force publish before revision", async () => {
  const source = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  assert.match(source, /data-testid="review-draft-panel"/);
  assert.match(source, /visibleReviewDraft \? \(/);
  assert.match(source, /ref=\{reviewPanelRef\}/);
  assert.match(source, /ref=\{finalPublishActionsRef\}/);
  assert.match(source, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
  assert.match(source, /Generating Draft\.\.\. Please Wait/);
  assert.match(source, /aria-busy=\{modificationSubmitting\}/);
  assert.match(source, /data-testid="assessor-data-fields"/);
  assert.match(source, /data-testid="review-checklist-panel"/);
  assert.match(source, /data-testid="broker-revise-loop"/);
  assert.doesNotMatch(source, /data-testid="payload-preview"/);
  assert.match(source, /data-testid="final-publish-actions"/);
  assert.match(source, /Plain-text revise loop/);
  assert.match(source, /Final approval after payload review/);
});
