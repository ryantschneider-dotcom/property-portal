export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";

import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";
import { parsePortalSession } from "@/lib/portal-session";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalSession(cookieStore.get("admin_session")?.value);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug, status } = await request.json();
    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ error: "Slug is required" }, { status: 400 });
    }
    if (status !== "resolved" && status !== "superseded") {
      return NextResponse.json({ error: "Status must be resolved or superseded" }, { status: 400 });
    }

    const query = await db.collection(PROPERTIES_COLLECTION).where("slug", "==", slug).limit(1).get();
    const doc = !query.empty ? query.docs[0] : await db.collection(PROPERTIES_COLLECTION).doc(slug).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const raw = (doc.data() as Record<string, any> | undefined) ?? {};
    const currentRequest = raw.meta?.revisionWorkflow?.currentRequest ?? null;
    if (!currentRequest) {
      return NextResponse.json({ error: "No current revision request found" }, { status: 400 });
    }

    const closedAt = new Date().toISOString();

    await db.collection(PROPERTIES_COLLECTION).doc(doc.id).set(
      {
        workflowStatus: "review",
        updatedByUserId: session.email,
        meta: {
          updatedAt: FieldValue.serverTimestamp(),
          approval: {
            status: "pending",
          },
          revisionWorkflow: {
            currentRequest: FieldValue.delete(),
            history: FieldValue.arrayUnion({
              ...currentRequest,
              status,
              closedAt,
              closedBy: session.email,
            }),
          },
        },
      },
      { merge: true },
    );

    revalidatePath("/admin/properties");
    revalidatePath(`/admin/properties/${slug}/edit`);
    revalidatePath("/broker");
    revalidatePath("/broker/revisions");

    return NextResponse.json({ ok: true, slug, status });
  } catch (error) {
    console.error("Revision status update error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update revision status" }, { status: 500 });
  }
}
