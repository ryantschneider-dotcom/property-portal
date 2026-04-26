export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "crypto";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { db, PROPERTIES_COLLECTION, storage } from "@/lib/firestore";
import { parsePortalSession } from "@/lib/portal-session";

type IntakePayload = {
  slug: string;
  title: string;
  transactionType: "sale" | "lease" | "sale-lease";
  propertyType: string;
  addressStreet: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  parcelId: string;
  listingPriceAmount: string;
  listingPriceVisibility: string;
  askingPriceRate: string;
  availableSf: string;
  buildingSizeSf: string;
  lotSizeAcres: string;
  yearBuilt: string;
  zoning: string;
  leaseType: string;
  websiteUrl: string;
  notes: string;
};

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

function visibilityFromTransaction(transactionType: IntakePayload["transactionType"]) {
  if (transactionType === "sale") {
    return { transactionLabel: "For Sale", saleActive: true, leaseActive: false };
  }
  if (transactionType === "lease") {
    return { transactionLabel: "For Lease", saleActive: false, leaseActive: true };
  }
  return { transactionLabel: "For Sale/Lease", saleActive: true, leaseActive: true };
}

async function uploadPhoto(slug: string, file: File, index: number) {
  const bucket = storage.bucket();
  const bytes = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const storagePath = `property-intake/${slug}/${Date.now()}-${index}-${safeName}`;
  const bucketFile = bucket.file(storagePath);

  await bucketFile.save(bytes, {
    metadata: {
      contentType: file.type || "application/octet-stream",
      cacheControl: "public, max-age=31536000",
    },
    resumable: false,
  });

  await bucketFile.makePublic();
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

  return {
    id: randomUUID(),
    title: file.name,
    caption: null,
    isPrimary: index === 0,
    sortOrder: index,
    uploadedByUserId: null,
    uploadedAt: new Date().toISOString(),
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

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalSession(cookieStore.get("admin_session")?.value);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const payload = JSON.parse(String(formData.get("payload") ?? "{}")) as IntakePayload;
    const files = formData.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (!payload.slug || !payload.title || !payload.addressStreet || !payload.city || !payload.state || !payload.zip) {
      return NextResponse.json({ error: "Missing required intake fields" }, { status: 400 });
    }

    const mediaImages = await Promise.all(files.map((file, index) => uploadPhoto(payload.slug, file, index)));

    const docId = payload.slug;
    const visibility = visibilityFromTransaction(payload.transactionType);
    const now = new Date().toISOString();

    await db.collection(PROPERTIES_COLLECTION).doc(docId).set(
      {
        slug: payload.slug,
        title: payload.title,
        status: "draft",
        workflowStatus: mediaImages.length ? "review" : "needs_input",
        ownerUserId: session.email,
        ownerEmail: session.email,
        leadBroker: session.name || session.email,
        createdByUserId: session.email,
        updatedByUserId: session.email,
        createdAt: now,
        updatedAt: now,
        visibility,
        address: {
          full: `${payload.addressStreet}, ${payload.city}, ${payload.state} ${payload.zip}`,
          street: payload.addressStreet,
          city: payload.city,
          state: payload.state,
          zip: payload.zip,
          county: payload.county || null,
          hideAddress: false,
        },
        property: {
          category: payload.propertyType || null,
          buildingSizeSf: parseOptionalNumber(payload.buildingSizeSf),
          lotSizeAcres: parseOptionalNumber(payload.lotSizeAcres),
          yearBuilt: parseOptionalNumber(payload.yearBuilt),
          zoning: payload.zoning || null,
          parcelId: payload.parcelId || null,
        },
        pricing: {
          salePriceDollars: parseOptionalNumber(payload.listingPriceAmount),
          listingPriceVisibility: payload.listingPriceVisibility || null,
          askingPriceRatePerSf: parseOptionalNumber(payload.askingPriceRate),
          availableSqFt: parseOptionalNumber(payload.availableSf),
        },
        content: {
          saleTitle: payload.title,
          saleDescription: payload.notes || null,
          leaseDescription: null,
          locationDescription: null,
          exteriorDescription: null,
          saleBullets: [],
          leaseBullets: [],
        },
        media: {
          heroImageUrl: mediaImages[0]?.urls?.large ?? null,
          images: mediaImages,
          documents: [],
        },
        links: {
          websiteUrl: payload.websiteUrl || null,
        },
        admin: {
          leaseType: payload.leaseType || null,
          propertyTypeLabel: payload.propertyType || null,
          intakeNotes: payload.notes || null,
        },
        meta: {
          intake: {
            property_type: payload.propertyType,
            parcel_id: payload.parcelId,
            listing_price_amount: payload.listingPriceAmount,
            listing_price_visibility: payload.listingPriceVisibility,
            asking_price_rate: payload.askingPriceRate,
            available_sf: payload.availableSf,
            building_size_sf: payload.buildingSizeSf,
            lot_size_acres: payload.lotSizeAcres,
            year_built: payload.yearBuilt,
            zoning: payload.zoning,
            lease_type: payload.leaseType,
            website_url: payload.websiteUrl,
            notes: payload.notes,
            uploaded_photo_count: files.length,
          },
          uploadedPhotoNames: files.map((file) => file.name),
          createdVia: "broker-intake-v1",
          intakeStatus: mediaImages.length ? "submitted_with_photos" : "submitted_no_photos",
        },
      },
      { merge: true },
    );

    revalidatePath("/admin/properties");
    revalidatePath(`/admin/properties/${payload.slug}/edit`);

    return NextResponse.json({ ok: true, slug: payload.slug, id: docId });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create draft listing" }, { status: 500 });
  }
}
