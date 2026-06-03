import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildPortalFormData,
  buildPropertyPortalUrl,
  fetchPropertyPortalActiveListings,
  getMinimalIntakeMissingFields,
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

test("property-portal URL builder targets portal backend paths without WordPress", () => {
  assert.equal(
    buildPropertyPortalUrl("/api/broker/active-listings", "https://portal.example.com/"),
    "https://portal.example.com/api/broker/active-listings",
  );
  assert.doesNotMatch(buildPropertyPortalUrl("api/broker/intake", "https://portal.example.com"), /wordpress|wp-json|wp-admin/i);
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

test("pier-manager listing foundation has no WordPress listing dependency", async () => {
  const clientSource = await readFile("src/lib/property-portal-client.ts", "utf8");
  const routeSource = await readFile("src/app/api/property-portal/intake/route.ts", "utf8").catch(() => "");
  const componentSource = await readFile("src/components/pier-manager-listing-console.tsx", "utf8").catch(() => "");
  const combined = `${clientSource}\n${routeSource}\n${componentSource}`;

  assert.doesNotMatch(combined, /pier-pulse-wordpress|wp-json|wp-admin|xmlrpc|createWordPressDraft|WordPressClient/i);
});
