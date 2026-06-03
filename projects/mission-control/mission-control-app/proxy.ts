import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";

const publicPaths = ["/login", "/api/auth/login", "/api/health"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const isPublic = publicPaths.some((path) => pathname === path);
  const isAuthenticated = await isValidAuthToken(request.cookies.get(AUTH_COOKIE)?.value);

  if (!isAuthenticated && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAuthenticated && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*).*)", "/api/uploads/file/:path*"],
};
