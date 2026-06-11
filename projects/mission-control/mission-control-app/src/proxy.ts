import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE, isBrokerAllowedPath, isValidAuthToken, getAuthSession } from "@/lib/auth";

const publicPaths = new Set([
  "/login",
  "/api/auth/login",
  "/api/health",
]);
const brokerHomePath = "/pier" + "-manager";

function isStaticAsset(pathname: string) {
  return pathname.startsWith("/_next/") || pathname.startsWith("/favicon") || /\.[a-z0-9]+$/i.test(pathname);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = publicPaths.has(pathname) || isStaticAsset(pathname);
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const isAuthenticated = await isValidAuthToken(token);

  if (!isAuthenticated && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  const session = await getAuthSession(token);
  if (session?.role === "broker" && !isBrokerAllowedPath(pathname) && !isPublic) {
    const brokerUrl = request.nextUrl.clone();
    brokerUrl.pathname = brokerHomePath;
    brokerUrl.search = "";
    return NextResponse.redirect(brokerUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
