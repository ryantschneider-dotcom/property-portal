export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { publishLaunchPackageToListingStream } from "@/lib/launch-package";
import { syncPropertyToAscendix } from "@/lib/ascendix-sync";
import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";

type LaunchPackageRequest = {
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

export async function POST(request: Request) {
  let identifier = "";
  try {
    const body = (await request.json()) as LaunchPackageRequest;
    identifier = String(body.slug || body.propertyId || "").trim();
    if (!identifier) return NextResponse.json({ error: "Slug or propertyId is required" }, { status: 400 });

    const actorEmail = String(body.actorEmail || "pier-manager@piercommercial.com").trim();

    let save: Record<string, unknown> | null = null;
    if (body.approvedPayload && typeof body.approvedPayload === "object") {
      await db.collection(PROPERTIES_COLLECTION).doc(identifier).set(
        {
          ...body.approvedPayload,
          slug: identifier,
          status: String(body.approvedPayload.status || "active"),
          workflowStatus: "approved",
          updatedByUserId: actorEmail,
          meta: {
            ...((body.approvedPayload.meta && typeof body.approvedPayload.meta === "object") ? body.approvedPayload.meta : {}),
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
      save = { success: true, slug: identifier, directLaunchPackageSave: true };
    }

    const publish = await publishLaunchPackageToListingStream(identifier, actorEmail);

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
