export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

import { persistLaunchExecutionState, publishLaunchPackageToListingStream } from "@/lib/launch-package";
import { syncPropertyToAscendix } from "@/lib/ascendix-sync";
import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";
import { parsePortalSession } from "@/lib/portal-session";

type ExportAction = "build_package" | "queue_export" | "retry_export" | "mark_failed";

async function resolvePropertyDoc(propertyId: string) {
  const directDoc = await db.collection(PROPERTIES_COLLECTION).doc(propertyId).get();
  if (directDoc.exists) return directDoc;

  const snapshot = await db.collection(PROPERTIES_COLLECTION).where("slug", "==", propertyId).limit(1).get();
  if (!snapshot.empty) return snapshot.docs[0];

  return null;
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalSession(cookieStore.get("admin_session")?.value);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { propertyId, action } = await request.json() as { propertyId?: string; action?: ExportAction };
    if (!propertyId || typeof propertyId !== "string") {
      return NextResponse.json({ error: "Property ID is required" }, { status: 400 });
    }
    if (!action || !["build_package", "queue_export", "retry_export", "mark_failed"].includes(action)) {
      return NextResponse.json({ error: "Valid export action is required" }, { status: 400 });
    }

    const doc = await resolvePropertyDoc(propertyId);
    if (!doc?.exists) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    if (action === "build_package") {
      const result = await persistLaunchExecutionState(doc.id, session.email);
      revalidatePath("/admin/exports");
      revalidatePath("/admin/properties");
      revalidatePath(`/admin/properties/${doc.id}/edit`);
      return NextResponse.json({ success: true, message: "Launch package rebuilt for ListingStream.", result });
    }

    if (action === "queue_export" || action === "retry_export") {
      try {
        const result = await publishLaunchPackageToListingStream(doc.id, session.email);
        const sync = await syncPropertyToAscendix(result.documentId);
        revalidatePath("/admin/exports");
        revalidatePath("/admin/properties");
        revalidatePath(`/admin/properties/${doc.id}/edit`);
        return NextResponse.json({
          success: sync.success,
          message: sync.success
            ? (action === "retry_export" ? "ListingStream publish retried successfully and Ascendix synced." : "Published to ListingStream and synced to Ascendix.")
            : `Published to ListingStream, but Ascendix sync needs retry: ${sync.message}`,
          result,
          sync,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "Missing Geolocation") {
          revalidatePath("/admin/exports");
          revalidatePath("/admin/properties");
          revalidatePath(`/admin/properties/${doc.id}/edit`);
          return NextResponse.json({ error: "Missing Geolocation" }, { status: 400 });
        }
        throw error;
      }
    }

    await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set(
      {
        meta: {
          updatedAt: FieldValue.serverTimestamp(),
          exportWorkflow: {
            destination: "listingstream",
            status: "failed",
            lastExportAttempt: {
              attemptedAt: FieldValue.serverTimestamp(),
              attemptedBy: session.email,
              result: "failed",
              errorMessage: "Marked failed from Export Console.",
            },
          },
        },
      },
      { merge: true },
    );

    revalidatePath("/admin/exports");
    revalidatePath("/admin/properties");
    revalidatePath(`/admin/properties/${doc.id}/edit`);

    return NextResponse.json({ success: true, message: "Export marked failed." });
  } catch (error) {
    console.error("Export console action error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update export workflow" },
      { status: 500 },
    );
  }
}
