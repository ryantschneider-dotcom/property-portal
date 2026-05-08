import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { evaluateAdminPreflight } from "@/lib/admin-workflow";
import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";
import { getPropertyBySlug } from "@/lib/properties";

const BUILDOUT_FIELD_MAP_VERSION = "v2.2-locked";

const BUILDOUT_FIELD_MAP = {
  slug: "listing.slug",
  title: "listing.title",
  transactionType: "listing.transaction_type",
  "address.full": "location.address_full",
  "address.street": "location.address_street",
  "address.city": "location.city",
  "address.state": "location.state",
  "address.zip": "location.zip",
  "address.county": "location.county",
  "property.category": "property.category",
  "property.parcelId": "property.parcel_id",
  "property.zoning": "property.zoning",
  "property.buildingSizeSf": "property.building_size_sf",
  "property.lotSizeAcres": "property.lot_size_acres",
  "property.yearBuilt": "property.year_built",
  "property.parking": "property.parking",
  "property.leaseType": "property.lease_type",
  "property.availableSqFt": "property.available_sq_ft",
  "pricing.salePriceDollars": "pricing.sale_price_dollars",
  "pricing.salePriceIsCallForPrice": "pricing.sale_price_call_for_price",
  "pricing.askingPriceRatePerSf": "pricing.asking_price_rate_per_sf",
  "pricing.listingPriceVisibility": "pricing.listing_price_visibility",
  "content.saleTitle": "content.sale_title",
  "content.saleDescription": "content.sale_description",
  "content.leaseDescription": "content.lease_description",
  "content.locationDescription": "content.location_description",
  "content.exteriorDescription": "content.exterior_description",
  "content.saleBullets": "content.sale_bullets",
  "content.leaseBullets": "content.lease_bullets",
  suites: "spaces.suites",
  broker: "broker.primary_contact",
  media: "media.gallery",
} as const;

const MARKETING_SUPPRESSION_PATTERNS: Array<{ pattern: RegExp; replace: string | ((value: string, context?: { street: string | null }) => string) }> = [
  { pattern: /\bexceptional opportunit(?:y|ies)\b/gi, replace: "opportunity" },
  { pattern: /\bthriving corridor\b/gi, replace: (_value, context) => (context?.street ? `corridor near ${context.street}` : "corridor") },
  { pattern: /\bdynamic retail destination\b/gi, replace: "retail area" },
  { pattern: /\bideal for visionary users\b/gi, replace: "suited for commercial users" },
  { pattern: /\brare find\b/gi, replace: "available property" },
  { pattern: /\bmust-see\b/gi, replace: "available for review" },
  { pattern: /\bboasting\b/gi, replace: "with" },
  { pattern: /\bnestled on (?:a |an )?thriving corridor\b/gi, replace: (_value, context) => (context?.street ? `located on ${context.street}` : "located on the corridor") },
  { pattern: /\bnestled along (?:a |an )?thriving corridor\b/gi, replace: (_value, context) => (context?.street ? `located on ${context.street}` : "located along the corridor") },
  { pattern: /\bnestled\b/gi, replace: "located" },
  { pattern: /\bexceptional\b/gi, replace: "" },
];

function asString(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function compact<T>(values: Array<T | null | undefined | false | "">): T[] {
  return values.filter(Boolean) as T[];
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = asString(value).replace(/,/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanupPunctuation(value: string) {
  return collapseWhitespace(
    value
      .replace(/\s+,/g, ",")
      .replace(/\s+\./g, ".")
      .replace(/\s+;/g, ";")
      .replace(/[!]{1,}/g, "")
      .replace(/\b,\b/g, "")
      .replace(/\(\s*\)/g, "")
      .replace(/\s{2,}/g, " "),
  );
}

function sanitizePlainSpeak(value: string, context?: { street: string | null }): string {
  if (!value) return "";
  let output = value;
  for (const rule of MARKETING_SUPPRESSION_PATTERNS) {
    output = output.replace(rule.pattern, (match) =>
      typeof rule.replace === "function" ? rule.replace(match, context) : rule.replace,
    );
  }
  output = output.replace(/\b(premier|stunning|incredible|amazing|rare opportunity|one-of-a-kind|best-in-class|beautiful|fantastic|gorgeous|unmatched|trophy|world-class|spectacular)\b/gi, "");
  return cleanupPunctuation(output);
}

function normalizeBullets(value: unknown, context?: { street: string | null }): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePlainSpeak(asString(item), context)).filter(Boolean);
  }
  return asString(value)
    .split(/\n+/)
    .map((item) => sanitizePlainSpeak(item, context))
    .filter(Boolean);
}

function firstPresent(...values: unknown[]) {
  for (const value of values) {
    const text = asString(value);
    if (text) return text;
  }
  return null;
}

function normalizeTransactionLabel(visibility: Record<string, any>) {
  const label = asString(visibility.transactionLabel);
  if (label) return label;
  if (visibility.saleActive === true && visibility.leaseActive === true) return "For Sale / For Lease";
  if (visibility.leaseActive === true) return "For Lease";
  if (visibility.saleActive === true) return "For Sale";
  return null;
}

function normalizeSuites(suites: unknown) {
  if (!Array.isArray(suites)) return [];
  return suites
    .map((suite) => {
      const row = suite as Record<string, any>;
      const suiteNumber = asString(row.suiteNumber);
      const availableSqFt = parseNumber(row.availableSqFt);
      const baseRent = parseNumber(row.baseRent);
      const rentType = asString(row.rentType) || null;
      const unpriced = row.unpriced === true;
      if (!suiteNumber && availableSqFt == null && baseRent == null && !rentType && !unpriced) return null;
      return {
        suiteNumber: suiteNumber || null,
        availableSqFt,
        baseRent,
        rentType,
        unpriced,
      };
    })
    .filter(Boolean) as Array<{
      suiteNumber: string | null;
      availableSqFt: number | null;
      baseRent: number | null;
      rentType: string | null;
      unpriced: boolean;
    }>;
}

export type BuildoutExportPreview = {
  slug: string;
  title: string;
  transactionType: string | null;
  fieldMapVersion: string;
  fieldMap: typeof BUILDOUT_FIELD_MAP;
  address: {
    full: string | null;
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    county: string | null;
  };
  property: {
    category: string | null;
    parcelId: string | null;
    zoning: string | null;
    buildingSizeSf: number | null;
    lotSizeAcres: number | null;
    yearBuilt: number | null;
    parking: string | null;
    leaseType: string | null;
    availableSqFt: number | null;
  };
  pricing: {
    salePriceDollars: number | null;
    salePriceIsCallForPrice: boolean;
    askingPriceRatePerSf: number | null;
    listingPriceVisibility: string | null;
  };
  content: {
    saleTitle: string | null;
    saleDescription: string | null;
    leaseDescription: string | null;
    locationDescription: string | null;
    exteriorDescription: string | null;
    saleBullets: string[];
    leaseBullets: string[];
  };
  suites: Array<{
    suiteNumber: string | null;
    availableSqFt: number | null;
    baseRent: number | null;
    rentType: string | null;
    unpriced: boolean;
  }>;
  broker: {
    leadBroker: string | null;
    ownerEmail: string | null;
  };
  media: {
    heroImageUrl: string | null;
    imageCount: number;
  };
};

export type BuildoutExportResult = {
  ready: boolean;
  missingRequiredFields: string[];
  warnings: string[];
  preflightStatus: "blocked" | "publish_ready_with_warnings" | "publish_ready";
  preflightBlockers: string[];
  payload: BuildoutExportPreview;
};

export async function generateBuildoutExportPreview(slug: string): Promise<BuildoutExportResult> {
  const property = await getPropertyBySlug(slug);
  if (!property) {
    throw new Error("Property not found");
  }

  const rawDoc = await db.collection(PROPERTIES_COLLECTION).doc(property.id).get();
  const raw = (rawDoc.data() as Record<string, any> | undefined) ?? {};
  const admin = raw.admin ?? {};
  const pricing = raw.pricing ?? {};
  const visibility = raw.visibility ?? {};
  const content = raw.content ?? {};
  const suites = normalizeSuites(admin.suites);
  const transactionType = normalizeTransactionLabel(visibility);
  const saleActive = visibility.saleActive === true || transactionType?.toLowerCase().includes("sale");
  const leaseActive = visibility.leaseActive === true || transactionType?.toLowerCase().includes("lease");
  const street = firstPresent(property.address.street, raw.address?.street);
  const textContext = { street };

  const payload: BuildoutExportPreview = {
    slug: property.slug,
    title: sanitizePlainSpeak(property.title, textContext),
    transactionType,
    fieldMapVersion: BUILDOUT_FIELD_MAP_VERSION,
    fieldMap: BUILDOUT_FIELD_MAP,
    address: {
      full: firstPresent(property.address.full, raw.address?.full),
      street,
      city: firstPresent(property.address.city, raw.address?.city),
      state: firstPresent(property.address.state, raw.address?.state),
      zip: firstPresent(property.address.zip, raw.address?.zip),
      county: firstPresent(property.address.county, raw.address?.county),
    },
    property: {
      category: firstPresent(property.property.category, raw.property?.category),
      parcelId: firstPresent(property.property.parcelId, raw.property?.parcelId),
      zoning: firstPresent(property.property.zoning, raw.property?.zoning),
      buildingSizeSf: parseNumber(property.property.buildingSizeSf ?? raw.property?.buildingSizeSf),
      lotSizeAcres: parseNumber(property.property.lotSizeAcres ?? raw.property?.lotSizeAcres),
      yearBuilt: parseNumber(property.property.yearBuilt ?? raw.property?.yearBuilt),
      parking: firstPresent(raw.property?.parking, admin.parking),
      leaseType: firstPresent(admin.leaseType),
      availableSqFt: parseNumber(pricing.availableSqFt),
    },
    pricing: {
      salePriceDollars: parseNumber(property.pricing.salePriceDollars ?? pricing.salePriceDollars),
      salePriceIsCallForPrice: pricing.salePriceIsCallForPrice === true || property.pricing.hideSalePrice === true,
      askingPriceRatePerSf: parseNumber(pricing.askingPriceRatePerSf),
      listingPriceVisibility: firstPresent(pricing.listingPriceVisibility, property.pricing.hiddenPriceLabel),
    },
    content: {
      saleTitle: sanitizePlainSpeak(firstPresent(property.content.saleTitle, content.saleTitle) || "", textContext) || null,
      saleDescription: sanitizePlainSpeak(firstPresent(property.content.saleDescription, content.saleDescription) || "", textContext) || null,
      leaseDescription: sanitizePlainSpeak(firstPresent(property.content.leaseDescription, content.leaseDescription) || "", textContext) || null,
      locationDescription: sanitizePlainSpeak(firstPresent(property.content.locationDescription, content.locationDescription) || "", textContext) || null,
      exteriorDescription: sanitizePlainSpeak(firstPresent(property.content.exteriorDescription, content.exteriorDescription) || "", textContext) || null,
      saleBullets: normalizeBullets(property.content.saleBullets ?? content.saleBullets, textContext),
      leaseBullets: normalizeBullets(property.content.leaseBullets ?? content.leaseBullets, textContext),
    },
    suites,
    broker: {
      leadBroker: firstPresent(raw.leadBroker, admin.leadBroker),
      ownerEmail: firstPresent(raw.ownerEmail, raw.ownerUserId),
    },
    media: {
      heroImageUrl: firstPresent(property.media.heroImageUrl, raw.media?.heroImageUrl),
      imageCount: Array.isArray(property.media.images) ? property.media.images.length : 0,
    },
  };

  const missingRequiredFields = compact([
    payload.title ? "" : "title",
    payload.address.street ? "" : "address.street",
    payload.address.city ? "" : "address.city",
    payload.address.state ? "" : "address.state",
    payload.address.county ? "" : "address.county",
    payload.property.category ? "" : "property.category",
    payload.property.parcelId ? "" : "property.parcelId",
    payload.property.zoning ? "" : "property.zoning",
    payload.broker.leadBroker ? "" : "broker.leadBroker",
    payload.content.saleTitle ? "" : "content.saleTitle",
    payload.content.locationDescription ? "" : "content.locationDescription",
    payload.media.imageCount > 0 ? "" : "media.images",
    payload.property.buildingSizeSf || payload.property.lotSizeAcres ? "" : "property.size",
    saleActive && !payload.content.saleDescription ? "content.saleDescription" : "",
    saleActive && !(payload.pricing.salePriceDollars || payload.pricing.salePriceIsCallForPrice || payload.pricing.listingPriceVisibility) ? "pricing.sale" : "",
    leaseActive && !payload.content.leaseDescription ? "content.leaseDescription" : "",
    leaseActive && !(payload.pricing.askingPriceRatePerSf || payload.suites.length > 0) ? "pricing.lease" : "",
    leaseActive && !payload.property.availableSqFt && !payload.suites.some((suite) => suite.availableSqFt) ? "property.availableSqFt" : "",
  ]);

  const warnings = compact([
    payload.address.zip ? "" : "address.zip missing",
    payload.property.yearBuilt ? "" : "yearBuilt missing",
    payload.property.parking ? "" : "parking missing",
    payload.content.exteriorDescription ? "" : "exteriorDescription missing",
    payload.content.saleBullets.length || payload.content.leaseBullets.length ? "" : "bullets missing",
    leaseActive && !payload.suites.length ? "lease suites not structured" : "",
    payload.media.heroImageUrl ? "" : "hero image missing",
  ]);

  const preflight = evaluateAdminPreflight(raw);

  return {
    ready: missingRequiredFields.length === 0 && preflight.blockers.length === 0,
    missingRequiredFields,
    warnings,
    preflightStatus: preflight.status,
    preflightBlockers: preflight.blockers,
    payload,
  };
}

export async function persistBuildoutExportPreview(slug: string, generatedBy: string) {
  const result = await generateBuildoutExportPreview(slug);
  const doc = await db.collection(PROPERTIES_COLLECTION).where("slug", "==", slug).limit(1).get();
  const propertyDoc = !doc.empty ? doc.docs[0] : await db.collection(PROPERTIES_COLLECTION).doc(slug).get();
  if (!propertyDoc.exists) throw new Error("Property not found");

  await db.collection(PROPERTIES_COLLECTION).doc(propertyDoc.id).set(
    {
      meta: {
        export: {
          buildoutReady: result.ready,
          buildoutPayloadVersion: BUILDOUT_FIELD_MAP_VERSION,
          buildoutFieldMap: BUILDOUT_FIELD_MAP,
          buildoutLastGeneratedAt: FieldValue.serverTimestamp(),
          buildoutLastGeneratedBy: generatedBy,
          buildoutSyncStatus: result.ready ? "ready" : "not_ready",
          buildoutSyncError: result.ready ? null : result.preflightBlockers[0] || result.missingRequiredFields[0] || null,
          missingRequiredFields: result.missingRequiredFields,
          warnings: result.warnings,
          preflightStatus: result.preflightStatus,
          preflightBlockers: result.preflightBlockers,
          payloadPreview: result.payload,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    { merge: true },
  );

  return result;
}
