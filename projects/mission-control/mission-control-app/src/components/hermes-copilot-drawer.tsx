"use client";

import { ChangeEvent, ClipboardEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { CopilotAttachment, CopilotMessage, copilotSlashCommands, renderMarkdownPreview } from "@/lib/hermes-copilot";

const COPILOT_MESSAGES_STORAGE_KEY = "hermes-copilot:copilotMessages";
const MAX_PENDING_ATTACHMENTS = 8;

type CopilotState = {
  ok: boolean;
  messages: CopilotMessage[];
  backend?: { ok: boolean; status: string; url?: string; error?: string };
};

type SignedCopilotUpload = CopilotAttachment & {
  storagePath?: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

type PendingAttachment = {
  id: string;
  file: File;
  previewUrl?: string;
  uploaded?: CopilotAttachment;
  error?: string;
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

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function makePendingAttachment(file: File): PendingAttachment {
  return {
    id: globalThis.crypto?.randomUUID?.() || `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    file,
    previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
  };
}

function attachmentLabel(attachments: CopilotAttachment[]) {
  if (!attachments.length) return "";
  return `\n\nAttachments:\n${attachments.map((item) => `- ${item.name}: ${item.url}`).join("\n")}`;
}

type HermesCopilotDrawerProps = {
  variant?: "floating" | "page";
};

export function HermesCopilotDrawer({ variant = "floating" }: HermesCopilotDrawerProps = {}) {
  const isPage = variant === "page";
  const [open, setOpen] = useState(isPage);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backend, setBackend] = useState<CopilotState["backend"]>(undefined);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isPage) setOpen(true);
  }, [isPage]);

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
    return copilotSlashCommands.find((command: { name: string }) => command.name.startsWith(trimmed.split(/\s+/)[0]));
  }, [draft]);

  const attachmentPreviews = pendingAttachments;

  function addFiles(fileList: FileList | File[] | null) {
    const files = Array.from(fileList || []).filter((file) => file.size > 0);
    if (!files.length) return;
    setOpen(true);
    setError(null);
    setPendingAttachments((current) => {
      const remainingSlots = Math.max(0, MAX_PENDING_ATTACHMENTS - current.length);
      const next = files.slice(0, remainingSlots).map(makePendingAttachment);
      if (files.length > remainingSlots) setError(`Only ${MAX_PENDING_ATTACHMENTS} attachments can be sent at once.`);
      return [...current, ...next];
    });
  }

  function removeAttachment(id: string) {
    setPendingAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files || []);
    if (!files.length) return;
    event.preventDefault();
    addFiles(files);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragActive(false);
    addFiles(event.dataTransfer.files);
  }

  function handleFilePick(event: ChangeEvent<HTMLInputElement>) {
    addFiles(event.target.files);
    event.target.value = "";
  }

  async function prepareDirectUpload(): Promise<SignedCopilotUpload[]> {
    const response = await fetch("/api/hermes-copilot/attachments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        files: pendingAttachments.map((attachment) => ({
          name: attachment.file.name || "copilot-attachment",
          type: attachment.file.type || "application/octet-stream",
          size: attachment.file.size,
        })),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { attachments?: SignedCopilotUpload[]; error?: string };
    if (!response.ok) throw new Error(data.error || "Attachment upload preparation failed");
    return Array.isArray(data.attachments) ? data.attachments : [];
  }

  async function uploadPendingAttachments(): Promise<CopilotAttachment[]> {
    if (!pendingAttachments.length) return [];
    setUploading(true);
    try {
      const signedUploads = await prepareDirectUpload();
      const pendingByIndex = pendingAttachments.slice(0, signedUploads.length);
      await Promise.all(signedUploads.map(async (signedUpload, index) => {
        const attachment = pendingByIndex[index];
        if (!attachment) throw new Error("Attachment signing mismatch");
        const uploadResponse = await fetch(signedUpload.uploadUrl, {
          method: "PUT",
          headers: signedUpload.headers,
          body: attachment.file,
        });
        if (!uploadResponse.ok) {
          const detail = await uploadResponse.text().catch(() => "");
          throw new Error(`Attachment direct upload failed with status ${uploadResponse.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
        }
      }));
      return signedUploads.map(({ uploadUrl: _uploadUrl, method: _method, headers: _headers, expiresAt: _expiresAt, ...attachment }) => attachment);
    } finally {
      setUploading(false);
    }
  }

  async function send(message = draft) {
    const text = message.trim();
    if ((!text && pendingAttachments.length === 0) || sending || uploading) return;
    setSending(true);
    setError(null);
    try {
      const uploadedAttachments = await uploadPendingAttachments();
      const payload = text || "Please review the attached file(s).";
      setDraft("");
      setPendingAttachments((current) => {
        current.forEach((attachment) => {
          if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
        });
        return [];
      });
      const optimistic: CopilotMessage = {
        id: `drawer-local-${Date.now()}`,
        role: "user",
        content: `${payload}${attachmentLabel(uploadedAttachments)}`,
        attachments: uploadedAttachments,
        createdAt: new Date().toISOString(),
        status: "sent",
      };
      const requestHistory = messages.slice(-80);
      const optimisticMessages = [...requestHistory, optimistic].slice(-80);
      setMessages(optimisticMessages);
      writeLocalCopilotMessages(optimisticMessages);
      const response = await fetch("/api/hermes-copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: payload, attachments: uploadedAttachments, history: requestHistory, copilotMessages: requestHistory }),
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
      setUploading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  const visibleMessages = isPage ? messages : messages.slice(-20);
  const surface = (
        <section
          className={`${isPage ? "flex min-h-[calc(100vh-190px)] w-full flex-col overflow-hidden rounded-[2rem] border bg-white shadow-sm" : "ml-auto flex h-[min(720px,calc(100vh-2rem))] w-full max-w-[460px] flex-col overflow-hidden rounded-[1.75rem] border bg-white shadow-2xl shadow-zinc-950/25"} ${dragActive ? "border-[#CB521E] ring-4 ring-[#CB521E]/20" : "border-zinc-200"}`}
          aria-label={isPage ? "Hermes Co-Pilot master console" : "Hermes Co-Pilot chat drawer"}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <div className="border-b border-zinc-200 bg-zinc-950 p-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] text-[#f6a87f]">Native Hermes Co-Pilot</p>
                <h2 className="mt-1 text-lg font-semibold">Mission Control Chat</h2>
                <p className="mt-1 text-xs leading-5 text-zinc-300">Out-of-band backup: Telegram channel remains the permanent out-of-band backup.</p>
              </div>
              {!isPage ? <button type="button" aria-label="Close Hermes Co-Pilot chat" onClick={() => setOpen(false)} className="min-h-[44px] min-w-[44px] rounded-full border border-white/15 px-3 py-1 text-sm text-zinc-200 transition hover:bg-white/10">×</button> : null}
            </div>
            <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[11px] ${backend?.ok ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-100"}`}>
              {loading ? "Checking Hermes bridge…" : backend?.ok ? `Hermes bridge ${backend.status}` : "Hermes bridge fallback ready"}
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-[#f6f4f1] p-3">
            {messages.length === 0 ? (
              <div className="rounded-3xl border border-[#CB521E]/20 bg-white p-4 text-sm leading-6 text-zinc-600 shadow-sm">
                <strong className="text-[#CB521E]">Ready.</strong> Paste screenshots, drag files, or tap the attachment icon. Telegram stays available if the web UI or Vercel is unreachable.
              </div>
            ) : null}
            {visibleMessages.map((message) => (
              <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-3xl border px-3 py-2 text-sm shadow-sm ${message.role === "user" ? "border-[#CB521E]/20 bg-[#CB521E] text-white" : "border-zinc-200 bg-white text-zinc-800"}`}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-[9px] uppercase tracking-[0.18em] opacity-70">
                    <span>{message.role === "user" ? "Ryan" : "Hermes"}</span>
                    <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                  {/* renderMarkdownPreview escapes user/model text before adding the limited markdown tags used here. */}
                  <div className="prose prose-sm max-w-none prose-pre:overflow-x-auto prose-pre:rounded-2xl prose-pre:bg-zinc-950 prose-pre:p-3 prose-pre:text-zinc-100" dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(message.content) }} />
                  {message.attachments?.length ? (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {message.attachments.map((attachment) => (
                        <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/30 bg-white/15 p-2 text-xs underline-offset-2 hover:underline">
                          {attachment.name}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
            {sending ? <div className="rounded-2xl border border-zinc-200 bg-white p-3 text-sm text-zinc-500">{uploading ? "Uploading attachments…" : "Hermes is working…"}</div> : null}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t border-zinc-200 bg-white p-3">
            {error ? <div className="mb-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
            {commandHint ? <div className="mb-2 rounded-2xl border border-[#CB521E]/20 bg-[#CB521E]/5 px-3 py-2 text-xs text-zinc-700"><strong>{commandHint.name}</strong> — {commandHint.description}</div> : null}
            {attachmentPreviews.length ? (
              <div className="mb-2 grid max-h-36 grid-cols-2 gap-2 overflow-y-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-2 sm:grid-cols-3">
                {attachmentPreviews.map((attachment) => (
                  <div key={attachment.id} className="relative rounded-2xl border border-zinc-200 bg-white p-2 text-xs shadow-sm">
                    {attachment.previewUrl ? <img src={attachment.previewUrl} alt={attachment.file.name || "Attachment preview"} className="mb-1 h-20 w-full rounded-xl object-cover" /> : <div className="mb-1 flex h-20 items-center justify-center rounded-xl bg-zinc-100 text-xl">📎</div>}
                    <p className="truncate font-medium text-zinc-800">{attachment.file.name || "Pasted screenshot"}</p>
                    <p className="text-[10px] text-zinc-500">{formatBytes(attachment.file.size)}</p>
                    <button type="button" aria-label={`Remove ${attachment.file.name || "attachment"}`} onClick={() => removeAttachment(attachment.id)} className="absolute right-1 top-1 min-h-[28px] min-w-[28px] rounded-full bg-zinc-950/80 text-white">×</button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex gap-2">
              <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf,text/plain,text/csv,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFilePick} className="hidden" />
              <button type="button" aria-label="Attach files to Hermes Co-Pilot" onClick={() => fileInputRef.current?.click()} className="min-h-[44px] min-w-[44px] rounded-2xl border border-zinc-200 bg-zinc-50 text-lg text-zinc-700 transition hover:border-[#CB521E]/30 hover:bg-[#CB521E]/5">＋</button>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onPaste={handlePaste}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                placeholder="Message Hermes, paste screenshot, or drop files…"
                className="min-h-[52px] flex-1 resize-none rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none transition focus:border-[#CB521E]/50 focus:bg-white focus:ring-4 focus:ring-[#CB521E]/10"
              />
              <button type="submit" disabled={sending || uploading || (!draft.trim() && pendingAttachments.length === 0)} className="min-h-[44px] rounded-2xl bg-[#CB521E] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a94318] disabled:cursor-not-allowed disabled:opacity-50">Send</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {copilotSlashCommands.slice(0, 4).map((command) => (
                <button key={command.name} type="button" onClick={() => setDraft(command.placeholder)} className="min-h-[32px] rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-mono text-zinc-600 hover:border-[#CB521E]/30 hover:bg-[#CB521E]/5">
                  {command.name}
                </button>
              ))}
            </div>
          </form>
        </section>
  );

  if (isPage) return surface;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 sm:inset-auto sm:bottom-5 sm:right-5">
      {open ? surface : (
        <button type="button" aria-label="Open Hermes Co-Pilot chat" onClick={() => setOpen(true)} className="ml-auto flex min-h-[56px] items-center gap-3 rounded-full border border-[#CB521E]/30 bg-zinc-950 px-4 py-3 text-left text-white shadow-2xl shadow-zinc-950/25 transition hover:-translate-y-0.5 hover:bg-zinc-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#CB521E] text-sm font-bold">H</span>
          <span className="hidden sm:block">
            <span className="block text-sm font-semibold">Hermes Co-Pilot</span>
            <span className="block text-[11px] text-zinc-300">Media-ready web chat • Telegram backup</span>
          </span>
        </button>
      )}
    </div>
  );
}

export function HermesCopilotMasterConsole() {
  return <HermesCopilotDrawer variant="page" />;
}
