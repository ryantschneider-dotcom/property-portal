import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { createHermesRun, getHermesApiHealth } from "@/lib/hermes-api-client";
import { getCopilotHistoryFromRequestBody } from "@/lib/hermes-copilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

async function requireAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

function safeSessionId(value: unknown) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : `mission-control-${Date.now()}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  return raw.replace(/[^a-zA-Z0-9:_-]/g, "-").slice(0, 180);
}

export async function GET() {
  try {
    await requireAuth();
    const health = await getHermesApiHealth();
    return NextResponse.json({ ok: true, health });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Hermes Console" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const body = (await request.json().catch(() => ({}))) as { message?: unknown; sessionId?: unknown; sessionKey?: unknown; history?: unknown; copilotMessages?: unknown; attachedContext?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });
    const sessionId = safeSessionId(body.sessionId);
    const sessionKey = typeof body.sessionKey === "string" && body.sessionKey.trim() ? body.sessionKey.trim().slice(0, 180) : "mission-control:master-console:ryan";
    const history = getCopilotHistoryFromRequestBody(body);
    const attachedContext = body.attachedContext && typeof body.attachedContext === "object" && !Array.isArray(body.attachedContext) ? body.attachedContext as Parameters<typeof createHermesRun>[0]["attachedContext"] : null;
    const run = await createHermesRun({ message, sessionId, sessionKey, history, attachedContext });
    return NextResponse.json({ ok: true, ...run, sessionId });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start Hermes run" }, { status: 500 });
  }
}
