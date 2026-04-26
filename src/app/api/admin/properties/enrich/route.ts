export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { enrichPropertyDraft } from "@/lib/property-enrichment";

export async function POST(request: Request) {
  try {
    const { slug } = await request.json();
    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ error: "Slug is required" }, { status: 400 });
    }

    const result = await enrichPropertyDraft(slug);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Enrichment error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to enrich property draft" },
      { status: 500 },
    );
  }
}
