import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";

function asString(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter(Boolean);
  }
  const text = asString(value);
  if (!text) return [];
  return text
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function compact<T>(values: Array<T | null | undefined | false | "">): T[] {
  return values.filter(Boolean) as T[];
}

function formatNumber(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const number = Number(raw);
  if (!Number.isFinite(number)) return raw;
  return new Intl.NumberFormat("en-US").format(number);
}

function formatAcres(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const number = Number(raw);
  if (!Number.isFinite(number)) return raw;
  return `${number.toFixed(number >= 10 ? 1 : 2).replace(/\.0$/, "")} acres`;
}

function buildNeighborhood(address: Record<string, unknown>, county: string, propertyType: string) {
  const city = asString(address.city);
  const state = asString(address.state) || "GA";
  const corridor = city ? `${city} commercial corridor` : county ? `${county} County corridor` : "local trade area";
  const neighborhood = city ? `${city}, ${state}` : county ? `${county} County, ${state}` : state;

  const description = compact([
    neighborhood && `Situated in ${neighborhood}`,
    propertyType && `this ${propertyType.toLowerCase()} listing sits within the ${corridor}`,
    "with access to surrounding commercial demand drivers and everyday service uses",
  ]).join(" ");

  return {
    neighborhood,
    corridor: titleCase(corridor),
    description,
  };
}

function buildSaleTitle(title: string, transactionLabel: string, city: string) {
  const cleanTitle = title || "Commercial Property";
  if (cleanTitle.toLowerCase().includes("for sale") || cleanTitle.toLowerCase().includes("for lease")) {
    return cleanTitle;
  }
  return compact([cleanTitle, transactionLabel, city]).join(" | ");
}

function buildSaleDescription(input: {
  title: string;
  transactionLabel: string;
  propertyType: string;
  city: string;
  state: string;
  buildingSizeSf: string | null;
  lotSize: string | null;
  yearBuilt: string | null;
  zoning: string | null;
  notes: string;
}) {
  const intro = compact([
    input.title || "This offering",
    input.transactionLabel ? `is available ${input.transactionLabel.toLowerCase()}.` : "is now available.",
  ]).join(" ");

  const facts = compact([
    input.propertyType && `${input.propertyType} asset`,
    input.buildingSizeSf && `${input.buildingSizeSf} SF`,
    input.lotSize,
    input.yearBuilt && `built in ${input.yearBuilt}`,
    input.zoning && `zoned ${input.zoning}`,
  ]).join(", ");

  const market = compact([
    input.city && `Positioned in ${input.city}, ${input.state || "GA"}`,
    "the property offers a practical footprint for marketing, underwriting, and broker review.",
  ]).join(" ");

  const notes = input.notes ? `Broker notes: ${input.notes}` : "";

  return compact([
    intro,
    facts ? `Key facts include ${facts}.` : "",
    market,
    notes,
  ]).join(" ");
}

function buildLocationDescription(neighborhoodDescription: string, anchors: string[], restaurants: string[], banks: string[]) {
  const drivers = compact([
    anchors.length ? `Nearby anchor tenants include ${anchors.slice(0, 3).join(", ")}.` : "",
    restaurants.length ? `Restaurant presence includes ${restaurants.slice(0, 3).join(", ")}.` : "",
    banks.length ? `Nearby financial-service presence includes ${banks.slice(0, 3).join(", ")}.` : "",
  ]).join(" ");

  return compact([neighborhoodDescription, drivers]).join(" ");
}

function buildBullets(input: {
  transactionLabel: string;
  propertyType: string;
  address: string;
  buildingSizeSf: string | null;
  lotSize: string | null;
  yearBuilt: string | null;
  zoning: string | null;
  anchors: string[];
}) {
  return compact([
    input.transactionLabel && input.propertyType ? `${input.transactionLabel} ${input.propertyType.toLowerCase()} opportunity` : "",
    input.address,
    input.buildingSizeSf ? `${input.buildingSizeSf} SF building area` : "",
    input.lotSize,
    input.yearBuilt ? `Year built: ${input.yearBuilt}` : "",
    input.zoning ? `Zoning: ${input.zoning}` : "",
    input.anchors.length ? `Area anchors: ${input.anchors.slice(0, 3).join(", ")}` : "",
  ]);
}

function detectMissingFields(raw: Record<string, any>) {
  const address = raw.address ?? {};
  const property = raw.property ?? {};
  const pricing = raw.pricing ?? {};
  const content = raw.content ?? {};

  const fields = [
    ["title", asString(raw.title)],
    ["address", asString(address.full || address.street)],
    ["propertyType", asString(property.category)],
    ["parcelId", asString(property.parcelId)],
    ["buildingSizeSf", asString(property.buildingSizeSf)],
    ["lotSizeAcres", asString(property.lotSizeAcres)],
    ["yearBuilt", asString(property.yearBuilt)],
    ["zoning", asString(property.zoning)],
    ["salePrice", asString(pricing.salePriceDollars)],
    ["saleDescription", asString(content.saleDescription)],
    ["locationDescription", asString(content.locationDescription)],
  ] as const;

  const missing = fields.filter(([, value]) => !value).map(([field]) => field);
  return {
    missing,
    hasCriticalGaps: missing.some((field) => ["address", "propertyType"].includes(field)),
  };
}

export async function enrichPropertyDraft(slug: string) {
  const query = await db.collection(PROPERTIES_COLLECTION).where("slug", "==", slug).limit(1).get();
  const doc = !query.empty ? query.docs[0] : await db.collection(PROPERTIES_COLLECTION).doc(slug).get();
  if (!doc.exists) {
    throw new Error("Property not found");
  }

  const raw = (doc.data() as Record<string, any> | undefined) ?? {};
  const address = raw.address ?? {};
  const property = raw.property ?? {};
  const pricing = raw.pricing ?? {};
  const content = raw.content ?? {};
  const admin = raw.admin ?? {};
  const meta = raw.meta ?? {};
  const existingResearch = meta.research ?? {};
  const intake = meta.intake ?? {};

  const transactionLabel = asString(raw.visibility?.transactionLabel) || "For Sale";
  const propertyType = asString(property.category || admin.propertyTypeLabel || intake.property_type) || "Commercial Property";
  const county = asString(address.county || intake.county);
  const city = asString(address.city || intake.city);
  const state = asString(address.state || intake.state) || "GA";
  const fullAddress = asString(address.full || address.street);
  const buildingSizeSf = formatNumber(property.buildingSizeSf || intake.building_size_sf);
  const lotSize = formatAcres(property.lotSizeAcres || intake.lot_size_acres);
  const yearBuilt = formatNumber(property.yearBuilt || intake.year_built);
  const zoning = asString(property.zoning || intake.zoning) || null;
  const anchors = parseList(admin.anchorTenants || existingResearch.places?.anchor_tenants);
  const restaurants = parseList(admin.nearbyRestaurants || existingResearch.places?.restaurants);
  const banks = parseList(admin.nearbyBanks || existingResearch.places?.banks);
  const notes = asString(admin.intakeNotes || intake.notes);

  const neighborhood = buildNeighborhood(address, county, propertyType);
  const generatedSaleTitle = buildSaleTitle(asString(raw.title), transactionLabel, city);
  const generatedSaleDescription = buildSaleDescription({
    title: asString(raw.title),
    transactionLabel,
    propertyType,
    city,
    state,
    buildingSizeSf,
    lotSize,
    yearBuilt,
    zoning,
    notes,
  });
  const generatedLocationDescription = buildLocationDescription(neighborhood.description, anchors, restaurants, banks);
  const generatedSaleBullets = buildBullets({
    transactionLabel,
    propertyType,
    address: fullAddress,
    buildingSizeSf,
    lotSize,
    yearBuilt,
    zoning,
    anchors,
  });

  const missing = detectMissingFields({
    ...raw,
    content: {
      ...content,
      saleDescription: content.saleDescription || generatedSaleDescription,
      locationDescription: content.locationDescription || generatedLocationDescription,
    },
  });

  const workflowStatus = missing.hasCriticalGaps ? "needs_input" : "review";

  await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set(
    {
      workflowStatus,
      content: {
        saleTitle: asString(content.saleTitle) || generatedSaleTitle,
        saleDescription: asString(content.saleDescription) || generatedSaleDescription,
        locationDescription: asString(content.locationDescription) || generatedLocationDescription,
        saleBullets: Array.isArray(content.saleBullets) && content.saleBullets.length ? content.saleBullets : generatedSaleBullets,
      },
      address: {
        neighborhood: asString(address.neighborhood) || neighborhood.neighborhood,
        submarket: asString(address.submarket) || neighborhood.corridor,
      },
      admin: {
        neighborhood: asString(admin.neighborhood) || neighborhood.neighborhood,
        corridor: asString(admin.corridor) || neighborhood.corridor,
        anchorTenants: anchors,
        nearbyRestaurants: restaurants,
        nearbyBanks: banks,
      },
      meta: {
        updatedAt: FieldValue.serverTimestamp(),
        enrichment: {
          lastRunAt: FieldValue.serverTimestamp(),
          version: "v1",
          mode: "deterministic-draft",
          missingFields: missing.missing,
          summary: missing.missing.length
            ? `Draft enrichment completed with ${missing.missing.length} missing field(s): ${missing.missing.join(", ")}`
            : "Draft enrichment completed with no critical missing fields.",
        },
        copy: {
          sale_title: generatedSaleTitle,
          sale_description: generatedSaleDescription,
          location_description: generatedLocationDescription,
          sale_bullets: generatedSaleBullets,
        },
        research: {
          ...existingResearch,
          places: {
            ...(existingResearch.places ?? {}),
            neighborhood: asString(existingResearch.places?.neighborhood) || neighborhood.neighborhood,
            corridor: asString(existingResearch.places?.corridor) || neighborhood.corridor,
            anchor_tenants: anchors,
            restaurants,
            banks,
          },
        },
      },
    },
    { merge: true },
  );

  return {
    ok: true,
    documentId: doc.id,
    workflowStatus,
    missingFields: missing.missing,
    generated: {
      saleTitle: generatedSaleTitle,
      saleDescription: generatedSaleDescription,
      locationDescription: generatedLocationDescription,
      saleBullets: generatedSaleBullets,
    },
  };
}
