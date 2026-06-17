import type { CopilotMessage } from "@/lib/hermes-copilot";

const DEFAULT_PUBLIC_COPILOT_ORIGIN = "https://openclaw-copilot.ryans-ai-lab.com";

function publicCopilotOrigin() {
  return (process.env.OPENCLAW_GATEWAY_ORIGIN || DEFAULT_PUBLIC_COPILOT_ORIGIN).trim().replace(/\/$/, "");
}

function gatewayWsUrl() {
  const configured = (process.env.OPENCLAW_GATEWAY_WS_URL || process.env.OPENCLAW_GATEWAY_URL || "").trim();
  if (configured) return configured;
  if (process.env.VERCEL) return `${publicCopilotOrigin().replace(/^http/i, "ws")}`;
  return "ws://127.0.0.1:18789";
}

function gatewayHttpUrl() {
  const configured = (process.env.OPENCLAW_GATEWAY_HTTP_URL || process.env.OPENCLAW_GATEWAY_PUBLIC_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL) return publicCopilotOrigin();
  return "http://127.0.0.1:18789";
}

function copilotExecUrl() {
  const configured = (process.env.OPENCLAW_COPILOT_EXEC_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  return `${gatewayHttpUrl()}/copilot-exec`;
}

export async function getOpenClawHealth(timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${gatewayHttpUrl()}/health`;
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: typeof data.status === "string" ? data.status : response.ok ? "live" : "error", url };
  } catch (error) {
    return { ok: false, status: "offline", url, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

type RpcResponse = { type: "res"; id: string; ok: true; payload: unknown } | { type: "res"; id: string; ok: false; error?: { message?: string; code?: string } };
type OpenClawChatResult = { ok: true; response?: unknown; runId?: string; text: string } | { ok: false; response?: unknown; error: string };
type OpenClawChatOptions = { sessionKey?: string; timeoutMs?: number; history?: CopilotMessage[] };

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function rpc(ws: WebSocket, method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  const id = requestId();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`OpenClaw RPC timeout: ${method}`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
    };
    const onMessage = (event: MessageEvent) => {
      let parsed: RpcResponse | null = null;
      try {
        parsed = JSON.parse(typeof event.data === "string" ? event.data : String(event.data)) as RpcResponse;
      } catch {
        return;
      }
      if (parsed.type !== "res" || parsed.id !== id) return;
      cleanup();
      if (parsed.ok) resolve(parsed.payload);
      else reject(new Error(parsed.error?.message || parsed.error?.code || `${method} failed`));
    };
    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify({ type: "req", id, method, params }));
  });
}

function textFromMessageContent(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const candidate = part as Record<string, unknown>;
      if (candidate.type === "text" && typeof candidate.text === "string") return candidate.text;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractRunId(response: unknown, fallback: string) {
  if (response && typeof response === "object" && typeof (response as Record<string, unknown>).runId === "string") {
    return (response as Record<string, string>).runId;
  }
  return fallback;
}

function extractAssistantTextAfterRun(history: unknown, runId: string) {
  if (!history || typeof history !== "object") return "";
  const messages = (history as Record<string, unknown>).messages;
  if (!Array.isArray(messages)) return "";
  const userIndex = messages.findIndex((message) => {
    if (!message || typeof message !== "object") return false;
    const key = (message as Record<string, unknown>).idempotencyKey;
    return typeof key === "string" && key.startsWith(`${runId}:`);
  });
  const searchStart = userIndex >= 0 ? userIndex + 1 : 0;
  for (const message of messages.slice(searchStart)) {
    if (!message || typeof message !== "object") continue;
    const candidate = message as Record<string, unknown>;
    if (candidate.role !== "assistant") continue;
    const text = textFromMessageContent(candidate.content);
    if (text) return text;
  }
  for (const message of messages.toReversed()) {
    if (!message || typeof message !== "object") continue;
    const candidate = message as Record<string, unknown>;
    if (candidate.role !== "assistant") continue;
    const text = textFromMessageContent(candidate.content);
    if (text) return text;
  }
  return "";
}

async function sendViaMacMiniExecutor(message: string, options: OpenClawChatOptions): Promise<OpenClawChatResult | null> {
  const token = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  if (!token) return null;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 55000;
  const timer = setTimeout(() => controller.abort(), timeoutMs + 5000);
  try {
    const response = await fetch(copilotExecUrl(), {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "user-agent": "mission-control-vercel/1.0" },
      body: JSON.stringify({ message, sessionKey: options.sessionKey || "main", timeoutMs, history: options.history || [] }),
    });
    if (response.status === 404) return null;
    const data = (await response.json().catch(() => ({}))) as { ok?: unknown; text?: unknown; error?: unknown; runId?: unknown; response?: unknown };
    if (!response.ok || !data.ok) return { ok: false, error: typeof data.error === "string" ? data.error : `Mac Mini executor returned HTTP ${response.status}`, response: data };
    const text = typeof data.text === "string" ? data.text.trim() : "";
    if (!text) return { ok: false, error: "Mac Mini executor completed without assistant text", response: data };
    return { ok: true, text, runId: typeof data.runId === "string" ? data.runId : undefined, response: data.response ?? data };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return { ok: false, error: "Mac Mini executor timed out waiting for OpenClaw output" };
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaGatewayWebSocket(message: string, options: OpenClawChatOptions = {}): Promise<OpenClawChatResult> {
  const url = gatewayWsUrl();
  const token = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  const timeoutMs = options.timeoutMs ?? 55000;
  const sessionKey = options.sessionKey || "main";
  const runId = requestId();
  const ws = new WebSocket(url);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("OpenClaw websocket connection timeout")), 6000);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("OpenClaw websocket connection failed"));
      }, { once: true });
    });

    await rpc(
      ws,
      "connect",
      {
        minProtocol: 4,
        maxProtocol: 4,
        client: { id: "cli", version: "mission-control", platform: "server", mode: "webchat" },
        role: "operator",
        scopes: ["operator.read", "operator.write"],
        caps: ["tool-events"],
        auth: token ? { token } : undefined,
        userAgent: "mission-control-hermes-copilot",
        locale: "en-US",
      },
      timeoutMs,
    );

    const response = await rpc(
      ws,
      "chat.send",
      { sessionKey, message, deliver: false, idempotencyKey: runId },
      timeoutMs,
    );
    const resolvedRunId = extractRunId(response, runId);
    await rpc(ws, "agent.wait", { runId: resolvedRunId, timeoutMs: Math.max(1000, timeoutMs - 5000) }, timeoutMs);
    const history = await rpc(ws, "chat.history", { sessionKey, limit: 16 }, 10000);
    const text = extractAssistantTextAfterRun(history, resolvedRunId);
    if (!text) return { ok: false, error: "OpenClaw completed without assistant text", response };
    return { ok: true, response, runId: resolvedRunId, text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    ws.close();
  }
}

export async function sendOpenClawChat(message: string, options: OpenClawChatOptions = {}) {
  const executorResult = await sendViaMacMiniExecutor(message, options);
  if (executorResult) return executorResult;
  return sendViaGatewayWebSocket(message, options);
}
