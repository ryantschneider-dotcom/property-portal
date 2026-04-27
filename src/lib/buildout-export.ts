import "server-only";

import { FieldValue } from "firebase-admin/firestore";

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
    return value.map((item) => asString(item)).filter(Boolean);
  }
  return asString(value)
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
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
  };
  pricing: {
    salePriceDollars: number | null;
    askingPriceRatePerSf: number | null;
    listingPriceVisibility: string | null;
  };
  content: {
    saleTitle: string | null;
    saleDescription: string | null;
    locationDescription: string | null;
    exteriorDescription: string | null;
    saleBullets: string[];
  };
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

  const payload: BuildoutExportPreview = {
    slug: property.slug,
    title: property.title,
    transactionType: asString(visibility.transactionLabel) || null,
    address: {
      full: property.address.full,
      street: property.address.street,
      city: property.address.city,
      state: property.address.state,
      zip: property.address.zip,
      county: property.address.county,
    },
    property: {
      category: property.property.category,
      parcelId: property.property.parcelId ?? null,
      zoning: property.property.zoning ?? null,
      buildingSizeSf: property.property.buildingSizeSf,
      lotSizeAcres: property.property.lotSizeAcres,
      yearBuilt: property.property.yearBuilt,
      parking: asString(raw.property?.parking) || null,
      leaseType: asString(admin.leaseType) || null,
    },
    pricing: {
      salePriceDollars: property.pricing.salePriceDollars,
      askingPriceRatePerSf: typeof pricing.askingPriceRatePerSf === "number" ? pricing.askingPriceRatePerSf : null,
      listingPriceVisibility: asString(pricing.listingPriceVisibility) || null,
    },
    content: {
      saleTitle: property.content.saleTitle,
      saleDescription: property.content.saleDescription,
      locationDescription: property.content.locationDescription,
      exteriorDescription: property.content.exteriorDescription,
      saleBullets: normalizeBullets(property.content.saleBullets),
    },
    broker: {
      leadBroker: asString(raw.leadBroker || admin.leadBroker) || null,
      ownerEmail: asString(raw.ownerEmail || raw.ownerUserId) || null,
    },
    media: {
      heroImageUrl: property.media.heroImageUrl,
      imageCount: property.media.images.length,
    },
  };

  const missingRequiredFields = compact([
    payload.title ? "" : "title",
    payload.address.street ? "" : "address.street",
    payload.address.city ? "" : "address.city",
    payload.address.state ? "" : "address.state",
    payload.property.category ? "" : "property.category",
    payload.content.saleTitle ? "" : "content.saleTitle",
    payload.content.saleDescription ? "" : "content.saleDescription",
    payload.content.locationDescription ? "" : "content.locationDescription",
  ]);

  const warnings = compact([
    payload.property.parcelId ? "" : "parcelId missing",
    payload.property.zoning ? "" : "zoning missing",
    payload.property.buildingSizeSf ? "" : "buildingSizeSf missing",
    payload.property.lotSizeAcres ? "" : "lotSizeAcres missing",
    payload.media.imageCount > 0 ? "" : "no images attached",
    payload.content.saleBullets.length > 0 ? "" : "sale bullets missing",
  ]);

  return {
    ready: missingRequiredFields.length === 0,
    missingRequiredFields,
    warnings,
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
          buildoutPayloadVersion: "v1-preview",
          buildoutLastGeneratedAt: FieldValue.serverTimestamp(),
          buildoutLastGeneratedBy: generatedBy,
          buildoutSyncStatus: result.ready ? "ready" : "not_ready",
          buildoutSyncError: null,
          missingRequiredFields: result.missingRequiredFields,
          warnings: result.warnings,
          payloadPreview: result.payload,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    { merge: true },
  );

  return result;
}
