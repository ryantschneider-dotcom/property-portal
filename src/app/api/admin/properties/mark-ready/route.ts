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
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug } = await request.json();
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
    if (session.role !== "admin" && ownerEmail !== session.email.toLowerCase()) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set(
      {
        workflowStatus: "ready_for_approval",
        updatedByUserId: session.email,
        meta: {
          updatedAt: FieldValue.serverTimestamp(),
          reviewReadyAt: FieldValue.serverTimestamp(),
          reviewReadyBy: session.email,
        },
      },
      { merge: true },
    );

    return NextResponse.json({ success: true, slug, workflowStatus: "ready_for_approval" });
  } catch (error) {
    console.error("Mark ready error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to mark property ready" },
      { status: 500 },
    );
  }
}
