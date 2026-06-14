function gatewayWsUrl() {
  return (process.env.OPENCLAW_GATEWAY_WS_URL || process.env.OPENCLAW_GATEWAY_URL || "ws://127.0.0.1:18789").trim();
}

function gatewayHttpUrl() {
  return (process.env.OPENCLAW_GATEWAY_HTTP_URL || process.env.OPENCLAW_GATEWAY_PUBLIC_URL || "http://127.0.0.1:18789").trim().replace(/\/$/, "");
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

export async function sendOpenClawChat(message: string, options: { sessionKey?: string; timeoutMs?: number } = {}) {
  const url = gatewayWsUrl();
  const token = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  const timeoutMs = options.timeoutMs ?? 20000;
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
        client: { id: "webchat", version: "mission-control", platform: "server", mode: "webchat" },
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
      { sessionKey: options.sessionKey || "main", message, deliver: false, idempotencyKey: requestId() },
      timeoutMs,
    );
    return { ok: true, response };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    ws.close();
  }
}
