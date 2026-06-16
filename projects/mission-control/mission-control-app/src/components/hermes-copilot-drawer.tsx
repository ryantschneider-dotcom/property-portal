"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { CopilotMessage, copilotSlashCommands, renderMarkdownPreview } from "@/lib/hermes-copilot";

const COPILOT_MESSAGES_STORAGE_KEY = "hermes-copilot:copilotMessages";

type CopilotState = {
  ok: boolean;
  messages: CopilotMessage[];
  backend?: { ok: boolean; status: string; url?: string; error?: string };
};

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
    // Mission Control remains usable when localStorage is blocked.
  }
}

export function HermesCopilotDrawer() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backend, setBackend] = useState<CopilotState["backend"]>(undefined);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const localMessages = readLocalCopilotMessages();
    setMessages(localMessages);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function loadStatus() {
      setLoading(true);
      try {
        const response = await fetch("/api/hermes-copilot", { cache: "no-store" });
        const data = (await response.json()) as CopilotState & { error?: string };
        if (!response.ok) throw new Error(data.error || "Unable to load Hermes Co-Pilot");
        if (!cancelled) setBackend(data.backend);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    writeLocalCopilotMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending, open]);

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
      id: `drawer-local-${Date.now()}`,
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
        body: JSON.stringify({ message: payload, history: requestHistory, copilotMessages: requestHistory }),
      });
      const data = (await response.json()) as CopilotState & { error?: string };
      if (!response.ok) throw new Error(data.error || "Hermes Co-Pilot send failed");
      const nextMessages = data.messages || optimisticMessages;
      setMessages(nextMessages);
      writeLocalCopilotMessages(nextMessages);
      setBackend(data.backend);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
      const errorMessage: CopilotMessage = { id: `drawer-error-${Date.now()}`, role: "assistant", content: `## Co-Pilot Error\n\n${detail}`, createdAt: new Date().toISOString(), status: "error" };
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
    <div className="fixed inset-x-3 bottom-3 z-50 sm:inset-auto sm:bottom-5 sm:right-5">
      {open ? (
        <section className="ml-auto flex h-[min(680px,calc(100vh-2rem))] w-full max-w-[440px] flex-col overflow-hidden rounded-[1.75rem] border border-zinc-200 bg-white shadow-2xl shadow-zinc-950/25" aria-label="Hermes Co-Pilot chat drawer">
          <div className="border-b border-zinc-200 bg-zinc-950 p-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-[#f6a87f]">Native Hermes Co-Pilot</p>
                <h2 className="mt-1 text-lg font-semibold">Mission Control Chat</h2>
                <p className="mt-1 text-xs leading-5 text-zinc-300">Out-of-band backup: Telegram channel remains the permanent out-of-band backup.</p>
              </div>
              <button type="button" aria-label="Close Hermes Co-Pilot chat" onClick={() => setOpen(false)} className="rounded-full border border-white/15 px-3 py-1 text-sm text-zinc-200 transition hover:bg-white/10">×</button>
            </div>
            <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[11px] ${backend?.ok ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-100"}`}>
              {loading ? "Checking Hermes bridge…" : backend?.ok ? `Hermes bridge ${backend.status}` : "Hermes bridge fallback ready"}
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-[#f6f4f1] p-3">
            {messages.length === 0 ? (
              <div className="rounded-3xl border border-[#CB521E]/20 bg-white p-4 text-sm leading-6 text-zinc-600 shadow-sm">
                <strong className="text-[#CB521E]">Ready.</strong> Message Hermes here without leaving Mission Control. Telegram stays available if the web UI or Vercel is unreachable.
              </div>
            ) : null}
            {messages.slice(-20).map((message) => (
              <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-3xl border px-3 py-2 text-sm shadow-sm ${message.role === "user" ? "border-[#CB521E]/20 bg-[#CB521E] text-white" : "border-zinc-200 bg-white text-zinc-800"}`}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-[9px] uppercase tracking-[0.18em] opacity-70">
                    <span>{message.role === "user" ? "Ryan" : "Hermes"}</span>
                    <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                  {/* renderMarkdownPreview escapes user/model text before adding the limited markdown tags used here. */}
                  <div className="prose prose-sm max-w-none prose-pre:overflow-x-auto prose-pre:rounded-2xl prose-pre:bg-zinc-950 prose-pre:p-3 prose-pre:text-zinc-100" dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(message.content) }} />
                </div>
              </article>
            ))}
            {sending ? <div className="rounded-2xl border border-zinc-200 bg-white p-3 text-sm text-zinc-500">Hermes is working…</div> : null}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t border-zinc-200 bg-white p-3">
            {error ? <div className="mb-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
            {commandHint ? <div className="mb-2 rounded-2xl border border-[#CB521E]/20 bg-[#CB521E]/5 px-3 py-2 text-xs text-zinc-700"><strong>{commandHint.name}</strong> — {commandHint.description}</div> : null}
            <div className="flex gap-2">
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
                placeholder="Message Hermes or type /status…"
                className="min-h-[52px] flex-1 resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none transition focus:border-[#CB521E]/50 focus:bg-white focus:ring-4 focus:ring-[#CB521E]/10"
              />
              <button type="submit" disabled={sending || !draft.trim()} className="rounded-2xl bg-[#CB521E] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a94318] disabled:cursor-not-allowed disabled:opacity-50">Send</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {copilotSlashCommands.slice(0, 4).map((command) => (
                <button key={command.name} type="button" onClick={() => setDraft(command.placeholder)} className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-mono text-zinc-600 hover:border-[#CB521E]/30 hover:bg-[#CB521E]/5">
                  {command.name}
                </button>
              ))}
            </div>
          </form>
        </section>
      ) : (
        <button type="button" aria-label="Open Hermes Co-Pilot chat" onClick={() => setOpen(true)} className="ml-auto flex items-center gap-3 rounded-full border border-[#CB521E]/30 bg-zinc-950 px-4 py-3 text-left text-white shadow-2xl shadow-zinc-950/25 transition hover:-translate-y-0.5 hover:bg-zinc-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#CB521E] text-sm font-bold">H</span>
          <span className="hidden sm:block">
            <span className="block text-sm font-semibold">Hermes Co-Pilot</span>
            <span className="block text-[11px] text-zinc-300">Native web chat • Telegram backup</span>
          </span>
        </button>
      )}
    </div>
  );
}
