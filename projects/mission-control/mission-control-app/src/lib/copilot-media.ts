import type { CopilotAttachment, CopilotMessage } from "@/lib/hermes-copilot";
import { getFirebaseAccessToken, getFirebaseStorageBucket } from "@/lib/mission-control-firebase-storage";

export type CopilotMediaContextResult = {
  ok: boolean;
  text: string;
  attachmentCount: number;
  parsedCount: number;
  error?: string;
};

const MAX_MEDIA_ATTACHMENTS = 6;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_CONTEXT_CHARS_PER_FILE = 12000;

async function fetchFirebaseStorageObject(storagePath: string) {
  const bucket = getFirebaseStorageBucket();
  const token = await getFirebaseAccessToken();
  const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(storagePath)}?alt=media`, {
    cache: "no-store",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Firebase Storage object fetch failed with status ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchAttachmentBytes(attachment: CopilotAttachment) {
  if (attachment.storagePath) return fetchFirebaseStorageObject(attachment.storagePath);
  const response = await fetch(attachment.url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Attachment URL fetch failed with status ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function trimContext(text: string) {
  const normalized = text.replace(/\u0000/g, "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return normalized.length > MAX_CONTEXT_CHARS_PER_FILE ? `${normalized.slice(0, MAX_CONTEXT_CHARS_PER_FILE)}\n\n[Truncated after ${MAX_CONTEXT_CHARS_PER_FILE.toLocaleString()} characters.]` : normalized;
}

async function extractPdfText(bytes: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false, isEvalSupported: false } as Parameters<typeof pdfjs.getDocument>[0]);
  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];
  const maxPages = Math.min(pdf.numPages, 12);
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const strings = content.items.map((item) => "str" in item ? item.str : "").filter(Boolean);
    if (strings.length) pageTexts.push(`Page ${pageNumber}:\n${strings.join(" ")}`);
  }
  if (pdf.numPages > maxPages) pageTexts.push(`[PDF truncated after ${maxPages} of ${pdf.numPages} pages.]`);
  return pageTexts.join("\n\n");
}

function isPlainTextAttachment(attachment: CopilotAttachment) {
  const type = attachment.contentType.toLowerCase();
  return type.startsWith("text/") || /\.(txt|csv|json|md|rtf)$/i.test(attachment.name) || ["application/json", "application/csv", "text/csv"].includes(type);
}

function isPdfAttachment(attachment: CopilotAttachment) {
  return attachment.contentType.toLowerCase() === "application/pdf" || /\.pdf$/i.test(attachment.name);
}

async function extractAttachmentContext(attachment: CopilotAttachment) {
  if (!isPdfAttachment(attachment) && !isPlainTextAttachment(attachment)) {
    const mediaKind = attachment.contentType.toLowerCase().startsWith("video/") ? "Video/media file" : "Binary document/media file";
    return `${mediaKind} uploaded and available at ${attachment.url}${attachment.storagePath ? ` (storage path: ${attachment.storagePath})` : ""}. Use OpenClaw/browser/file tools to inspect it when needed.`;
  }

  if (attachment.size > MAX_TEXT_BYTES && !isPdfAttachment(attachment)) {
    return `Text-like attachment exceeds inline parse limit (${attachment.size} bytes). Use URL/storage path for deeper inspection: ${attachment.url}`;
  }

  const bytes = await fetchAttachmentBytes(attachment);
  const text = isPdfAttachment(attachment) ? await extractPdfText(bytes) : bytes.toString("utf8");
  return trimContext(text || `[No extractable text found in ${attachment.name}.]`);
}

export async function buildCopilotMediaAttachmentContext(input: {
  message: string;
  history: CopilotMessage[];
  attachments: CopilotAttachment[];
  timeoutMs?: number;
}): Promise<CopilotMediaContextResult | null> {
  const attachments = input.attachments.slice(0, MAX_MEDIA_ATTACHMENTS);
  if (!attachments.length) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 30000);
  try {
    const sections: string[] = [];
    let parsedCount = 0;
    for (const attachment of attachments) {
      if (controller.signal.aborted) throw new Error("Co-Pilot media parsing timed out");
      try {
        const extracted = await extractAttachmentContext(attachment);
        if (extracted.trim()) parsedCount += 1;
        sections.push(`### ${attachment.name}\nType: ${attachment.contentType}\nSize: ${attachment.size} bytes\nURL: ${attachment.url}${attachment.storagePath ? `\nStorage path: ${attachment.storagePath}` : ""}\n\n${extracted}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sections.push(`### ${attachment.name}\nType: ${attachment.contentType}\nSize: ${attachment.size} bytes\nURL: ${attachment.url}${attachment.storagePath ? `\nStorage path: ${attachment.storagePath}` : ""}\n\n[Parser note: ${message}. Use the URL/storage path with OpenClaw tools if this file is needed.]`);
      }
    }

    return {
      ok: true,
      text: `Parsed Co-Pilot media/document context for Ryan's latest request (${input.message || "attachment review"}):\n\n${sections.join("\n\n")}`,
      attachmentCount: attachments.length,
      parsedCount,
    };
  } catch (error) {
    return { ok: false, text: "", attachmentCount: attachments.length, parsedCount: 0, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}
