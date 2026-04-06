export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { saveAdminProperty } from "@/lib/admin";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = await saveAdminProperty(payload);
    return NextResponse.json({ success: true, id: result.documentId, slug: result.slug });
  } catch (error) {
    console.error("Save error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save property" },
      { status: 500 },
    );
  }
}
