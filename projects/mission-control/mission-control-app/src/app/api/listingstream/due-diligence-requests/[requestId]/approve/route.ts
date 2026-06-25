import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { buildPropertyPortalUrl, createPropertyPortalProxyError, getPropertyPortalInternalHeaders, safePropertyPortalFetch } from "@/lib/property-portal-client";

type RouteContext = { params: Promise<{ requestId: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

export async function POST(request: Request, context: RouteContext) {
  try {
    await requirePierManagerAuth();
    const { requestId } = await context.params;
    if (!requestId) return NextResponse.json({ error: "Due diligence request ID is required." }, { status: 400 });
    const body = await request.text().catch(() => "");
    const response = await safePropertyPortalFetch(fetch, buildPropertyPortalUrl(`/api/broker/due-diligence-requests/${encodeURIComponent(requestId)}/approve`), {
      method: "POST",
      headers: {
        "content-type": request.headers.get("content-type") || "application/json",
        ...getPropertyPortalInternalHeaders(),
      },
      body: body || JSON.stringify({}),
    }, "due diligence vault approval");
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const normalized = createPropertyPortalProxyError(error, "due diligence vault approval");
    return NextResponse.json({ error: normalized.message }, { status: 503 });
  }
}
