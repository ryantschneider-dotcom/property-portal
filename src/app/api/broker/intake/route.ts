export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  buildListingSlug,
  getCountyEnrichmentPlan,
  normalizeParcelId,
  parseOptionalNumber,
  uploadBrokerAsset,
} from "@/lib/broker-hub";
import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";
import { enrichPropertyDraft } from "@/lib/property-enrichment";
import { parsePortalSession } from "@/lib/portal-session";

type SuiteRow = {
  suiteNumber: string;
  availableSqFt: string;
};

type IntakePayload = {
  slug?: string;
  addressStreet: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  parcelId: string;
  propertyType: "Office" | "Industrial" | "Retail" | "Land" | "Multi-Family" | "";
  transactionType: "Sale" | "Lease" | "Both";
  salePrice: string;
  grossAcres: string;
  leaseRate: string;
  leaseType: "NNN" | "Modified Net" | "Modified Gross" | "Gross" | "";
  brokerNotes: string;
  leadBrokers: string[];
  suites: SuiteRow[];
};

function visibilityFromTransaction(transactionType: IntakePayload["transactionType"]) {
  if (transactionType === "Sale") {
    return { transactionLabel: "For Sale", saleActive: true, leaseActive: false };
  }
  if (transactionType === "Lease") {
    return { transactionLabel: "For Lease", saleActive: false, leaseActive: true };
  }
  return { transactionLabel: "For Sale/Lease", saleActive: true, leaseActive: true };
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalSession(cookieStore.get("admin_session")?.value);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const payload = JSON.parse(String(formData.get("payload") ?? "{}")) as IntakePayload;
    const files = formData.getAll("assets").filter((entry): entry is File => entry instanceof File && entry.size > 0);

    const isSale = payload.transactionType === "Sale" || payload.transactionType === "Both";
    const isLease = payload.transactionType === "Lease" || payload.transactionType === "Both";
    const slug = payload.slug?.trim() || buildListingSlug(payload.addressStreet, payload.city, payload.propertyType);
    const normalizedParcelId = normalizeParcelId(payload.parcelId, payload.county);
    const suites = (payload.suites ?? []).filter((suite) => suite.suiteNumber?.trim() || suite.availableSqFt?.trim());

    if (!payload.addressStreet || !payload.city || !payload.state || !payload.county || !normalizedParcelId || !payload.propertyType || !payload.brokerNotes.trim()) {
      return NextResponse.json({ error: "Address, county, parcel number, property type, and broker notes are required." }, { status: 400 });
    }

    if (!payload.leadBrokers?.length) {
      return NextResponse.json({ error: "Select at least one lead broker." }, { status: 400 });
    }

    if (isSale && !payload.salePrice.trim()) {
      return NextResponse.json({ error: "Sale price is required for sale listings." }, { status: 400 });
    }

    if (payload.propertyType === "Land" && !payload.grossAcres.trim()) {
      return NextResponse.json({ error: "Gross acres are required for land listings." }, { status: 400 });
    }

    if (isLease) {
      const firstSuite = suites[0];
      if (!payload.leaseRate.trim() || !payload.leaseType || !firstSuite?.suiteNumber?.trim() || !firstSuite?.availableSqFt?.trim()) {
        return NextResponse.json({ error: "Lease rate, lease type, and at least one suite row are required for lease listings." }, { status: 400 });
      }
    }

    const uploadedAssets = await Promise.all(files.map((file, index) => uploadBrokerAsset("intake", slug, file, index)));
    const imageAssets = uploadedAssets.filter((asset) => asset.documentType === "photo");
    const documentAssets = uploadedAssets.filter((asset) => asset.documentType !== "photo");
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
        ownerUserId: session.email,
        ownerEmail: session.email,
        leadBroker: payload.leadBrokers.join(", "),
        createdByUserId: session.email,
        updatedByUserId: session.email,
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
          category: payload.propertyType,
          buildingSizeSf: null,
          lotSizeAcres: parseOptionalNumber(payload.grossAcres),
          yearBuilt: null,
          zoning: null,
          parcelId: normalizedParcelId,
        },
        pricing: {
          salePriceDollars: parseOptionalNumber(payload.salePrice),
          askingPriceRatePerSf: parseOptionalNumber(payload.leaseRate),
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
          heroImageUrl: imageAssets[0]?.urls?.large ?? null,
          images: imageAssets.map((asset) => ({
            id: asset.id,
            title: asset.title,
            caption: null,
            isPrimary: Boolean(asset.isPrimary),
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
          leaseType: payload.leaseType || null,
          suites,
          propertyTypeLabel: payload.propertyType,
          intakeNotes: payload.brokerNotes,
          leadBrokerChecklist: payload.leadBrokers,
        },
        meta: {
          updatedAt: now,
          intake: {
            intake_version: "broker_hub_v1",
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
            gross_acres: payload.grossAcres,
            lease_rate_per_sf: payload.leaseRate,
            lease_type: payload.leaseType,
            suites,
            broker_notes: payload.brokerNotes,
            lead_brokers: payload.leadBrokers,
            uploaded_asset_count: uploadedAssets.length,
          },
          enrichment: {
            status: "queued",
            queue: ["county_tax_card", "narrative_draft", "logistics_draft"],
            requestedAt: now,
            countyRouting: countyPlan,
          },
          brokerHub: {
            source: "broker-hub",
            submittedByName: session.name,
            submittedByEmail: session.email,
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

    revalidatePath("/broker");
    revalidatePath("/broker/new");
    revalidatePath("/admin/properties");
    revalidatePath(`/admin/properties/${slug}/edit`);

    return NextResponse.json({
      ok: true,
      slug,
      id: slug,
      parcelId: normalizedParcelId,
      countyRouting: countyPlan,
      enrichment: enrichmentResult,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create broker intake draft." }, { status: 500 });
  }
}
