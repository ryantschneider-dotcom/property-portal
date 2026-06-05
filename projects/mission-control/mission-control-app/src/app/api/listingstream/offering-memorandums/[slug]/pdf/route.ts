import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE, getAuthSession } from "@/lib/auth";
import { buildPropertyPortalUrl, getPropertyPortalInternalHeaders } from "@/lib/property-portal-client";
import { getBrokerProfileForSession } from "@/lib/offering-summary-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const session = await getAuthSession((await cookies()).get(AUTH_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { slug } = await params;
  const format = request.nextUrl.searchParams.get("format") === "html" ? "html" : "pdf";
  const response = await fetch(buildPropertyPortalUrl(`/api/admin/offering-memorandums/${encodeURIComponent(slug)}/pdf`), {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...getPropertyPortalInternalHeaders(),
    },
    body: JSON.stringify({
      format,
      broker: getBrokerProfileForSession(session),
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    return NextResponse.json({ error: String(payload.error || `Offering memorandum generation failed with status ${response.status}`) }, { status: response.status });
  }

  const contentType = response.headers.get("content-type") || (format === "html" ? "text/html; charset=utf-8" : "application/pdf");
  const disposition = response.headers.get("content-disposition") || `attachment; filename="${slug}-offering-memorandum.pdf"`;
  return new NextResponse(await response.arrayBuffer(), {
    headers: {
      "content-type": contentType,
      ...(format === "pdf" ? { "content-disposition": disposition } : {}),
    },
  });
}
