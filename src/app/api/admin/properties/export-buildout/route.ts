export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { persistBuildoutExportPreview } from "@/lib/buildout-export";
import { parsePortalSession } from "@/lib/portal-session";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalSession(cookieStore.get("admin_session")?.value);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug } = await request.json();
    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ error: "Slug is required" }, { status: 400 });
    }

    const result = await persistBuildoutExportPreview(slug, session.email);
    return NextResponse.json({ success: true, slug, ...result });
  } catch (error) {
    console.error("Buildout export preview error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate Buildout export preview" },
      { status: 500 },
    );
  }
}
