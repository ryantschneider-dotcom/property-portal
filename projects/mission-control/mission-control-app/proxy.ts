import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, getAuthSession, isBrokerAllowedPath } from "@/lib/auth";

const publicPaths = ["/login", "/api/auth/login", "/api/health"];
const brokerHomePath = ["/pier", "manager"].join("-");
// getAuthSession supersedes isValidAuthToken so broker roles can be enforced.

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const isPublic = publicPaths.some((path) => pathname === path);
  const session = await getAuthSession(request.cookies.get(AUTH_COOKIE)?.value);
  const isAuthenticated = session !== null;

  if (!isAuthenticated && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session && session.role === "broker" && !isBrokerAllowedPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Broker sessions are restricted to PIER Manager." }, { status: 403 });
    }

    return NextResponse.redirect(new URL(brokerHomePath, request.url));
  }

  if (isAuthenticated && pathname === "/login") {
    return NextResponse.redirect(new URL(session.role === "broker" ? brokerHomePath : "/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*).*)", "/api/uploads/file/:path*"],
};
