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
  submitPropertyPortalListingModification,
  type MinimalListingIntakeInput,
} from "../src/lib/property-portal-client";

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

test("mission-control revision proxy forwards property-portal internal token helper", async () => {
  const routeSource = await readFile("src/app/api/listingstream/revisions/route.ts", "utf8");
  assert.match(routeSource, /getPropertyPortalInternalHeaders/);
  assert.match(routeSource, /headers:\s*getPropertyPortalInternalHeaders\(\)/);
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
