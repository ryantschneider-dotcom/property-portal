import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE, getAuthSession } from "@/lib/auth";
import { buildPropertyPortalUrl, getPropertyPortalInternalHeaders, withPropertyPortalTimeout } from "@/lib/property-portal-client";
import { getBrokerProfileForSession } from "@/lib/offering-summary-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const OM_PROXY_TIMEOUT_MS = 780_000;

type Params = { params: Promise<{ slug: string }> };

function errorHtml(message: string) {
  return `<!doctype html><html><head><meta charset="utf-8" /><title>OM Generation Failed</title></head><body style="font-family: Arial, sans-serif; padding: 32px; color: #27272a;"><h1 style="color:#CB521E;">Offering Memorandum generation failed</h1><p>${message.replace(/[<&>]/g, "")}</p><p>Please close this tab and try again from PIER Manager.</p></body></html>`;
}

export async function GET(request: NextRequest, { params }: Params) {
  const session = await getAuthSession((await cookies()).get(AUTH_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { slug } = await params;
  const format = request.nextUrl.searchParams.get("format") === "html" ? "html" : "pdf";
  let response: Response;
  try {
    response = await withPropertyPortalTimeout(fetch(buildPropertyPortalUrl(`/api/admin/offering-memorandums/${encodeURIComponent(slug)}/pdf`), {
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
    }), OM_PROXY_TIMEOUT_MS, "Offering Memorandum generation timed out before ListingStream returned a PDF. Please try again; the backend may still be warming Chromium or map rendering.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Offering memorandum generation failed.";
    if (format === "html") return new NextResponse(errorHtml(message), { status: 504, headers: { "content-type": "text/html; charset=utf-8" } });
    return NextResponse.json({ error: message }, { status: 504 });
  }

  if (!response.ok) {
    const payload = await response.json().catch(async () => ({ error: await response.text().catch(() => "") }));
    const message = String((payload as { error?: unknown }).error || `Offering memorandum generation failed with status ${response.status}`);
    if (format === "html") return new NextResponse(errorHtml(message), { status: response.status, headers: { "content-type": "text/html; charset=utf-8" } });
    return NextResponse.json({ error: message }, { status: response.status });
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
