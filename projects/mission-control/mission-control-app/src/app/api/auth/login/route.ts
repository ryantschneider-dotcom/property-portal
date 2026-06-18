import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  createAuthToken,
  getAuthCookieMaxAgeSeconds,
  getLoginRole,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { password?: string; brokerId?: string; email?: string };

  const role = body.password ? getLoginRole(body.password, body.email) : null;

  if (!role) {
    return NextResponse.json({ ok: false, error: "Invalid password" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const brokerId = role === "broker" || role === "staff" ? body.brokerId : body.brokerId || "";

  cookieStore.set(AUTH_COOKIE, await createAuthToken(role, Date.now(), brokerId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getAuthCookieMaxAgeSeconds(),
  });

  return NextResponse.json({ ok: true, role, redirectTo: role === "broker" || role === "staff" ? "/pier-manager" : "/" });
}
