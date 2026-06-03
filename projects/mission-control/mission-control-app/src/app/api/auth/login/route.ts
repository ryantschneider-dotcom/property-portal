import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  createAuthToken,
  getAuthCookieMaxAgeSeconds,
  isValidPassword,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { password?: string };

  if (!body.password || !isValidPassword(body.password)) {
    return NextResponse.json({ ok: false, error: "Invalid password" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, await createAuthToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getAuthCookieMaxAgeSeconds(),
  });

  return NextResponse.json({ ok: true });
}
