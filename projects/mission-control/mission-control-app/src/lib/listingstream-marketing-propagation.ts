import { buildPropertyPortalUrl, getPropertyPortalInternalHeaders, safePropertyPortalFetch } from "@/lib/property-portal-client";
import { getBrokerProfileForSession } from "@/lib/offering-summary-pdf";
import type { AuthSession } from "@/lib/auth";

export type ListingStreamPropagationEvent = {
  propertyIdOrSlug: string;
  reason: "listing-data-updated" | "listing-made-live" | "manual-publish";
  source: "pier-manager-v2";
  mode?: "publish-live" | "draft-preview";
};

function getListingSlugFromDraft(draft: unknown) {
  if (!draft || typeof draft !== "object") return "";
  const record = draft as Record<string, unknown>;
  const candidates = [record.slug, record.propertyIdOrSlug, record.listingSlug, record.id];
  const structured = record.structuredUpdates;
  if (structured && typeof structured === "object") {
    const structuredRecord = structured as Record<string, unknown>;
    candidates.push(structuredRecord.slug, structuredRecord.id, structuredRecord.propertyIdOrSlug);
    const admin = structuredRecord.admin;
    if (admin && typeof admin === "object") {
      const adminRecord = admin as Record<string, unknown>;
      candidates.push(adminRecord.slug, adminRecord.id, adminRecord.propertyIdOrSlug);
    }
  }
  return candidates.map((candidate) => String(candidate ?? "").trim()).find(Boolean) || "";
}

export function buildMarketingPropagationEvent(input: { draft?: unknown; propertyIdOrSlug?: string; reason: ListingStreamPropagationEvent["reason"]; mode?: ListingStreamPropagationEvent["mode"] }): ListingStreamPropagationEvent | null {
  const propertyIdOrSlug = String(input.propertyIdOrSlug || getListingSlugFromDraft(input.draft) || "").trim();
  if (!propertyIdOrSlug) return null;
  return {
    propertyIdOrSlug,
    reason: input.reason,
    source: "pier-manager-v2",
    mode: input.mode,
  };
}

export async function triggerListingStreamMarketingPropagation(event: ListingStreamPropagationEvent, session?: AuthSession | null, fetchImpl: typeof fetch = fetch) {
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    ...getPropertyPortalInternalHeaders(),
  };
  const broker = session ? getBrokerProfileForSession(session) : undefined;
  const omPromise = safePropertyPortalFetch(fetchImpl, buildPropertyPortalUrl(`/api/admin/offering-memorandums/${encodeURIComponent(event.propertyIdOrSlug)}/pdf`), {
    method: "POST",
    cache: "no-store",
    headers,
    body: JSON.stringify({
      format: "pdf",
      attachToListing: true,
      replaceExisting: true,
      reason: event.reason,
      source: event.source,
      broker,
    }),
  }, "event-driven OM regeneration").then(async (response) => ({ target: "offering-memorandum", status: response.status, ok: response.ok })).catch((error) => ({ target: "offering-memorandum", ok: false, error: error instanceof Error ? error.message : String(error) }));

  const sitePromise = safePropertyPortalFetch(fetchImpl, buildPropertyPortalUrl("/api/admin/offering-sites"), {
    method: "POST",
    cache: "no-store",
    headers,
    body: JSON.stringify({
      listingId: event.propertyIdOrSlug,
      propertyIdOrSlug: event.propertyIdOrSlug,
      mode: "auto-propagation",
      launchGate: 5,
      reason: event.reason,
      source: event.source,
    }),
  }, "event-driven offering site propagation").then(async (response) => ({ target: "offering-site", status: response.status, ok: response.ok })).catch((error) => ({ target: "offering-site", ok: false, error: error instanceof Error ? error.message : String(error) }));

  return Promise.all([omPromise, sitePromise]);
}
