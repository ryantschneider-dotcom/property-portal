export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireInternalBearer } from "@/lib/internal-api-auth";
import { buildNormalizedOmInput } from "@/lib/om/normalize-om-input";
import { validateNormalizedOmInput } from "@/lib/om/validate-om-input";

export async function POST(request: Request) {
  const unauthorized = requireInternalBearer(request, process.env.OM_SERVICE_TOKEN ?? null);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const propertyId = String(body?.propertyId ?? "").trim();
    if (!propertyId) {
      return NextResponse.json({ ok: false, error: "propertyId is required" }, { status: 400 });
    }

    const input = await buildNormalizedOmInput(propertyId);
    const validation = validateNormalizedOmInput(input);

    return NextResponse.json({
      ok: validation.ok,
      input,
      warnings: validation.warnings,
      errors: validation.errors,
    });
  } catch (error) {
    console.error("OM build-input error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to build OM input" },
      { status: 500 },
    );
  }
}
