export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireInternalBearer } from "@/lib/internal-api-auth";
import { validateOpenClawDraftResponse } from "@/lib/om/openclaw-prompt";

export async function POST(request: Request) {
  const unauthorized = requireInternalBearer(request, process.env.OPENCLAW_TOKEN ?? null);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const upstreamUrl = process.env.OPENCLAW_DRAFT_WEBHOOK_URL || process.env.OPENCLAW_DRAFT_URL;
    const upstreamToken = process.env.OPENCLAW_DRAFT_WEBHOOK_TOKEN || process.env.OPENCLAW_UPSTREAM_TOKEN || "";

    if (!upstreamUrl) {
      return NextResponse.json(
        { ok: false, error: "OPENCLAW_DRAFT_WEBHOOK_URL is not configured" },
        { status: 501 },
      );
    }

    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(upstreamToken ? { Authorization: `Bearer ${upstreamToken}` } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`OpenClaw upstream returned non-JSON response (${response.status})`);
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "OpenClaw draft upstream error",
          upstreamStatus: response.status,
          upstreamBody: parsed,
        },
        { status: 502 },
      );
    }

    const validated = validateOpenClawDraftResponse(parsed);
    return NextResponse.json(validated);
  } catch (error) {
    console.error("OM draft bridge error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to draft OM narrative" },
      { status: 500 },
    );
  }
}
