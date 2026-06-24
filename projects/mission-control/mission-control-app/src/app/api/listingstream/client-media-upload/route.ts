import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { uploadMissionControlFirebaseFile } from "@/lib/mission-control-firebase-storage";
import { createPropertyPortalProxyError } from "@/lib/property-portal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_CLIENT_LISTING_IMAGE_BYTES = 12_000_000;

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

function isAllowedListingImage(file: File) {
  const name = file.name || "";
  return /image\/(jpeg|jpg|png|webp|heic|heif)/i.test(file.type || "") || /\.(jpe?g|png|webp|heic|heif)$/i.test(name);
}

function safeClientFolderSegment(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "listing";
}

export async function POST(request: Request) {
  try {
    await requirePierManagerAuth();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Listing photo file is required." }, { status: 400 });
    if (!isAllowedListingImage(file)) return NextResponse.json({ error: "Only JPEG, PNG, WebP, HEIC, or HEIF listing photos are allowed." }, { status: 400 });
    if (file.size > MAX_CLIENT_LISTING_IMAGE_BYTES) return NextResponse.json({ error: "Listing photo is too large." }, { status: 413 });

    const slug = safeClientFolderSegment(String(formData.get("slug") ?? "listing"));
    const index = Math.max(1, Number.parseInt(String(formData.get("index") ?? "1"), 10) || 1);
    const upload = await uploadMissionControlFirebaseFile(file, {
      slug,
      index,
      folder: ["property-intake", "listing-media", slug],
      fallbackBaseName: index === 1 ? "heroImageUrl" : "listing-photo",
    });

    return NextResponse.json({ ok: true, heroImageUrl: index === 1 ? upload.url : undefined, ...upload });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const normalized = createPropertyPortalProxyError(error, "client listing media upload");
    return NextResponse.json({ error: normalized.message }, { status: 503 });
  }
}
