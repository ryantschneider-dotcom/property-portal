export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { db } from "@/lib/firestore";
import { parsePortalSession } from "@/lib/portal-session";
import { isAdminPortalRole, listPortalUsers, normalizePortalRole, type PortalRole, USERS_COLLECTION } from "@/lib/users";

export async function GET() {
  const cookieStore = await cookies();
  const session = parsePortalSession(cookieStore.get("admin_session")?.value);
  if (!session || !isAdminPortalRole(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await listPortalUsers();
  return NextResponse.json({
    users: users.map(({ passwordHash, ...user }) => user),
  });
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies();
  const session = parsePortalSession(cookieStore.get("admin_session")?.value);
  if (!session || !isAdminPortalRole(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { email, role, active } = await request.json();
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!normalizedEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalizedRole = normalizePortalRole(role, normalizedEmail) as PortalRole;
    if (!["admin", "senior_broker", "junior_broker", "sales_associate"].includes(normalizedRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const docRef = db.collection(USERS_COLLECTION).doc(normalizedEmail);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (normalizedEmail === session.email.toLowerCase() && normalizedRole !== "admin") {
      return NextResponse.json({ error: "You cannot remove your own admin access." }, { status: 400 });
    }

    await docRef.set(
      {
        email: normalizedEmail,
        role: normalizedRole,
        active: active !== false,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    revalidatePath("/admin/setup-users");

    return NextResponse.json({ ok: true, email: normalizedEmail, role: normalizedRole, active: active !== false });
  } catch (error) {
    console.error("Portal user update error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update portal user" }, { status: 500 });
  }
}
