"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { CopilotMessage, copilotSlashCommands, renderMarkdownPreview } from "@/lib/hermes-copilot";

type CopilotState = {
  ok: boolean;
  messages: CopilotMessage[];
  backend?: { ok: boolean; status: string; url?: string; error?: string };
};

const COPILOT_MESSAGES_STORAGE_KEY = "hermes-copilot:copilotMessages";

function readLocalCopilotMessages() {
  if (typeof window === "undefined") return [] as CopilotMessage[];
  try {
    const raw = window.localStorage.getItem(COPILOT_MESSAGES_STORAGE_KEY);
    if (!raw) return [] as CopilotMessage[];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [] as CopilotMessage[];
    return parsed.filter((message): message is CopilotMessage => {
      if (!message || typeof message !== "object") return false;
      const candidate = message as Partial<CopilotMessage>;
      return (candidate.role === "user" || candidate.role === "assistant") && typeof candidate.content === "string" && typeof candidate.createdAt === "string";
    }).slice(-80);
  } catch {
    return [] as CopilotMessage[];
  }
}

function writeLocalCopilotMessages(messages: CopilotMessage[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COPILOT_MESSAGES_STORAGE_KEY, JSON.stringify(messages.slice(-80)));
  } catch {
    // Browser storage can be unavailable in private mode; the server API remains stateless either way.
  }
}

export function HermesCopilotConsole() {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backend, setBackend] = useState<CopilotState["backend"]>(undefined);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const localMessages = readLocalCopilotMessages();
        const response = await fetch("/api/hermes-copilot", { cache: "no-store" });
        const data = (await response.json()) as CopilotState & { error?: string };
        if (!response.ok) throw new Error(data.error || "Unable to load Hermes Co-Pilot");
        if (!cancelled) {
          setMessages(localMessages);
          setBackend(data.backend);
        }
      } catch (err) {
        if (!cancelled) {
          const localMessages = readLocalCopilotMessages();
          setMessages(localMessages);
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    writeLocalCopilotMessages(messages);
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const commandHint = useMemo(() => {
    const trimmed = draft.trim();
    if (!trimmed.startsWith("/")) return null;
    return copilotSlashCommands.find((command) => command.name.startsWith(trimmed.split(/\s+/)[0]));
  }, [draft]);

  async function send(message = draft) {
    const payload = message.trim();
    if (!payload || sending) return;
    setSending(true);
    setError(null);
    setDraft("");
    const optimistic: CopilotMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: payload,
      createdAt: new Date().toISOString(),
      status: "sent",
    };
    const requestHistory = messages.slice(-80);
    const optimisticMessages = [...requestHistory, optimistic].slice(-80);
    setMessages(optimisticMessages);
    writeLocalCopilotMessages(optimisticMessages);
    try {
      const response = await fetch("/api/hermes-copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: payload, history: requestHistory }),
      });
      const data = (await response.json()) as CopilotState & { error?: string };
      if (!response.ok) throw new Error(data.error || "Hermes Co-Pilot send failed");
      const nextMessages = data.messages || optimisticMessages;
      setMessages(nextMessages);
      writeLocalCopilotMessages(nextMessages);
      setBackend(data.backend);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      const errorMessage: CopilotMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `## Co-Pilot Error\n\n${err instanceof Error ? err.message : String(err)}`,
        createdAt: new Date().toISOString(),
        status: "error",
      };
      setMessages((current) => [...current, errorMessage].slice(-80));
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  return (
    <div className="grid min-h-[calc(100vh-190px)] gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
      <section className="flex min-h-[68vh] flex-col overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 bg-zinc-950 px-4 py-4 text-white sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-[#f6a87f]">Native Hermes Interface</p>
              <h3 className="mt-1 text-xl font-semibold">Co-Pilot Command Console</h3>
            </div>
            <div className={`rounded-full border px-3 py-1 text-xs ${backend?.ok ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-100"}`}>
              OpenClaw {backend?.ok ? backend.status : "tunnel pending"}
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-[#f6f4f1] p-4 sm:p-5">
          {loading ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-500">Loading active Hermes session context…</div>
          ) : messages.length === 0 ? (
            <div className="rounded-3xl border border-[#CB521E]/20 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-[#CB521E]">Ready when you are.</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">Start with a normal message or one of the command chips. History is saved into the active Mission Control Co-Pilot session so desktop and mobile stay aligned.</p>
            </div>
          ) : null}

          {messages.map((message) => (
            <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[92%] rounded-3xl border px-4 py-3 shadow-sm sm:max-w-[78%] ${message.role === "user" ? "border-[#CB521E]/20 bg-[#CB521E] text-white" : "border-zinc-200 bg-white text-zinc-800"}`}>
                <div className="mb-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em] opacity-70">
                  <span>{message.role === "user" ? "Ryan" : "Hermes"}</span>
                  <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                </div>
                <div
                  className="prose prose-sm max-w-none prose-pre:overflow-x-auto prose-pre:rounded-2xl prose-pre:bg-zinc-950 prose-pre:p-4 prose-pre:text-zinc-100 prose-code:rounded prose-code:bg-black/10 prose-code:px-1 prose-code:py-0.5"
                  // renderMarkdownPreview escapes HTML before applying a tiny markdown subset for code/log readability.
                  dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(message.content) }}
                />
              </div>
            </article>
          ))}
          {sending ? <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500">Hermes is routing this through OpenClaw…</div> : null}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="border-t border-zinc-200 bg-white p-3 sm:p-4">
          {error ? <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {commandHint ? <div className="mb-3 rounded-2xl border border-[#CB521E]/20 bg-[#CB521E]/5 px-4 py-3 text-xs text-zinc-700"><strong>{commandHint.name}</strong> — {commandHint.description}</div> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={2}
              placeholder="Message Hermes or type /intel, /site, /scrape, /status…"
              className="min-h-[56px] flex-1 resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none transition focus:border-[#CB521E]/50 focus:bg-white focus:ring-4 focus:ring-[#CB521E]/10"
            />
            <button type="submit" disabled={sending || !draft.trim()} className="rounded-2xl bg-[#CB521E] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a94318] disabled:cursor-not-allowed disabled:opacity-50">
              Send
            </button>
          </div>
        </form>
      </section>

      <aside className="space-y-4">
        <div className="rounded-[2rem] border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.24em] text-[#CB521E]">Slash commands</p>
          <div className="mt-4 grid gap-2">
            {copilotSlashCommands.map((command) => (
              <button key={command.name} onClick={() => setDraft(command.placeholder)} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-left transition hover:border-[#CB521E]/30 hover:bg-[#CB521E]/5">
                <div className="font-mono text-sm font-semibold text-zinc-950">{command.name}</div>
                <div className="mt-1 text-xs leading-5 text-zinc-600">{command.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-zinc-200 bg-white p-4 text-sm leading-6 text-zinc-600 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">Connection posture</p>
          <ul className="mt-3 space-y-2">
            <li>• Server-side OpenClaw proxy; tokens never enter the browser.</li>
            <li>• Active chat memory persists in Mission Control.</li>
            <li>• Markdown, code, and log blocks render in chat bubbles.</li>
            <li>• Mobile-first composer supports Enter-to-send and Shift+Enter.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
