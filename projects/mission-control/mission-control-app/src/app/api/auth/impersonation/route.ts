import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import {
  AUTH_COOKIE,
  createAuthToken,
  getAuthCookieMaxAgeSeconds,
  getAuthSession,
  normalizeBrokerId,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getAuthSession(cookieStore.get(AUTH_COOKIE)?.value);

  if (session?.role !== "master" && session?.role !== "staff") {
    return NextResponse.json({ ok: false, error: "Admin or staff session required" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { brokerId?: string };
  const brokerId = normalizeBrokerId(body.brokerId);
  cookieStore.set(AUTH_COOKIE, await createAuthToken(session.role, Date.now(), brokerId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getAuthCookieMaxAgeSeconds(),
  });

  return NextResponse.json({ ok: true, role: session.role, brokerId });
}
