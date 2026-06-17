"use client";

import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from "react";

import type { CopilotMessage } from "@/lib/hermes-copilot";
import { renderMarkdownPreview } from "@/lib/hermes-copilot";

const quickStarts = [
  "Plan my next 48 hours across PIER, family logistics, and maker projects.",
  "Review Mission Control and tell me the highest-leverage workflow to build next.",
  "Help me scope a Shopify operations sprint before you execute it.",
  "Run a PIER broker concierge check-in and ask me only what you need before acting.",
];

const operatingLanes = [
  { label: "PIER CRE", detail: "Listings, OMs, Gate 5 sites, broker follow-up, local CRE intel." },
  { label: "Life Logistics", detail: "Scheduling, errands, travel-style coordination, family and board commitments." },
  { label: "Commerce", detail: "Shopify, products, content ops, customer/admin workflow triage." },
  { label: "App Builds", detail: "Local repo inspection, implementation, testing, git, deploy, post-launch checks." },
];

const fileStructures = ["/Users/macclaw/projects", "/Users/macclaw/listingstream-portal", "/Users/macclaw/.openclaw", "/Users/macclaw/.hermes"];

function createLocalMessage(role: "user" | "assistant", content: string, status: CopilotMessage["status"] = "ok"): CopilotMessage {
  return {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    role,
    content,
    status,
    createdAt: new Date().toISOString(),
  };
}

export function MasterCopilotConsole() {
  const [messages, setMessages] = useState<CopilotMessage[]>([
    createLocalMessage(
      "assistant",
      "Welcome to the Master Co-Pilot Console. Give me a broad outcome, and I’ll either ask the minimum clarifying questions needed or execute through the local OpenClaw bridge when the scope is clear.",
    ),
  ]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeHistory = useMemo(() => messages.slice(-40), [messages]);

  async function sendMessage(messageText: string) {
    const trimmed = messageText.trim();
    if (!trimmed || isSending) return;
    const userMessage = createLocalMessage("user", trimmed, "sent");
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setError("");
    setIsSending(true);

    try {
      const response = await fetch("/api/hermes-copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: activeHistory,
          consoleMode: "master",
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { assistant?: CopilotMessage; error?: string };
      if (!response.ok || !data.assistant) {
        throw new Error(data.error || `Master Console returned HTTP ${response.status}`);
      }
      setMessages((current) => [...current, data.assistant as CopilotMessage]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to reach the Master Console bridge.";
      setError(message);
      setMessages((current) => [...current, createLocalMessage("assistant", `I could not complete that through OpenClaw yet: ${message}`, "error")]);
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void sendMessage(draft);
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-154px)] gap-5 xl:grid-cols-[minmax(0,1.55fr)_420px] 2xl:grid-cols-[minmax(0,1.7fr)_460px]">
      <section className="flex min-h-[720px] flex-col overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 bg-zinc-950 p-5 text-white lg:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-[#f6a87f]">Autonomous concierge node</p>
              <h3 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">Master Co-Pilot Console</h3>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                Desktop-native command stream for PIER, life logistics, commerce operations, and app development, routed through the local OpenClaw engine.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <StatusPill label="Bridge" value="OpenClaw" />
              <StatusPill label="Mode" value="Concierge" />
              <StatusPill label="Scope" value="Master" />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-[#f6f4f1] p-4 lg:p-5">
          <div className="space-y-4">
            {messages.map((message) => (
              <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[88%] rounded-3xl border p-4 shadow-sm ${
                    message.role === "user"
                      ? "border-[#CB521E]/20 bg-[#CB521E] text-white"
                      : message.status === "error"
                        ? "border-red-200 bg-red-50 text-red-900"
                        : "border-zinc-200 bg-white text-zinc-900"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <p className={`text-[10px] uppercase tracking-[0.22em] ${message.role === "user" ? "text-white/70" : "text-zinc-500"}`}>
                      {message.role === "user" ? "Ryan" : "Master Concierge"}
                    </p>
                    <time className={`text-[10px] ${message.role === "user" ? "text-white/60" : "text-zinc-400"}`} dateTime={message.createdAt}>
                      {new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </time>
                  </div>
                  {message.role === "assistant" ? (
                    // renderMarkdownPreview escapes raw HTML before applying a tiny markdown subset, so sanitized OpenClaw text is not inserted directly.
                    <div className="prose prose-sm max-w-none text-inherit" dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(message.content) }} />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                  )}
                </div>
              </article>
            ))}
            {isSending ? (
              <div className="rounded-3xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm">
                OpenClaw is working through the request. If the scope is broad, expect concise clarifying questions before execution.
              </div>
            ) : null}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="border-t border-zinc-200 bg-white p-4 lg:p-5">
          {error ? <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-3 focus-within:border-[#CB521E]/40 focus-within:ring-2 focus-within:ring-[#CB521E]/10">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={4}
              placeholder="Hand me the outcome: plan the day, triage PIER work, scope Shopify ops, build an app feature, or ask me the minimum concierge questions first…"
              className="min-h-28 w-full resize-y bg-transparent px-2 py-2 text-base leading-7 text-zinc-950 outline-none placeholder:text-zinc-400"
            />
            <div className="flex flex-col gap-3 border-t border-zinc-200 pt-3 md:flex-row md:items-center md:justify-between">
              <p className="text-xs text-zinc-500">Press ⌘/Ctrl + Enter to send. Broad requests trigger clarifying questions before execution.</p>
              <button
                type="submit"
                disabled={isSending || !draft.trim()}
                className="rounded-xl bg-[#CB521E] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a94318] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSending ? "Routing…" : "Send to Master Co-Pilot"}
              </button>
            </div>
          </div>
        </form>
      </section>

      <aside className="space-y-4">
        <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#CB521E]">Operating lanes</p>
          <div className="mt-4 grid gap-3">
            {operatingLanes.map((lane) => (
              <div key={lane.label} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <h4 className="font-semibold text-zinc-950">{lane.label}</h4>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{lane.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#CB521E]">Quick starts</p>
          <div className="mt-4 space-y-2">
            {quickStarts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setDraft(prompt)}
                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-left text-sm leading-6 text-zinc-700 transition hover:border-[#CB521E]/30 hover:bg-[#CB521E]/5"
              >
                {prompt}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#CB521E]">Integrated file structures</p>
          <div className="mt-4 space-y-2">
            {fileStructures.map((path) => (
              <code key={path} className="block rounded-xl border border-zinc-200 bg-zinc-950 px-3 py-2 text-xs text-zinc-100">
                {path}
              </code>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-zinc-500">
            The interface is static and dashboard-native; execution stays server-side through the authenticated OpenClaw bridge.
          </p>
        </section>
      </aside>
    </div>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2">
      <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-400">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
    </div>
  );
}
