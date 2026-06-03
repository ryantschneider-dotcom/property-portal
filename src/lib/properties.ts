import "server-only";

import { db } from "@/lib/firestore";
import type { PropertyCard, PropertyDetail, PropertyMapMarker, TransactionType } from "@/lib/types";

const PROPERTIES_COLLECTION = "properties";

function coalesce<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") {
      return value as T;
    }
  }
  return null;
}

function asPositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.-]/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function normalizeSpaces(data: Record<string, unknown>) {
  const raw = (data.raw as Record<string, unknown> | undefined)?.buildout as Record<string, unknown> | undefined;
  const candidates = [
    data.spaces,
    data.suites,
    (data.availability as Record<string, unknown> | undefined)?.spaces,
    (data.availability as Record<string, unknown> | undefined)?.suites,
    raw?.spaces,
    raw?.suites,
    raw?.availabilities,
    raw?.units,
  ].filter(Array.isArray) as Array<Array<Record<string, unknown>>>;

  return candidates.flatMap((items) => items.map((item) => ({
    id: (item.id as string | number | null) ?? null,
    name: (item.name as string | null) ?? (item.title as string | null) ?? null,
    suite: (item.suite as string | null) ?? (item.unit as string | null) ?? (item.label as string | null) ?? null,
    sizeSf: asPositiveNumber(item.sizeSf) ?? asPositiveNumber(item.availableSqFt) ?? asPositiveNumber(item.squareFeet) ?? asPositiveNumber(item.sqFt) ?? asPositiveNumber(item.size),
    ratePerSf: asPositiveNumber(item.ratePerSf) ?? asPositiveNumber(item.askingPriceRatePerSf) ?? asPositiveNumber(item.pricePerSf) ?? asPositiveNumber(item.leaseRate),
    monthlyRate: asPositiveNumber(item.monthlyRate) ?? asPositiveNumber(item.monthlyRent) ?? asPositiveNumber(item.rentPerMonth),
    rawRateLabel: (item.rateLabel as string | null) ?? (item.priceLabel as string | null) ?? null,
  })));
}

function formatTeaserText(pricing: Record<string, unknown> | undefined): string | null {
  if (!pricing) return null;
  if (pricing.hideSalePrice === true) {
    return (pricing.hiddenPriceLabel as string | null) ?? "Call for Price";
  }
  const dollars = pricing.salePriceDollars as number | null | undefined;
  if (typeof dollars === "number") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(dollars);
  }
  return null;
}

function normalizeTransactionTypes(visibility: Record<string, unknown> | undefined): TransactionType[] {
  const label = visibility?.transactionLabel;
  if (label === "For Sale") return ["sale"];
  if (label === "For Lease") return ["lease"];
  if (label === "For Sale/Lease") return ["sale", "lease"];
  return [];
}

function normalizedStatusText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function isUnderContractValue(value: unknown): boolean {
  if (value === true) return true;
  const normalized = normalizedStatusText(value);
  return ["under_contract", "undercontract", "contract_pending", "pending_contract", "pending_sale"].includes(normalized);
}

function recordHasUnderContractFlag(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.entries(record).some(([key, flagValue]) => {
    const normalizedKey = normalizedStatusText(key);
    if (["under_contract", "undercontract", "is_under_contract"].includes(normalizedKey) && flagValue === true) {
      return true;
    }
    return isUnderContractValue(flagValue);
  });
}

function isUnderContractListing(data: Record<string, unknown>): boolean {
  const visibility = (data.visibility as Record<string, unknown> | undefined) ?? {};
  const meta = (data.meta as Record<string, unknown> | undefined) ?? {};
  const listing = (data.listing as Record<string, unknown> | undefined) ?? {};
  const deal = (data.deal as Record<string, unknown> | undefined) ?? {};

  return [
    data.underContract,
    data.isUnderContract,
    data.status,
    data.workflowStatus,
    data.listingStatus,
    data.saleStatus,
    data.contractStatus,
    visibility.status,
    visibility.listingStatus,
    visibility.saleStatus,
    visibility.underContract,
    meta.status,
    meta.listingStatus,
    meta.saleStatus,
    listing.status,
    listing.listingStatus,
    deal.status,
    deal.stage,
    data.statusFlags,
    visibility.statusFlags,
    meta.statusFlags,
  ].some((value) => isUnderContractValue(value) || recordHasUnderContractFlag(value));
}

function buildBadges(data: Record<string, unknown>): string[] {
  const badges: string[] = [];
  const visibility = (data.visibility as Record<string, unknown> | undefined) ?? {};
  const property = (data.property as Record<string, unknown> | undefined) ?? {};

  if (visibility.transactionLabel && typeof visibility.transactionLabel === "string") {
    badges.push(visibility.transactionLabel);
  }
  if (property.category && typeof property.category === "string") {
    badges.push(property.category.replace(/(^|\s)\S/g, (s) => s.toUpperCase()));
  }
  return badges;
}

type PropertyRecord = Record<string, unknown> & { id: string };

export async function listPropertyCards(transaction: "sale" | "lease" | "all" = "all"): Promise<PropertyCard[]> {
  const snapshot = await db.collection(PROPERTIES_COLLECTION).get();
  const items = snapshot.docs
    .map((doc): PropertyRecord => {
      const data = doc.data() as Record<string, unknown>;
      return { id: doc.id, ...data };
    })
    .filter((item) => item.status === "active" || isUnderContractListing(item))
    .filter((item) => {
      const visibility = (item.visibility as Record<string, unknown> | undefined) ?? {};
      if (transaction === "sale") return visibility.saleActive === true;
      if (transaction === "lease") return visibility.leaseActive === true;
      return true;
    })
    .map((item): PropertyCard => {
      const address = (item.address as Record<string, unknown> | undefined) ?? {};
      const property = (item.property as Record<string, unknown> | undefined) ?? {};
      const pricing = (item.pricing as Record<string, unknown> | undefined) ?? {};
      const media = (item.media as Record<string, unknown> | undefined) ?? {};
      const meta = (item.meta as Record<string, unknown> | undefined) ?? {};
      const images = (media.images as Array<Record<string, unknown>> | undefined) ?? [];
      const firstImage = images[0] ?? undefined;
      const firstUrls = (firstImage?.urls as Record<string, unknown> | undefined) ?? {};

      return {
        id: item.id as string,
        slug: (item.slug as string | null) ?? item.id as string,
        title: (item.title as string | null) ?? "Untitled Property",
        underContract: isUnderContractListing(item),
        transactionTypes: normalizeTransactionTypes((item.visibility as Record<string, unknown> | undefined) ?? {}),
        propertyCategory: (property.category as string | null) ?? null,
        address: {
          street: (address.street as string | null) ?? null,
          city: (address.city as string | null) ?? null,
          state: (address.state as string | null) ?? null,
          zip: (address.zip as string | null) ?? null,
          full: (address.full as string | null) ?? null,
        },
        heroImageUrl: (media.heroImageUrl as string | null) ?? null,
        thumbnailUrl: coalesce(firstUrls.thumb as string | null, firstUrls.medium as string | null, media.heroImageUrl as string | null),
        stats: {
          buildingSizeSf: (property.buildingSizeSf as number | null) ?? null,
          lotSizeAcres: (property.lotSizeAcres as number | null) ?? null,
          yearBuilt: (property.yearBuilt as number | null) ?? null,
        },
        pricing: {
          hideSalePrice: pricing.hideSalePrice === true,
          hiddenPriceLabel: (pricing.hiddenPriceLabel as string | null) ?? null,
          salePriceDollars: (pricing.salePriceDollars as number | null) ?? null,
          teaserText: formatTeaserText(pricing),
        },
        badges: buildBadges(item),
        updatedAt: (meta.updatedAt as string | null) ?? null,
      };
    });

  return items;
}

export async function getPropertyDocumentByIdentifier(identifier: string): Promise<FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot | null> {
  const normalized = identifier.trim();
  if (!normalized) return null;

  const bySlug = await db.collection(PROPERTIES_COLLECTION).where("slug", "==", normalized).limit(1).get();
  if (!bySlug.empty) {
    return bySlug.docs[0];
  }

  const directDoc = await db.collection(PROPERTIES_COLLECTION).doc(normalized).get();
  if (directDoc.exists) {
    return directDoc;
  }

  const byTitle = await db.collection(PROPERTIES_COLLECTION).where("title", "==", normalized).limit(1).get();
  if (!byTitle.empty) {
    return byTitle.docs[0];
  }

  return null;
}

export async function getPropertyBySlug(slug: string): Promise<PropertyDetail | null> {
  const doc = await getPropertyDocumentByIdentifier(slug);
  if (!doc) return null;

  const data = doc.data() as Record<string, unknown>;

  return {
    id: doc.id,
    slug: (data.slug as string | null) ?? doc.id,
    title: (data.title as string | null) ?? "Untitled Property",
    transactionTypes: normalizeTransactionTypes((data.visibility as Record<string, unknown> | undefined) ?? {}),
    address: (data.address as PropertyDetail["address"]) ?? {
      full: null,
      street: null,
      city: null,
      state: null,
      zip: null,
      county: null,
      market: null,
      submarket: null,
      crossStreets: null,
      hideAddress: false,
    },
    location: {
      lat: ((data.location as Record<string, unknown> | undefined)?.lat as number | null) ?? null,
      lng: ((data.location as Record<string, unknown> | undefined)?.lng as number | null) ?? null,
    },
    property: (data.property as PropertyDetail["property"]) ?? {
      category: null,
      typeId: null,
      subtypeId: null,
      buildingSizeSf: null,
      grossLeasableArea: null,
      lotSizeAcres: null,
      yearBuilt: null,
      numberOfUnits: null,
      numberOfFloors: null,
    },
    pricing: {
      hideSalePrice: ((data.pricing as Record<string, unknown> | undefined)?.hideSalePrice as boolean | undefined) === true,
      hiddenPriceLabel: ((data.pricing as Record<string, unknown> | undefined)?.hiddenPriceLabel as string | null) ?? null,
      salePriceDollars: ((data.pricing as Record<string, unknown> | undefined)?.salePriceDollars as number | null) ?? null,
      salePricePerUnit: ((data.pricing as Record<string, unknown> | undefined)?.salePricePerUnit as number | null) ?? null,
      salePriceUnits: ((data.pricing as Record<string, unknown> | undefined)?.salePriceUnits as string | null) ?? null,
      availableSqFt:
        (((data.pricing as Record<string, unknown> | undefined)?.availableSqFt as number | null) ?? null) ||
        ((((data.meta as Record<string, unknown> | undefined)?.adminOverrides as Record<string, unknown> | undefined)?.availableSf as number | null) ?? null),
      askingPriceRatePerSf:
        (((data.pricing as Record<string, unknown> | undefined)?.askingPriceRatePerSf as number | null) ?? null) ||
        ((((data.meta as Record<string, unknown> | undefined)?.adminOverrides as Record<string, unknown> | undefined)?.askingPriceRate as number | null) ?? null),
      leaseType: (((data.meta as Record<string, unknown> | undefined)?.adminOverrides as Record<string, unknown> | undefined)?.leaseType as string | null) ?? null,
      listingPriceVisibility:
        (((data.pricing as Record<string, unknown> | undefined)?.listingPriceVisibility as string | null) ?? null) ||
        ((((data.meta as Record<string, unknown> | undefined)?.adminOverrides as Record<string, unknown> | undefined)?.listingPriceVisibility as string | null) ?? null),
    },
    content: (data.content as PropertyDetail["content"]) ?? {
      locationDescription: null,
      siteDescription: null,
      exteriorDescription: null,
      saleTitle: null,
      saleDescription: null,
      saleBullets: [],
      leaseTitle: null,
      leaseDescription: null,
      leaseBullets: [],
    },
    media: (data.media as PropertyDetail["media"]) ?? {
      heroImageUrl: null,
      images: [],
      documents: [],
    },
    spaces: normalizeSpaces(data),
    links: (data.links as PropertyDetail["links"]) ?? {
      saleListingUrl: null,
      leaseListingUrl: null,
      virtualTourUrl: null,
      matterportUrl: null,
      youTubeUrl: null,
    },
    demographics: (data.demographics as PropertyDetail["demographics"]) ?? null,
    enrichment: (data.enrichment as PropertyDetail["enrichment"]) ?? null,
    om: (data.om as PropertyDetail["om"]) ?? null,
  };
}

export async function listMapMarkers(transaction: "sale" | "lease" | "all" = "all"): Promise<PropertyMapMarker[]> {
  const cards = await listPropertyCards(transaction);
  const snapshot = await db.collection(PROPERTIES_COLLECTION).get();
  const locationById = new Map(
    snapshot.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const location = (data.location as Record<string, unknown> | undefined) ?? {};
      return [doc.id, location] as const;
    }),
  );

  return cards
    .map((card): PropertyMapMarker | null => {
      const location = locationById.get(card.id) ?? {};
      const lat = typeof location.lat === "number" ? location.lat : null;
      const lng = typeof location.lng === "number" ? location.lng : null;
      if (lat === null || lng === null) return null;

      return {
        id: card.id,
        slug: card.slug,
        title: card.title,
        transactionTypes: card.transactionTypes,
        propertyCategory: card.propertyCategory,
        coordinates: { lat, lng },
        address: {
          full: card.address.full,
          city: card.address.city,
          state: card.address.state,
        },
        pricing: {
          teaserText: card.pricing.teaserText,
        },
        heroImageUrl: card.heroImageUrl,
      };
    })
    .filter((item): item is PropertyMapMarker => Boolean(item));
}
