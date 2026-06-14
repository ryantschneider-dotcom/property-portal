import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import {
  buildCopilotPrompt,
  CopilotMessage,
  createCopilotAssistantFallback,
  normalizeCopilotMessages,
  parseCopilotCommand,
} from "@/lib/hermes-copilot";
import { getOpenClawHealth, sendOpenClawChat } from "@/lib/openclaw-client";
import { buildPropertyPortalUrl, getPropertyPortalInternalHeaders, safePropertyPortalFetch } from "@/lib/property-portal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requireAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

function makeMessage(role: "user" | "assistant", content: string, command?: string | null, status: CopilotMessage["status"] = "ok"): CopilotMessage {
  return {
    id: globalThis.crypto.randomUUID(),
    role,
    content,
    command,
    status,
    createdAt: new Date().toISOString(),
  };
}

async function runCopilotAction(command: string | null, args: string) {
  if (command === "/status") {
    const [openClaw, vercel] = await Promise.all([
      getOpenClawHealth(),
      fetch(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000", { cache: "no-store" })
        .then((response) => ({ ok: response.ok, status: response.status }))
        .catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) })),
    ]);
    return { ok: true, summary: `Vercel ${vercel.ok ? "reachable" : "unreachable"}; OpenClaw ${openClaw.ok ? openClaw.status : "offline"}; queue nominal until a live ListingStream queue error is reported.`, data: { openClaw, vercel } };
  }

  if (command === "/site") {
    const identifier = args.trim();
    if (!identifier) return { ok: false, summary: "Usage: /site [listingId or slug]" };
    try {
      const response = await safePropertyPortalFetch(
        fetch,
        buildPropertyPortalUrl("/api/admin/offering-sites"),
        {
          method: "POST",
          cache: "no-store",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            ...getPropertyPortalInternalHeaders(),
          },
          body: JSON.stringify({ listingId: identifier, slug: identifier, requestedBy: "hermes-co-pilot", gate: "5", runGate2: true, runGate5: true }),
        },
        "Hermes Co-Pilot offering site trigger",
      );
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, summary: response.ok ? `Offering Site Generator triggered for ${identifier}.` : `Offering Site Generator returned ${response.status}.`, data };
    } catch (error) {
      return { ok: false, summary: `Offering Site Generator trigger failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  return null;
}

export async function GET() {
  try {
    await requireAuth();
    const backend = await getOpenClawHealth(3000);
    return NextResponse.json({ ok: true, messages: [], backend });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Co-Pilot" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const body = (await request.json().catch(() => ({}))) as { message?: unknown; history?: unknown };
    const rawMessage = typeof body.message === "string" ? body.message.trim() : "";
    if (!rawMessage) return NextResponse.json({ error: "message is required" }, { status: 400 });

    const parsed = parseCopilotCommand(rawMessage);
    const history = normalizeCopilotMessages(body.history);
    const userMessage = makeMessage("user", rawMessage, parsed.command, "sent");
    const prompt = buildCopilotPrompt(parsed.command, parsed.args, history);
    const [backend, action, openClaw] = await Promise.all([
      getOpenClawHealth(3000),
      runCopilotAction(parsed.command, parsed.args),
      sendOpenClawChat(prompt, { sessionKey: "main", timeoutMs: 55000 }),
    ]);

    const assistantContent = openClaw.ok
      ? openClaw.text
      : createCopilotAssistantFallback({ message: rawMessage, command: parsed.command, args: parsed.args, backend, action });
    const assistantMessage = makeMessage("assistant", assistantContent, parsed.command, openClaw.ok || action?.ok ? "ok" : "error");

    const messages = [...history, userMessage, assistantMessage].slice(-80);

    return NextResponse.json({ ok: true, messages, assistant: assistantMessage, backend, action, openClaw });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to send Co-Pilot message" }, { status: 500 });
  }
}
