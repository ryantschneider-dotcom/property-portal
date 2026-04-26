import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";
import { runLaunchpadEnrichment } from "@/lib/launchpad-enrichment";

function asString(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
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

function parseOptionalNumber(value: unknown): number | null {
  const raw = asString(value).replace(/,/g, "");
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
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

  return compact([intro, facts ? `Key facts include ${facts}.` : "", market, notes]).join(" ");
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
  const notes = asString(admin.intakeNotes || intake.notes);

  const row = {
    transaction_type: transactionLabel,
    property_type: propertyType,
    city,
    county,
    state,
    available_sf: property.availableSqFt ?? pricing.availableSqFt ?? intake.available_sf,
    listing_price_visibility: pricing.listingPriceVisibility ?? intake.listing_price_visibility,
    listing_price_amount: pricing.salePriceDollars ?? intake.listing_price_amount,
    asking_price_rate: pricing.askingPriceRatePerSf ?? intake.asking_price_rate,
    lease_type: admin.leaseType ?? intake.lease_type,
    lead_broker: raw.leadBroker ?? admin.leadBroker ?? raw.ownerEmail,
    website_url: raw.links?.websiteUrl ?? intake.website_url,
    parcel_id: property.parcelId ?? intake.parcel_id,
    tax_id: property.parcelId ?? intake.tax_id,
    street_number: "",
    street_name: fullAddress,
    zip_code: address.zip ?? intake.zip,
  } as Record<string, unknown>;

  let launchpad: {
    public_records?: Record<string, unknown>;
    places?: Record<string, unknown>;
    ai_copy?: Record<string, unknown>;
  } = {};

  try {
    launchpad = await runLaunchpadEnrichment(row, raw.location ?? null);
  } catch (error) {
    console.error("Launchpad enrichment failed; falling back to deterministic draft enrichment", error);
  }

  const publicRecords = (launchpad.public_records as Record<string, unknown> | undefined) ?? {};
  const places = (launchpad.places as Record<string, unknown> | undefined) ?? {};
  const aiCopy = (launchpad.ai_copy as Record<string, unknown> | undefined) ?? {};

  const buildingSizeSf = formatNumber(property.buildingSizeSf || publicRecords.building_size_sf || intake.building_size_sf);
  const lotSize = formatAcres(property.lotSizeAcres || publicRecords.lot_size_acres || intake.lot_size_acres);
  const yearBuilt = formatNumber(property.yearBuilt || publicRecords.year_built || intake.year_built);
  const zoning = asString(property.zoning || publicRecords.zoning || intake.zoning) || null;

  const anchors = parseList(admin.anchorTenants || places.anchor_tenants || existingResearch.places?.anchor_tenants);
  const restaurants = parseList(admin.nearbyRestaurants || places.restaurants || existingResearch.places?.restaurants);
  const banks = parseList(admin.nearbyBanks || places.banks || existingResearch.places?.banks);

  const neighborhood = buildNeighborhood(address, county, propertyType);
  const generatedSaleTitle = asString(aiCopy.sale_title) || buildSaleTitle(asString(raw.title), transactionLabel, city);
  const generatedSaleDescription = asString(aiCopy.sale_description) || buildSaleDescription({
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
  const generatedLocationDescription = asString(aiCopy.location_description) || buildLocationDescription(asString(places.neighborhood) || neighborhood.description, anchors, restaurants, banks);
  const generatedSaleBullets = Array.isArray(aiCopy.sale_bullets) && aiCopy.sale_bullets.length
    ? aiCopy.sale_bullets.map((item) => asString(item)).filter(Boolean)
    : buildBullets({
        transactionLabel,
        propertyType,
        address: fullAddress,
        buildingSizeSf,
        lotSize,
        yearBuilt,
        zoning,
        anchors,
      });
  const generatedExteriorDescription = asString(aiCopy.exterior_description) || asString(publicRecords.exterior_construction_type || publicRecords.notes);

  const missing = detectMissingFields({
    ...raw,
    property: {
      ...property,
      parcelId: property.parcelId || publicRecords.parcel_number,
      buildingSizeSf: property.buildingSizeSf || publicRecords.building_size_sf,
      lotSizeAcres: property.lotSizeAcres || publicRecords.lot_size_acres,
      yearBuilt: property.yearBuilt || publicRecords.year_built,
      zoning: property.zoning || publicRecords.zoning,
    },
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
      property: {
        parcelId: asString(property.parcelId) || asString(publicRecords.parcel_number) || null,
        buildingSizeSf: property.buildingSizeSf ?? parseOptionalNumber(publicRecords.building_size_sf),
        lotSizeAcres: property.lotSizeAcres ?? parseOptionalNumber(publicRecords.lot_size_acres),
        yearBuilt: property.yearBuilt ?? parseOptionalNumber(publicRecords.year_built),
        zoning: asString(property.zoning) || asString(publicRecords.zoning) || null,
        parking: asString(property.parking) || asString(publicRecords.parking) || null,
        exteriorConstructionType: asString(property.exteriorConstructionType) || asString(publicRecords.exterior_construction_type) || null,
        propertyClass: asString(property.propertyClass) || asString(publicRecords.property_class) || null,
      },
      content: {
        saleTitle: asString(content.saleTitle) || generatedSaleTitle,
        saleDescription: asString(content.saleDescription) || generatedSaleDescription,
        locationDescription: asString(content.locationDescription) || generatedLocationDescription,
        exteriorDescription: asString(content.exteriorDescription) || generatedExteriorDescription || null,
        saleBullets: Array.isArray(content.saleBullets) && content.saleBullets.length ? content.saleBullets : generatedSaleBullets,
      },
      address: {
        neighborhood: asString(address.neighborhood) || asString(places.neighborhood) || neighborhood.neighborhood,
        submarket: asString(address.submarket) || asString(places.corridor) || neighborhood.corridor,
      },
      admin: {
        neighborhood: asString(admin.neighborhood) || asString(places.neighborhood) || neighborhood.neighborhood,
        corridor: asString(admin.corridor) || asString(places.corridor) || neighborhood.corridor,
        anchorTenants: anchors,
        nearbyRestaurants: restaurants,
        nearbyBanks: banks,
        assessorImprovements: parseList(publicRecords.assessor_improvements),
      },
      meta: {
        updatedAt: FieldValue.serverTimestamp(),
        enrichment: {
          lastRunAt: FieldValue.serverTimestamp(),
          version: "v2",
          mode: asString(aiCopy.generator) ? `launchpad+${asString(aiCopy.generator)}` : "launchpad+deterministic",
          missingFields: missing.missing,
          summary: missing.missing.length
            ? `Draft enrichment completed with ${missing.missing.length} missing field(s): ${missing.missing.join(", ")}`
            : "Draft enrichment completed with no critical missing fields.",
        },
        copy: {
          sale_title: generatedSaleTitle,
          sale_description: generatedSaleDescription,
          location_description: generatedLocationDescription,
          exterior_description: generatedExteriorDescription,
          sale_bullets: generatedSaleBullets,
          generator: asString(aiCopy.generator) || "deterministic",
        },
        research: {
          ...existingResearch,
          public_records: publicRecords,
          places: {
            ...(existingResearch.places ?? {}),
            neighborhood: asString(places.neighborhood) || neighborhood.neighborhood,
            corridor: asString(places.corridor) || neighborhood.corridor,
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
