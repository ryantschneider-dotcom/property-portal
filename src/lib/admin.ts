import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";
import { getPropertyBySlug } from "@/lib/properties";
import type { PropertyDetail } from "@/lib/types";

export type AdminPropertyListItem = {
  id: string;
  slug: string;
  title: string;
  address: string | null;
  transactionLabel: string | null;
  parcelId: string | null;
  zoning: string | null;
  updatedAt: string | null;
};

export type AdminPropertyFormData = {
  id?: string;
  slug: string;
  title: string;
  transactionType: "sale" | "lease" | "sale-lease";
  addressStreet: string;
  addressFull: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  latitude: string;
  longitude: string;
  salePriceDollars: string;
  hiddenPriceLabel: string;
  buildingSizeSf: string;
  lotSizeAcres: string;
  yearBuilt: string;
  zoning: string;
  parcelId: string;
  websiteUrl: string;
  saleDescription: string;
  leaseDescription: string;
  locationDescription: string;
  exteriorDescription: string;
  saleBullets: string;
  leaseBullets: string;
};

function asString(value: unknown): string {
  return value == null ? "" : String(value);
}

function splitBullets(values: string): string[] {
  return values
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function visibilityFromTransaction(transactionType: AdminPropertyFormData["transactionType"]) {
  if (transactionType === "sale") {
    return { transactionLabel: "For Sale", saleActive: true, leaseActive: false };
  }
  if (transactionType === "lease") {
    return { transactionLabel: "For Lease", saleActive: false, leaseActive: true };
  }
  return { transactionLabel: "For Sale/Lease", saleActive: true, leaseActive: true };
}

function inferCategory(existing?: PropertyDetail | null): string | null {
  return existing?.property.category ?? null;
}

export async function listAdminProperties(): Promise<AdminPropertyListItem[]> {
  const snapshot = await db.collection(PROPERTIES_COLLECTION).get();
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const address = (data.address as Record<string, unknown> | undefined) ?? {};
      const visibility = (data.visibility as Record<string, unknown> | undefined) ?? {};
      const property = (data.property as Record<string, unknown> | undefined) ?? {};
      const meta = (data.meta as Record<string, unknown> | undefined) ?? {};
      return {
        id: doc.id,
        slug: asString(data.slug),
        title: asString(data.title) || "Untitled Property",
        address: asString(address.full || address.street) || null,
        transactionLabel: asString(visibility.transactionLabel) || null,
        parcelId: asString(property.parcelId) || null,
        zoning: asString(property.zoning) || null,
        updatedAt: asString(meta.updatedAt) || null,
      } satisfies AdminPropertyListItem;
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function buildEmptyAdminFormData(): AdminPropertyFormData {
  return {
    slug: "",
    title: "",
    transactionType: "sale",
    addressStreet: "",
    addressFull: "",
    city: "",
    state: "GA",
    zip: "",
    county: "",
    latitude: "",
    longitude: "",
    salePriceDollars: "",
    hiddenPriceLabel: "",
    buildingSizeSf: "",
    lotSizeAcres: "",
    yearBuilt: "",
    zoning: "",
    parcelId: "",
    websiteUrl: "",
    saleDescription: "",
    leaseDescription: "",
    locationDescription: "",
    exteriorDescription: "",
    saleBullets: "",
    leaseBullets: "",
  };
}

export async function getAdminPropertyFormData(slug: string): Promise<AdminPropertyFormData | null> {
  const property = await getPropertyBySlug(slug);
  if (!property) return null;

  const transactionType =
    property.transactionTypes.length === 2
      ? "sale-lease"
      : property.transactionTypes[0] === "lease"
        ? "lease"
        : "sale";

  return {
    id: property.id,
    slug: property.slug,
    title: property.title,
    transactionType,
    addressStreet: property.address.street ?? "",
    addressFull: property.address.full ?? "",
    city: property.address.city ?? "",
    state: property.address.state ?? "",
    zip: property.address.zip ?? "",
    county: property.address.county ?? "",
    latitude: asString(property.location.lat),
    longitude: asString(property.location.lng),
    salePriceDollars: asString(property.pricing.salePriceDollars),
    hiddenPriceLabel: property.pricing.hiddenPriceLabel ?? "",
    buildingSizeSf: asString(property.property.buildingSizeSf),
    lotSizeAcres: asString(property.property.lotSizeAcres),
    yearBuilt: asString(property.property.yearBuilt),
    zoning: property.property.zoning ?? "",
    parcelId: property.property.parcelId ?? "",
    websiteUrl: property.links.websiteUrl ?? "",
    saleDescription: property.content.saleDescription ?? "",
    leaseDescription: property.content.leaseDescription ?? "",
    locationDescription: property.content.locationDescription ?? "",
    exteriorDescription: property.content.exteriorDescription ?? "",
    saleBullets: (property.content.saleBullets ?? []).join("\n"),
    leaseBullets: (property.content.leaseBullets ?? []).join("\n"),
  };
}

export async function saveAdminProperty(input: AdminPropertyFormData) {
  const slug = input.slug.trim();
  if (!slug) {
    throw new Error("Slug is required");
  }

  const docId = input.id?.trim() || slug;
  const existing = await getPropertyBySlug(slug);
  const visibility = visibilityFromTransaction(input.transactionType);

  const payload = {
    slug,
    title: input.title.trim(),
    status: "active",
    visibility,
    address: {
      full: input.addressFull.trim() || input.addressStreet.trim(),
      street: input.addressStreet.trim(),
      city: input.city.trim(),
      state: input.state.trim(),
      zip: input.zip.trim(),
      county: input.county.trim(),
      hideAddress: false,
    },
    location: {
      lat: parseOptionalNumber(input.latitude),
      lng: parseOptionalNumber(input.longitude),
    },
    property: {
      category: inferCategory(existing),
      buildingSizeSf: parseOptionalNumber(input.buildingSizeSf),
      lotSizeAcres: parseOptionalNumber(input.lotSizeAcres),
      yearBuilt: parseOptionalNumber(input.yearBuilt),
      zoning: input.zoning.trim() || null,
      parcelId: input.parcelId.trim() || null,
    },
    pricing: {
      hideSalePrice: !input.salePriceDollars.trim(),
      hiddenPriceLabel: input.hiddenPriceLabel.trim() || null,
      salePriceDollars: parseOptionalNumber(input.salePriceDollars),
    },
    content: {
      saleDescription: input.saleDescription.trim() || null,
      leaseDescription: input.leaseDescription.trim() || null,
      locationDescription: input.locationDescription.trim() || null,
      exteriorDescription: input.exteriorDescription.trim() || null,
      saleBullets: splitBullets(input.saleBullets),
      leaseBullets: splitBullets(input.leaseBullets),
    },
    links: {
      websiteUrl: input.websiteUrl.trim() || null,
    },
    meta: {
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: existing ? undefined : FieldValue.serverTimestamp(),
      adminLastEditedAt: FieldValue.serverTimestamp(),
    },
  };

  const cleanPayload = JSON.parse(JSON.stringify(payload));
  await db.collection(PROPERTIES_COLLECTION).doc(docId).set(cleanPayload, { merge: true });
  return { ok: true, documentId: docId, slug };
}
