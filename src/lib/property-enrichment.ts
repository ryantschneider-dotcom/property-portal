import "server-only";

import { randomUUID } from "crypto";

import { FieldValue } from "firebase-admin/firestore";

import { db, PROPERTIES_COLLECTION, storage } from "@/lib/firestore";
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

function firstNonEmptyList(...values: unknown[]): string[] {
  for (const value of values) {
    const parsed = parseList(value);
    if (parsed.length) return parsed;
  }
  return [];
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

function normalizeOpenAiModelName(value: unknown) {
  const text = asString(value);
  if (!text) return "gpt-4o";
  if (text.startsWith("openai/")) return text.slice("openai/".length) || "gpt-4o";
  return text;
}

async function generateOpenAiCopyFallback(input: {
  title: string;
  transactionLabel: string;
  propertyType: string;
  city: string;
  county: string;
  state: string;
  address: string;
  buildingSizeSf: string | null;
  lotSize: string | null;
  yearBuilt: string | null;
  zoning: string | null;
  research: Record<string, unknown>;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY missing in Node runtime");
  }

  const model = normalizeOpenAiModelName(process.env.OPENAI_MODEL);
  const prompt = `You are writing CRE broker-facing enrichment copy. Return strict JSON with keys sale_title, sale_description, location_description, sale_bullets, exterior_description.\n\nRules:\n- factual, polished, no fluff\n- no placeholders like unknown/unspecified/not available\n- use local context only when supported by research\n- sale_bullets must be an array of 3 to 5 short bullets\n\nListing:\n${JSON.stringify({
    title: input.title,
    transactionLabel: input.transactionLabel,
    propertyType: input.propertyType,
    city: input.city,
    county: input.county,
    state: input.state,
    address: input.address,
    buildingSizeSf: input.buildingSizeSf,
    lotSize: input.lotSize,
    yearBuilt: input.yearBuilt,
    zoning: input.zoning,
  }, null, 2)}\n\nResearch:\n${JSON.stringify(input.research, null, 2)}`;

  console.log("[enrich][node-openai] attempting direct OpenAI fallback", {
    model,
    address: input.address,
    city: input.city,
    hasApiKey: true,
  });

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You produce factual CRE enrichment JSON for broker-facing marketing copy.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI fallback failed (${response.status}): ${text.slice(0, 800)}`);
  }

  const payload = JSON.parse(text) as Record<string, unknown>;
  const content = (((payload.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message as Record<string, unknown> | undefined)?.content) ?? "";
  const parsed = JSON.parse(asString(content)) as Record<string, unknown>;
  return {
    sale_title: asString(parsed.sale_title),
    sale_description: asString(parsed.sale_description),
    location_description: asString(parsed.location_description),
    exterior_description: asString(parsed.exterior_description),
    sale_bullets: Array.isArray(parsed.sale_bullets) ? parsed.sale_bullets.map((item) => asString(item)).filter(Boolean) : [],
    generator: `node-openai:${model}`,
  };
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

function normalizeCounty(value: unknown, city: string, state: string) {
  const county = asString(value).replace(/\s+county$/i, "").trim();
  if (county && !/^[A-Z]{2}$/i.test(county)) return county;

  const normalizedCity = city.trim().toLowerCase();
  const normalizedState = state.trim().toUpperCase();
  if (normalizedState === "GA") {
    if (["savannah", "pooler", "port wentworth", "tybee island", "garden city", "thunderbolt", "bloomingdale"].includes(normalizedCity)) {
      return "Chatham";
    }
    if (["richmond hill", "pembroke"].includes(normalizedCity)) return "Bryan";
    if (["rincon", "springfield"].includes(normalizedCity)) return "Effingham";
    if (["hinesville", "midway", "walthourville"].includes(normalizedCity)) return "Liberty";
    if (["statesboro", "brooklet"].includes(normalizedCity)) return "Bulloch";
    if (["st marys", "st. marys", "kingsland", "woodbine"].includes(normalizedCity)) return "Camden";
    if (["brunswick"].includes(normalizedCity)) return "Glynn";
    if (["darien"].includes(normalizedCity)) return "McIntosh";
  }

  return county;
}

async function uploadStreetViewGalleryImage(input: {
  slug: string;
  documentId: string;
  title: string;
  contentType: string;
  imageBase64: string;
}) {
  const bytes = Buffer.from(input.imageBase64, "base64");
  if (!bytes.length) return null;

  const ext = input.contentType.includes("png") ? "png" : "jpg";
  const storagePath = `property-generated/${input.slug}/${Date.now()}-street-view.${ext}`;
  const bucket = storage.bucket();
  const bucketFile = bucket.file(storagePath);

  await bucketFile.save(bytes, {
    metadata: {
      contentType: input.contentType || "image/jpeg",
      cacheControl: "public, max-age=31536000",
      metadata: {
        source: "street-view-auto",
        documentId: input.documentId,
      },
    },
    resumable: false,
  });

  await bucketFile.makePublic();
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

  return {
    id: randomUUID(),
    title: input.title,
    caption: "Auto-generated from Google Street View during enrichment",
    isPrimary: false,
    sortOrder: 999,
    uploadedByUserId: null,
    uploadedAt: new Date().toISOString(),
    source: "street-view-auto",
    urls: {
      original: publicUrl,
      full: publicUrl,
      xlarge: publicUrl,
      large: publicUrl,
      medium: publicUrl,
      thumb: publicUrl,
    },
  };
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
  console.log("[enrich] starting enrichPropertyDraft", { slug });
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
  const city = asString(address.city || intake.city);
  const state = asString(address.state || intake.state) || "GA";
  const county = normalizeCounty(address.county || intake.county, city, state);
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
    street_name: address.street ?? intake.address_street ?? fullAddress,
    zip_code: address.zip ?? intake.zip,
  } as Record<string, unknown>;

  console.log("[enrich] prepared row", {
    slug,
    documentId: doc.id,
    title: raw.title ?? null,
    fullAddress,
    county,
    transactionLabel,
    propertyType,
    existingLocation: raw.location ?? null,
  });

  let launchpad: {
    public_records?: Record<string, unknown>;
    places?: Record<string, unknown>;
    research?: Record<string, unknown>;
    ai_copy?: Record<string, unknown>;
  } = {};
  let launchpadFailure: string | null = null;

  try {
    console.log("[enrich] calling runLaunchpadEnrichment", { slug, hasExistingLocation: Boolean(raw.location) });
    launchpad = await runLaunchpadEnrichment(row, raw.location ?? null);
  } catch (error) {
    launchpadFailure = error instanceof Error ? error.message : String(error);
    console.error("[enrich] Launchpad enrichment failed; falling back to deterministic draft enrichment", {
      slug,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });
  }

  const publicRecords = ((launchpad.public_records as Record<string, unknown> | undefined) ?? (existingResearch.public_records as Record<string, unknown> | undefined)) ?? {};
  const places = ((launchpad.places as Record<string, unknown> | undefined) ?? (existingResearch.places as Record<string, unknown> | undefined)) ?? {};
  const deepResearch = ((launchpad.research as Record<string, unknown> | undefined) ?? existingResearch) ?? {};
  let aiCopy = (launchpad.ai_copy as Record<string, unknown> | undefined) ?? {};
  console.log("[enrich] launchpad result summary", {
    slug,
    publicRecordsStatus: publicRecords.status ?? null,
    placesStatus: places.status ?? null,
    aiGenerator: aiCopy.generator ?? null,
    aiError: aiCopy.error ?? null,
    aiWarning: aiCopy.warning ?? null,
    streetViewStatus: (deepResearch.street_view as Record<string, unknown> | undefined)?.status ?? null,
    streetViewErrors: (deepResearch.street_view as Record<string, unknown> | undefined)?.errors ?? null,
    visionStatus: (deepResearch.vision as Record<string, unknown> | undefined)?.status ?? null,
    visionError: (deepResearch.vision as Record<string, unknown> | undefined)?.error ?? null,
    webContextStatus: (deepResearch.web_context as Record<string, unknown> | undefined)?.status ?? null,
  });
  const media = raw.media ?? {};
  const streetViewResearch = (deepResearch.street_view as Record<string, unknown> | undefined) ?? {};
  const visionResearch = (deepResearch.vision as Record<string, unknown> | undefined) ?? {};

  const buildingSizeSf = formatNumber(property.buildingSizeSf || publicRecords.building_size_sf || intake.building_size_sf);
  const lotSize = formatAcres(property.lotSizeAcres || publicRecords.lot_size_acres || intake.lot_size_acres);
  const yearBuilt = formatNumber(property.yearBuilt || publicRecords.year_built || intake.year_built);
  const zoning = asString(property.zoning || publicRecords.zoning || intake.zoning) || null;

  const anchors = firstNonEmptyList(admin.anchorTenants, places.anchor_tenants, existingResearch.places?.anchor_tenants);
  const restaurants = firstNonEmptyList(admin.nearbyRestaurants, places.restaurants, existingResearch.places?.restaurants);
  const banks = firstNonEmptyList(admin.nearbyBanks, places.banks, existingResearch.places?.banks);

  const neighborhood = buildNeighborhood(address, county, propertyType);
  if (!asString(aiCopy.sale_description) && !asString(aiCopy.location_description) && process.env.OPENAI_API_KEY) {
    try {
      aiCopy = await generateOpenAiCopyFallback({
        title: asString(raw.title),
        transactionLabel,
        propertyType,
        city,
        county,
        state,
        address: fullAddress,
        buildingSizeSf,
        lotSize,
        yearBuilt,
        zoning,
        research: {
          public_records: publicRecords,
          places: {
            ...places,
            anchor_tenants: anchors,
            restaurants,
            banks,
          },
          web_context: (deepResearch.web_context as Record<string, unknown> | undefined) ?? (existingResearch.web_context as Record<string, unknown> | undefined) ?? {},
          street_view: (deepResearch.street_view as Record<string, unknown> | undefined) ?? (existingResearch.street_view as Record<string, unknown> | undefined) ?? {},
        },
      });
    } catch (error) {
      const fallbackError = error instanceof Error ? error.message : String(error);
      aiCopy = {
        ...aiCopy,
        error: [asString(aiCopy.error), fallbackError].filter(Boolean).join(" | "),
      };
      console.error("[enrich][node-openai] direct OpenAI fallback failed", {
        slug,
        error: fallbackError,
      });
    }
  }

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
  const resolvedCoordinates =
    ((deepResearch.street_view as Record<string, unknown> | undefined)?.map_coordinates as Record<string, unknown> | undefined) ??
    ((deepResearch.places as Record<string, unknown> | undefined)?.map_coordinates as Record<string, unknown> | undefined) ??
    ((existingResearch.street_view as Record<string, unknown> | undefined)?.map_coordinates as Record<string, unknown> | undefined) ??
    ((existingResearch.places as Record<string, unknown> | undefined)?.map_coordinates as Record<string, unknown> | undefined) ??
    ((raw.location as Record<string, unknown> | undefined) ?? null);
  const resolvedLat = parseOptionalNumber(resolvedCoordinates?.lat);
  const resolvedLng = parseOptionalNumber(resolvedCoordinates?.lng);
  console.log("[enrich] resolved coordinates", {
    slug,
    resolvedCoordinates,
    resolvedLat,
    resolvedLng,
    rawLocation: raw.location ?? null,
    placesMapCoordinates: (deepResearch.places as Record<string, unknown> | undefined)?.map_coordinates ?? null,
    streetViewMapCoordinates: (deepResearch.street_view as Record<string, unknown> | undefined)?.map_coordinates ?? null,
  });

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

  const streetViewPrimary = (streetViewResearch.primary_image as Record<string, unknown> | undefined) ?? null;
  const existingImages = Array.isArray(media.images) ? (media.images as Array<Record<string, unknown>>) : [];
  const hasStreetViewGalleryImage = existingImages.some((image: Record<string, unknown>) => asString(image?.source) === "street-view-auto");
  const generatedStreetViewImage = !hasStreetViewGalleryImage && streetViewPrimary && asString(streetViewPrimary.image_base64)
    ? await uploadStreetViewGalleryImage({
        slug,
        documentId: doc.id,
        title: `${asString(raw.title) || slug} — Street View`,
        contentType: asString(streetViewPrimary.content_type) || "image/jpeg",
        imageBase64: asString(streetViewPrimary.image_base64),
      })
    : null;
  console.log("[enrich] street view gallery decision", {
    slug,
    hasStreetViewGalleryImage,
    hasStreetViewPrimary: Boolean(streetViewPrimary),
    streetViewPrimaryLabel: streetViewPrimary?.label ?? null,
    generatedStreetViewImage: Boolean(generatedStreetViewImage),
  });

  const updatePayload: Record<string, unknown> = {
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
      county: county || null,
      neighborhood: asString(address.neighborhood) || asString(places.neighborhood) || neighborhood.neighborhood,
      submarket: asString(address.submarket) || asString(places.corridor) || neighborhood.corridor,
    },
    location: {
      lat: resolvedLat,
      lng: resolvedLng,
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
        launchpadErrors: compact([
          launchpadFailure,
          asString((publicRecords as Record<string, unknown>).error),
          asString((places as Record<string, unknown>).error),
          asString((aiCopy as Record<string, unknown>).error),
          asString(visionResearch.error),
          ...(Array.isArray(streetViewResearch.errors)
            ? streetViewResearch.errors.map((item) => asString(item)).filter(Boolean)
            : []),
        ]),
        streetViewGalleryInjected: Boolean(generatedStreetViewImage),
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
        ...deepResearch,
        public_records: publicRecords,
        places: {
          ...(existingResearch.places ?? {}),
          neighborhood: asString(places.neighborhood) || neighborhood.neighborhood,
          corridor: asString(places.corridor) || neighborhood.corridor,
          environment_mode: asString(places.environment_mode) || null,
          landmarks: firstNonEmptyList((places as Record<string, unknown>).landmarks, (existingResearch.places ?? {}).landmarks),
          anchor_tenants: anchors,
          restaurants,
          banks,
        },
      },
    },
  };

  if (generatedStreetViewImage) {
    updatePayload.media = {
      images: [...existingImages, generatedStreetViewImage],
    };
  }

  console.log("[enrich] saving update payload", {
    slug,
    documentId: doc.id,
    workflowStatus,
    location: updatePayload.location ?? null,
    mode: (updatePayload.meta as Record<string, unknown> | undefined)?.enrichment && ((updatePayload.meta as Record<string, unknown>).enrichment as Record<string, unknown>).mode,
    launchpadErrors:
      (updatePayload.meta as Record<string, unknown> | undefined)?.enrichment &&
      ((updatePayload.meta as Record<string, unknown>).enrichment as Record<string, unknown>).launchpadErrors,
  });

  await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set(updatePayload, { merge: true });

  console.log("[enrich] completed enrichPropertyDraft", {
    slug,
    documentId: doc.id,
    workflowStatus,
    savedLocation: updatePayload.location ?? null,
    generatedSaleTitle,
  });

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
