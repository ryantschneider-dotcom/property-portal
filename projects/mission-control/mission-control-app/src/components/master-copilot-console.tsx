"use client";

import { ChangeEvent, DragEvent, FormEvent, KeyboardEvent, useMemo, useRef, useState } from "react";

import type { CopilotAttachment, CopilotMessage } from "@/lib/hermes-copilot";
import { renderMarkdownPreview } from "@/lib/hermes-copilot";
import type { HermesConversationContext, HermesRunStatus, HermesSession } from "@/lib/hermes-api-client";

const quickStarts = [
  "Use your tools to inspect Mission Control and tell me the highest-leverage workflow to build next.",
  "Search our prior Telegram sessions for Pooler Parkway and attach the useful context before you answer.",
  "Help me plan my next 48 hours across work, family logistics, and maker projects.",
  "Review current repo state, propose an implementation path, and execute once the scope is clear.",
];

const operatingLanes = [
  { label: "General Hermes", detail: "The same default Hermes profile, skills, memory, terminal, browser, file, git, deployment, and research tools used in Telegram." },
  { label: "PIER CRE", detail: "Listings, OMs, Gate 5 sites, broker follow-up, local CRE intel, and ListingStream operations when the work is PIER-specific." },
  { label: "Life + Commerce", detail: "Personal logistics, planning, Shopify, product operations, documents, media, travel-style research, and day-to-day execution." },
  { label: "App Builds", detail: "Local repo inspection, implementation, tests, commits, Vercel deploys, smoke checks, and long-running task status." },
];

const fileStructures = ["/Users/macclaw/projects", "/Users/macclaw/listingstream-portal", "/Users/macclaw/.openclaw", "/Users/macclaw/.hermes"];
const MAX_PENDING_ATTACHMENTS = 8;
const ACCEPTED_ATTACHMENT_TYPES = "image/*,video/*,.pdf,.txt,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx";
const MASTER_CONSOLE_VIEWPORT_CLEARANCE_CLASS =
  "grid h-full min-h-0 min-h-[calc(100dvh-11rem)] scroll-mt-40 gap-5 pb-2 xl:grid-cols-[minmax(0,1.6fr)_460px] 2xl:grid-cols-[minmax(0,1.75fr)_520px]";
const MASTER_CONSOLE_CHAT_CARD_CLASS = "flex min-h-0 flex-col overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm";

type PendingAttachment = { id: string; file: File };
type SignedUpload = CopilotAttachment & { uploadUrl: string; method: "PUT"; headers: Record<string, string> };
type SessionSearchResult = { session: HermesSession; snippet: string };
type ActiveRun = { runId: string; sessionId: string; status: string; lastEvent?: string; startedAt: number } | null;

function createLocalMessage(role: "user" | "assistant", content: string, status: CopilotMessage["status"] = "ok", stable?: { id: string; createdAt: string }): CopilotMessage {
  return { id: stable?.id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, role, content, status, createdAt: stable?.createdAt || new Date().toISOString() };
}

function createMissionControlSessionId() {
  return `mission-control-${new Date().toISOString().slice(0, 10)}-${globalThis.crypto?.randomUUID?.().slice(0, 8) || Date.now()}`;
}

function attachmentPromptContext(attachments: CopilotAttachment[]) {
  if (!attachments.length) return "";
  const lines = attachments.map((attachment, index) => `${index + 1}. ${attachment.name} (${attachment.contentType}, ${formatFileSize(attachment.size)}): ${attachment.url}`);
  return `\n\nMission Control attachments uploaded for this turn:\n${lines.join("\n")}\nUse these URLs as first-class context. If the file is an image, PDF, spreadsheet, document, video, or media asset, inspect it with available tools before asking Ryan to re-describe it.`;
}

export function MasterCopilotConsole({ mode = "full" }: { mode?: "full" | "dashboard" } = {}) {
  const isDashboardMode = mode === "dashboard";
  const viewportClassName = isDashboardMode
    ? "grid h-full min-h-0 min-h-[calc(100dvh-9rem)] gap-3"
    : MASTER_CONSOLE_VIEWPORT_CLEARANCE_CLASS;
  const [sessionId, setSessionId] = useState(createMissionControlSessionId);
  const [messages, setMessages] = useState<CopilotMessage[]>([
    createLocalMessage(
      "assistant",
      "Welcome to the Mission Control Hermes Console. This is wired as a general-purpose Hermes interface, not a PIER-only assistant: send any work request and I’ll run it through the same default Hermes profile, memory, skills, and tools used in Telegram.",
      "ok",
      { id: "mission-control-hermes-welcome", createdAt: "2026-06-17T14:20:00.000Z" },
    ),
  ]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [activeRun, setActiveRun] = useState<ActiveRun>(null);
  const [attachedContext, setAttachedContext] = useState<HermesConversationContext | null>(null);
  const [sessionQuery, setSessionQuery] = useState("");
  const [sessionResults, setSessionResults] = useState<SessionSearchResult[]>([]);
  const [isSearchingSessions, setIsSearchingSessions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeHistory = useMemo(() => messages.slice(-40), [messages]);

  function addPendingFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.size > 0);
    if (!files.length) return;
    setPendingAttachments((current) => {
      const availableSlots = Math.max(MAX_PENDING_ATTACHMENTS - current.length, 0);
      const nextFiles = files.slice(0, availableSlots).map((file) => ({ id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${file.name}-${Math.random()}`, file }));
      if (files.length > availableSlots) setError(`Only ${MAX_PENDING_ATTACHMENTS} files can be attached at once.`);
      return [...current, ...nextFiles];
    });
  }

  function removePendingAttachment(id: string) {
    setPendingAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addPendingFiles(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
    if (event.dataTransfer.files) addPendingFiles(event.dataTransfer.files);
  }

  async function uploadPendingAttachments(): Promise<CopilotAttachment[]> {
    if (!pendingAttachments.length) return [];
    setUploadStatus(`Uploading ${pendingAttachments.length} attachment${pendingAttachments.length === 1 ? "" : "s"}...`);
    const response = await fetch("/api/hermes-copilot/attachments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files: pendingAttachments.map(({ file }) => ({ name: file.name, type: file.type || "application/octet-stream", size: file.size })) }),
    });
    const data = (await response.json().catch(() => ({}))) as { attachments?: SignedUpload[]; error?: string };
    if (!response.ok || !Array.isArray(data.attachments)) throw new Error(data.error || `Attachment upload prep returned HTTP ${response.status}`);
    const uploaded: CopilotAttachment[] = [];
    for (const [index, signed] of data.attachments.entries()) {
      const pending = pendingAttachments[index];
      if (!pending) continue;
      const upload = await fetch(signed.uploadUrl, { method: signed.method || "PUT", headers: signed.headers, body: pending.file });
      if (!upload.ok) throw new Error(`${pending.file.name} upload failed with HTTP ${upload.status}`);
      const attachment: CopilotAttachment = {
        id: signed.id,
        name: signed.name,
        url: signed.url,
        contentType: signed.contentType,
        size: signed.size,
      };
      uploaded.push(attachment);
    }
    return uploaded;
  }

  async function pollRun(runId: string): Promise<HermesRunStatus> {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const response = await fetch(`/api/hermes-console/runs/${encodeURIComponent(runId)}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { run?: HermesRunStatus; error?: string };
      if (!response.ok || !data.run) throw new Error(data.error || `Hermes run status returned HTTP ${response.status}`);
      setActiveRun((current) => current && current.runId === runId ? { ...current, status: data.run?.status || current.status, lastEvent: data.run?.last_event } : current);
      if (["completed", "failed", "cancelled"].includes(data.run.status)) return data.run;
      await new Promise((resolve) => setTimeout(resolve, attempt < 10 ? 1200 : 2500));
    }
    throw new Error("Hermes run is still active after the Mission Control polling window; check task status before resubmitting.");
  }

  async function sendMessage(messageText: string) {
    const trimmed = messageText.trim();
    if ((!trimmed && !pendingAttachments.length) || isSending) return;
    const attachmentsToSend = pendingAttachments;
    const outboundText = trimmed || `Please review the attached ${attachmentsToSend.length === 1 ? "file" : "files"}.`;
    const userMessage = createLocalMessage("user", outboundText, "sent");
    userMessage.attachments = attachmentsToSend.map(({ file, id }) => ({ id, name: file.name, url: "pending-upload", contentType: file.type || "application/octet-stream", size: file.size }));
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setError("");
    setUploadStatus("");
    setIsSending(true);

    try {
      const uploadedAttachments = await uploadPendingAttachments();
      setMessages((current) => current.map((message) => message.id === userMessage.id ? { ...message, attachments: uploadedAttachments } : message));
      setPendingAttachments([]);
      setUploadStatus(uploadedAttachments.length ? "Attachments uploaded and added to Hermes context." : "");
      const hermesMessage = `${outboundText}${attachmentPromptContext(uploadedAttachments)}`;
      const startResponse = await fetch("/api/hermes-console/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: hermesMessage, history: activeHistory, sessionId, sessionKey: "mission-control:master-console:ryan", attachedContext }),
      });
      const started = (await startResponse.json().catch(() => ({}))) as { ok?: boolean; run_id?: string; sessionId?: string; error?: string };
      if (!startResponse.ok || !started.run_id) throw new Error(started.error || `Hermes Console returned HTTP ${startResponse.status}`);
      setActiveRun({ runId: started.run_id, sessionId: started.sessionId || sessionId, status: "queued", startedAt: Date.now() });
      const finalRun = await pollRun(started.run_id);
      if (finalRun.status !== "completed") throw new Error(finalRun.error || `Hermes run ended with status ${finalRun.status}`);
      setMessages((current) => [...current, createLocalMessage("assistant", finalRun.output || "Hermes completed without a final response.", "ok")]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to reach the Hermes Console bridge.";
      setError(message);
      setMessages((current) => [...current, createLocalMessage("assistant", `I could not complete that through Hermes yet: ${message}`, "error")]);
    } finally {
      setIsSending(false);
      setActiveRun(null);
      textareaRef.current?.focus();
    }
  }

  async function searchSessions(queryOverride?: string) {
    const query = (queryOverride ?? sessionQuery).trim();
    setIsSearchingSessions(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (query) params.set("query", query);
      const response = await fetch(`/api/hermes-console/sessions?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { data?: SessionSearchResult[]; error?: string };
      if (!response.ok || !Array.isArray(data.data)) throw new Error(data.error || `Session search returned HTTP ${response.status}`);
      setSessionResults(data.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to search Hermes sessions.");
    } finally {
      setIsSearchingSessions(false);
    }
  }

  async function attachSession(sessionIdToAttach: string) {
    setError("");
    try {
      const response = await fetch("/api/hermes-console/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdToAttach }),
      });
      const data = (await response.json().catch(() => ({}))) as { context?: HermesConversationContext; error?: string };
      if (!response.ok || !data.context) throw new Error(data.error || `Attach returned HTTP ${response.status}`);
      setAttachedContext(data.context);
      setMessages((current) => [...current, createLocalMessage("assistant", `Attached compact continuity context from: ${data.context?.title || sessionIdToAttach}. Your next message can continue from that Telegram/Hermes thread without importing the full raw transcript.`, "ok")]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to attach prior Hermes session.");
    }
  }

  function startNewMissionControlSession() {
    setSessionId(createMissionControlSessionId());
    setAttachedContext(null);
    setMessages([createLocalMessage("assistant", "Started a fresh Mission Control Hermes session. Shared Hermes memory and skills remain available; prior Telegram context is detached unless you attach it again from the history panel.")]);
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
    <div className={viewportClassName}>
      <section className={MASTER_CONSOLE_CHAT_CARD_CLASS}>
        <div className="flex-none border-b border-zinc-200 bg-zinc-950 p-5 text-white lg:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-[#f6a87f]">First-class Hermes interface</p>
              <h3 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">Mission Control Hermes Console</h3>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                Desktop-primary command stream routed to the same Hermes backend/profile as Telegram, with shared tools, memory, skills, long-running task status, and prior-session continuity.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <StatusPill label="Backend" value="Hermes" />
              <StatusPill label="Profile" value="Default" />
              <StatusPill label="Scope" value="General" />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f6f4f1] p-4 lg:p-5">
          <div className="space-y-4">
            {attachedContext ? (
              <div className="rounded-3xl border border-[#CB521E]/25 bg-[#CB521E]/5 p-4 text-sm text-zinc-700">
                <span className="font-semibold text-zinc-950">Continuity attached:</span> {attachedContext.title}
                <button type="button" onClick={() => setAttachedContext(null)} className="ml-3 rounded-full border border-[#CB521E]/20 bg-white px-3 py-1 text-xs font-semibold text-[#CB521E]">Detach</button>
              </div>
            ) : null}
            {messages.map((message) => (
              <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-3xl border p-4 shadow-sm ${message.role === "user" ? "border-[#CB521E]/20 bg-[#CB521E] text-white" : message.status === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-zinc-200 bg-white text-zinc-900"}`}>
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <p className={`text-[10px] uppercase tracking-[0.22em] ${message.role === "user" ? "text-white/70" : "text-zinc-500"}`}>{message.role === "user" ? "Ryan" : "Hermes"}</p>
                    <time className={`text-[10px] ${message.role === "user" ? "text-white/60" : "text-zinc-400"}`} dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
                  </div>
                  {message.role === "assistant" ? (
                    // renderMarkdownPreview escapes raw HTML before applying a small markdown subset; Hermes text is never inserted unescaped.
                    <div className="prose prose-sm max-w-none text-inherit" dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(message.content) }} />
                  ) : <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>}
                  {message.attachments?.length ? <AttachmentManifest attachments={message.attachments} tone={message.role === "user" ? "dark" : "light"} /> : null}
                </div>
              </article>
            ))}
            {isSending || activeRun ? (
              <div className="rounded-3xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-zinc-950">Hermes is executing with tools in the background.</p>
                    <p className="mt-1">Run: {activeRun?.runId || "starting"} · Status: {activeRun?.status || "queued"}{activeRun?.lastEvent ? ` · Last event: ${activeRun.lastEvent}` : ""}</p>
                  </div>
                  <span className="rounded-full bg-[#CB521E]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#CB521E]">Non-blocking task</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-none border-t border-zinc-200 bg-white p-4 lg:p-5">
          {error ? <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {uploadStatus ? <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{uploadStatus}</div> : null}
          <div onDragOver={(event) => { event.preventDefault(); setIsDragActive(true); }} onDragLeave={() => setIsDragActive(false)} onDrop={handleDrop} className={`rounded-3xl border bg-zinc-50 p-3 focus-within:border-[#CB521E]/40 focus-within:ring-2 focus-within:ring-[#CB521E]/10 ${isDragActive ? "border-[#CB521E] ring-2 ring-[#CB521E]/20" : "border-zinc-200"}`}>
            <textarea ref={textareaRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} rows={4} placeholder="Hand Hermes the outcome: inspect a repo, deploy a fix, research a question, draft a document, search prior Telegram context, or coordinate any PIER/non-PIER work..." className="min-h-28 w-full resize-y bg-transparent px-2 py-2 text-base leading-7 text-zinc-950 outline-none placeholder:text-zinc-400" />
            {pendingAttachments.length ? (
              <div className="mt-2 grid gap-2 border-t border-zinc-200 pt-3 md:grid-cols-2">
                {pendingAttachments.map(({ id, file }) => (
                  <div key={id} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                    <div className="min-w-0"><p className="truncate font-semibold text-zinc-900">{file.name}</p><p className="text-zinc-500">{file.type || "application/octet-stream"} · {formatFileSize(file.size)}</p></div>
                    <button type="button" onClick={() => removePendingAttachment(id)} className="rounded-full px-2 py-1 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900" aria-label={`Remove ${file.name}`}>×</button>
                  </div>
                ))}
              </div>
            ) : null}
            <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_ATTACHMENT_TYPES} className="hidden" onChange={handleFileSelection} />
            <div className="flex flex-col gap-3 border-t border-zinc-200 pt-3 md:flex-row md:items-center md:justify-between">
              <p className="text-xs text-zinc-500">Drag files here or attach PDFs, images, videos, and docs. Cmd/Ctrl + Enter sends to Hermes with media context.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-[#CB521E]/40 hover:text-[#CB521E]">Attach files</button>
                <button type="button" onClick={startNewMissionControlSession} className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-[#CB521E]/40 hover:text-[#CB521E]">New session</button>
                <button type="submit" disabled={isSending || (!draft.trim() && !pendingAttachments.length)} className="rounded-xl bg-[#CB521E] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a94318] disabled:cursor-not-allowed disabled:opacity-50">{isSending ? "Hermes running..." : "Send to Hermes"}</button>
              </div>
            </div>
          </div>
        </form>
      </section>

      {!isDashboardMode ? (
      <aside className="min-h-0 space-y-4 overflow-y-auto pb-1">
        <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#CB521E]">Previous Telegram sessions</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">Search shared Hermes history, then attach a compact continuity summary to this Mission Control conversation without importing the full raw transcript.</p>
          <div className="mt-4 flex gap-2">
            <input value={sessionQuery} onChange={(event) => setSessionQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchSessions(); }} placeholder="Pooler Parkway, Offering Sites, ListingStream..." className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#CB521E]/50" />
            <button type="button" onClick={() => void searchSessions()} className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white">{isSearchingSessions ? "Searching" : "Search"}</button>
          </div>
          <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
            {sessionResults.map(({ session, snippet }) => (
              <button key={session.id} type="button" onClick={() => void attachSession(session.id)} className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-left transition hover:border-[#CB521E]/30 hover:bg-[#CB521E]/5">
                <p className="truncate text-sm font-semibold text-zinc-950">{session.title || session.id}</p>
                <p className="mt-1 line-clamp-3 text-xs leading-5 text-zinc-600">{snippet || session.preview || "No preview available."}</p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-zinc-400">{session.source || "Hermes"} · {session.message_count || 0} messages</p>
              </button>
            ))}
            {!sessionResults.length ? <p className="rounded-2xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">Run a search to attach previous Telegram/Hermes context.</p> : null}
          </div>
        </section>

        <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#CB521E]">Operating lanes</p>
          <div className="mt-4 grid gap-3">{operatingLanes.map((lane) => <div key={lane.label} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><h4 className="font-semibold text-zinc-950">{lane.label}</h4><p className="mt-2 text-sm leading-6 text-zinc-600">{lane.detail}</p></div>)}</div>
        </section>

        <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#CB521E]">Quick starts</p>
          <div className="mt-4 space-y-2">{quickStarts.map((prompt) => <button key={prompt} type="button" onClick={() => setDraft(prompt)} className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-left text-sm leading-6 text-zinc-700 transition hover:border-[#CB521E]/30 hover:bg-[#CB521E]/5">{prompt}</button>)}</div>
        </section>

        <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#CB521E]">Integrated file structures</p>
          <div className="mt-4 space-y-2">{fileStructures.map((path) => <code key={path} className="block rounded-xl border border-zinc-200 bg-zinc-950 px-3 py-2 text-xs text-zinc-100">{path}</code>)}</div>
          <p className="mt-4 text-xs leading-5 text-zinc-500">Mission Control stays desktop-native while execution runs server-side through the authenticated Hermes API bridge and Mac mini tool runtime.</p>
        </section>
      </aside>
      ) : null}
    </div>
  );
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function AttachmentManifest({ attachments, tone }: { attachments: CopilotAttachment[]; tone: "dark" | "light" }) {
  return <div className="mt-3 grid gap-2">{attachments.map((attachment) => <div key={attachment.id} className={`rounded-2xl border px-3 py-2 text-xs ${tone === "dark" ? "border-white/20 bg-white/10 text-white/85" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}><p className={`truncate font-semibold ${tone === "dark" ? "text-white" : "text-zinc-900"}`}>{attachment.name}</p><p>{attachment.contentType} · {formatFileSize(attachment.size)}</p></div>)}</div>;
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2"><p className="text-[9px] uppercase tracking-[0.2em] text-zinc-400">{label}</p><p className="mt-1 font-semibold text-white">{value}</p></div>;
}
