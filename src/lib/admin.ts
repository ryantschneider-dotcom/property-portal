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
  websiteUrl: string;
  leadBroker: string;

  addressStreet: string;
  addressFull: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  latitude: string;
  longitude: string;
  neighborhood: string;
  corridor: string;
  anchorTenants: string;
  nearbyRestaurants: string;
  nearbyBanks: string;

  saleTitle: string;
  salePriceDollars: string;
  hiddenPriceLabel: string;
  hideSalePrice: boolean;
  listingPriceVisibility: string;
  askingPriceRate: string;
  availableSf: string;
  leaseType: string;

  propertyTypeId: string;
  propertySubtypeId: string;
  propertyTypeLabel: string;
  buildingSizeSf: string;
  lotSizeAcres: string;
  yearBuilt: string;
  zoning: string;
  parcelId: string;
  parking: string;
  exteriorConstructionType: string;
  propertyClass: string;
  assessorImprovements: string;

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

function splitLines(values: string): string[] {
  return values
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitBullets(values: string): string[] {
  return splitLines(values);
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
    websiteUrl: "",
    leadBroker: "",

    addressStreet: "",
    addressFull: "",
    city: "",
    state: "GA",
    zip: "",
    county: "",
    latitude: "",
    longitude: "",
    neighborhood: "",
    corridor: "",
    anchorTenants: "",
    nearbyRestaurants: "",
    nearbyBanks: "",

    saleTitle: "",
    salePriceDollars: "",
    hiddenPriceLabel: "",
    hideSalePrice: false,
    listingPriceVisibility: "",
    askingPriceRate: "",
    availableSf: "",
    leaseType: "",

    propertyTypeId: "",
    propertySubtypeId: "",
    propertyTypeLabel: "",
    buildingSizeSf: "",
    lotSizeAcres: "",
    yearBuilt: "",
    zoning: "",
    parcelId: "",
    parking: "",
    exteriorConstructionType: "",
    propertyClass: "",
    assessorImprovements: "",

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

  const rawDoc = await db.collection(PROPERTIES_COLLECTION).doc(property.id).get();
  const raw = (rawDoc.data() as Record<string, any> | undefined) ?? {};
  const meta = raw.meta ?? {};
  const intake = meta.intake ?? {};
  const research = meta.research ?? {};
  const places = research.places ?? {};
  const publicRecords = research.public_records ?? {};
  const rawProperty = raw.property ?? {};
  const rawPricing = raw.pricing ?? {};
  const rawLinks = raw.links ?? {};
  const rawContent = raw.content ?? {};

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
    websiteUrl: asString(rawLinks.websiteUrl || meta.websiteUrl || intake.website_url || intake["Website URL (If applicable)"]),
    leadBroker: asString(intake.lead_broker || intake["Lead Broker"]),

    addressStreet: property.address.street ?? asString(intake.street_number && intake.street_name ? `${intake.street_number} ${intake.street_name}` : ""),
    addressFull: property.address.full ?? asString(rawProperty.address),
    city: property.address.city ?? asString(rawProperty.city || intake.city || intake["City"]),
    state: property.address.state ?? asString(rawProperty.state || intake.state || intake["State"]),
    zip: property.address.zip ?? asString(rawProperty.zip || intake.zip_code || intake["Zip Code"]),
    county: property.address.county ?? asString(rawProperty.county || intake.county || intake["County"]),
    latitude: asString(property.location.lat || rawProperty.latitude || intake.map_coordinates?.lat),
    longitude: asString(property.location.lng || rawProperty.longitude || intake.map_coordinates?.lng),
    neighborhood: asString(places.neighborhood),
    corridor: asString(places.corridor),
    anchorTenants: asString((places.anchor_tenants ?? []).join("\n")),
    nearbyRestaurants: asString((places.restaurants ?? []).join("\n")),
    nearbyBanks: asString((places.banks ?? []).join("\n")),

    saleTitle: asString(rawContent.saleTitle || rawProperty.sale_title || meta.copy?.sale_title),
    salePriceDollars: asString(property.pricing.salePriceDollars || intake.listing_price_amount || intake["Listing Price Amount (Leave blank if undisclosed)"]),
    hiddenPriceLabel: property.pricing.hiddenPriceLabel ?? asString(rawProperty.hidden_price_label),
    hideSalePrice: property.pricing.hideSalePrice === true || rawProperty.hide_sale_price === true,
    listingPriceVisibility: asString(intake.listing_price_visibility || intake["Listing Price Visibility"]),
    askingPriceRate: asString(intake.asking_price_rate || intake["Asking Price/Lease Rate/per sf"]),
    availableSf: asString(intake.available_sf || intake["Available Sq. Ft."]),
    leaseType: asString(intake.lease_type || intake["Lease Type"]),

    propertyTypeId: asString(rawProperty.property_type_id),
    propertySubtypeId: asString(rawProperty.property_subtype_id || meta.copy?.property_subtype_id),
    propertyTypeLabel: asString(intake.property_type || intake["Property Type"]),
    buildingSizeSf: asString(property.property.buildingSizeSf || rawProperty.building_size_sf || publicRecords.building_size_sf),
    lotSizeAcres: asString(property.property.lotSizeAcres || rawProperty.lot_size_acres || publicRecords.lot_size_acres),
    yearBuilt: asString(property.property.yearBuilt || rawProperty.year_built || publicRecords.year_built),
    zoning: property.property.zoning ?? asString(rawProperty.zoning || publicRecords.zoning),
    parcelId: property.property.parcelId ?? asString(intake.parcel_id || intake.tax_id || intake["Tax ID #/Map ID #"]),
    parking: asString(publicRecords.parking),
    exteriorConstructionType: asString(publicRecords.exterior_construction_type),
    propertyClass: asString(publicRecords.property_class),
    assessorImprovements: asString((publicRecords.assessor_improvements ?? []).join("\n")),

    saleDescription: property.content.saleDescription ?? asString(rawProperty.sale_description || meta.copy?.sale_description),
    leaseDescription: property.content.leaseDescription ?? "",
    locationDescription: property.content.locationDescription ?? asString(rawProperty.location_description || meta.copy?.location_description),
    exteriorDescription: property.content.exteriorDescription ?? asString(rawProperty.exterior_description || meta.copy?.exterior_description),
    saleBullets: (property.content.saleBullets ?? rawProperty.sale_bullets ?? meta.copy?.sale_bullets ?? []).join("\n"),
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
      neighborhood: input.neighborhood.trim() || null,
      submarket: input.corridor.trim() || null,
      hideAddress: false,
    },
    location: {
      lat: parseOptionalNumber(input.latitude),
      lng: parseOptionalNumber(input.longitude),
    },
    property: {
      category: inferCategory(existing) || input.propertyTypeLabel.trim() || null,
      propertyTypeId: input.propertyTypeId.trim() || null,
      propertySubtypeId: input.propertySubtypeId.trim() || null,
      buildingSizeSf: parseOptionalNumber(input.buildingSizeSf),
      lotSizeAcres: parseOptionalNumber(input.lotSizeAcres),
      yearBuilt: parseOptionalNumber(input.yearBuilt),
      zoning: input.zoning.trim() || null,
      parcelId: input.parcelId.trim() || null,
      parking: input.parking.trim() || null,
      exteriorConstructionType: input.exteriorConstructionType.trim() || null,
      propertyClass: input.propertyClass.trim() || null,
    },
    pricing: {
      hideSalePrice: input.hideSalePrice || !input.salePriceDollars.trim(),
      hiddenPriceLabel: input.hiddenPriceLabel.trim() || null,
      salePriceDollars: parseOptionalNumber(input.salePriceDollars),
      askingPriceRatePerSf: parseOptionalNumber(input.askingPriceRate),
      availableSqFt: parseOptionalNumber(input.availableSf),
      listingPriceVisibility: input.listingPriceVisibility.trim() || null,
    },
    content: {
      saleTitle: input.saleTitle.trim() || null,
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
    admin: {
      leadBroker: input.leadBroker.trim() || null,
      leaseType: input.leaseType.trim() || null,
      propertyTypeLabel: input.propertyTypeLabel.trim() || null,
      neighborhood: input.neighborhood.trim() || null,
      corridor: input.corridor.trim() || null,
      anchorTenants: splitLines(input.anchorTenants),
      nearbyRestaurants: splitLines(input.nearbyRestaurants),
      nearbyBanks: splitLines(input.nearbyBanks),
      assessorImprovements: splitLines(input.assessorImprovements),
    },
    meta: {
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: existing ? undefined : FieldValue.serverTimestamp(),
      adminLastEditedAt: FieldValue.serverTimestamp(),
      adminOverrides: {
        listingPriceVisibility: input.listingPriceVisibility.trim() || null,
        askingPriceRate: parseOptionalNumber(input.askingPriceRate),
        availableSf: parseOptionalNumber(input.availableSf),
        leaseType: input.leaseType.trim() || null,
        leadBroker: input.leadBroker.trim() || null,
        propertyTypeLabel: input.propertyTypeLabel.trim() || null,
        neighborhood: input.neighborhood.trim() || null,
        corridor: input.corridor.trim() || null,
        anchorTenants: splitLines(input.anchorTenants),
        nearbyRestaurants: splitLines(input.nearbyRestaurants),
        nearbyBanks: splitLines(input.nearbyBanks),
        parking: input.parking.trim() || null,
        exteriorConstructionType: input.exteriorConstructionType.trim() || null,
        propertyClass: input.propertyClass.trim() || null,
        assessorImprovements: splitLines(input.assessorImprovements),
      },
    },
  };

  const cleanPayload = JSON.parse(JSON.stringify(payload));
  await db.collection(PROPERTIES_COLLECTION).doc(docId).set(cleanPayload, { merge: true });
  return { ok: true, documentId: docId, slug };
}
