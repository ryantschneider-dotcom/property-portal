import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { uploadStagedListingImageToFirebase } from "@/lib/firebase-storage-server";
import { approvePropertyPortalReviewDraft, changePropertyPortalDraftLifecycle, createPropertyPortalProxyError } from "@/lib/property-portal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

export async function POST(request: Request) {
  try {
    await requirePierManagerAuth();
    const contentType = request.headers.get("content-type") ?? "";
    let draft: unknown;
    let mode: "draft-preview" | "publish-live" = "publish-live";
    let lifecycleAction: "delete-draft" | "make-live" | null = null;
    let propertyIdOrSlug = "";
    let assets: File[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      draft = JSON.parse(String(formData.get("draft") ?? "null"));
      mode = String(formData.get("mode") ?? "publish-live") === "draft-preview" ? "draft-preview" : "publish-live";
      lifecycleAction = ["delete-draft", "make-live"].includes(String(formData.get("action"))) ? String(formData.get("action")) as "delete-draft" | "make-live" : null;
      propertyIdOrSlug = String(formData.get("propertyIdOrSlug") ?? "").trim();
      assets = formData.getAll("assets").filter((item): item is File => item instanceof File);
    } else {
      const body = await request.json();
      draft = body.draft;
      mode = body.mode === "draft-preview" ? "draft-preview" : "publish-live";
      lifecycleAction = ["delete-draft", "make-live"].includes(String(body.action)) ? body.action : null;
      propertyIdOrSlug = String(body.propertyIdOrSlug ?? "").trim();
    }

    if (lifecycleAction) {
      const result = await changePropertyPortalDraftLifecycle({ propertyIdOrSlug, action: lifecycleAction });
      return NextResponse.json({ ok: true, ...result });
    }

    if (!draft) return NextResponse.json({ error: "Draft is required" }, { status: 400 });
    console.info("[listingstream approve-draft] forwarding draft", {
      mode,
      assetCount: assets.length,
      assetBytes: assets.reduce((sum, asset) => sum + asset.size, 0),
      hasBaseUrl: Boolean(process.env.LISTINGSTREAM_PORTAL_BASE_URL || process.env.PROPERTY_PORTAL_BASE_URL || process.env.NEXT_PUBLIC_LISTINGSTREAM_PORTAL_URL),
      hasInternalToken: Boolean(process.env.PROPERTY_PORTAL_INTERNAL_TOKEN || process.env.LISTINGSTREAM_INTERNAL_TOKEN),
    });
    const result = await approvePropertyPortalReviewDraft({ draft: draft as Parameters<typeof approvePropertyPortalReviewDraft>[0]["draft"], assets, mode, uploadStagedImage: (file, options) => uploadStagedListingImageToFirebase(file, options) });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const normalized = createPropertyPortalProxyError(error, "approve and publish draft");
    console.error("[listingstream approve-draft] proxy failure", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: normalized.message }, { status: 503 });
  }
}
