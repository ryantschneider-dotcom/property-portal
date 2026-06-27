import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";

import { AUTH_COOKIE, getAuthSession, isValidAuthToken } from "@/lib/auth";
import { uploadMissionControlFirebaseFile } from "@/lib/mission-control-firebase-storage";
import { approvePropertyPortalReviewDraft, changePropertyPortalDraftLifecycle, changePropertyPortalPropertyLifecycle, createPropertyPortalProxyError, type StagedListingImageUpload } from "@/lib/property-portal-client";
import { buildMarketingPropagationEvent, triggerListingStreamMarketingPropagation } from "@/lib/listingstream-marketing-propagation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const APPROVE_DRAFT_ROUTE_UNAUTHORIZED = "PIER_MANAGER_APPROVE_DRAFT_ROUTE_UNAUTHORIZED";

function getCookieValueFromHeader(headerValue: string | null, name: string) {
  if (!headerValue) return "";
  const match = headerValue.split(/;\s*/).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

async function requirePierManagerAuth(request?: Request) {
  const cookieStore = await cookies();
  const storeToken = cookieStore.get(AUTH_COOKIE)?.value || "";
  const headerToken = getCookieValueFromHeader(request?.headers.get("cookie") ?? null, AUTH_COOKIE);
  const storeOk = storeToken ? await isValidAuthToken(storeToken) : false;
  const headerOk = headerToken ? await isValidAuthToken(headerToken) : false;
  const ok = storeOk || headerOk;
  const tokenForSession = storeOk ? storeToken : headerToken;
  if (!ok) throw new Error(APPROVE_DRAFT_ROUTE_UNAUTHORIZED);
  return getAuthSession(tokenForSession);
}

async function uploadStagedAssetToFirebase(file: File, options: { slug?: string; index: number }): Promise<StagedListingImageUpload | null> {
  return uploadMissionControlFirebaseFile(file, options);
}

export async function POST(request: Request) {
  try {
    const session = await requirePierManagerAuth(request);
    const contentType = request.headers.get("content-type") ?? "";
    let draft: unknown;
    let mode: "draft-preview" | "publish-live" = "publish-live";
    let lifecycleAction: "delete-draft" | "make-live" | "delete-property" | null = null;
    let propertyIdOrSlug = "";
    let assets: File[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      draft = JSON.parse(String(formData.get("draft") ?? "null"));
      mode = String(formData.get("mode") ?? "publish-live") === "draft-preview" ? "draft-preview" : "publish-live";
      lifecycleAction = ["delete-draft", "make-live", "delete-property"].includes(String(formData.get("action"))) ? String(formData.get("action")) as "delete-draft" | "make-live" | "delete-property" : null;
      propertyIdOrSlug = String(formData.get("propertyIdOrSlug") ?? "").trim();
      assets = formData.getAll("assets").filter((item): item is File => item instanceof File);
    } else {
      const body = await request.json();
      draft = body.draft;
      mode = body.mode === "draft-preview" ? "draft-preview" : "publish-live";
      lifecycleAction = ["delete-draft", "make-live", "delete-property"].includes(String(body.action)) ? body.action : null;
      propertyIdOrSlug = String(body.propertyIdOrSlug ?? "").trim();
    }

    if (lifecycleAction) {
      const result = lifecycleAction === "delete-property"
        ? await changePropertyPortalPropertyLifecycle({ propertyIdOrSlug, action: "delete" })
        : await changePropertyPortalDraftLifecycle({ propertyIdOrSlug, action: lifecycleAction as "delete-draft" | "make-live" });
      if (lifecycleAction === "make-live") {
        const event = buildMarketingPropagationEvent({ propertyIdOrSlug, reason: "listing-made-live", mode: "publish-live" });
        if (event) after(() => triggerListingStreamMarketingPropagation(event, session).then((results) => console.info("PIER Manager V2 marketing propagation", results)).catch((error) => console.error("PIER Manager V2 marketing propagation failed", error)));
      }
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
    if (mode === "publish-live") {
      const event = buildMarketingPropagationEvent({ draft: typedDraft, propertyIdOrSlug, reason: "listing-data-updated", mode });
      if (event) after(() => triggerListingStreamMarketingPropagation(event, session).then((results) => console.info("PIER Manager V2 marketing propagation", results)).catch((error) => console.error("PIER Manager V2 marketing propagation failed", error)));
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === APPROVE_DRAFT_ROUTE_UNAUTHORIZED) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const normalized = createPropertyPortalProxyError(error, "approve and publish draft");
    return NextResponse.json({ error: normalized.message }, { status: 503 });
  }
}
