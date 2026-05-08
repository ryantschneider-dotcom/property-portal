import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { evaluateAdminPreflight } from "@/lib/admin-workflow";
import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";
import { getPropertyBySlug } from "@/lib/properties";

function asString(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function compact<T>(values: Array<T | null | undefined | false | "">): T[] {
  return values.filter(Boolean) as T[];
}

function normalizeBullets(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePlainSpeak(asString(item))).filter(Boolean);
  }
  return asString(value)
    .split(/\n+/)
    .map((item) => sanitizePlainSpeak(item))
    .filter(Boolean);
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

function sanitizePlainSpeak(value: string): string {
  if (!value) return "";
  return collapseWhitespace(
    value
      .replace(/\b(premier|stunning|exceptional|incredible|amazing|rare opportunity|must-see|one-of-a-kind|best-in-class|beautiful|fantastic|gorgeous|unmatched|trophy|world-class|spectacular)\b/gi, "")
      .replace(/[!]{2,}/g, "")
      .replace(/\s+,/g, ",")
      .replace(/\s+\./g, "."),
  );
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

  const payload: BuildoutExportPreview = {
    slug: property.slug,
    title: sanitizePlainSpeak(property.title),
    transactionType,
    address: {
      full: firstPresent(property.address.full, raw.address?.full),
      street: firstPresent(property.address.street, raw.address?.street),
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
      saleTitle: sanitizePlainSpeak(firstPresent(property.content.saleTitle, content.saleTitle) || "") || null,
      saleDescription: sanitizePlainSpeak(firstPresent(property.content.saleDescription, content.saleDescription) || "") || null,
      leaseDescription: sanitizePlainSpeak(firstPresent(property.content.leaseDescription, content.leaseDescription) || "") || null,
      locationDescription: sanitizePlainSpeak(firstPresent(property.content.locationDescription, content.locationDescription) || "") || null,
      exteriorDescription: sanitizePlainSpeak(firstPresent(property.content.exteriorDescription, content.exteriorDescription) || "") || null,
      saleBullets: normalizeBullets(property.content.saleBullets ?? content.saleBullets),
      leaseBullets: normalizeBullets(property.content.leaseBullets ?? content.leaseBullets),
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
          buildoutPayloadVersion: "v2-structured",
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
