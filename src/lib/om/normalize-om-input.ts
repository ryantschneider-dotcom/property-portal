import "server-only";

import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";
import { getPropertyBySlug, getPropertyDocumentByIdentifier } from "@/lib/properties";
import type { PropertyDetail, PropertyDocumentAsset, PropertyImageAsset } from "@/lib/types";
import type { NormalizedOmDocument, NormalizedOmImage, NormalizedOmInput } from "@/lib/om/types";

const DEFAULT_COMPANY_NAME = "PIER Commercial Real Estate";
const DEFAULT_PRIMARY_COLOR = "#cb521e";

function asString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function asPositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.-]/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function coalesce<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") return value as T;
  }
  return null;
}

function formatCurrency(value: number | null, maximumFractionDigits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

function normalizeImages(images: PropertyImageAsset[] | undefined): NormalizedOmImage[] {
  return (images ?? [])
    .map((image, index) => ({
      id: String(image.id ?? `image-${index + 1}`),
      kind: image.kind,
      title: image.title ?? null,
      caption: image.caption ?? null,
      storagePath: image.storagePath ?? null,
      isPublic: image.isPublic === true,
      sortOrder: typeof image.sortOrder === "number" ? image.sortOrder : index,
      url: coalesce(image.urls.original, image.urls.full, image.urls.xlarge, image.urls.large, image.urls.medium, image.urls.thumb),
      thumbUrl: coalesce(image.urls.thumb, image.urls.medium, image.urls.large, image.urls.original),
      filename: image.filename ?? null,
      contentType: image.contentType ?? null,
      source: image.source ?? null,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function normalizeDocuments(documents: PropertyDocumentAsset[] | undefined): NormalizedOmDocument[] {
  return (documents ?? [])
    .map((document, index) => ({
      id: String(document.id ?? `document-${index + 1}`),
      title: document.title ?? null,
      description: document.description ?? null,
      kind: document.kind,
      status: document.status,
      isPublic: document.isPublic === true,
      storagePath: document.storagePath ?? null,
      url: document.url ?? null,
      previewImageUrl: document.previewImageUrl ?? null,
      filename: document.filename ?? null,
      contentType: document.contentType ?? null,
      source: document.source ?? null,
      version: typeof document.version === "number" && Number.isFinite(document.version) ? document.version : 1,
      sortOrder: typeof document.sortOrder === "number" ? document.sortOrder : index,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function normalizeSpaces(raw: Record<string, any>, property: PropertyDetail) {
  const candidates = [
    property.spaces,
    raw.spaces,
    raw.suites,
    raw.availability?.spaces,
    raw.availability?.suites,
    raw.raw?.buildout?.spaces,
    raw.raw?.buildout?.suites,
    raw.raw?.buildout?.availabilities,
    raw.raw?.buildout?.units,
  ].filter(Array.isArray) as Array<Array<Record<string, unknown>>>;

  return candidates.flatMap((items) =>
    items.map((item) => ({
      id: (item.id as string | number | null) ?? null,
      name: (item.name as string | null) ?? (item.title as string | null) ?? null,
      suite: (item.suite as string | null) ?? (item.unit as string | null) ?? (item.label as string | null) ?? null,
      sizeSf: asPositiveNumber(item.sizeSf) ?? asPositiveNumber(item.availableSqFt) ?? asPositiveNumber(item.squareFeet) ?? asPositiveNumber(item.sqFt) ?? asPositiveNumber(item.size),
      ratePerSf: asPositiveNumber(item.ratePerSf) ?? asPositiveNumber(item.askingPriceRatePerSf) ?? asPositiveNumber(item.pricePerSf) ?? asPositiveNumber(item.leaseRate),
      monthlyRate: asPositiveNumber(item.monthlyRate) ?? asPositiveNumber(item.monthlyRent) ?? asPositiveNumber(item.rentPerMonth),
      rawRateLabel: asString(item.rawRateLabel) ?? asString(item.rateLabel) ?? asString(item.priceLabel),
    })),
  );
}

function buildPricingDisplay(property: PropertyDetail, raw: Record<string, any>) {
  if (property.pricing.hideSalePrice) return property.pricing.hiddenPriceLabel ?? "Call for Price";

  const salePrice = asPositiveNumber(property.pricing.salePriceDollars ?? raw.pricing?.salePriceDollars);
  if (salePrice) return formatCurrency(salePrice, 0);

  const salePricePerUnit = asPositiveNumber(property.pricing.salePricePerUnit ?? raw.pricing?.salePricePerUnit);
  if (salePricePerUnit) return formatCurrency(salePricePerUnit, 0);

  const askingPriceRate = asPositiveNumber(property.pricing.askingPriceRatePerSf ?? raw.pricing?.askingPriceRatePerSf ?? raw.meta?.adminOverrides?.askingPriceRate);
  if (askingPriceRate) return `${formatCurrency(askingPriceRate, 2)} / SF / YR`;

  return property.pricing.hiddenPriceLabel ?? null;
}

function buildHighlights(property: PropertyDetail) {
  return [...(property.content.saleBullets ?? []), ...(property.content.leaseBullets ?? [])]
    .map((item) => item.trim())
    .filter(Boolean);
}

export function pickPrimaryOmImages(images: PropertyImageAsset[]): PropertyImageAsset[] {
  return [...(images ?? [])]
    .sort((a, b) => {
      const aPrimary = a.isPrimary ? 0 : 1;
      const bPrimary = b.isPrimary ? 0 : 1;
      if (aPrimary !== bPrimary) return aPrimary - bPrimary;
      return (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
    })
    .slice(0, 12);
}

export function collectOmWarnings(input: NormalizedOmInput): string[] {
  const warnings = [...input.warnings];

  if (!input.location.lat || !input.location.lng) warnings.push("Missing coordinates");
  if (!input.property.buildingSizeSf) warnings.push("Missing building size");
  if (!input.content.propertyDescription && !input.content.saleDescription && !input.content.leaseDescription) warnings.push("Missing property description");
  if (!input.brokerProfile.leadBroker) warnings.push("Missing lead broker");
  if (!input.demographics?.oneMile && !input.demographics?.threeMile && !input.demographics?.fiveMile) warnings.push("Missing demographics");

  return Array.from(new Set(warnings));
}

async function resolveProperty(identifier: string) {
  const doc = await getPropertyDocumentByIdentifier(identifier);
  if (!doc?.exists) throw new Error("Property not found");

  const raw = (doc.data() as Record<string, any> | undefined) ?? {};
  const slug = asString(raw.slug) || doc.id;
  const property = await getPropertyBySlug(doc.id) ?? await getPropertyBySlug(slug);
  if (!property) throw new Error("Property details not found");

  return { docId: doc.id, raw, property };
}

export async function buildNormalizedOmInput(propertyId: string): Promise<NormalizedOmInput> {
  const { docId, raw, property } = await resolveProperty(propertyId);
  const normalizedImages = normalizeImages(pickPrimaryOmImages(property.media.images ?? []));
  const normalizedDocuments = normalizeDocuments(property.media.documents ?? []);
  const pricingDisplay = buildPricingDisplay(property, raw);
  const ownerEmail = asString(raw.ownerEmail ?? raw.ownerUserId);
  const leadBroker = asString(raw.leadBroker ?? raw.admin?.leadBroker ?? raw.meta?.intake?.lead_broker);
  const demographics = (raw.demographics ?? property.demographics ?? null) as NormalizedOmInput["demographics"];

  const input: NormalizedOmInput = {
    propertyId: docId,
    slug: property.slug,
    title: property.title,
    status: asString(raw.status),
    transactionTypes: property.transactionTypes,
    address: property.address,
    location: property.location,
    property: {
      category: property.property.category ?? null,
      typeId: property.property.typeId ?? null,
      subtypeId: property.property.subtypeId ?? null,
      buildingSizeSf: property.property.buildingSizeSf ?? null,
      grossLeasableArea: property.property.grossLeasableArea ?? null,
      lotSizeAcres: property.property.lotSizeAcres ?? null,
      yearBuilt: property.property.yearBuilt ?? null,
      numberOfUnits: property.property.numberOfUnits ?? null,
      numberOfFloors: property.property.numberOfFloors ?? null,
      zoning: property.property.zoning ?? null,
      parcelId: property.property.parcelId ?? null,
    },
    pricing: {
      hideSalePrice: property.pricing.hideSalePrice === true,
      hiddenPriceLabel: property.pricing.hiddenPriceLabel ?? null,
      salePriceDollars: property.pricing.salePriceDollars ?? null,
      salePricePerUnit: property.pricing.salePricePerUnit ?? null,
      salePriceUnits: property.pricing.salePriceUnits ?? null,
      availableSqFt: property.pricing.availableSqFt ?? asPositiveNumber(raw.pricing?.availableSqFt) ?? null,
      askingPriceRatePerSf: property.pricing.askingPriceRatePerSf ?? asPositiveNumber(raw.pricing?.askingPriceRatePerSf) ?? asPositiveNumber(raw.meta?.adminOverrides?.askingPriceRate) ?? null,
      leaseType: property.pricing.leaseType ?? asString(raw.meta?.adminOverrides?.leaseType),
      listingPriceVisibility: property.pricing.listingPriceVisibility ?? asString(raw.pricing?.listingPriceVisibility) ?? asString(raw.meta?.adminOverrides?.listingPriceVisibility),
      display: pricingDisplay,
    },
    content: {
      saleTitle: property.content.saleTitle ?? null,
      leaseTitle: property.content.leaseTitle ?? null,
      propertyDescription: coalesce(property.content.saleDescription, property.content.leaseDescription, property.content.siteDescription, property.content.exteriorDescription),
      locationDescription: property.content.locationDescription ?? null,
      siteDescription: property.content.siteDescription ?? null,
      exteriorDescription: property.content.exteriorDescription ?? null,
      saleDescription: property.content.saleDescription ?? null,
      leaseDescription: property.content.leaseDescription ?? null,
      highlights: buildHighlights(property),
    },
    spaces: normalizeSpaces(raw, property),
    images: normalizedImages,
    documents: normalizedDocuments,
    demographics,
    links: property.links,
    brokerProfile: {
      leadBroker,
      ownerEmail,
      companyName: DEFAULT_COMPANY_NAME,
    },
    branding: {
      companyName: DEFAULT_COMPANY_NAME,
      primaryColor: DEFAULT_PRIMARY_COLOR,
    },
    warnings: [],
  };

  input.warnings = collectOmWarnings(input);
  return input;
}

export async function readRawPropertyRecord(propertyId: string) {
  const doc = await db.collection(PROPERTIES_COLLECTION).doc(propertyId).get();
  return doc.exists ? ((doc.data() as Record<string, any>) ?? null) : null;
}
