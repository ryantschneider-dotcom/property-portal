import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildBrokerReviewState,
  buildModificationDeltaPrompt,
  buildNewListingEnrichmentPrompt,
  createModificationReviewDraft,
  createNewListingReviewDraft,
  reviseBrokerReviewDraft,
  type PropertyPortalCloudWriter,
} from "../src/lib/property-portal-ai";

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

test("modification AI draft fetches current listing from property-portal before writing delta", async () => {
  const calls: string[] = [];
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
    fetchImpl: async (url) => {
      calls.push(String(url));
      return Response.json({ slug: "2812-williams-street", content: { saleDescription: "Existing description" } });
    },
    writer,
  });

  assert.equal(calls[0], "https://portal.example.com/api/properties/2812-williams-street");
  assert.equal(draft.kind, "modification");
  assert.equal(draft.status, "ready_for_broker_review");
  assert.deepEqual(draft.structuredUpdates.pricing, { askingPriceRatePerSf: 22, listingPriceVisibility: "per_sf" });
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

test("draft preview helper saves ListingStream draft and explicitly bypasses Ascendix", async () => {
  const { approvePropertyPortalReviewDraft } = await import("../src/lib/property-portal-client");
  const previousToken = process.env.PROPERTY_PORTAL_INTERNAL_TOKEN;
  process.env.PROPERTY_PORTAL_INTERNAL_TOKEN = "test-internal-token";
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
        if (String(url).includes("/broker/intake")) {
          return Response.json({ success: true, slug: "safe-test-preview", uploadedAssetCount: 1 });
        }
        return Response.json({ success: true, save: { success: true, slug: "safe-test-preview" }, result: { publicCollection: "public_listings", publishStatus: "draft", previewUrl: "/properties/safe-test-preview", ascendixBypassed: true }, sync: null, ascendixBypassed: true });
      },
    });

    assert.equal(calls[0].url, "https://portal.example.com/api/broker/intake");
    assert.equal(calls[0].headers.get("x-pier-manager-internal"), "test-internal-token");
    assert.equal(calls[1].url, "https://portal.example.com/api/admin/properties/launch-package");
    assert.equal(calls[1].headers.get("x-pier-manager-internal"), "test-internal-token");
    const launchBody = calls[1].body as Record<string, unknown>;
    assert.equal(launchBody.action, "save-draft");
    assert.equal((launchBody.approvedPayload as Record<string, unknown>).status, "draft");
    assert.equal((launchBody.approvedPayload as Record<string, unknown>).workflowStatus, "draft_preview");
    assert.equal((result.launch.result as Record<string, unknown>).publishStatus, "draft");
    assert.equal(result.ascendix, null);
    assert.equal(result.previewUrl, "https://portal.example.com/properties/safe-test-preview");
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

test("broker listing console uses premium broker hub styling and functional search defaults", async () => {
  const source = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  assert.match(source, /data-testid="broker-hub-premium-header"/);
  assert.match(source, /bg-\[radial-gradient\(circle_at_top_left,rgba\(203,82,30,0\.22\),transparent_34%\),linear-gradient\(135deg,#111827_0%,#172033_58%,#263245_100%\)\]/);
  assert.match(source, /text-white/);
  assert.match(source, /The PIER Big Brain is Working/);
  assert.match(source, /Broker Note/);

  assert.match(source, /data-testid="listing-address-search"/);
  assert.match(source, /Start entering address or property name/);
  assert.match(source, /const \[listingSearchText, setListingSearchText\] = useState\(""\)/);
  assert.doesNotMatch(source, /setSelectedPropertyId\(\(current\) => current \|\| items\[0\]/);
  assert.match(source, /function searchableListingText\(listing: PropertyPortalActiveListing\) \{\n\s+return \[listing\.address, listing\.title/);
  assert.match(source, /The PIER Commercial Big Brain fetches/);
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

test("broker review UI exposes Review Draft, Draft Preview, Publish Live, Revise Draft, assessor fields, and payload preview", async () => {
  const source = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  assert.match(source, /Review Draft/);
  assert.match(source, /Save as Draft & Preview/);
  assert.match(source, /draftPreviewUrl/);
  assert.match(source, /Open Draft Preview/);
  assert.match(source, /Preview URL is ready below/);
  assert.match(source, /Approve & Publish Live/);
  assert.match(source, /Delete Draft/);
  assert.match(source, /Make Live/);
  assert.match(source, /Revise Draft/);
  assert.match(source, /revisionFeedback/);
  assert.match(source, /Assessor Data Review/);
  assert.match(source, /Year Built/);
  assert.match(source, /Total Sq\. Ft\./);
  assert.match(source, /Lot Size/);
  assert.match(source, /Zoning/);
  assert.match(source, /Full data payload preview/);
  assert.match(source, /getDraftReviewChecklist/);
  assert.match(source, /defaultReviewChecklist/);
  assert.match(source, /Editable public-record fields before publish/);
  assert.match(source, /These fields always remain available for manual broker entry/);
});

test("broker review draft has explicit visible panels and does not force publish before revision", async () => {
  const source = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  assert.match(source, /data-testid="review-draft-panel"/);
  assert.match(source, /data-testid="assessor-data-fields"/);
  assert.match(source, /data-testid="review-checklist-panel"/);
  assert.match(source, /data-testid="broker-revise-loop"/);
  assert.match(source, /data-testid="payload-preview"/);
  assert.match(source, /data-testid="final-publish-actions"/);
  assert.match(source, /Plain-text revise loop/);
  assert.match(source, /Final approval after payload review/);
});
