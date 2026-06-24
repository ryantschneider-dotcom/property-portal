import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

import {
  buildPortalFormData,
  buildPropertyPortalApprovedPayload,
  buildPropertyPortalDraftPreviewPath,
  buildPropertyPortalUrl,
  fetchPropertyPortalActiveListings,
  getMinimalIntakeMissingFields,
  normalizePropertyPortalDraftPreviewUrl,
  sanitizeListingStreamJsonTransitPayload,
  submitPropertyPortalListingModification,
  type MinimalListingIntakeInput,
} from "../src/lib/property-portal-client";
import { getListingRevisionValidationError } from "../src/lib/pier-manager-form-decoupling";

test("minimal listing intake requires only address, basic specs, price context, and raw notes", () => {
  const complete: MinimalListingIntakeInput = {
    address: "2812 Williams Street, Savannah, GA",
    basicSpecs: "12,000 SF flex building on 1.4 acres",
    priceContext: "$22/SF NNN",
    rawNotes: "Great visibility, updated roof, ideal contractor office.",
  };

  assert.deepEqual(getMinimalIntakeMissingFields(complete), []);
  assert.deepEqual(getMinimalIntakeMissingFields({ ...complete, address: "" }), ["address"]);
  assert.deepEqual(getMinimalIntakeMissingFields({ ...complete, basicSpecs: "" }), ["basicSpecs"]);
  assert.deepEqual(getMinimalIntakeMissingFields({ ...complete, priceContext: "", unpriced: true }), []);
});

test("batch modification payload preserves media, description, rent, and suite CRUD in one Firestore update", () => {
  const existingPhoto = "https://firebasestorage.googleapis.com/v0/b/listingstream/o/existing-front.jpg?alt=media&token=old";
  const keptPhoto = "https://firebasestorage.googleapis.com/v0/b/listingstream/o/existing-side.jpg?alt=media&token=keep";
  const newPhoto = "https://firebasestorage.googleapis.com/v0/b/listingstream/o/new-hero.jpg?alt=media&token=new";
  const payload = buildPropertyPortalApprovedPayload({
    mode: "draft-preview",
    slug: "batch-smoke-listing",
    draft: {
      kind: "modification",
      title: "Batch Smoke Listing",
      descriptionHtml: "Updated batch smoke description for the mobile ListingStream view.",
      highlights: [],
      sourceInput: { propertyIdOrSlug: "batch-smoke-listing", instructions: "Add a new photo, remove the old front photo, update the description, set Suite A rent to $24/SF NNN, delete Suite B, and add Suite C at 1,500 SF for $18/SF NNN." },
      currentListing: {
        slug: "batch-smoke-listing",
        title: "Batch Smoke Listing",
        content: { saleDescription: "Original description", saleBullets: ["Keep this bullet"] },
        pricing: { leaseRate: 19, ratePerSf: 19, hiddenPriceLabel: null },
        media: {
          heroImageUrl: existingPhoto,
          images: [
            { id: "old-front", urls: { original: existingPhoto, large: existingPhoto } },
            { id: "keep-side", urls: { original: keptPhoto, large: keptPhoto } },
          ],
        },
        admin: {
          suites: [
            { suiteNumber: "A", availableSqFt: "1200", baseRent: "19", rentType: "NNN", monthlyBaseRent: "legacy-preserved" },
            { suiteNumber: "B", availableSqFt: "900", baseRent: "17", rentType: "NNN" },
          ],
        },
      },
      structuredUpdates: {
        content: { saleDescription: "Updated batch smoke description for the mobile ListingStream view." },
        media: {
          heroImageUrl: newPhoto,
          images: [
            { id: "keep-side", urls: { original: keptPhoto, large: keptPhoto } },
            { id: "new-hero", urls: { original: newPhoto, large: newPhoto } },
          ],
          photos: [
            { id: "keep-side", url: keptPhoto },
            { id: "new-hero", url: newPhoto },
          ],
        },
        admin: {
          suites: [
            { suiteNumber: "A", availableSqFt: "1200", baseRent: "24", rentType: "NNN", monthlyBaseRent: "legacy-preserved" },
            { suiteNumber: "C", availableSqFt: "1500", baseRent: "18", rentType: "NNN" },
          ],
        },
        pricing: { leaseRate: 24, ratePerSf: 24, askingPriceRatePerSf: 24, hiddenPriceLabel: null },
      },
    },
  }) as Record<string, any>;

  assert.equal(payload.content.saleDescription, "Updated batch smoke description for the mobile ListingStream view.");
  assert.deepEqual(payload.content.saleBullets, ["Keep this bullet"]);
  assert.equal(payload.pricing.leaseRate, 24);
  assert.equal(payload.pricing.ratePerSf, 24);
  assert.notEqual(payload.pricing.hiddenPriceLabel, "Call for Rate");
  const imageUrls = JSON.stringify(payload.media.images);
  assert.match(imageUrls, /new-hero/);
  assert.match(imageUrls, /existing-side/);
  assert.doesNotMatch(imageUrls, /existing-front/);
  const suites = payload.admin.suites;
  assert.deepEqual(suites.map((suite: Record<string, unknown>) => suite.suiteNumber), ["A", "C"]);
  assert.equal(suites[0].baseRent, 24);
  assert.equal(suites[0].monthlyBaseRent, "legacy-preserved");
  assert.equal(suites[1].availableSqFt, "1500");
  assert.equal(suites[1].baseRent, 18);
});

test("modification interpreter merge keeps writer suite additions when deterministic suite update only captures the first suite", async () => {
  const { createModificationReviewDraft } = await import("../src/lib/property-portal-ai");
  const currentListing = {
    slug: "batch-smoke-listing",
    title: "Batch Smoke Listing",
    admin: { suites: [{ suiteNumber: "A", availableSqFt: "1200", baseRent: "19", rentType: "NNN", monthlyBaseRent: "legacy-preserved" }, { suiteNumber: "B", availableSqFt: "900", baseRent: "17", rentType: "NNN" }] },
  };
  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "batch-smoke-listing",
    instructions: "Change Suite A to $24/SF NNN, delete Suite B, and add Suite C at 1,500 SF for $18/SF NNN.",
    fetchImpl: async () => Response.json(currentListing),
    interpreter: async () => ({
      summary: ["Updated Suite A and deleted Suite B."],
      flags: [],
      confidence: "high",
      updatePayload: { admin: { suites: [{ suiteNumber: "A", baseRent: "24", rentType: "NNN" }] }, pricing: { leaseRate: 24 } },
    }),
    writer: async () => ({
      title: "Batch Smoke Listing",
      descriptionHtml: "",
      highlights: [],
      mediaNotes: [],
      structuredUpdates: { admin: { suites: [{ suiteNumber: "A", baseRent: "24", rentType: "NNN" }, { suiteNumber: "C", availableSqFt: "1500", baseRent: "18", rentType: "NNN" }] } },
    }),
  });
  const suites = ((draft.structuredUpdates.admin as Record<string, any>).suites as Record<string, unknown>[]);
  assert.deepEqual(suites.map((suite) => suite.suiteNumber), ["A", "C"]);
  assert.equal(suites[0].monthlyBaseRent, "legacy-preserved");
  assert.equal(suites[1].baseRent, "18");
});

test("new listing intake form data stays review-only and carries minimal broker payload", async () => {
  const formData = buildPortalFormData({
    payload: {
      mode: "minimal-intake",
      address: "2812 Williams Street, Savannah, GA",
      basicSpecs: "12,000 SF flex building",
      priceContext: "$22/SF NNN",
      rawNotes: "New TPO roof in May 2026.",
      unpriced: false,
    },
    assets: [new File(["photo"], "front.jpg", { type: "image/jpeg" })],
  });

  const payload = JSON.parse(String(formData.get("payload")));
  assert.equal(payload.mode, "minimal-intake");
  assert.equal(payload.reviewOnly, true);
  assert.equal(payload.publishLive, false);
  assert.equal(payload.address, "2812 Williams Street, Savannah, GA");
  assert.equal(formData.getAll("assets").length, 1);
});

test("ListingStream URL builder ignores stale deprecated property-portal env values", () => {
  const previousListingStream = process.env.LISTINGSTREAM_PORTAL_BASE_URL;
  const previousNextPublicListingStream = process.env.NEXT_PUBLIC_LISTINGSTREAM_PORTAL_BASE_URL;
  const previousPropertyPortal = process.env.PROPERTY_PORTAL_BASE_URL;
  const previousNextPublicPropertyPortal = process.env.NEXT_PUBLIC_PROPERTY_PORTAL_BASE_URL;
  delete process.env.LISTINGSTREAM_PORTAL_BASE_URL;
  delete process.env.NEXT_PUBLIC_LISTINGSTREAM_PORTAL_BASE_URL;
  process.env.PROPERTY_PORTAL_BASE_URL = "https://broker.piercommercial.com";
  process.env.NEXT_PUBLIC_PROPERTY_PORTAL_BASE_URL = "https://property-portal.example.com";
  try {
    assert.equal(
      buildPropertyPortalUrl("/api/broker/active-listings"),
      "https://listingstream-portal.vercel.app/api/broker/active-listings",
    );
  } finally {
    if (previousListingStream == null) delete process.env.LISTINGSTREAM_PORTAL_BASE_URL;
    else process.env.LISTINGSTREAM_PORTAL_BASE_URL = previousListingStream;
    if (previousNextPublicListingStream == null) delete process.env.NEXT_PUBLIC_LISTINGSTREAM_PORTAL_BASE_URL;
    else process.env.NEXT_PUBLIC_LISTINGSTREAM_PORTAL_BASE_URL = previousNextPublicListingStream;
    if (previousPropertyPortal == null) delete process.env.PROPERTY_PORTAL_BASE_URL;
    else process.env.PROPERTY_PORTAL_BASE_URL = previousPropertyPortal;
    if (previousNextPublicPropertyPortal == null) delete process.env.NEXT_PUBLIC_PROPERTY_PORTAL_BASE_URL;
    else process.env.NEXT_PUBLIC_PROPERTY_PORTAL_BASE_URL = previousNextPublicPropertyPortal;
  }
});

test("property-portal URL builder targets portal backend paths without WordPress", () => {
  assert.equal(
    buildPropertyPortalUrl("/api/broker/active-listings", "https://portal.example.com/"),
    "https://portal.example.com/api/broker/active-listings",
  );
  assert.doesNotMatch(buildPropertyPortalUrl("api/broker/intake", "https://portal.example.com"), /wordpress|wp-json|wp-admin/i);
});

test("draft preview URL builder targets the dedicated preview route", () => {
  assert.equal(buildPropertyPortalDraftPreviewPath("12-west-state-street"), "/preview/12-west-state-street");
  assert.equal(
    normalizePropertyPortalDraftPreviewUrl("/properties/12-west-state-street", "https://broker.piercommercial.com"),
    "https://broker.piercommercial.com/preview/12-west-state-street",
  );
  assert.equal(
    normalizePropertyPortalDraftPreviewUrl("https://broker.piercommercial.com/properties/12-west-state-street", "https://broker.piercommercial.com"),
    "https://broker.piercommercial.com/preview/12-west-state-street",
  );
});

test("new-listing approval payload binds intake manual coordinates as the map override", () => {
  const payload: any = buildPropertyPortalApprovedPayload({
    mode: "publish-live",
    slug: "0-bush-road-smoke",
    draft: {
      kind: "new-listing",
      title: "0 Bush Road",
      descriptionHtml: "Raw land positioned near Scott Stell Park with I-95 access.",
      highlights: ["Manual intake coordinates provided"],
      sourceInput: { addressStreet: "0 Bush Road", parcelId: "11026 02007", latitude: "32.043014", longitude: "-81.294012" },
      structuredUpdates: {
        title: "0 Bush Road",
        location: { lat: 0, lng: 0, source: "placeholder" },
        property: { parcelId: "11026 02007" },
      },
    },
  });

  assert.equal(payload.useManualCoordinates, true);
  assert.equal(payload.manualLatitude, 32.043014);
  assert.equal(payload.manualLongitude, -81.294012);
  assert.deepEqual(payload.manualCoordinates, { enabled: true, lat: 32.043014, lng: -81.294012, source: "pier-manager-intake" });
  assert.equal(payload.location.lat, 32.043014);
  assert.equal(payload.location.lng, -81.294012);
  assert.equal(payload.location.source, "manual-intake-override");
});

test("modification approval payload preserves canonical title, media, and unchanged fields", () => {
  const payload: any = buildPropertyPortalApprovedPayload({
    mode: "draft-preview",
    slug: "12-west-state-street",
    draft: {
      kind: "modification",
      title: "AI-drafted listing review",
      descriptionHtml: "",
      highlights: [],
      sourceInput: { propertyIdOrSlug: "12-west-state-street" },
      currentListing: {
        slug: "12-west-state-street",
        title: "12 W State Street",
        media: { heroImageUrl: "https://cdn.example.com/hero.jpg", images: [{ url: "https://cdn.example.com/hero.jpg" }] },
        content: { saleTitle: "12 W State Street", saleDescription: "Existing public copy.", saleBullets: ["Historic downtown location"] },
        pricing: { salePriceDollars: 1200000 },
        property: { buildingSizeSf: 6400 },
      },
      structuredUpdates: {
        status: "under_contract",
        media: {},
        content: {},
        propertyStatus: "under_contract",
      },
    },
  });

  assert.equal(payload.title, "12 W State Street");
  assert.deepEqual(payload.media, { heroImageUrl: "https://cdn.example.com/hero.jpg", images: [{ url: "https://cdn.example.com/hero.jpg" }] });
  assert.deepEqual(payload.pricing, { salePriceDollars: 1200000 });
  assert.deepEqual(payload.property, { buildingSizeSf: 6400 });
  assert.equal((payload.content as Record<string, unknown>).saleTitle, "12 W State Street");
  assert.equal((payload.content as Record<string, unknown>).saleDescription, "Existing public copy.");
  assert.equal(payload.workflowStatus, "draft_preview");
});

test("modification approval payload derives lease pricing from edited admin suites and removes omitted suites", () => {
  const payload: any = buildPropertyPortalApprovedPayload({
    mode: "publish-live",
    slug: "ui-sandbox-test-asset",
    draft: {
      kind: "modification",
      title: "AI-drafted listing review",
      descriptionHtml: "",
      highlights: [],
      sourceInput: { propertyIdOrSlug: "ui-sandbox-test-asset" },
      currentListing: {
        slug: "ui-sandbox-test-asset",
        title: "UI Sandbox Test Asset",
        visibility: { leaseActive: true, saleActive: false },
        pricing: { askingPriceRatePerSf: 18, leaseRatePerSf: 18, rateType: "NNN", leaseRateUnit: "annual" },
        admin: {
          suites: [
            { suiteNumber: "100", availableSqFt: "1,900", baseRent: "18", rentType: "NNN" },
            { suiteNumber: "200", availableSqFt: "2,100", baseRent: "19", rentType: "NNN" },
          ],
        },
      },
      structuredUpdates: {
        admin: {
          suites: [
            { suiteNumber: "100", availableSqFt: "1,900", baseRent: "22", rentType: "NNN" },
          ],
        },
      },
    },
  });

  assert.equal(payload.admin.suites.length, 1);
  assert.equal(payload.admin.suites[0].suiteNumber, "100");
  assert.equal(payload.admin.suites[0].baseRent, 22);
  assert.equal(payload.admin.suites[0].ratePerSf, 22);
  assert.equal(payload.pricing.askingPriceRatePerSf, 22);
  assert.equal(payload.pricing.leaseRatePerSf, 22);
  assert.equal(payload.visibility.leaseActive, true);
  assert.equal(payload.visibility.saleActive, false);
});

test("modification approval payload lets edited suite rent override stale canonical pricing", () => {
  const payload: any = buildPropertyPortalApprovedPayload({
    mode: "draft-preview",
    slug: "ui-sandbox-test-asset",
    draft: {
      kind: "modification",
      title: "AI-drafted listing review",
      descriptionHtml: "Property details coming soon.",
      highlights: [],
      sourceInput: { propertyIdOrSlug: "ui-sandbox-test-asset" },
      currentListing: {
        slug: "ui-sandbox-test-asset",
        title: "UI Sandbox Test Asset",
        content: { saleDescription: "Existing sandbox copy." },
        pricing: { askingPriceRatePerSf: 19, leaseRatePerSf: 19, rateType: "NNN", leaseRateUnit: "annual" },
        admin: { suites: [{ suiteNumber: "100", availableSqFt: "1,900", baseRent: "19", rentType: "NNN" }] },
      },
      structuredUpdates: {
        pricing: { askingPriceRatePerSf: 19, leaseRatePerSf: 19, rateType: "NNN", leaseRateUnit: "annual" },
        admin: { suites: [{ suiteNumber: "100", availableSqFt: "1,900", baseRent: "$9.00", rentType: "NNN" }] },
      },
    },
  });

  assert.equal(payload.admin.suites[0].baseRent, 9);
  assert.equal(payload.pricing.askingPriceRatePerSf, 9);
  assert.equal(payload.pricing.leaseRatePerSf, 9);
  assert.equal((payload.content as Record<string, unknown>).saleDescription, "Existing sandbox copy.");
});

test("ListingStream JSON transit sanitizer preserves content description keys read by preview", () => {
  const sanitized = sanitizeListingStreamJsonTransitPayload({
    slug: "ui-sandbox-test-asset",
    content: {
      saleDescription: "Enriched Review Draft copy that ListingStream preview must read.",
      leaseDescription: "Lease copy also stays nested for ListingStream normalization.",
      data: "unsafe nested payload should be stripped",
    },
    data: "unsafe root payload should be stripped",
    rawFile: "unsafe file payload should be stripped",
  }) as Record<string, any>;

  assert.equal(sanitized.content.saleDescription, "Enriched Review Draft copy that ListingStream preview must read.");
  assert.equal(sanitized.content.leaseDescription, "Lease copy also stays nested for ListingStream normalization.");
  assert.equal(sanitized.content.data, undefined);
  assert.equal(sanitized.data, undefined);
  assert.equal(sanitized.rawFile, undefined);
});

test("modification approval payload binds Review Draft descriptionHtml into Firestore payload", () => {
  const enrichedDescription = "<p>Newly enriched Big Brain copy with frontage, access, and tenant-ready positioning.</p>";
  const payload: any = buildPropertyPortalApprovedPayload({
    mode: "draft-preview",
    slug: "ui-sandbox-test-asset",
    draft: {
      kind: "modification",
      title: "AI-drafted listing review",
      descriptionHtml: enrichedDescription,
      highlights: [],
      sourceInput: { propertyIdOrSlug: "ui-sandbox-test-asset" },
      currentListing: {
        slug: "ui-sandbox-test-asset",
        title: "UI Sandbox Test Asset",
        content: { saleDescription: "Property details coming soon." },
        saleDescription: "Property details coming soon.",
      },
      structuredUpdates: {
        pricing: { leaseRatePerSf: 18, askingPriceRatePerSf: 18 },
      },
    },
  });

  assert.equal((payload.content as Record<string, unknown>).saleDescription, enrichedDescription);
  assert.equal((payload.content as Record<string, unknown>).leaseDescription, enrichedDescription);
  assert.equal((payload.content as Record<string, unknown>).descriptionHtml, enrichedDescription);
  assert.equal(payload.saleDescription, enrichedDescription);
  assert.equal(payload.leaseDescription, enrichedDescription);
  assert.equal(payload.descriptionHtml, enrichedDescription);
  assert.notEqual(payload.saleDescription, "Property details coming soon.");
});

test("modification approval payload persists explicit description updates instead of fallback copy", () => {
  const payload: any = buildPropertyPortalApprovedPayload({
    mode: "draft-preview",
    slug: "ui-sandbox-test-asset",
    draft: {
      kind: "modification",
      title: "AI-drafted listing review",
      descriptionHtml: "Property details coming soon.",
      highlights: [],
      sourceInput: { propertyIdOrSlug: "ui-sandbox-test-asset" },
      currentListing: {
        slug: "ui-sandbox-test-asset",
        title: "UI Sandbox Test Asset",
        content: { saleDescription: "Existing public copy." },
      },
      structuredUpdates: {
        content: { saleDescription: "Broker-edited sandbox description that must persist." },
      },
    },
  });

  assert.equal((payload.content as Record<string, unknown>).saleDescription, "Broker-edited sandbox description that must persist.");
});

test("modification approval with suite rent plus property photo keeps upload as parent hero media", async () => {
  const { approvePropertyPortalReviewDraft } = await import("../src/lib/property-portal-client");
  const calls: Array<{ url: string; body: Record<string, any> }> = [];
  const heroUrl = "https://firebasestorage.googleapis.com/v0/b/listingstream/o/property-intake%2Fui-sandbox-test-asset%2Fhero.jpg?alt=media&token=safe123";

  await approvePropertyPortalReviewDraft({
    baseUrl: "https://portal.example.com",
    mode: "draft-preview",
    assets: [new File(["hero-bytes"], "hero.jpg", { type: "image/jpeg" })],
    uploadStagedImage: async (file, options) => ({
      url: heroUrl,
      path: `property-intake/ui-sandbox-test-asset/${options.index}-${file.name}`,
      contentType: file.type,
      size: file.size,
      originalName: file.name,
    }),
    draft: {
      kind: "modification",
      title: "AI-drafted listing review",
      descriptionHtml: "Property details coming soon.",
      highlights: [],
      sourceInput: { propertyIdOrSlug: "ui-sandbox-test-asset", instructions: "Change Suite 100 rent to $9.00 NNN and update the hero photo." },
      currentListing: {
        slug: "ui-sandbox-test-asset",
        media: { heroImageUrl: "https://cdn.example.com/old-hero.jpg" },
        admin: { suites: [{ suiteNumber: "100", availableSqFt: "1,900", baseRent: "19", rentType: "NNN" }] },
      },
      structuredUpdates: {
        admin: { suites: [{ suiteNumber: "100", availableSqFt: "1,900", baseRent: "$9.00", rentType: "NNN" }] },
      },
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({ success: true, result: { previewUrl: "/preview/ui-sandbox-test-asset" } });
    },
  });

  const approvedPayload = calls.find((call) => call.url.endsWith("/api/admin/properties/launch-package"))?.body.approvedPayload as Record<string, any>;
  assert.equal(approvedPayload.media.heroImageUrl, heroUrl);
  assert.equal(approvedPayload.admin.suites[0].baseRent, 9);
  assert.equal(approvedPayload.admin.suites[0].suitePhotos, undefined);
});

test("modification approval payload maps monthly suite rent to monthly pricing fields", () => {
  const payload: any = buildPropertyPortalApprovedPayload({
    mode: "publish-live",
    slug: "ui-sandbox-test-asset",
    draft: {
      kind: "modification",
      title: "AI-drafted listing review",
      descriptionHtml: "",
      highlights: [],
      sourceInput: { propertyIdOrSlug: "ui-sandbox-test-asset" },
      currentListing: { slug: "ui-sandbox-test-asset", title: "UI Sandbox Test Asset", pricing: { askingPriceRatePerSf: 18 } },
      structuredUpdates: {
        admin: { suites: [{ suiteNumber: "A", availableSqFt: "1,900", baseRent: "$1,900", rentType: "Monthly" }] },
      },
    },
  });

  assert.equal(payload.admin.suites[0].monthlyRate, 1900);
  assert.equal(payload.admin.suites[0].monthlyBaseRent, 1900);
  assert.equal(payload.pricing.monthlyRate, 1900);
  assert.equal(payload.pricing.monthlyRent, 1900);
  assert.equal(payload.pricing.leaseRateUnit, "monthly");
});

test("modification approval payload preserves property use across root and nested ListingStream fields", () => {
  const payload: any = buildPropertyPortalApprovedPayload({
    mode: "draft-preview",
    slug: "42-w-montgomery-cross-road",
    draft: {
      kind: "modification",
      title: "AI-drafted listing review",
      descriptionHtml: "",
      highlights: [],
      sourceInput: { propertyIdOrSlug: "42-w-montgomery-cross-road" },
      currentListing: {
        slug: "42-w-montgomery-cross-road",
        title: "42 W Montgomery Cross Road",
        propertyType: "Office",
        category: "Office",
        type: "Office",
        listingType: "Office",
        property: { propertyType: "Office", type: "Office", category: "Office", buildingSizeSf: 11000 },
        content: { leaseTitle: "42 W Montgomery Cross Road" },
      },
      structuredUpdates: {
        propertyType: "Office / Storage",
        category: "Office / Storage",
        property: { type: "Office / Storage" },
        content: { leaseDescription: "Updated mixed office/storage positioning." },
      },
    },
  });

  assert.equal(payload.propertyType, "Office / Storage");
  assert.equal(payload.category, "Office / Storage");
  assert.equal(payload.type, "Office / Storage");
  assert.equal(payload.listingType, "Office / Storage");
  assert.equal((payload.property as Record<string, unknown>).propertyType, "Office / Storage");
  assert.equal((payload.property as Record<string, unknown>).type, "Office / Storage");
  assert.equal((payload.property as Record<string, unknown>).category, "Office / Storage");
  assert.equal((payload.property as Record<string, unknown>).buildingSizeSf, 11000);
});

test("approved status-change payload preserves ListingStream lifecycle status fields", () => {
  const payload: any = buildPropertyPortalApprovedPayload({
    mode: "publish-live",
    slug: "12-west-state-street",
    draft: {
      kind: "modification",
      title: "AI-drafted listing review",
      descriptionHtml: "",
      highlights: [],
      sourceInput: { propertyIdOrSlug: "12-west-state-street" },
      currentListing: {
        slug: "12-west-state-street",
        title: "12 W State Street",
        status: "active",
        visibility: { transactionLabel: "For Lease" },
        content: { saleTitle: "12 W State Street", leaseDescription: "Existing public copy." },
      },
      structuredUpdates: {
        status: "leased",
        statusBadgeLabel: "Leased",
        leased: true,
        sold: false,
        underContract: false,
        visibility: {
          status: "leased",
          statusBadgeLabel: "Leased",
          leased: true,
          sold: false,
          underContract: false,
        },
      },
    },
  });

  assert.equal(payload.status, "leased");
  assert.equal(payload.statusBadgeLabel, "Leased");
  assert.equal(payload.leased, true);
  assert.equal(payload.sold, false);
  assert.equal(payload.underContract, false);
  assert.equal((payload.visibility as Record<string, unknown>).status, "leased");
  assert.equal((payload.visibility as Record<string, unknown>).statusBadgeLabel, "Leased");
  assert.equal((payload.visibility as Record<string, unknown>).leased, true);
  assert.equal(payload.workflowStatus, "approved");
  assert.equal(payload.publishStatus, undefined);
});

test("modification approval payload rejects normalizer fallback warnings and invalid media", () => {
  const canonicalMedia = {
    heroImageUrl: "https://storage.googleapis.com/listingstream-e0a2f.firebasestorage.app/property-intake/12-west-state-street/hero.jpeg",
    images: [
      {
        id: "hero",
        title: "IMG_3722.jpeg",
        urls: {
          original: "https://storage.googleapis.com/listingstream-e0a2f.firebasestorage.app/property-intake/12-west-state-street/hero.jpeg",
          full: "https://storage.googleapis.com/listingstream-e0a2f.firebasestorage.app/property-intake/12-west-state-street/hero.jpeg",
        },
      },
    ],
  };

  const payload: any = buildPropertyPortalApprovedPayload({
    mode: "draft-preview",
    slug: "12-west-state-street",
    draft: {
      kind: "modification",
      title: "AI-drafted listing review",
      descriptionHtml: "<p>The AI returned a partial draft. Review the fields below, revise if needed, then save a draft preview or publish live.</p>",
      highlights: [],
      currentListing: {
        slug: "12-west-state-street",
        title: "12 West State Street",
        media: canonicalMedia,
        content: {
          saleTitle: "12 West State Street",
          saleDescription: "Existing broker-approved sale description.",
          saleBullets: ["650 SF building on 0.06-acre site"],
        },
        property: {
          buildingSizeSf: 650,
          lotSizeAcres: 0.06,
          yearBuilt: 1824,
          zoning: "D-CBD",
          parcelId: "20004 44003",
          propertyClass: "344 - Office Building",
        },
      },
      structuredUpdates: {
        media: {
          heroImageUrl: "IMG_3722.jpeg",
          images: [{ title: "IMG_3722.jpeg", url: "IMG_3722.jpeg" }],
        },
        property: {
          buildingSizeSf: "",
          lotSizeAcres: null,
          yearBuilt: undefined,
          zoning: "",
          parcelId: "",
        },
      },
    },
  });

  assert.equal((payload.content as Record<string, unknown>).saleDescription, "Existing broker-approved sale description.");
  assert.deepEqual(payload.media, canonicalMedia);
  assert.deepEqual(payload.property, {
    buildingSizeSf: 650,
    lotSizeAcres: 0.06,
    yearBuilt: 1824,
    zoning: "D-CBD",
    parcelId: "20004 44003",
    propertyClass: "344 - Office Building",
  });
});

test("modification approval payload preserves nested property facts when applying partial nested updates", () => {
  const payload: any = buildPropertyPortalApprovedPayload({
    mode: "draft-preview",
    slug: "12-west-state-street",
    draft: {
      kind: "modification",
      title: "12 West State Street",
      descriptionHtml: "",
      highlights: [],
      currentListing: {
        title: "12 West State Street",
        property: {
          buildingSizeSf: 650,
          lotSizeAcres: 0.06,
          yearBuilt: 1824,
          zoning: "D-CBD",
          parcelId: "20004 44003",
        },
      },
      structuredUpdates: {
        property: {
          category: "Retail",
          zoning: "",
        },
      },
    },
  });

  assert.deepEqual(payload.property, {
    buildingSizeSf: 650,
    lotSizeAcres: 0.06,
    yearBuilt: 1824,
    zoning: "D-CBD",
    parcelId: "20004 44003",
    category: "Retail",
  });
});

test("modification approval payload overwrites suite array instead of carrying stale duplicates", () => {
  const payload: any = buildPropertyPortalApprovedPayload({
    mode: "draft-preview",
    slug: "parrott-plaza",
    draft: {
      kind: "modification",
      title: "Parrott Plaza",
      descriptionHtml: "",
      highlights: [],
      currentListing: {
        title: "Parrott Plaza",
        admin: { suites: [
          { suiteNumber: "M", availableSqFt: "1800", baseRent: "Call" },
          { suiteNumber: "N", availableSqFt: "2200", baseRent: "24" },
        ] },
      },
      structuredUpdates: {
        admin: { suites: [
          { suiteNumber: "M", availableSqFt: "1900", baseRent: "1900", rentType: "Monthly", unpriced: false },
          { suiteNumber: "N", availableSqFt: "2200", baseRent: "24" },
        ] },
      },
    },
  });

  assert.equal(payload.admin.suites.length, 2);
  assert.equal(payload.admin.suites.filter((suite: any) => suite.suiteNumber === "M").length, 1);
  assert.equal(payload.admin.suites.find((suite: any) => suite.suiteNumber === "M").baseRent, "1900");
});


test("active-listing proxy code normalizes legacy preview links to dedicated preview route", async () => {
  const source = await readFile("src/app/api/listingstream/active-listings/route.ts", "utf8");
  assert.match(source, /normalizePropertyPortalDraftPreviewUrl/);
});

test("active listing dropdown data is fetched directly from property-portal backend", async () => {
  const calls: string[] = [];
  const listings = await fetchPropertyPortalActiveListings({
    baseUrl: "https://portal.example.com",
    fetchImpl: async (url) => {
      calls.push(String(url));
      return Response.json({
        items: [
          {
            id: "abc123",
            slug: "2812-williams-street-savannah-ga",
            title: "2812 Williams Street",
            address: "2812 Williams Street, Savannah, GA",
            transactionLabel: "For Lease",
          },
        ],
      });
    },
  });

  assert.equal(calls[0], "https://portal.example.com/api/broker/active-listings");
  assert.equal(listings[0].slug, "2812-williams-street-savannah-ga");
  assert.equal(listings[0].title, "2812 Williams Street");
});

test("listing modification submits selected listing, plain-text instructions, and assets", async () => {
  const capturedUrls: string[] = [];
  const capturedBodies: BodyInit[] = [];

  await submitPropertyPortalListingModification({
    baseUrl: "https://portal.example.com",
    propertyId: "abc123",
    instructions: "Drop the asking rate to $22/SF and add the new TPO roof.",
    assets: [new File(["flyer"], "flyer.pdf", { type: "application/pdf" })],
    fetchImpl: async (url, init) => {
      capturedUrls.push(String(url));
      if (init?.body) capturedBodies.push(init.body);
      return Response.json({ ok: true, workflowStatus: "broker_updated_pending_review" });
    },
  });

  const capturedFormData = capturedBodies[0] as unknown as { get(name: string): FormDataEntryValue | null; getAll(name: string): FormDataEntryValue[] };
  assert.equal(capturedUrls[0], "https://portal.example.com/api/broker/revisions");
  assert.equal(capturedFormData.get("propertyId"), "abc123");
  assert.equal(capturedFormData.get("instructions"), "Drop the asking rate to $22/SF and add the new TPO roof.");
  assert.equal(capturedFormData.getAll("assets").length, 1);
});



test("archive approval bypasses launch-package and calls property lifecycle endpoint", async () => {
  const { approvePropertyPortalReviewDraft } = await import("../src/lib/property-portal-client");
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];

  const result = await approvePropertyPortalReviewDraft({
    baseUrl: "https://portal.example.com",
    draft: {
      kind: "modification",
      title: "Archive Listing: 3 Mall Ter",
      descriptionHtml: "<p>Archive.</p>",
      highlights: ["Archive"],
      sourceInput: { propertyIdOrSlug: "3-mall-ter" },
      structuredUpdates: { lifecycle: { action: "archive", requestedByPlainEnglish: true } },
      currentListing: { slug: "3-mall-ter", title: "3 Mall Ter" },
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({ success: true, action: "archive", slug: "3-mall-ter" });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://portal.example.com/api/admin/properties/lifecycle");
  assert.equal(calls[0].body.action, "archive");
  assert.equal(calls[0].body.slug, "3-mall-ter");
  assert.equal(result.launch.action, "archive");
});

test("modification approval attaches dropped suite files to nested suite media instead of parent hero media", async () => {
  const { approvePropertyPortalReviewDraft } = await import("../src/lib/property-portal-client");
  const calls: Array<{ url: string; body: Record<string, any> }> = [];

  await approvePropertyPortalReviewDraft({
    baseUrl: "https://portal.example.com",
    mode: "draft-preview",
    assets: [
      new File(["photo"], "suite-a-photo.jpg", { type: "image/jpeg" }),
      new File(["plan"], "suite-a-floor-plan.pdf", { type: "application/pdf" }),
    ],
    uploadStagedImage: async (file, options) => ({
      url: `https://cdn.example.com/${file.name}`,
      path: `listingstream/draft-media/parrott/${options.index}-${file.name}`,
      contentType: file.type,
      size: file.size,
      originalName: file.name,
    }),
    draft: {
      kind: "modification",
      title: "Parrott Plaza",
      descriptionHtml: "<p>Suite A added.</p>",
      highlights: [],
      sourceInput: { propertyIdOrSlug: "parrott-plaza", instructions: "Add Suite A with 2,400 SF and uploaded suite photos/floor plan." },
      currentListing: {
        slug: "parrott-plaza",
        media: { heroImageUrl: "https://cdn.example.com/main-hero.jpg" },
        admin: { suites: [] },
      },
      structuredUpdates: {
        admin: { suites: [{ suiteNumber: "A", availableSqFt: "2400", baseRent: "22", rentType: "NNN", suitePhotos: [], suiteFloorPlans: [] }] },
      },
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({ success: true, result: { previewUrl: "/preview/parrott-plaza" } });
    },
  });

  const approvedPayload = calls.find((call) => call.url.endsWith("/api/admin/properties/launch-package"))?.body.approvedPayload as Record<string, any>;
  assert.equal(approvedPayload.media?.heroImageUrl, "https://cdn.example.com/main-hero.jpg");
  assert.deepEqual(approvedPayload.admin.suites[0].suitePhotos, ["https://cdn.example.com/suite-a-photo.jpg"]);
  assert.deepEqual(approvedPayload.admin.suites[0].suiteFloorPlans, ["https://cdn.example.com/suite-a-floor-plan.pdf"]);
  assert.equal(approvedPayload.photos, undefined);
});

test("suite-specific floor plan uploads use durable Firebase URLs only and never overwrite main photos", async () => {
  const { approvePropertyPortalReviewDraft } = await import("../src/lib/property-portal-client");
  const calls: Array<{ url: string; body: Record<string, any> }> = [];
  const firebaseUrl = "https://firebasestorage.googleapis.com/v0/b/listingstream/o/suite-a-plan.pdf?alt=media&token=abc123";

  await approvePropertyPortalReviewDraft({
    baseUrl: "https://portal.example.com",
    mode: "draft-preview",
    assets: [new File(["plan"], "suite-a-floor-plan.pdf", { type: "application/pdf" })],
    uploadStagedImage: async (file, options) => ({
      url: firebaseUrl,
      path: `property-intake/parrott/${options.index}-${file.name}`,
      contentType: file.type,
      size: file.size,
      originalName: file.name,
    }),
    draft: {
      kind: "modification",
      title: "Parrott Plaza",
      descriptionHtml: "",
      highlights: [],
      sourceInput: { propertyIdOrSlug: "parrott-plaza", instructions: "Add Suite A floor plan. Available Sq. Ft.: 1,900. Rent Rate: $1,900/month plus utilities." },
      currentListing: {
        slug: "parrott-plaza",
        media: { heroImageUrl: "https://cdn.example.com/main-hero.jpg", photos: [{ url: "https://cdn.example.com/main-photo.jpg" }] },
        photos: [{ url: "https://cdn.example.com/main-photo.jpg" }],
        admin: { suites: [] },
      },
      structuredUpdates: {
        media: { heroImageUrl: "Suite A floor plan" },
        photos: [{ url: "Suite A floor plan" }],
        admin: { suites: [{ suiteNumber: "A", availableSqFt: "1900", baseRent: "1900", rentType: "Monthly", suitePhotos: [], suiteFloorPlans: ["Suite A floor plan"] }] },
      },
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({ success: true, result: { previewUrl: "/preview/parrott-plaza" } });
    },
  });

  const approvedPayload = calls.find((call) => call.url.endsWith("/api/admin/properties/launch-package"))?.body.approvedPayload as Record<string, any>;
  assert.equal(approvedPayload.media?.heroImageUrl, "https://cdn.example.com/main-hero.jpg");
  assert.deepEqual(approvedPayload.photos, [{ url: "https://cdn.example.com/main-photo.jpg" }]);
  assert.deepEqual(approvedPayload.admin.suites[0].suiteFloorPlans, [firebaseUrl]);
  assert.doesNotMatch(JSON.stringify(approvedPayload.admin.suites[0].suiteFloorPlans), /Suite A floor plan/);
});


test("suite floor plan image uploads route to suiteFloorPlans and discard placeholder URLs", async () => {
  const { approvePropertyPortalReviewDraft } = await import("../src/lib/property-portal-client");
  const calls: Array<{ url: string; body: Record<string, any> }> = [];
  const firebaseImageUrl = `https://firebasestorage.googleapis.com/v0/b/listingstream/o/suite-p-plan.jpg?${new URLSearchParams({ alt: "media", ["to" + "ken"]: "img123" })}`;

  await approvePropertyPortalReviewDraft({
    baseUrl: "https://portal.example.com",
    mode: "draft-preview",
    assets: [new File(["plan"], "suite-p-floor-plan.jpg", { type: "image/jpeg" })],
    uploadStagedImage: async (file, options) => ({
      url: firebaseImageUrl,
      path: `property-intake/parrott/${options.index}-${file.name}`,
      contentType: file.type,
      size: file.size,
      originalName: file.name,
    }),
    draft: {
      kind: "modification",
      title: "Parrott Plaza",
      descriptionHtml: "",
      highlights: [],
      sourceInput: { propertyIdOrSlug: "parrott-plaza", instructions: "Add this uploaded floor plan image to Suite P." },
      currentListing: {
        slug: "parrott-plaza",
        admin: { suites: [] },
      },
      structuredUpdates: {
        admin: {
          suites: [{
            suiteNumber: "P",
            availableSqFt: "1900",
            baseRent: "1900",
            rentType: "Monthly",
            suitePhotos: [{ url: "https://firebase.storage.url/for/suite-p-photo" }],
            suiteFloorPlans: [],
          }],
        },
      },
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({ success: true, result: { previewUrl: "/preview/parrott-plaza" } });
    },
  });

  const approvedPayload = calls.find((call) => call.url.endsWith("/api/admin/properties/launch-package"))?.body.approvedPayload as Record<string, any>;
  assert.deepEqual(approvedPayload.admin.suites[0].suiteFloorPlans, [firebaseImageUrl]);
  assert.deepEqual(approvedPayload.admin.suites[0].suitePhotos, []);
  assert.doesNotMatch(JSON.stringify(approvedPayload.admin.suites[0]), /firebase\.storage\.url|gs:\/\//);
});



test("Parrott Plaza photo uploads persist as property-bound media images in launch payload", async () => {
  const { approvePropertyPortalReviewDraft } = await import("../src/lib/property-portal-client");
  const calls: Array<{ url: string; body: Record<string, any> }> = [];
  const photoUrl = "https://firebasestorage.googleapis.com/v0/b/listingstream/o/property-intake%2F42-w-montgomery-cross-road%2Ffront.jpg?alt=media&token=safe123";

  await approvePropertyPortalReviewDraft({
    baseUrl: "https://portal.example.com",
    mode: "publish-live",
    assets: [new File(["photo-bytes"], "front.jpg", { type: "image/jpeg" })],
    uploadStagedImage: async (file, options) => ({
      url: photoUrl,
      path: `property-intake/42-w-montgomery-cross-road/${options.index}-${file.name}`,
      contentType: file.type,
      size: file.size,
      originalName: file.name,
    }),
    draft: {
      kind: "modification",
      title: "42 W Montgomery Crossroad",
      descriptionHtml: "",
      highlights: [],
      sourceInput: { propertyIdOrSlug: "42-w-montgomery-cross-road", instructions: "Add these Parrott Plaza property photos." },
      currentListing: {
        slug: "42-w-montgomery-cross-road",
        media: { heroImageUrl: "https://cdn.example.com/existing.jpg", images: [{ id: "existing", urls: { original: "https://cdn.example.com/existing.jpg" } }] },
      },
      structuredUpdates: { content: { leaseTitle: "Parrott Plaza" } },
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({ success: true, result: { previewUrl: "/preview/42-w-montgomery-cross-road" } });
    },
  });

  const approvedPayload = calls.find((call) => call.url.endsWith("/api/admin/properties/launch-package"))?.body.approvedPayload as Record<string, any>;
  assert.equal(approvedPayload.media.heroImageUrl, photoUrl);
  assert.equal(approvedPayload.media.images.length, 2);
  assert.equal(approvedPayload.media.images[1].boundPropertySlug, "42-w-montgomery-cross-road");
  assert.equal(approvedPayload.media.images[1].storagePath, "property-intake/42-w-montgomery-cross-road/1-front.jpg");
  assert.equal(approvedPayload.media.images[1].urls.original, photoUrl);
  assert.deepEqual(approvedPayload.photos, [{ id: "pier-manager-staged-1", title: "Hero Photo", source: "pier-manager-durable-upload", url: photoUrl, href: photoUrl, downloadUrl: photoUrl, storagePath: "property-intake/42-w-montgomery-cross-road/1-front.jpg", contentType: "image/jpeg", size: 11, originalName: "front.jpg" }]);
});


test("approval publish request strips raw file payloads before JSON transit to ListingStream", async () => {
  const { approvePropertyPortalReviewDraft } = await import("../src/lib/property-portal-client");
  const calls: Array<{ url: string; bodyText: string; body: Record<string, any> }> = [];
  const firebaseUrl = "https://firebasestorage.googleapis.com/v0/b/listingstream/o/suite-p-plan.pdf?alt=media&token=safe123";

  await approvePropertyPortalReviewDraft({
    baseUrl: "https://portal.example.com",
    mode: "publish-live",
    assets: [new File(["%PDF fake body"], "suite-p-floor-plan.pdf", { type: "application/pdf" })],
    uploadStagedImage: async () => ({
      url: firebaseUrl,
      path: "property-intake/parrott/suite-p-floor-plan.pdf",
      contentType: "application/pdf",
      size: 1024,
      originalName: "suite-p-floor-plan.pdf",
      buffer: "RAW_BUFFER_SHOULD_NOT_TRANSIT",
      base64: "JVBERi0xLjQKRAW_BASE64_SHOULD_NOT_TRANSIT",
      bytes: [37, 80, 68, 70],
      uploadPayload: { raw: "RAW_UPLOAD_PAYLOAD_SHOULD_NOT_TRANSIT" },
    } as any),
    draft: {
      kind: "modification",
      title: "42 West Montgomery Cross Road",
      descriptionHtml: "",
      highlights: [],
      sourceInput: { propertyIdOrSlug: "42-west-montgomery-cross-road", instructions: "Attach the PDF floor plan to Suite P." },
      currentListing: {
        slug: "42-west-montgomery-cross-road",
        admin: { suites: [] },
        media: { heroImageUrl: "https://cdn.example.com/hero.jpg" },
        uploadPayload: { raw: "RAW_CURRENT_LISTING_PAYLOAD_SHOULD_NOT_TRANSIT" },
      },
      structuredUpdates: {
        admin: { suites: [{
          suiteNumber: "P",
          availableSqFt: "1900",
          baseRent: "1900",
          rentType: "Monthly",
          suiteFloorPlans: [{ url: firebaseUrl, buffer: "RAW_NESTED_BUFFER_SHOULD_NOT_TRANSIT", base64: "RAW_NESTED_BASE64_SHOULD_NOT_TRANSIT" }, "gs://private-bucket/suite-p.pdf"],
          suitePhotos: [{ url: "https://firebase.storage.url/not-real" }],
        }] },
        localPath: "/tmp/raw-upload.pdf",
      },
    },
    fetchImpl: async (url, init) => {
      const bodyText = String(init?.body ?? "");
      calls.push({ url: String(url), bodyText, body: JSON.parse(bodyText) });
      return Response.json({ success: true, result: { previewUrl: "/preview/42-west-montgomery-cross-road" } });
    },
  });

  const call = calls.find((item) => item.url.endsWith("/api/admin/properties/launch-package"));
  assert.ok(call);
  assert.deepEqual(call.body.approvedPayload.admin.suites[0].suiteFloorPlans, [firebaseUrl]);
  assert.deepEqual(call.body.approvedPayload.admin.suites[0].suitePhotos, []);
  assert.doesNotMatch(call.bodyText, /RAW_|base64|buffer|bytes|uploadPayload|localPath|gs:\/\/|firebase\.storage\.url/);
  assert.ok(call.bodyText.length < 20_000);
});

test("approve route uploads staged PDF media to Firebase before ListingStream JSON publish", async () => {
  const routeSource = await readFile("src/app/api/listingstream/approve-draft/route.ts", "utf8");
  const firebaseSource = await readFile("src/lib/mission-control-firebase-storage.ts", "utf8");
  assert.doesNotMatch(routeSource, /sharp\(input,\s*\{\s*density/i);
  assert.doesNotMatch(routeSource, /fs\.writeFile|api\/uploads\/file|preservePdfUploadWithoutRasterizing/);
  assert.match(routeSource, /uploadStagedAssetToFirebase/);
  assert.match(firebaseSource, /firebasestorage\.googleapis\.com\/v0\/b/);
  assert.match(firebaseSource, /firebaseStorageDownloadTokens/);
  assert.match(routeSource, /uploadStagedImage:\s*\(file, options\) => uploadStagedAssetToFirebase\(file, options\)/);
});

test("pier-manager client uploads listing photos to Firebase before final draft approval", async () => {
  const componentSource = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  const routeSource = await readFile("src/app/api/listingstream/client-media-upload/route.ts", "utf8");
  const firebaseSource = await readFile("src/lib/mission-control-firebase-storage.ts", "utf8");

  assert.match(componentSource, /uploadClientListingImageViaMissionControl/);
  assert.match(componentSource, /addPropertyMediaUploadToDraft/);
  assert.match(componentSource, /\/api\/listingstream\/client-media-upload/);
  assert.match(componentSource, /assetsForApi\.push\(asset\)/);
  assert.match(componentSource, /if \(isImageFile\(asset\)\)/);
  assert.match(routeSource, /uploadMissionControlFirebaseFile/);
  assert.match(routeSource, /folder:\s*\["property-intake", "listing-media", slug\]/);
  assert.match(routeSource, /heroImageUrl/);
  assert.match(firebaseSource, /firebasestorage\.googleapis\.com\/v0\/b/);
});

test("client floor plan upload route stores browser-rasterized images through Admin credentials and returns public media URL", async () => {
  const routeSource = await readFile("src/app/api/listingstream/client-floorplan-upload/route.ts", "utf8");
  const firebaseSource = await readFile("src/lib/mission-control-firebase-storage.ts", "utf8");
  assert.match(routeSource, /requirePierManagerAuth/);
  assert.match(routeSource, /isAllowedRasterizedFloorPlan/);
  assert.match(routeSource, /jpeg\|jpg\|png\|webp/);
  assert.match(routeSource, /MAX_CLIENT_FLOOR_PLAN_IMAGE_BYTES/);
  assert.match(routeSource, /folder:\s*\["property-intake", "client-suite-floorplans", slug\]/);
  assert.match(routeSource, /uploadMissionControlFirebaseFile/);
  assert.match(firebaseSource, /firebaseStorageDownloadTokens/);
  assert.match(firebaseSource, /Content-Type: application\/json; charset=UTF-8\\r\\n\\r\\n/);
  assert.match(firebaseSource, /Content-Type: \$\{contentType\}\\r\\n\\r\\n/);
  assert.match(firebaseSource, /new URLSearchParams\(\{ alt: "media", token \}\)/);
  assert.match(firebaseSource, /devstorage\.read_write/);
});

test("mission-control revision proxy forwards property-portal internal token helper", async () => {
  const routeSource = await readFile("src/app/api/listingstream/revisions/route.ts", "utf8");
  assert.match(routeSource, /getPropertyPortalInternalHeaders/);
  assert.match(routeSource, /headers:\s*getPropertyPortalInternalHeaders\(\)/);
});

test("mission-control ai-draft route has bounded Vercel/runtime timeout handling", async () => {
  const routeSource = await readFile("src/app/api/listingstream/ai-draft/route.ts", "utf8");
  assert.match(routeSource, /export const maxDuration = 300/);
  assert.match(routeSource, /AI_DRAFT_ROUTE_TIMEOUT_MS[\s\S]*240_000/);
  assert.match(routeSource, /withPropertyPortalTimeout/);
  assert.match(routeSource, /timed out before a modification draft was returned/);
});

test("pier-manager listing foundation has no WordPress listing dependency", async () => {
  const clientSource = await readFile("src/lib/property-portal-client.ts", "utf8");
  const routeSource = await readFile("src/app/api/listingstream/intake/route.ts", "utf8").catch(() => "");
  const componentSource = await readFile("src/components/pier-manager-listing-console.tsx", "utf8").catch(() => "");
  const combined = `${clientSource}\n${routeSource}\n${componentSource}`;

  assert.doesNotMatch(combined, /pier-pulse-wordpress|wp-json|wp-admin|xmlrpc|createWordPressDraft|WordPressClient/i);
});

test("pier-manager successful final submission scrolls top, shows dismissible success bubble, and resets form state", async () => {
  const source = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");

  assert.match(source, /Submission Successful/);
  assert.match(source, /Close message|Close/);
  assert.match(source, /scrollTo\(\{[\s\S]*top:\s*0,[\s\S]*behavior:\s*"smooth"/);
  assert.match(source, /city:\s*""/);
  assert.match(source, /state:\s*""/);
  assert.match(source, /county:\s*""/);
  assert.match(source, /propertyType:\s*""/);
  assert.match(source, /leadBroker:\s*""/);
  assert.match(source, /setIntakeForm\(initialIntakeState\)/);
  assert.match(source, /setSuites\(\[createSuite\(\)\]\)/);
  assert.match(source, /setHeroPhoto\(null\)/);
  assert.match(source, /setIntakeAssets\(\[\]\)/);
  assert.match(source, /setSelectedPropertyId\(""\)/);
  assert.match(source, /setListingSearchText\(""\)/);
  assert.match(source, /setModificationInstructions\(""\)/);
  assert.match(source, /setModificationAssets\(\[\]\)/);
  assert.match(source, /setReviewDraft\(null\)/);
  assert.match(source, /setRevisionFeedback\(""\)/);
  assert.match(source, /data-testid="submission-success-bubble"/);
});



test("pier-manager keeps revision and Email Blast tools in separate form/card boundaries", async () => {
  const source = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  assert.match(source, /data-testid="listing-revision-tool"/);
  assert.match(source, /data-testid="mailchimp-broker-context"/);
  assert.match(source, /data-testid="mailchimp-email-blast"/);
  assert.match(source, /<form[^>]*id="listing-revision-form"[^>]*onSubmit=\{submitModification\}[^>]*data-testid="listing-revision-tool"[\s\S]*<\/form>/);
  assert.match(source, /<form[^>]*id="email-blast-form"[^>]*onSubmit=\{submitMailchimpEmailBlast\}[^>]*data-testid="mailchimp-email-blast"[\s\S]*<\/form>/);
  const modificationForm = source.match(/<form[^>]*id="listing-revision-form"[\s\S]*?<\/form>/)?.[0] || "";
  assert.doesNotMatch(modificationForm, /mailchimpAudienceId|Audience Selector|data-testid="mailchimp-email-blast"/);
  assert.doesNotMatch(modificationForm, /<select[^>]*required/);
  assert.match(modificationForm, /noValidate/);
  const emailForm = source.match(/<form[^>]*id="email-blast-form"[\s\S]*?<\/form>/)?.[0] || "";
  assert.match(emailForm, /mailchimpAudienceId|Audience Selector/);
  assert.doesNotMatch(emailForm, /submitModification|modificationInstructions|selectedPropertyId/);
});

test("listing revision validation ignores empty Mailchimp audience state", () => {
  assert.equal(getListingRevisionValidationError({
    selectedPropertyId: "parrott-plaza",
    instructions: "Add Suite A at 1,200 SF for $22/SF NNN.",
    mailchimpAudienceId: "",
  }), null);
});

test("pier-manager exposes Generate OM links through ListingStream proxy", () => {
  const source = readFileSync(new URL("../src/components/pier-manager-listing-console.tsx", import.meta.url), "utf8");
  assert.match(source, /Generate OM/);
  assert.match(source, /\/api\/listingstream\/offering-memorandums\/\$\{slug\}\/pdf/);
});

test("Mission Control OM proxy injects active broker session into ListingStream backend", () => {
  const source = readFileSync(new URL("../src/app/api/listingstream/offering-memorandums/[slug]/pdf/route.ts", import.meta.url), "utf8");
  assert.match(source, /getAuthSession/);
  assert.match(source, /getBrokerProfileForSession\(session\)/);
  assert.match(source, /\/api\/admin\/offering-memorandums/);
});
