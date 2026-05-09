export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

import { persistLaunchExecutionState } from "@/lib/launch-package";
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

    const raw = (doc.data() as Record<string, any> | undefined) ?? {};
    const slug = typeof raw.slug === "string" && raw.slug.trim() ? raw.slug.trim() : doc.id;

    if (action === "build_package") {
      const result = await persistLaunchExecutionState(slug, session.email);
      revalidatePath("/admin/exports");
      revalidatePath("/admin/properties");
      revalidatePath(`/admin/properties/${doc.id}/edit`);
      return NextResponse.json({ success: true, message: "Launch package rebuilt.", result });
    }

    const exportCountBase = Number(raw.meta?.exportWorkflow?.exportCount ?? 0) || 0;
    const now = FieldValue.serverTimestamp();
    const update: Record<string, unknown> = {
      meta: {
        updatedAt: now,
        exportWorkflow: {
          destination: raw.meta?.exportWorkflow?.destination ?? "buildout",
        },
      },
    };

    if (action === "queue_export" || action === "retry_export") {
      update.meta = {
        ...((update.meta as Record<string, unknown>) ?? {}),
        exportWorkflow: {
          destination: raw.meta?.exportWorkflow?.destination ?? "buildout",
          status: "queued",
          queuedAt: now,
          queuedBy: session.email,
          exportCount: exportCountBase + 1,
          lastExportAttempt: {
            attemptedAt: now,
            attemptedBy: session.email,
            result: action === "retry_export" ? "retry_queued" : "queued",
            errorMessage: null,
          },
        },
      };
    }

    if (action === "mark_failed") {
      update.meta = {
        ...((update.meta as Record<string, unknown>) ?? {}),
        exportWorkflow: {
          destination: raw.meta?.exportWorkflow?.destination ?? "buildout",
          status: "failed",
          lastExportAttempt: {
            attemptedAt: now,
            attemptedBy: session.email,
            result: "failed",
            errorMessage: "Marked failed from Export Console.",
          },
        },
      };
    }

    await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set(update, { merge: true });

    revalidatePath("/admin/exports");
    revalidatePath("/admin/properties");
    revalidatePath(`/admin/properties/${doc.id}/edit`);

    return NextResponse.json({
      success: true,
      message:
        action === "queue_export"
          ? "Export queued."
          : action === "retry_export"
            ? "Export re-queued."
            : "Export marked failed.",
    });
  } catch (error) {
    console.error("Export console action error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update export workflow" },
      { status: 500 },
    );
  }
}
