import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { getHermesRun, stopHermesRun } from "@/lib/hermes-api-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

async function requireAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    await requireAuth();
    const { runId } = await context.params;
    const run = await getHermesRun(runId);
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Hermes run" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    await requireAuth();
    const { runId } = await context.params;
    const result = await stopHermesRun(runId);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to stop Hermes run" }, { status: 500 });
  }
}
