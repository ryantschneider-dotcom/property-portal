export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";
import { parsePortalSession } from "@/lib/portal-session";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalSession(cookieStore.get("admin_session")?.value);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug, note, reason } = await request.json();
    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ error: "Slug is required" }, { status: 400 });
    }

    const query = await db.collection(PROPERTIES_COLLECTION).where("slug", "==", slug).limit(1).get();
    const doc = !query.empty ? query.docs[0] : await db.collection(PROPERTIES_COLLECTION).doc(slug).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

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
            decisionNote: typeof note === "string" ? note.trim() || null : null,
            rejectionReason: typeof reason === "string" ? reason.trim() || null : null,
          },
        },
      },
      { merge: true },
    );

    return NextResponse.json({ success: true, slug, workflowStatus: "needs_input", approvalStatus: "rejected" });
  } catch (error) {
    console.error("Reject property error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reject property" },
      { status: 500 },
    );
  }
}
