export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { deleteDraftLaunchPackage, makeDraftLaunchPackageLive, publishLaunchPackageToListingStream, saveDraftLaunchPackageToListingStream } from "@/lib/launch-package";
import { syncPropertyToAscendix } from "@/lib/ascendix-sync";
import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";
import { getPropertyDocumentByIdentifier } from "@/lib/properties";

type LaunchPackageRequest = {
  action?: "save-draft" | "publish-live" | "delete-draft" | "make-live";
  slug?: string;
  propertyId?: string;
  actorEmail?: string;
  note?: string;
  approvedPayload?: Record<string, unknown>;
};

function normalizeError(error: unknown, operation: "listingstream" | "ascendix") {
  const message = error instanceof Error ? error.message : String(error ?? "unknown error");
  const transient = /429|rate limit|quota|timeout|timed out|temporarily|ECONN|ENOTFOUND|unreachable|fetch failed/i.test(message);
  const prefix = operation === "listingstream" ? "ListingStream publish" : "Ascendix sync";
  return {
    message: transient
      ? `${prefix} is temporarily unavailable or rate-limited. Please retry from PIER Manager shortly. ${message}`
      : `${prefix} failed. ${message}`,
    transient,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.values(value).some(hasMeaningfulValue);
  return true;
}

function isGenericReviewTitle(value: unknown) {
  return /^(ai[- ]drafted listing review|ai draft ready for broker review)$/i.test(String(value ?? "").trim());
}

function mergeMediaPayload(existingMedia: unknown, nextMedia: unknown) {
  const existing = isRecord(existingMedia) ? existingMedia : {};
  const next = isRecord(nextMedia) ? nextMedia : {};
  const merged = { ...existing, ...next } as Record<string, unknown>;
  const existingImages = Array.isArray(existing.images) ? existing.images : [];
  const nextImages = Array.isArray(next.images) ? next.images : [];
  if (existingImages.length || nextImages.length) {
    const seen = new Set<string>();
    merged.images = [...existingImages, ...nextImages].filter((image) => {
      const record = isRecord(image) ? image : {};
      const urls = isRecord(record.urls) ? record.urls : {};
      const key = String(record.id || record.storagePath || urls.original || urls.large || "").trim();
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  if (!merged.heroImageUrl && Array.isArray(merged.images)) {
    const firstImage = merged.images.find(isRecord) as Record<string, unknown> | undefined;
    const urls = firstImage && isRecord(firstImage.urls) ? firstImage.urls : {};
    merged.heroImageUrl = urls.large || urls.xlarge || urls.full || urls.original || null;
  }
  return merged;
}

export async function POST(request: Request) {
  let identifier = "";
  try {
    const body = (await request.json()) as LaunchPackageRequest;
    identifier = String(body.slug || body.propertyId || "").trim();
    if (!identifier) return NextResponse.json({ error: "Slug or propertyId is required" }, { status: 400 });

    const actorEmail = String(body.actorEmail || "pier-manager@piercommercial.com").trim();
    const action = body.action || "publish-live";

    if (action === "delete-draft") {
      const deleted = await deleteDraftLaunchPackage(identifier);
      return NextResponse.json({
        success: true,
        message: "Draft deleted from Firestore without touching Ascendix.",
        result: deleted,
        sync: null,
        ascendixBypassed: true,
        wordpressBypassed: true,
        primaryCms: "ListingStream",
      });
    }

    if (action === "make-live") {
      const publish = await makeDraftLaunchPackageLive(identifier, actorEmail);
      const sync = await syncPropertyToAscendix(publish.documentId);
      if (!sync.success) {
        const normalized = normalizeError(new Error(sync.message), "ascendix");
        return NextResponse.json({ success: false, result: publish, sync, error: normalized.message }, { status: normalized.transient ? 503 : 502 });
      }
      return NextResponse.json({
        success: true,
        message: "Draft made live and synced to Ascendix.",
        result: publish,
        sync,
        wordpressBypassed: true,
        primaryCms: "ListingStream",
      });
    }

    let save: Record<string, unknown> | null = null;
    let publishIdentifier = identifier;
    if (body.approvedPayload && typeof body.approvedPayload === "object") {
      const existingDoc = await getPropertyDocumentByIdentifier(identifier);
      publishIdentifier = existingDoc?.id || identifier;
      const existingData = existingDoc?.data() as Record<string, unknown> | undefined;
      const payloadForSave = { ...body.approvedPayload };
      if (isGenericReviewTitle(payloadForSave.title) && typeof existingData?.title === "string") {
        payloadForSave.title = existingData.title;
      }
      if (!hasMeaningfulValue(payloadForSave.media) && hasMeaningfulValue(existingData?.media)) {
        payloadForSave.media = existingData?.media;
      } else if (hasMeaningfulValue(payloadForSave.media)) {
        payloadForSave.media = mergeMediaPayload(existingData?.media, payloadForSave.media);
      }
      const approvedSlug = String(payloadForSave.slug || existingData?.slug || identifier).trim();

      await db.collection(PROPERTIES_COLLECTION).doc(publishIdentifier).set(
        {
          ...payloadForSave,
          slug: approvedSlug,
          status: String(payloadForSave.status || (action === "save-draft" ? "draft" : "active")),
          workflowStatus: String(payloadForSave.workflowStatus || (action === "save-draft" ? "draft_preview" : "approved")),
          updatedByUserId: actorEmail,
          meta: {
            ...((payloadForSave.meta && typeof payloadForSave.meta === "object") ? payloadForSave.meta : {}),
            updatedAt: FieldValue.serverTimestamp(),
            approval: {
              status: "approved",
              submittedAt: FieldValue.serverTimestamp(),
              submittedBy: actorEmail,
              decidedAt: FieldValue.serverTimestamp(),
              decidedBy: actorEmail,
              decisionNote: typeof body.note === "string" ? body.note.trim() || null : null,
              decisionSource: "pier-manager-broker-review",
            },
          },
        },
        { merge: true },
      );
      save = { success: true, slug: approvedSlug, documentId: publishIdentifier, directLaunchPackageSave: true };
    }

    if (action === "save-draft") {
      const draft = await saveDraftLaunchPackageToListingStream(publishIdentifier, actorEmail);
      return NextResponse.json({
        success: true,
        message: "Saved as ListingStream draft preview. Ascendix was bypassed.",
        save,
        result: draft,
        sync: null,
        ascendixBypassed: true,
        wordpressBypassed: true,
        primaryCms: "ListingStream",
      });
    }

    const publish = await publishLaunchPackageToListingStream(publishIdentifier, actorEmail);

    const sync = await syncPropertyToAscendix(publish.documentId);
    if (!sync.success) {
      const normalized = normalizeError(new Error(sync.message), "ascendix");
      return NextResponse.json({ success: false, save, result: publish, sync, error: normalized.message }, { status: normalized.transient ? 503 : 502 });
    }

    return NextResponse.json({
      success: true,
      message: "Published to ListingStream public_listings and synced to Ascendix.",
      save,
      result: publish,
      sync,
      wordpressBypassed: true,
      primaryCms: "ListingStream",
    });
  } catch (error) {
    const normalized = normalizeError(error, /Ascendix|Salesforce/i.test(error instanceof Error ? error.message : String(error)) ? "ascendix" : "listingstream");
    return NextResponse.json({ error: normalized.message, slug: identifier || null }, { status: normalized.transient ? 503 : 500 });
  }
}
