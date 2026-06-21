import type { CopilotMessage } from "@/lib/hermes-copilot";

const DEFAULT_LOCAL_HERMES_API_URL = "http://127.0.0.1:8642";
const DEFAULT_PUBLIC_HERMES_API_URL = "https://hermes-api.ryans-ai-lab.com";
const HERMES_MODEL = "hermes-agent";

export type HermesRunStatus = {
  object?: string;
  run_id: string;
  status: "queued" | "running" | "waiting_for_approval" | "completed" | "failed" | "cancelled" | "started" | string;
  session_id?: string;
  model?: string;
  output?: string;
  error?: string;
  usage?: unknown;
  last_event?: string;
  created_at?: number;
  updated_at?: number;
};

export type HermesSession = {
  id: string;
  source?: string;
  title?: string;
  preview?: string;
  last_active?: string;
  started_at?: string;
  message_count?: number;
  tool_call_count?: number;
};

export type HermesSessionMessage = {
  id?: number | string;
  session_id?: string;
  role?: string;
  content?: string;
  timestamp?: string;
  tool_name?: string;
};

export type HermesConversationContext = {
  sourceSessionId: string;
  title: string;
  summary: string;
  messages: HermesSessionMessage[];
};

function hermesApiBaseUrl() {
  const configured = (process.env.HERMES_API_URL || process.env.HERMES_AGENT_API_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL) return DEFAULT_PUBLIC_HERMES_API_URL;
  return DEFAULT_LOCAL_HERMES_API_URL;
}

function hermesApiKey() {
  return (process.env.HERMES_API_KEY || process.env.API_SERVER_KEY || "").trim();
}

function requestHeaders(extra?: HeadersInit): HeadersInit {
  const key = hermesApiKey();
  return {
    accept: "application/json",
    "content-type": "application/json",
    ...(key ? { authorization: `Bearer ${key}` } : {}),
    ...extra,
  };
}

function timeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, clear: () => clearTimeout(timer) };
}

export async function getHermesApiHealth(timeoutMs = 4000) {
  const url = `${hermesApiBaseUrl()}/health`;
  const { controller, clear } = timeoutSignal(timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal, headers: requestHeaders({ "content-type": "application/json" }) });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: typeof data.status === "string" ? data.status : response.ok ? "ok" : "error", url };
  } catch (error) {
    return { ok: false, status: "offline", url, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clear();
  }
}

function mapCopilotHistory(history: CopilotMessage[] = []) {
  return history
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-30)
    .map((message) => ({ role: message.role, content: message.content }));
}

export function buildMissionControlHermesInstructions(attachedContext?: HermesConversationContext | null) {
  const contextBlock = attachedContext
    ? `\n\nMission Control continuity context attached from prior ${attachedContext.title || attachedContext.sourceSessionId}:\n${attachedContext.summary}\n\nUse this compact imported context as background for the current Mission Control conversation. Do not reveal raw private transcript unnecessarily; answer the new user request directly.`
    : "";

  return `You are Hermes operating inside Mission Control, a general-purpose first-class Hermes interface for Ryan. This is not PIER-only: help with PIER Commercial Real Estate, software development, personal logistics, local Mac mini administration, research, documents, media, and any other work Ryan asks for. Use the same default Hermes profile, durable memory, skills, and tools available in the gateway. Maintain desktop-primary assumptions for Mission Control: rich progress, wide-screen workflows, files/media, data tables, and long-running task status are preferred over mobile-first shortcuts. Act autonomously when the request is actionable, use tools rather than referral language, protect secrets, and ask only when missing context genuinely changes execution.${contextBlock}`;
}

export async function createHermesRun(input: {
  message: string;
  sessionId: string;
  sessionKey?: string;
  history?: CopilotMessage[];
  attachedContext?: HermesConversationContext | null;
  timeoutMs?: number;
}) {
  const url = `${hermesApiBaseUrl()}/v1/runs`;
  const { controller, clear } = timeoutSignal(input.timeoutMs ?? 10000);
  try {
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: requestHeaders({
        "X-Hermes-Session-Key": input.sessionKey || "mission-control:master-console:ryan",
      }),
      body: JSON.stringify({
        model: HERMES_MODEL,
        input: input.message,
        session_id: input.sessionId,
        instructions: buildMissionControlHermesInstructions(input.attachedContext),
        conversation_history: mapCopilotHistory(input.history),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data?.error?.message === "string" ? data.error.message : `Hermes run returned HTTP ${response.status}`);
    return data as { run_id: string; status: string };
  } finally {
    clear();
  }
}

export async function getHermesRun(runId: string, timeoutMs = 6000): Promise<HermesRunStatus> {
  const url = `${hermesApiBaseUrl()}/v1/runs/${encodeURIComponent(runId)}`;
  const { controller, clear } = timeoutSignal(timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal, headers: requestHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data?.error?.message === "string" ? data.error.message : `Hermes run status returned HTTP ${response.status}`);
    return data as HermesRunStatus;
  } finally {
    clear();
  }
}

export async function stopHermesRun(runId: string, timeoutMs = 6000) {
  const url = `${hermesApiBaseUrl()}/v1/runs/${encodeURIComponent(runId)}/stop`;
  const { controller, clear } = timeoutSignal(timeoutMs);
  try {
    const response = await fetch(url, { method: "POST", cache: "no-store", signal: controller.signal, headers: requestHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data?.error?.message === "string" ? data.error.message : `Hermes stop returned HTTP ${response.status}`);
    return data;
  } finally {
    clear();
  }
}

export async function listHermesSessions(input: { source?: string; limit?: number; offset?: number } = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(Math.max(input.limit ?? 80, 1), 200)));
  params.set("offset", String(Math.max(input.offset ?? 0, 0)));
  if (input.source) params.set("source", input.source);
  const url = `${hermesApiBaseUrl()}/api/sessions?${params.toString()}`;
  const response = await fetch(url, { cache: "no-store", headers: requestHeaders() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error?.message === "string" ? data.error.message : `Hermes sessions returned HTTP ${response.status}`);
  return Array.isArray(data.data) ? data.data as HermesSession[] : [];
}

export async function getHermesSessionMessages(sessionId: string) {
  const url = `${hermesApiBaseUrl()}/api/sessions/${encodeURIComponent(sessionId)}/messages`;
  const response = await fetch(url, { cache: "no-store", headers: requestHeaders() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error?.message === "string" ? data.error.message : `Hermes messages returned HTTP ${response.status}`);
  return Array.isArray(data.data) ? data.data as HermesSessionMessage[] : [];
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function searchHermesSessions(input: { query?: string; source?: string; limit?: number }) {
  const sessions = await listHermesSessions({ source: input.source, limit: Math.min(input.limit ?? 80, 120) });
  const query = normalizeText(input.query || "");
  if (!query) return sessions.slice(0, input.limit ?? 30).map((session) => ({ session, snippet: session.preview || "" }));

  const terms = query.split(" ").filter(Boolean);
  const scored: { session: HermesSession; snippet: string; score: number }[] = [];
  for (const session of sessions) {
    const haystack = normalizeText(`${session.title || ""} ${session.preview || ""}`);
    let score = terms.reduce((total, term) => total + (haystack.includes(term) ? 3 : 0), 0);
    let snippet = session.preview || "";
    if (score < terms.length * 2) {
      const messages = await getHermesSessionMessages(session.id).catch(() => []);
      const match = messages.find((message) => {
        const text = normalizeText(String(message.content || ""));
        return terms.every((term) => text.includes(term));
      });
      if (match?.content) {
        score += 10;
        snippet = String(match.content).slice(0, 360);
      }
    }
    if (score > 0) scored.push({ session, snippet, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 30)
    .map(({ session, snippet }) => ({ session, snippet }));
}

export function compactSessionMessages(session: HermesSession, messages: HermesSessionMessage[]): HermesConversationContext {
  const userAssistant = messages.filter((message) => message.role === "user" || message.role === "assistant");
  const first = userAssistant.slice(0, 6);
  const last = userAssistant.slice(-8);
  const selected = [...first, ...last.filter((message) => !first.includes(message))];
  const lines = selected.map((message) => `${String(message.role || "message").toUpperCase()}: ${String(message.content || "").replace(/\s+/g, " ").slice(0, 700)}`);
  const summary = [
    `Source session: ${session.title || session.id}`,
    session.preview ? `Preview: ${session.preview}` : "",
    `Selected continuity turns (${selected.length} of ${userAssistant.length}):`,
    ...lines,
  ].filter(Boolean).join("\n");
  return { sourceSessionId: session.id, title: session.title || session.id, summary, messages: selected };
}
