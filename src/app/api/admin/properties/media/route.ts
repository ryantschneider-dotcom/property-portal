export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { db, PROPERTIES_COLLECTION, storage } from "@/lib/firestore";

function parseSessionCookie(rawCookie: string | null) {
  if (!rawCookie) return null;
  const match = rawCookie.match(/(?:^|;\s*)admin_session=([^;]+)/);
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")) as {
      email: string;
      role: string;
      name: string;
    };
  } catch {
    return null;
  }
}

async function uploadPhoto(slug: string, file: File, index: number) {
  const bucket = storage.bucket();
  const bytes = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const storagePath = `property-intake/${slug}/${Date.now()}-admin-${index}-${safeName}`;
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
    isPrimary: false,
    sortOrder: index,
    uploadedByUserId: null,
    uploadedAt: new Date().toISOString(),
    path: storagePath,
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
    const session = parseSessionCookie(request.headers.get("cookie"));
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const slug = String(formData.get("slug") ?? "").trim();
    const documentId = String(formData.get("documentId") ?? "").trim();
    const files = formData.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (!slug || !documentId) {
      return NextResponse.json({ error: "Missing property identity" }, { status: 400 });
    }

    if (!files.length) {
      return NextResponse.json({ error: "No photos uploaded" }, { status: 400 });
    }

    const docRef = db.collection(PROPERTIES_COLLECTION).doc(documentId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const data = (snapshot.data() as Record<string, any> | undefined) ?? {};
    const media = (data.media as Record<string, any> | undefined) ?? {};
    const existingImages = Array.isArray(media.images) ? media.images : [];
    const existingCount = existingImages.length;
    const uploaded = await Promise.all(files.map((file, index) => uploadPhoto(slug, file, existingCount + index)));
    const nextImages = [
      ...existingImages,
      ...uploaded.map((image, index) => ({
        ...image,
        isPrimary: existingImages.length === 0 && index === 0,
      })),
    ].map((image, index) => ({
      ...image,
      sortOrder: index,
      isPrimary: index === 0 ? true : image.isPrimary === true,
    }));

    await docRef.set(
      {
        media: {
          heroImageUrl: nextImages[0]?.urls?.large ?? nextImages[0]?.urls?.original ?? media.heroImageUrl ?? null,
          images: nextImages,
        },
        updatedByUserId: session.email,
        updatedAt: new Date().toISOString(),
        meta: {
          uploadedPhotoNames: [...(Array.isArray(data.meta?.uploadedPhotoNames) ? data.meta.uploadedPhotoNames : []), ...files.map((file) => file.name)],
          adminLastPhotoUploadAt: new Date().toISOString(),
          adminLastPhotoUploadBy: session.email,
          intake: {
            uploaded_photo_count: nextImages.length,
          },
        },
      },
      { merge: true },
    );

    return NextResponse.json({
      ok: true,
      addedCount: uploaded.length,
      heroImageUrl: nextImages[0]?.urls?.large ?? nextImages[0]?.urls?.original ?? null,
      images: nextImages,
    });
  } catch (error) {
    console.error("Admin media upload error:", error);
    return NextResponse.json({ error: "Failed to upload photos" }, { status: 500 });
  }
}
