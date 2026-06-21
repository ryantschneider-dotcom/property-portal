import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { compactSessionMessages, getHermesSessionMessages, listHermesSessions, searchHermesSessions } from "@/lib/hermes-api-client";
import type { HermesSession } from "@/lib/hermes-api-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function requireAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

export async function GET(request: Request) {
  try {
    await requireAuth();
    const url = new URL(request.url);
    const query = url.searchParams.get("query")?.trim() || "";
    const source = url.searchParams.get("source")?.trim() || undefined;
    const limit = Number(url.searchParams.get("limit") || 40);
    const data = query ? await searchHermesSessions({ query, source, limit }) : (await listHermesSessions({ source, limit })).map((session: HermesSession) => ({ session, snippet: session.preview || "" }));
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to search Hermes sessions" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const body = (await request.json().catch(() => ({}))) as { sessionId?: unknown };
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    const sessions: HermesSession[] = await listHermesSessions({ limit: 200 });
    const session = sessions.find((candidate: HermesSession) => candidate.id === sessionId) || { id: sessionId, title: sessionId };
    const messages = await getHermesSessionMessages(sessionId);
    const context = compactSessionMessages(session, messages);
    return NextResponse.json({ ok: true, context });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to attach Hermes session" }, { status: 500 });
  }
}
