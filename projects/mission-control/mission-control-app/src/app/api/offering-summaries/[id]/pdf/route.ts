import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE, getAuthSession } from "@/lib/auth";
import { getRadiusDemographics } from "@/lib/census-demographics";
import {
  buildOfferingSummaryPdfModel,
  generateOfferingSummaryPdf,
  getBrokerProfileForSession,
  renderOfferingSummaryHtml,
} from "@/lib/offering-summary-pdf";
import { readStore } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession((await cookies()).get(AUTH_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  const store = await readStore();
  const listing = store.projects.find((project) => project.id === id && project.type === "listing");
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  const demographics = Number.isFinite(lat) && Number.isFinite(lng)
    ? await getRadiusDemographics(lat, lng, [1, 3, 5]).catch(() => null)
    : null;

  const model = buildOfferingSummaryPdfModel({
    listing,
    broker: getBrokerProfileForSession(session),
    heroImageUrl: request.nextUrl.searchParams.get("heroImageUrl"),
    demographics,
    aerialMapImageUrl: request.nextUrl.searchParams.get("aerialMapImageUrl"),
    locationMapImageUrl: request.nextUrl.searchParams.get("locationMapImageUrl"),
  });

  if (request.nextUrl.searchParams.get("format") === "html") {
    return new NextResponse(renderOfferingSummaryHtml(model), { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const pdf = await generateOfferingSummaryPdf(model);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${listing.id}-offering-summary.pdf"`,
    },
  });
}
