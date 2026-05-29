export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyPortalUser, type PortalRole } from "@/lib/users";

function encodeSession(value: { email: string; role: PortalRole; name: string }) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    const user = await verifyPortalUser(email, password);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cookieStore = await cookies();
    cookieStore.set("admin_session", encodeSession({ email: user.email, role: user.role, name: user.name }), {
      maxAge: 60 * 60 * 24 * 5,
      httpOnly: true,
      secure: false,
      path: "/",
      sameSite: "lax",
    });

    return NextResponse.json({ success: true, role: user.role, email: user.email, name: user.name }, { status: 200 });
  } catch (error) {
    console.error("Session creation error:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
