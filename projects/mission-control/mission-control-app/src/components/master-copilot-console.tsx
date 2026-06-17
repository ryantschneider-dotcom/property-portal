"use client";

import { ChangeEvent, DragEvent, FormEvent, KeyboardEvent, useMemo, useRef, useState } from "react";

import type { CopilotAttachment, CopilotMessage } from "@/lib/hermes-copilot";
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
const MAX_PENDING_ATTACHMENTS = 8;
const ACCEPTED_ATTACHMENT_TYPES = "image/*,video/*,.pdf,.txt,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx";

type PendingAttachment = {
  id: string;
  file: File;
};

type SignedUpload = CopilotAttachment & {
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
};

const MASTER_CONSOLE_VIEWPORT_CLEARANCE_CLASS =
  "grid h-full min-h-0 min-h-[calc(100dvh-11rem)] scroll-mt-40 gap-5 pb-2 xl:grid-cols-[minmax(0,1.55fr)_420px] 2xl:grid-cols-[minmax(0,1.7fr)_460px]";
const MASTER_CONSOLE_CHAT_CARD_CLASS = "flex min-h-0 flex-col overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm";

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
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeHistory = useMemo(() => messages.slice(-40), [messages]);

  function addPendingFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.size > 0);
    if (!files.length) return;
    setPendingAttachments((current) => {
      const availableSlots = Math.max(MAX_PENDING_ATTACHMENTS - current.length, 0);
      const nextFiles = files.slice(0, availableSlots).map((file) => ({
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${file.name}-${Math.random()}`,
        file,
      }));
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
    setUploadStatus(`Uploading ${pendingAttachments.length} attachment${pendingAttachments.length === 1 ? "" : "s"}…`);
    const response = await fetch("/api/hermes-copilot/attachments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        files: pendingAttachments.map(({ file }) => ({ name: file.name, type: file.type || "application/octet-stream", size: file.size })),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { attachments?: SignedUpload[]; error?: string };
    if (!response.ok || !Array.isArray(data.attachments)) throw new Error(data.error || `Attachment upload prep returned HTTP ${response.status}`);
    const uploaded: CopilotAttachment[] = [];
    for (const [index, signed] of data.attachments.entries()) {
      const pending = pendingAttachments[index];
      if (!pending) continue;
      const upload = await fetch(signed.uploadUrl, {
        method: signed.method || "PUT",
        headers: signed.headers,
        body: pending.file,
      });
      if (!upload.ok) throw new Error(`${pending.file.name} upload failed with HTTP ${upload.status}`);
      const { uploadUrl: _uploadUrl, method: _method, headers: _headers, ...attachment } = signed;
      uploaded.push(attachment);
    }
    return uploaded;
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
      setUploadStatus(uploadedAttachments.length ? "Attachments uploaded and added to context." : "");
      const response = await fetch("/api/hermes-copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: outboundText,
          history: activeHistory,
          attachments: uploadedAttachments,
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
    <div className={MASTER_CONSOLE_VIEWPORT_CLEARANCE_CLASS}>
      <section className={MASTER_CONSOLE_CHAT_CARD_CLASS}>
        <div className="flex-none border-b border-zinc-200 bg-zinc-950 p-5 text-white lg:p-6">
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

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f6f4f1] p-4 lg:p-5">
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
                  {message.attachments?.length ? <AttachmentManifest attachments={message.attachments} tone={message.role === "user" ? "dark" : "light"} /> : null}
                </div>
              </article>
            ))}
            {isSending ? (
              <div className="rounded-3xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm">
                OpenClaw is executing the request through available tools. If a blocker remains after tool attempts, I will return the concrete blocker and next action.
              </div>
            ) : null}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-none border-t border-zinc-200 bg-white p-4 lg:p-5">
          {error ? <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {uploadStatus ? <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{uploadStatus}</div> : null}
          <div
            onDragOver={(event) => { event.preventDefault(); setIsDragActive(true); }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={handleDrop}
            className={`rounded-3xl border bg-zinc-50 p-3 focus-within:border-[#CB521E]/40 focus-within:ring-2 focus-within:ring-[#CB521E]/10 ${isDragActive ? "border-[#CB521E] ring-2 ring-[#CB521E]/20" : "border-zinc-200"}`}
          >
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={4}
              placeholder="Hand me the outcome: plan the day, triage PIER work, scope Shopify ops, build an app feature, or ask me the minimum concierge questions first…"
              className="min-h-28 w-full resize-y bg-transparent px-2 py-2 text-base leading-7 text-zinc-950 outline-none placeholder:text-zinc-400"
            />
            {pendingAttachments.length ? (
              <div className="mt-2 grid gap-2 border-t border-zinc-200 pt-3 md:grid-cols-2">
                {pendingAttachments.map(({ id, file }) => (
                  <div key={id} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-zinc-900">{file.name}</p>
                      <p className="text-zinc-500">{file.type || "application/octet-stream"} · {formatFileSize(file.size)}</p>
                    </div>
                    <button type="button" onClick={() => removePendingAttachment(id)} className="rounded-full px-2 py-1 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900" aria-label={`Remove ${file.name}`}>×</button>
                  </div>
                ))}
              </div>
            ) : null}
            <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_ATTACHMENT_TYPES} className="hidden" onChange={handleFileSelection} />
            <div className="flex flex-col gap-3 border-t border-zinc-200 pt-3 md:flex-row md:items-center md:justify-between">
              <p className="text-xs text-zinc-500">Drag files here or attach PDFs, images, videos, and docs. ⌘/Ctrl + Enter sends to OpenClaw with media context.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:border-[#CB521E]/40 hover:text-[#CB521E]"
                >
                  Attach files
                </button>
              <button
                type="submit"
                disabled={isSending || (!draft.trim() && !pendingAttachments.length)}
                className="rounded-xl bg-[#CB521E] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a94318] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSending ? "Routing…" : "Send to Master Co-Pilot"}
              </button>
              </div>
            </div>
          </div>
        </form>
      </section>

      <aside className="min-h-0 space-y-4 overflow-y-auto pb-1">
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

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function AttachmentManifest({ attachments, tone }: { attachments: CopilotAttachment[]; tone: "dark" | "light" }) {
  return (
    <div className="mt-3 grid gap-2">
      {attachments.map((attachment) => (
        <div key={attachment.id} className={`rounded-2xl border px-3 py-2 text-xs ${tone === "dark" ? "border-white/20 bg-white/10 text-white/85" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>
          <p className={`truncate font-semibold ${tone === "dark" ? "text-white" : "text-zinc-900"}`}>{attachment.name}</p>
          <p>{attachment.contentType} · {formatFileSize(attachment.size)}</p>
        </div>
      ))}
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
