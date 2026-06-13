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

async function forwardSyndicationRequest(init?: RequestInit) {
  return safePropertyPortalFetch(fetch, buildPropertyPortalUrl("/api/admin/syndication"), {
    cache: "no-store",
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...getPropertyPortalInternalHeaders(),
      ...(init?.headers ?? {}),
    },
  }, "syndication status");
}

export async function GET() {
  try {
    await requirePierManagerAuth();
    const response = await forwardSyndicationRequest();
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const normalized = createPropertyPortalProxyError(error, "syndication status");
    return NextResponse.json({ error: normalized.message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    await requirePierManagerAuth();
    const body = await request.json().catch(() => ({}));
    const response = await forwardSyndicationRequest({ method: "POST", body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const normalized = createPropertyPortalProxyError(error, "syndication retry");
    return NextResponse.json({ error: normalized.message }, { status: 503 });
  }
}
