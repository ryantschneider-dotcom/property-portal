import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { uploadMissionControlFirebaseFile } from "@/lib/mission-control-firebase-storage";
import { createPropertyPortalProxyError } from "@/lib/property-portal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_CLIENT_FLOOR_PLAN_IMAGE_BYTES = 6_000_000;

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

function isAllowedRasterizedFloorPlan(file: File) {
  const name = file.name || "";
  return /image\/(jpeg|jpg|png|webp)/i.test(file.type || "") || /\.(jpe?g|png|webp)$/i.test(name);
}

function safeClientFolderSegment(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "listing";
}

export async function POST(request: Request) {
  try {
    await requirePierManagerAuth();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Rasterized floor plan image is required." }, { status: 400 });
    if (!isAllowedRasterizedFloorPlan(file)) return NextResponse.json({ error: "Only browser-rasterized JPEG, PNG, or WebP floor plan images are allowed." }, { status: 400 });
    if (file.size > MAX_CLIENT_FLOOR_PLAN_IMAGE_BYTES) return NextResponse.json({ error: "Rasterized floor plan image is too large." }, { status: 413 });

    const slug = safeClientFolderSegment(String(formData.get("slug") ?? "listing"));
    const index = Math.max(1, Number.parseInt(String(formData.get("index") ?? "1"), 10) || 1);
    const upload = await uploadMissionControlFirebaseFile(file, {
      slug,
      index,
      folder: ["property-intake", "client-suite-floorplans", slug],
      fallbackBaseName: "suite-floorplan-page-1.jpg",
    });

    return NextResponse.json({ ok: true, ...upload });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const normalized = createPropertyPortalProxyError(error, "client floor plan image upload");
    return NextResponse.json({ error: normalized.message }, { status: 503 });
  }
}
