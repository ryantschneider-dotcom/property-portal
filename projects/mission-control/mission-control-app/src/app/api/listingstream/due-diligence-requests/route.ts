import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { buildPropertyPortalUrl, createPropertyPortalProxyError, getPropertyPortalInternalHeaders, safePropertyPortalFetch } from "@/lib/property-portal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

export async function GET() {
  try {
    await requirePierManagerAuth();
    const response = await safePropertyPortalFetch(fetch, buildPropertyPortalUrl("/api/broker/due-diligence-requests"), {
      cache: "no-store",
      headers: {
        accept: "application/json",
        ...getPropertyPortalInternalHeaders(),
      },
    }, "due diligence vault requests");
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const normalized = createPropertyPortalProxyError(error, "due diligence vault requests");
    return NextResponse.json({ error: normalized.message }, { status: 503 });
  }
}
