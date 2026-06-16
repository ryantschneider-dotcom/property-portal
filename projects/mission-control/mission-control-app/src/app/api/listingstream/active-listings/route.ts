import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, getAuthSession, isValidAuthToken, normalizeBrokerId } from "@/lib/auth";
import { buildPropertyPortalUrl, createPropertyPortalProxyError, getPropertyPortalInternalHeaders, normalizePropertyPortalDraftPreviewUrl, safePropertyPortalFetch } from "@/lib/property-portal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const ok = await isValidAuthToken(token);
  if (!ok) throw new Error("Unauthorized");
  return getAuthSession(token);
}

export async function GET(request: Request) {
  try {
    const session = await requirePierManagerAuth();
    const requestedBrokerId = new URL(request.url).searchParams.get("brokerId");
    const brokerId = normalizeBrokerId(requestedBrokerId || session?.brokerId || "ryan");
    const params = new URLSearchParams({ brokerId });
    const response = await safePropertyPortalFetch(fetch, buildPropertyPortalUrl(`/api/broker/active-listings?${params.toString()}`), {
      cache: "no-store",
      headers: {
        accept: "application/json",
        ...getPropertyPortalInternalHeaders(),
      },
    }, "active listings");
    const data = await response.json().catch(() => ({}));
    if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
      const items = ((data as { items: Array<Record<string, unknown>> }).items).map((item) => {
        const previewUrl = typeof item.previewUrl === "string" ? normalizePropertyPortalDraftPreviewUrl(item.previewUrl) : null;
        const rawPublicUrl = typeof item.publicUrl === "string" ? item.publicUrl : (typeof item.slug === "string" ? `/property/${encodeURIComponent(item.slug)}` : "");
        const publicUrl = rawPublicUrl ? buildPropertyPortalUrl(rawPublicUrl) : null;
        return {
          ...item,
          previewUrl: previewUrl ?? undefined,
          publicUrl: publicUrl ?? undefined,
        };
      });
      return NextResponse.json({ ...data, items }, { status: response.status });
    }
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const normalized = createPropertyPortalProxyError(error, "active listings");
    return NextResponse.json({ error: normalized.message }, { status: 503 });
  }
}
