import assert from "node:assert/strict";

import { createModificationReviewDraft, type PropertyPortalCloudWriter } from "../src/lib/property-portal-ai";
import { buildPropertyPortalApprovedPayload } from "../src/lib/property-portal-client";

const POOLER_SLUG = "1539-pooler-parkway";
const DELETION_INSTRUCTION = "Remove the Sale Listing link from the Pooler Parkway vacant land listing.";
const TARGET_LINK = "http://www.piercommercial.com/properties/?propertyId=423992-sale";

function getInternalHeaders(): Record<string, string> {
  const token = process.env.PROPERTY_PORTAL_INTERNAL_TOKEN?.trim();
  return token ? { "x-pier-manager-internal": token } : {};
}

function getListingStreamBaseUrl() {
  return (process.env.LISTINGSTREAM_PORTAL_BASE_URL
    || process.env.NEXT_PUBLIC_LISTINGSTREAM_PORTAL_BASE_URL
    || "https://listingstream-portal.vercel.app").replace(/\/+$/, "");
}

function containsTargetLink(value: unknown): boolean {
  if (typeof value === "string") return value.includes(TARGET_LINK);
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsTargetLink);
  return Object.values(value as Record<string, unknown>).some(containsTargetLink);
}

async function pullPoolerPayload() {
  const response = await fetch(`${getListingStreamBaseUrl()}/api/properties/${POOLER_SLUG}`, {
    cache: "no-store",
    headers: getInternalHeaders(),
  });
  if (!response.ok) throw new Error(`Could not pull Pooler payload: ${response.status} ${await response.text()}`);
  return await response.json() as Record<string, unknown>;
}

const writer: PropertyPortalCloudWriter = async () => ({
  title: "Pooler Parkway Link Removal Draft",
  descriptionHtml: "<p>Sale Listing link removed from the ListingStream payload for broker review.</p>",
  highlights: ["Sale Listing link removed"],
  structuredUpdates: {},
  mediaNotes: [],
});

async function main() {
  const currentListing = await pullPoolerPayload();
  assert.equal(containsTargetLink(currentListing), true, "Pooler source payload should contain the target Sale Listing link before deletion.");

  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: POOLER_SLUG,
    instructions: DELETION_INSTRUCTION,
    fetchImpl: async () => Response.json(currentListing),
    writer,
  });

  const approvedPayload = buildPropertyPortalApprovedPayload({
    draft,
    mode: "publish-live",
    slug: POOLER_SLUG,
  });

  assert.equal(containsTargetLink(draft.structuredUpdates), false, "Draft structured updates should not retain the removed Sale Listing link.");
  assert.equal(containsTargetLink(approvedPayload), false, "Approved payload must completely lack the removed Sale Listing link after destructive merge.");

  console.log(JSON.stringify({
    ok: true,
    slug: POOLER_SLUG,
    instruction: DELETION_INSTRUCTION,
    documentsLength: Array.isArray((approvedPayload as Record<string, unknown>).documents) ? ((approvedPayload as Record<string, unknown>).documents as unknown[]).length : null,
    links: (approvedPayload as Record<string, unknown>).links ?? null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
