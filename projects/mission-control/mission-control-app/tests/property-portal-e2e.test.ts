import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createAuthToken } from "../src/lib/auth";
import {
  approvePropertyPortalReviewDraft,
  createPropertyPortalProxyError,
  withPropertyPortalTimeout,
} from "../src/lib/property-portal-client";
import { buildBrokerReviewState, createNewListingReviewDraft } from "../src/lib/property-portal-ai";

test("approval pipeline forwards staged new-listing media before save and publish", async () => {
  const calls: Array<{ url: string; body: BodyInit | null | undefined }> = [];
  const draft = buildBrokerReviewState({
    kind: "new-listing",
    sourceInput: {
      address: "2812 Williams Street, Savannah, GA",
      basicSpecs: "12,000 SF flex",
      priceContext: "$22/SF",
      rawNotes: "New TPO roof.",
    },
    writerResult: {
      title: "Approved New Listing",
      descriptionHtml: "<p>Approved listing copy.</p>",
      highlights: ["New TPO roof"],
      structuredUpdates: { content: { saleDescription: "Approved listing copy." } },
      mediaNotes: ["Use exterior as hero"],
    },
  });

  await approvePropertyPortalReviewDraft({
    baseUrl: "https://portal.example.com",
    draft,
    assets: [new File(["photo"], "exterior.jpg", { type: "image/jpeg" }), new File(["flyer"], "flyer.pdf", { type: "application/pdf" })],
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: init?.body });
      if (String(url).endsWith("/api/broker/intake")) return Response.json({ ok: true, slug: "approved-new-listing" });
      return Response.json({ success: true, slug: "approved-new-listing" });
    },
  });

  assert.equal(calls[0].url, "https://portal.example.com/api/broker/intake");
  const intakeForm = calls[0].body as FormData;
  assert.equal(intakeForm.getAll("assets").length, 2);
  assert.equal(calls[1].url, "https://portal.example.com/api/admin/properties/launch-package");
  assert.equal(((calls[1].body as string) ? JSON.parse(String(calls[1].body)) : {}).approvedPayload.workflowStatus, "approved");
});

test("approval pipeline forwards modification media and broker delta before save and publish", async () => {
  const calls: Array<{ url: string; body: BodyInit | null | undefined }> = [];
  const draft = buildBrokerReviewState({
    kind: "modification",
    sourceInput: { propertyIdOrSlug: "2812-williams-street", instructions: "Attach new roof warranty and update roof language." },
    writerResult: {
      title: "Updated Williams Street Listing",
      descriptionHtml: "<p>Updated roof language.</p>",
      highlights: ["New TPO roof"],
      structuredUpdates: { slug: "2812-williams-street", content: { saleDescription: "Updated roof language." } },
      mediaNotes: ["Attach warranty"],
    },
  });

  await approvePropertyPortalReviewDraft({
    baseUrl: "https://portal.example.com",
    draft,
    assets: [new File(["warranty"], "roof-warranty.pdf", { type: "application/pdf" })],
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: init?.body });
      return Response.json({ success: true, slug: "2812-williams-street" });
    },
  });

  assert.equal(calls[0].url, "https://portal.example.com/api/broker/revisions");
  const revisionForm = calls[0].body as FormData;
  assert.equal(revisionForm.get("propertyId"), "2812-williams-street");
  assert.match(String(revisionForm.get("instructions")), /Attach new roof warranty/);
  assert.equal(revisionForm.getAll("assets").length, 1);
  assert.equal(calls.at(-1)?.url, "https://portal.example.com/api/admin/properties/launch-package");
});

test("cloud writer timeout returns a clear broker-facing error", async () => {
  await assert.rejects(
    () => createNewListingReviewDraft({
      input: {
        address: "2812 Williams Street",
        basicSpecs: "12,000 SF flex",
        priceContext: "$22/SF",
        rawNotes: "Roof update.",
      },
      writer: () => withPropertyPortalTimeout(new Promise(() => undefined), 5, "Cloud writer timed out while drafting premium marketing copy."),
    }),
    /Cloud writer timed out while drafting premium marketing copy\./,
  );
});

test("property-portal unreachable errors are normalized without leaking internals", () => {
  const error = createPropertyPortalProxyError(new TypeError("fetch failed"), "active listings");
  assert.equal(error.message, "Property-portal backend is temporarily unreachable while handling active listings. Please try again shortly.");
});

test("pier-manager is protected by mission-control auth proxy", async () => {
  const source = await readFile("src/proxy.ts", "utf8");
  assert.match(source, /isValidAuthToken/);
  assert.match(source, /!isAuthenticated && !isPublic/);
  assert.equal(source.includes("pier-manager") && source.includes("publicPaths"), false);

  process.env.MISSION_CONTROL_PASSWORD = "test-secret-for-pier-manager";
  const token = await createAuthToken();
  assert.equal(typeof token, "string");
});

test("pier-manager UI has production loading states and success toast notification", async () => {
  const source = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  assert.match(source, /AI is analyzing property data/);
  assert.match(source, /Drafting premium marketing copy/);
  assert.match(source, /toastMessage/);
  assert.match(source, /successfully approved and published to the property-portal/i);
  assert.match(source, /Approve & Publish/);
});
