import "server-only";

import { db } from "@/../firebase";
import type { PropertyCard, PropertyDetail, PropertyMapMarker, TransactionType } from "@/lib/types";

function coalesce<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") {
      return value as T;
    }
  }
  return null;
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
    .filter((item) => item.status === "active")
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

export async function getPropertyBySlug(slug: string): Promise<PropertyDetail | null> {
  const snapshot = await db.collection(PROPERTIES_COLLECTION).where("slug", "==", slug).limit(1).get();
  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
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
    pricing: (data.pricing as PropertyDetail["pricing"]) ?? {
      hideSalePrice: false,
      hiddenPriceLabel: null,
      salePriceDollars: null,
      salePricePerUnit: null,
      salePriceUnits: null,
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
    links: (data.links as PropertyDetail["links"]) ?? {
      saleListingUrl: null,
      leaseListingUrl: null,
      virtualTourUrl: null,
      matterportUrl: null,
      youTubeUrl: null,
    },
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
