import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { uploadMissionControlFirebaseFile } from "@/lib/mission-control-firebase-storage";
import { approvePropertyPortalReviewDraft, changePropertyPortalDraftLifecycle, createPropertyPortalProxyError, type StagedListingImageUpload } from "@/lib/property-portal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

async function uploadStagedAssetToFirebase(file: File, options: { slug?: string; index: number }): Promise<StagedListingImageUpload | null> {
  return uploadMissionControlFirebaseFile(file, options);
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
    const typedDraft = draft as Parameters<typeof approvePropertyPortalReviewDraft>[0]["draft"];
    const result = await approvePropertyPortalReviewDraft({
      draft: typedDraft,
      assets,
      mode,
      uploadStagedImage: (file, options) => uploadStagedAssetToFirebase(file, options),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const normalized = createPropertyPortalProxyError(error, "approve and publish draft");
    return NextResponse.json({ error: normalized.message }, { status: 503 });
  }
}
