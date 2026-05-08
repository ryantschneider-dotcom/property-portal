export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { evaluateAdminPreflight } from "@/lib/admin-workflow";
import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";
import { parsePortalSession } from "@/lib/portal-session";
import { isAdminPortalRole, isSeniorBrokerRole } from "@/lib/users";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalSession(cookieStore.get("admin_session")?.value);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug, note } = await request.json();
    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ error: "Slug is required" }, { status: 400 });
    }

    const query = await db.collection(PROPERTIES_COLLECTION).where("slug", "==", slug).limit(1).get();
    const doc = !query.empty ? query.docs[0] : await db.collection(PROPERTIES_COLLECTION).doc(slug).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const raw = (doc.data() as Record<string, unknown> | undefined) ?? {};
    const ownerEmail = typeof raw.ownerEmail === "string" ? raw.ownerEmail.toLowerCase() : null;
    const canAdminApprove = isAdminPortalRole(session.role);
    const canSeniorSelfApprove = isSeniorBrokerRole(session.role) && ownerEmail === session.email.toLowerCase();
    if (!canAdminApprove && !canSeniorSelfApprove) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const preflight = evaluateAdminPreflight(raw as Record<string, any>);
    if (preflight.blockers.length) {
      return NextResponse.json(
        {
          error: `Cannot approve until blockers are resolved: ${preflight.blockers.join(", ")}`,
          preflight,
        },
        { status: 400 },
      );
    }

    await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set(
      {
        workflowStatus: "approved",
        updatedByUserId: session.email,
        meta: {
          updatedAt: FieldValue.serverTimestamp(),
          reviewReadyAt: FieldValue.serverTimestamp(),
          reviewReadyBy: session.email,
          preflight: {
            status: preflight.status,
            blockers: preflight.blockers,
            warnings: preflight.warnings,
            sections: preflight.sections,
            lastEvaluatedAt: FieldValue.serverTimestamp(),
            lastEvaluatedBy: session.email,
          },
          approval: {
            status: "approved",
            submittedAt: FieldValue.serverTimestamp(),
            submittedBy: session.email,
            decidedAt: FieldValue.serverTimestamp(),
            decidedBy: session.email,
            decisionNote: typeof note === "string" ? note.trim() || null : null,
            decisionSource: canSeniorSelfApprove ? "senior_fast_track" : "admin_review",
          },
        },
      },
      { merge: true },
    );

    return NextResponse.json({ success: true, slug, workflowStatus: "approved", approvalStatus: "approved", preflight, decisionSource: canSeniorSelfApprove ? "senior_fast_track" : "admin_review" });
  } catch (error) {
    console.error("Approve property error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to approve property" },
      { status: 500 },
    );
  }
}
