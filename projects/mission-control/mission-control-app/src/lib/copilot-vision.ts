import type { CopilotAttachment, CopilotMessage } from "@/lib/hermes-copilot";
import { getFirebaseAccessToken, getFirebaseStorageBucket } from "@/lib/mission-control-firebase-storage";

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

export type CopilotVisionResult = {
  ok: boolean;
  text: string;
  model?: string;
  error?: string;
  imageCount: number;
};

const MAX_VISION_IMAGES = 4;
const MAX_INLINE_IMAGE_BYTES = 20 * 1024 * 1024;

export function getCopilotImageAttachments(attachments: CopilotAttachment[]) {
  return attachments.filter((attachment) => attachment.contentType.toLowerCase().startsWith("image/")).slice(0, MAX_VISION_IMAGES);
}

function getGeminiApiKey() {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "").trim();
}

function getVisionModel() {
  return (process.env.OPENCLAW_VISION_MODEL || process.env.GEMINI_VISION_MODEL || "gemini-2.5-flash").trim();
}

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
  // Direct uploads can succeed even when the public Firebase download-token metadata is absent.
  // Prefer the authenticated storagePath read when Mission Control supplied one so vision never
  // depends on a browser-facing token URL being public.
  if (attachment.storagePath) return fetchFirebaseStorageObject(attachment.storagePath);

  const response = await fetch(attachment.url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Attachment URL fetch failed with status ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function buildVisionInstruction(userMessage: string, history: CopilotMessage[], imageAttachments: CopilotAttachment[]) {
  const recentContext = history.slice(-8).map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n");
  const files = imageAttachments.map((attachment, index) => `${index + 1}. ${attachment.name} (${attachment.contentType}, ${attachment.size} bytes)`).join("\n");
  return [
    "You are Hermes Co-Pilot's multimodal vision layer for Mission Control.",
    "Analyze the attached image(s) directly and answer Ryan's latest request from the visual evidence.",
    "Be concrete and concise. Do not say you cannot view the image if the pixels are provided.",
    recentContext ? `Recent Mission Control context:\n${recentContext}` : "",
    `Latest user request: ${userMessage || "Please review the attached image(s)."}`,
    `Image attachment manifest:\n${files}`,
  ].filter(Boolean).join("\n\n");
}

export async function analyzeCopilotImageAttachments(input: {
  message: string;
  history: CopilotMessage[];
  attachments: CopilotAttachment[];
  timeoutMs?: number;
}): Promise<CopilotVisionResult | null> {
  const imageAttachments = getCopilotImageAttachments(input.attachments);
  if (!imageAttachments.length) return null;

  const apiKey = getGeminiApiKey();
  if (!apiKey) return { ok: false, text: "", error: "GEMINI_API_KEY is not configured for Co-Pilot vision processing", imageCount: imageAttachments.length };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 30000);
  try {
    const inlineParts = [] as Array<{ inlineData: { mimeType: string; data: string } }>;
    for (const attachment of imageAttachments) {
      const bytes = await fetchAttachmentBytes(attachment);
      if (bytes.byteLength > MAX_INLINE_IMAGE_BYTES) throw new Error(`${attachment.name} exceeds the ${Math.floor(MAX_INLINE_IMAGE_BYTES / 1024 / 1024)} MB inline vision limit`);
      inlineParts.push({ inlineData: { mimeType: attachment.contentType || "image/jpeg", data: bytes.toString("base64") } });
    }

    const model = getVisionModel();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: buildVisionInstruction(input.message, input.history, imageAttachments) }, ...inlineParts],
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
      }),
    });
    const data = (await response.json().catch(() => ({}))) as GeminiGenerateContentResponse;
    if (!response.ok) return { ok: false, text: "", model, error: data.error?.message || `Gemini vision returned HTTP ${response.status}`, imageCount: imageAttachments.length };
    const text = (data.candidates || [])
      .flatMap((candidate) => candidate.content?.parts || [])
      .map((part) => part.text || "")
      .filter(Boolean)
      .join("\n")
      .trim();
    if (!text) return { ok: false, text: "", model, error: data.promptFeedback?.blockReason ? `Gemini vision blocked: ${data.promptFeedback.blockReason}` : "Gemini vision completed without text", imageCount: imageAttachments.length };
    return { ok: true, text, model, imageCount: imageAttachments.length };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "Co-Pilot vision processing timed out" : error instanceof Error ? error.message : String(error);
    return { ok: false, text: "", error: message, imageCount: imageAttachments.length };
  } finally {
    clearTimeout(timer);
  }
}
