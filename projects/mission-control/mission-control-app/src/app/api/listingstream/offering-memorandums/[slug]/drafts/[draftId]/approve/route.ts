import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE, getAuthSession } from "@/lib/auth";
import { buildPropertyPortalUrl, getPropertyPortalInternalHeaders, withPropertyPortalTimeout } from "@/lib/property-portal-client";
import { getBrokerProfileForSession } from "@/lib/offering-summary-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const OM_APPROVAL_TIMEOUT_MS = 295_000;

type Params = { params: Promise<{ slug: string; draftId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const session = await getAuthSession((await cookies()).get(AUTH_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { slug, draftId } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const response = await withPropertyPortalTimeout(fetch(buildPropertyPortalUrl(`/api/admin/offering-memorandums/${encodeURIComponent(slug)}/drafts/${encodeURIComponent(draftId)}/approve`), {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...getPropertyPortalInternalHeaders(),
      },
      body: JSON.stringify({
        ...body,
        broker: getBrokerProfileForSession(session),
      }),
    }), OM_APPROVAL_TIMEOUT_MS, "Approved OM publishing timed out before ListingStream attached the PDF. Please check the listing documents before retrying.");
    const payload = await response.json().catch(async () => ({ error: await response.text().catch(() => "") }));
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Approved OM publishing failed." }, { status: 504 });
  }
}
