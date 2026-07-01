import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { buildPropertyPortalUrl, createPropertyPortalProxyError, getPropertyPortalInternalHeaders, safePropertyPortalFetch } from "@/lib/property-portal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const ok = await isValidAuthToken(token);
  if (!ok) throw new Error("Unauthorized");
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  try {
    await requirePierManagerAuth();
    const url = new URL(request.url);
    const listingId = clean(url.searchParams.get("listingId"));
    const jobId = clean(url.searchParams.get("jobId"));
    if (!listingId) return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    const suffix = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
    const response = await safePropertyPortalFetch(fetch, buildPropertyPortalUrl(`/api/listings/${encodeURIComponent(listingId)}/force-manus-reenrichment/status${suffix}`), {
      method: "GET",
      cache: "no-store",
      headers: {
        accept: "application/json",
        ...getPropertyPortalInternalHeaders(),
      },
    }, "Manus force re-enrichment status");

    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    return NextResponse.json(data, { status: response.status, headers: { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const normalized = createPropertyPortalProxyError(error, "Manus force re-enrichment status");
    return NextResponse.json({ error: normalized.message }, { status: 503 });
  }
}
