export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";
import { requireInternalBearer } from "@/lib/internal-api-auth";

export async function POST(request: Request) {
  const unauthorized = requireInternalBearer(request, process.env.OM_SERVICE_TOKEN ?? null);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const propertyId = String(body?.propertyId ?? "").trim();
    const patch = body?.patch;
    const runId = String(body?.runId ?? "").trim() || null;

    if (!propertyId) {
      return NextResponse.json({ ok: false, error: "propertyId is required" }, { status: 400 });
    }

    if (!patch || typeof patch !== "object") {
      return NextResponse.json({ ok: false, error: "patch is required" }, { status: 400 });
    }

    const docRef = db.collection(PROPERTIES_COLLECTION).doc(propertyId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ ok: false, error: "Property not found" }, { status: 404 });
    }

    const payload: Record<string, unknown> = {
      ...patch,
      meta: {
        omLastRunId: runId,
        omLastStatusUpdateAt: FieldValue.serverTimestamp(),
      },
      updatedAt: new Date().toISOString(),
    };

    await docRef.set(payload, { merge: true });

    return NextResponse.json({ ok: true, propertyId, runId, applied: patch });
  } catch (error) {
    console.error("OM status update error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update OM status" },
      { status: 500 },
    );
  }
}
