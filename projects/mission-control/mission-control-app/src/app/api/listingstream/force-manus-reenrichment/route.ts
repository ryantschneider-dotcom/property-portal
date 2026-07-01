import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, getAuthSession, isValidAuthToken } from "@/lib/auth";
import { buildPropertyPortalUrl, createPropertyPortalProxyError, getPropertyPortalInternalHeaders, safePropertyPortalFetch } from "@/lib/property-portal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const ok = await isValidAuthToken(token);
  if (!ok) throw new Error("Unauthorized");
  return getAuthSession(token);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const session = await requirePierManagerAuth();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const listingId = clean(body.listingId);
    if (!listingId) return NextResponse.json({ error: "listingId is required" }, { status: 400 });

    const response = await safePropertyPortalFetch(fetch, buildPropertyPortalUrl(`/api/listings/${encodeURIComponent(listingId)}/force-manus-reenrichment`), {
      method: "POST",
      cache: "no-store",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...getPropertyPortalInternalHeaders(),
      },
      body: JSON.stringify({
        requestedBy: clean(body.requestedBy) || (session?.brokerId ? `${session.brokerId}@piercommercial.com` : "PIER Manager"),
      }),
    }, "Manus force re-enrichment request");

    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    return NextResponse.json(data, { status: response.status, headers: { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const normalized = createPropertyPortalProxyError(error, "Manus force re-enrichment request");
    return NextResponse.json({ error: normalized.message }, { status: 503 });
  }
}
