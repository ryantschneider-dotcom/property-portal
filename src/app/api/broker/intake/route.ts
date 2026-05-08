export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

import {
  buildListingSlug,
  getCountyEnrichmentPlan,
  normalizeParcelId,
  parseOptionalNumber,
  uploadBrokerAsset,
} from "@/lib/broker-hub";
import { getAdminWorkflowSnapshot } from "@/lib/admin-workflow";
import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";
import { enrichPropertyDraft } from "@/lib/property-enrichment";
import { parsePortalSession } from "@/lib/portal-session";

type SuiteRow = {
  suiteNumber: string;
  availableSqFt: string;
  baseRent: string;
  rentType: string;
  unpriced?: boolean;
};

type IntakePayload = {
  slug?: string;
  heroPhotoKey?: string | null;
  addressStreet: string;
  city: string;
  state: "GA" | "SC";
  zip: string;
  county: string;
  parcelId: string;
  propertyType: "Office" | "Industrial" | "Retail" | "Land" | "Multi-Family" | "";
  transactionType: "Sale" | "Lease";
  salePrice: string;
  saleUnpriced?: boolean;
  grossAcres: string;
  brokerNotes: string;
  leadBroker: string;
  suites: SuiteRow[];
};

function visibilityFromTransaction(transactionType: IntakePayload["transactionType"]) {
  if (transactionType === "Sale") {
    return { transactionLabel: "For Sale", saleActive: true, leaseActive: false };
  }
  return { transactionLabel: "For Lease", saleActive: false, leaseActive: true };
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const headerStore = await headers();
    const session = parsePortalSession(cookieStore.get("admin_session")?.value);
    const host = (headerStore.get("x-forwarded-host") || headerStore.get("host") || "").toLowerCase();
    const isBrokerHost = host === "broker.piercommercial.com" || host === "www.broker.piercommercial.com";
    const actor = session ?? (isBrokerHost
      ? {
          email: "broker-hub@pier.internal",
          role: "junior_broker",
          name: "Broker Hub",
        }
      : null);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const payload = JSON.parse(String(formData.get("payload") ?? "{}")) as IntakePayload;
    const files = formData.getAll("assets").filter((entry): entry is File => entry instanceof File && entry.size > 0);

    const slug = payload.slug?.trim() || buildListingSlug(payload.addressStreet, payload.city, payload.propertyType || "property");
    const normalizedParcelId = normalizeParcelId(payload.parcelId, payload.county);
    const suites = (payload.suites ?? []).filter((suite) => suite.suiteNumber?.trim() || suite.availableSqFt?.trim() || suite.baseRent?.trim());

    if (!payload.addressStreet || !payload.city || !payload.state || !payload.county || !normalizedParcelId || !payload.propertyType || !payload.transactionType || !payload.leadBroker?.trim()) {
      return NextResponse.json({ error: "Lead broker, street address, city, state, county, parcel ID, property type, and transaction type are required." }, { status: 400 });
    }

    if (!["GA", "SC"].includes(payload.state)) {
      return NextResponse.json({ error: "State must be GA or SC." }, { status: 400 });
    }

    if (payload.transactionType === "Sale" && !payload.saleUnpriced && !payload.salePrice.trim()) {
      return NextResponse.json({ error: "Sale listings require a sale price or Unpriced / Inquire." }, { status: 400 });
    }

    if (payload.propertyType === "Land" && !payload.grossAcres.trim()) {
      return NextResponse.json({ error: "Gross acres are required for land listings." }, { status: 400 });
    }

    if (payload.transactionType === "Lease") {
      if (!suites.length) {
        return NextResponse.json({ error: "Lease listings require at least one suite row." }, { status: 400 });
      }
      for (const suite of suites) {
        if (!suite.suiteNumber?.trim() || !suite.availableSqFt?.trim() || !suite.rentType?.trim() || (!suite.unpriced && !suite.baseRent?.trim())) {
          return NextResponse.json({ error: "Each suite requires Suite #, Suite Size, Rent Type, and either Base Rent or Unpriced / Inquire." }, { status: 400 });
        }
      }
    }

    const uploadedAssets = await Promise.all(files.map((file, index) => uploadBrokerAsset("intake", slug, file, index)));
    const imageAssets = uploadedAssets.filter((asset) => asset.documentType === "photo");
    const documentAssets = uploadedAssets.filter((asset) => asset.documentType !== "photo");
    const heroAsset = imageAssets.find((asset) => `${asset.filename}-${asset.sizeBytes}-${files.find((file) => file.name === asset.filename && file.size === asset.sizeBytes)?.lastModified}` === payload.heroPhotoKey)
      ?? imageAssets[0]
      ?? null;
    const now = new Date().toISOString();
    const title = `${payload.addressStreet}, ${payload.city}, ${payload.state}`;
    const visibility = visibilityFromTransaction(payload.transactionType);
    const countyPlan = getCountyEnrichmentPlan(payload.county);

    await db.collection(PROPERTIES_COLLECTION).doc(slug).set(
      {
        slug,
        title,
        status: "draft",
        workflowStatus: "needs_input",
        ownerUserId: actor.email,
        ownerEmail: actor.email,
        leadBroker: payload.leadBroker.trim() || null,
        createdByUserId: actor.email,
        updatedByUserId: actor.email,
        createdAt: now,
        updatedAt: now,
        visibility,
        address: {
          full: `${payload.addressStreet}, ${payload.city}, ${payload.state} ${payload.zip}`.trim(),
          street: payload.addressStreet,
          city: payload.city,
          state: payload.state,
          zip: payload.zip || null,
          county: payload.county,
          hideAddress: false,
        },
        property: {
          category: payload.propertyType || null,
          buildingSizeSf: null,
          lotSizeAcres: parseOptionalNumber(payload.grossAcres),
          yearBuilt: null,
          zoning: null,
          parcelId: normalizedParcelId,
        },
        pricing: {
          salePriceDollars: payload.saleUnpriced ? null : parseOptionalNumber(payload.salePrice),
          salePriceIsCallForPrice: payload.transactionType === "Sale" ? payload.saleUnpriced === true : false,
          askingPriceRatePerSf: null,
          availableSqFt: suites.reduce<number | null>((sum, suite) => {
            const value = parseOptionalNumber(suite.availableSqFt);
            if (value == null) return sum;
            return (sum ?? 0) + value;
          }, null),
          suiteNumbers: suites.map((suite) => suite.suiteNumber.trim()).filter(Boolean).join(", "),
        },
        content: {
          saleTitle: title,
          saleDescription: null,
          leaseDescription: null,
          locationDescription: null,
          exteriorDescription: null,
          saleBullets: [],
          leaseBullets: [],
        },
        media: {
          heroImageUrl: heroAsset?.urls?.large ?? null,
          images: imageAssets.map((asset) => ({
            id: asset.id,
            title: asset.title,
            caption: null,
            isPrimary: heroAsset ? asset.id === heroAsset.id : Boolean(asset.isPrimary),
            sortOrder: asset.sortOrder,
            urls: asset.urls,
          })),
          documents: documentAssets.map((asset) => ({
            id: asset.id,
            title: asset.title,
            description: null,
            documentType: "broker-intake",
            url: asset.url,
            filename: asset.filename,
            contentType: asset.contentType,
          })),
        },
        admin: {
          leaseType: payload.transactionType === "Lease" ? (suites.length === 1 ? suites[0].rentType : null) : null,
          suites,
          propertyTypeLabel: payload.propertyType || null,
          intakeNotes: payload.brokerNotes || null,
          leadBrokerChecklist: payload.leadBroker ? [payload.leadBroker.trim()] : [],
        },
        meta: {
          updatedAt: now,
          intake: {
            intake_version: "broker_hub_v2",
            address_street: payload.addressStreet,
            city: payload.city,
            state: payload.state,
            zip: payload.zip,
            county: payload.county,
            parcel_id_raw: payload.parcelId,
            parcel_id_normalized: normalizedParcelId,
            property_type: payload.propertyType,
            transaction_type: payload.transactionType,
            sale_price: payload.salePrice,
            sale_unpriced: payload.saleUnpriced === true,
            gross_acres: payload.grossAcres,
            suites,
            broker_notes: payload.brokerNotes,
            lead_brokers: payload.leadBroker ? [payload.leadBroker.trim()] : [],
            lead_broker: payload.leadBroker.trim(),
            uploaded_asset_count: uploadedAssets.length,
            hero_photo_key: payload.heroPhotoKey || null,
          },
          enrichment: {
            status: "queued",
            queue: ["county_tax_card", "narrative_draft", "logistics_draft"],
            requestedAt: now,
            countyRouting: countyPlan,
          },
          brokerHub: {
            source: "broker-hub",
            submittedByName: actor.name,
            submittedByEmail: actor.email,
            authMode: session ? "session" : "broker-host-anonymous",
          },
        },
      },
      { merge: true },
    );

    let enrichmentResult: { ok?: boolean; workflowStatus?: string; missingFields?: string[] } | null = null;
    try {
      enrichmentResult = await enrichPropertyDraft(slug);
    } catch (error) {
      console.error("Broker intake enrichment failed:", error);
    }

    const workflowSnapshot = await getAdminWorkflowSnapshot(slug);

    revalidatePath("/broker");
    revalidatePath("/broker/new");
    revalidatePath("/broker/revisions");
    revalidatePath("/admin/properties");
    revalidatePath(`/admin/properties/${slug}/edit`);

    return NextResponse.json({
      ok: true,
      slug,
      id: slug,
      parcelId: normalizedParcelId,
      countyRouting: countyPlan,
      enrichment: enrichmentResult,
      reviewChecklist: workflowSnapshot?.reviewChecklist ?? null,
      workflowStatus: workflowSnapshot?.workflowStatus ?? null,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Failed to create broker intake draft.";
    const isStorageError = /bucket does not exist|storage|upload/i.test(message);
    return NextResponse.json(
      {
        error: isStorageError
          ? `File upload failed: ${message}`
          : message || "Failed to create broker intake draft.",
      },
      { status: 500 },
    );
  }
}
