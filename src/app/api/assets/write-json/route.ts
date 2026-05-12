export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireInternalBearer } from "@/lib/internal-api-auth";
import { storage } from "@/lib/firestore";
import { buildPropertyStorageRoot, buildPrivateRoot, buildPublicRoot } from "@/lib/storage/storage-paths";

function isAllowedStoragePath(propertyId: string, storagePath: string) {
  const propertyRoot = buildPropertyStorageRoot(propertyId);
  const publicRoot = buildPublicRoot(propertyId);
  const privateRoot = buildPrivateRoot(propertyId);
  return storagePath === propertyRoot || storagePath.startsWith(`${publicRoot}/`) || storagePath.startsWith(`${privateRoot}/`);
}

export async function POST(request: Request) {
  const unauthorized = requireInternalBearer(request, process.env.ASSET_SERVICE_TOKEN ?? null);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const propertyId = String(body?.propertyId ?? "").trim();
    const storagePath = String(body?.storagePath ?? "").trim();
    const isPublic = body?.isPublic === true;
    const contentType = String(body?.contentType ?? "application/json").trim() || "application/json";
    const metadata = body?.metadata && typeof body.metadata === "object" ? body.metadata : {};

    if (!propertyId) {
      return NextResponse.json({ ok: false, error: "propertyId is required" }, { status: 400 });
    }
    if (!storagePath) {
      return NextResponse.json({ ok: false, error: "storagePath is required" }, { status: 400 });
    }
    if (!isAllowedStoragePath(propertyId, storagePath)) {
      return NextResponse.json({ ok: false, error: "storagePath is outside the allowed property root" }, { status: 400 });
    }

    const bucket = storage.bucket();
    const bucketFile = bucket.file(storagePath);
    const bytes = Buffer.from(JSON.stringify(body?.content ?? null, null, 2), "utf8");

    await bucketFile.save(bytes, {
      contentType,
      metadata: {
        cacheControl: isPublic ? "public, max-age=300" : "private, max-age=0, no-transform",
        metadata: Object.fromEntries(
          Object.entries(metadata).map(([key, value]) => [key, value == null ? "" : String(value)]),
        ),
      },
      resumable: false,
    });

    if (isPublic) {
      await bucketFile.makePublic();
    }

    const publicUrl = isPublic ? `https://storage.googleapis.com/${bucket.name}/${storagePath}` : null;

    return NextResponse.json({
      ok: true,
      propertyId,
      storagePath,
      bucket: bucket.name,
      publicUrl,
      sizeBytes: bytes.length,
    });
  } catch (error) {
    console.error("Asset write-json error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to write JSON asset" },
      { status: 500 },
    );
  }
}
