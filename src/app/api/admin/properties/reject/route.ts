export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";
import { parsePortalSession } from "@/lib/portal-session";
import { normalizeRevisionCategories } from "@/lib/revision-workflow";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalSession(cookieStore.get("admin_session")?.value);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug, note, reason, summary, categories } = await request.json();
    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ error: "Slug is required" }, { status: 400 });
    }

    const query = await db.collection(PROPERTIES_COLLECTION).where("slug", "==", slug).limit(1).get();
    const doc = !query.empty ? query.docs[0] : await db.collection(PROPERTIES_COLLECTION).doc(slug).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const normalizedCategories = normalizeRevisionCategories(categories);
    if (!normalizedCategories.length) {
      return NextResponse.json({ error: "At least one structured revision category is required." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const requestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const summaryText = typeof summary === "string" ? summary.trim() || null : null;
    const decisionNote = typeof note === "string" ? note.trim() || null : null;
    const rejectionReason = typeof reason === "string" ? reason.trim() || null : null;

    await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set(
      {
        workflowStatus: "needs_input",
        updatedByUserId: session.email,
        meta: {
          updatedAt: FieldValue.serverTimestamp(),
          approval: {
            status: "rejected",
            decidedAt: FieldValue.serverTimestamp(),
            decidedBy: session.email,
            decisionNote,
            rejectionReason,
          },
          revisionWorkflow: {
            currentRequest: {
              id: requestId,
              createdAt: now,
              createdBy: session.email,
              createdByName: session.name ?? null,
              status: "open",
              summary: summaryText,
              categories: normalizedCategories,
            },
            history: FieldValue.arrayUnion({
              id: requestId,
              createdAt: now,
              createdBy: session.email,
              createdByName: session.name ?? null,
              status: "open",
              summary: summaryText,
              categories: normalizedCategories,
            }),
          },
        },
      },
      { merge: true },
    );

    return NextResponse.json({ success: true, slug, workflowStatus: "needs_input", approvalStatus: "rejected", revisionRequestId: requestId, categories: normalizedCategories });
  } catch (error) {
    console.error("Reject property error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reject property" },
      { status: 500 },
    );
  }
}
