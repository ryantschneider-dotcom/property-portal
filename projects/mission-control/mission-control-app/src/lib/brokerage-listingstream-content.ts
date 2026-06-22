import { fetchPropertyPortalListing } from "@/lib/property-portal-ai";
import { type PierPulseSourceCandidateInput } from "@/lib/pier-pulse";
import { type PropertyPortalFetch } from "@/lib/property-portal-client";

export type BrokerageListingStreamContentOptions = {
  propertyIdOrSlug: string;
  eventType?: "property-email" | "offering-memorandum" | "listing-announcement" | "status-update";
  baseUrl?: string;
  fetchImpl?: PropertyPortalFetch;
  now?: () => Date;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = asString(value);
    if (text) return text;
  }
  return "";
}

function coerceNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = asString(value).replace(/,/g, "");
  const match = text.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function formatAddress(value: unknown) {
  const direct = asString(value);
  if (direct) return direct;
  const record = asRecord(value);
  const parts = [
    firstString(record.street, record.streetAddress, record.address1, record.line1),
    firstString(record.city),
    firstString(record.state),
    firstString(record.zip, record.zipCode, record.postalCode),
  ].filter(Boolean);
  return parts.join(", ").replace(/, ([A-Z]{2}), /, ", $1 ").trim();
}

export async function extractBrokerageListingStreamCandidate(options: BrokerageListingStreamContentOptions): Promise<PierPulseSourceCandidateInput> {
  const payload = await fetchPropertyPortalListing({ propertyIdOrSlug: options.propertyIdOrSlug, baseUrl: options.baseUrl, fetchImpl: options.fetchImpl });
  return buildBrokerageListingStreamCandidate({
    payload,
    propertyIdOrSlug: options.propertyIdOrSlug,
    eventType: options.eventType,
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
  });
}

export function buildBrokerageListingStreamCandidate(input: {
  payload: Record<string, unknown>;
  propertyIdOrSlug: string;
  eventType?: BrokerageListingStreamContentOptions["eventType"];
  generatedAt: string;
}): PierPulseSourceCandidateInput {
  const payload = input.payload;
  const content = asRecord(payload.content);
  const details = asRecord(payload.details);
  const pricing = asRecord(payload.pricing);
  const location = asRecord(payload.location);
  const sale = asRecord(payload.sale);
  const lease = asRecord(payload.lease);
  const admin = asRecord(payload.admin);
  const title = firstString(payload.title, content.saleTitle, content.leaseTitle, details.propertyName, input.propertyIdOrSlug);
  const address = firstString(formatAddress(payload.address), formatAddress(location.address), formatAddress(details.address), formatAddress(content.address), formatAddress(location));
  const propertyType = firstString(payload.propertyType, details.propertyType, admin.propertyType);
  const transactionLabel = firstString(payload.transactionLabel, payload.listingType, details.listingType, sale.status, lease.status);
  const squareFeet = coerceNumber(firstString(payload.squareFeet, details.squareFeet, details.buildingSize, admin.totalBuildingSize, content.squareFeet));
  const acreage = coerceNumber(firstString(payload.acreage, details.acreage, admin.acreage, location.acreage));
  const price = firstString(pricing.askingPrice, pricing.salePrice, sale.price, payload.price, content.price);
  const leaseRate = firstString(pricing.leaseRate, lease.rate, lease.baseRent, payload.leaseRate, content.leaseRate);
  const highlights = [
    ...asStringArray(payload.highlights),
    ...asStringArray(content.highlights),
    ...asStringArray(payload.bullets),
  ].slice(0, 6);
  const facts = [
    address ? `Address: ${address}` : "",
    propertyType ? `Property type: ${propertyType}` : "",
    transactionLabel ? `Listing status/type: ${transactionLabel}` : "",
    squareFeet ? `Building/available size: ${squareFeet.toLocaleString()} SF` : "",
    acreage ? `Site size: ${acreage} acres` : "",
    price ? `Pricing: ${price}` : "",
    leaseRate ? `Lease rate: ${leaseRate}` : "",
    ...highlights,
  ].filter(Boolean);
  const eventLabel =
    input.eventType === "offering-memorandum"
      ? "Offering Memorandum Source"
      : input.eventType === "listing-announcement"
        ? "Brokerage Listing Announcement"
        : input.eventType === "status-update"
          ? "Brokerage Status Update"
          : "Property Email Source";
  return {
    title: `${eventLabel}: ${title}`,
    url: firstString(payload.publicUrl, payload.previewUrl, `listingstream://${input.propertyIdOrSlug}`),
    sourceName: "ListingStream verified brokerage payload",
    publishedAt: input.generatedAt,
    summary: `${eventLabel} from PIER's active ListingStream database${address ? ` for ${address}` : ""}. ${facts.slice(0, 4).join(" ")}`.trim(),
    topics: ["leasing", "development", propertyType.toLowerCase().includes("industrial") ? "industrial" : propertyType.toLowerCase().includes("retail") ? "retail" : propertyType.toLowerCase().includes("office") ? "office" : "other"],
    facts,
    corridorHint: firstString(location.market, location.city, payload.market, "Coastal Georgia / Lowcountry"),
  };
}
