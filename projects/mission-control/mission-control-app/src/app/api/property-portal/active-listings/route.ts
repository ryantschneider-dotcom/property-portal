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
    const response = await safePropertyPortalFetch(fetch, buildPropertyPortalUrl("/api/broker/active-listings"), {
      cache: "no-store",
      headers: {
        accept: "application/json",
        ...getPropertyPortalInternalHeaders(),
      },
    }, "active listings");
    const data = await response.json().catch(() => ({}));
    if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
      const items = ((data as { items: Array<Record<string, unknown>> }).items).map((item) => {
        const previewUrl = typeof item.previewUrl === "string" ? item.previewUrl : null;
        return {
          ...item,
          previewUrl: previewUrl && !/^https?:\/\//i.test(previewUrl) ? buildPropertyPortalUrl(previewUrl) : previewUrl ?? undefined,
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
