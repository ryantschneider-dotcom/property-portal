import type { PierPulseSocialDraftSet, PierPulseWordPressDraftPayload } from "@/lib/pier-pulse";
import {
  buildPierPulseImageAltText,
  buildPierPulseImageFilename,
  type PierPulseGeneratedImage,
  type PierPulseImageGenerationInput,
  type PierPulseUploadedImage,
} from "@/lib/pier-pulse-images";
import type { PierPulseWriterOutputInput } from "@/lib/pier-pulse-runner";

export type PierPulseWordPressConfig = {
  baseUrl: string;
  username: string;
  appPassword: string;
};

export type SafePierPulseWordPressConfig = Omit<PierPulseWordPressConfig, "appPassword"> & {
  hasPassword: boolean;
};

export type PierPulseWordPressDraftResult = {
  id: number;
  link: string;
  status: "draft";
};

export type PierPulseWordPressMediaResult = PierPulseUploadedImage;

type EnvLike = Record<string, string | undefined>;

export function getPierPulseWordPressConfigFromEnv(env: EnvLike = process.env): SafePierPulseWordPressConfig {
  return {
    baseUrl: (env.PIER_PULSE_WP_BASE_URL ?? "").trim(),
    username: (env.PIER_PULSE_WP_USERNAME ?? "").trim(),
    hasPassword: Boolean((env.PIER_PULSE_WP_APP_PASSWORD ?? "").trim()),
  };
}

export function getPrivatePierPulseWordPressConfigFromEnv(env: EnvLike = process.env): PierPulseWordPressConfig | null {
  const baseUrl = (env.PIER_PULSE_WP_BASE_URL ?? "").trim();
  const username = (env.PIER_PULSE_WP_USERNAME ?? "").trim();
  const appPassword = (env.PIER_PULSE_WP_APP_PASSWORD ?? "").trim();

  if (!baseUrl || !username || !appPassword) return null;
  return { baseUrl, username, appPassword };
}

export function validateDraftOnlyPayload(payload: PierPulseWordPressDraftPayload) {
  if (payload.status !== "draft") {
    throw new Error("PIER Pulse is draft-only; refusing non-draft WordPress payload.");
  }
  if (!payload.categories.includes(99)) {
    throw new Error("PIER Pulse draft payload must include Pulse Drop category ID 99.");
  }
  return payload;
}

export async function createWordPressDraft(input: {
  config: PierPulseWordPressConfig;
  payload: PierPulseWordPressDraftPayload;
  fetchImpl?: typeof fetch;
}): Promise<PierPulseWordPressDraftResult> {
  const payload = validateDraftOnlyPayload(input.payload);
  const fetchImpl = input.fetchImpl ?? fetch;
  const endpoint = `${input.config.baseUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts`;
  const token = Buffer.from(`${input.config.username}:${input.config.appPassword}`).toString("base64");
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return createWordPressDraftWithXmlRpc({ config: input.config, payload, fetchImpl });
  }

  const parsed = (await response.json()) as { id?: number; link?: string; status?: string };
  if (parsed.status !== "draft") {
    throw new Error("WordPress returned a non-draft post status; refusing to treat it as a safe draft.");
  }
  if (typeof parsed.id !== "number" || !parsed.link) {
    throw new Error("WordPress draft response missing id or link.");
  }

  return { id: parsed.id, link: parsed.link, status: "draft" };
}

export async function uploadWordPressMedia(input: {
  config: PierPulseWordPressConfig;
  image: PierPulseGeneratedImage;
  fetchImpl?: typeof fetch;
}): Promise<PierPulseWordPressMediaResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const endpoint = `${input.config.baseUrl.replace(/\/$/, "")}/wp-json/wp/v2/media`;
  const token = Buffer.from(`${input.config.username}:${input.config.appPassword}`).toString("base64");
  const imageData = input.image.data;
  const imageBody = new ArrayBuffer(imageData.byteLength);
  new Uint8Array(imageBody).set(imageData);
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${token}`,
      "content-type": input.image.mimeType,
      "content-disposition": `attachment; filename="${input.image.filename.replaceAll('"', "")}"`,
      alt_text: input.image.altText,
    },
    body: new Blob([imageBody], { type: input.image.mimeType }),
  });

  if (!response.ok) {
    return uploadWordPressMediaWithXmlRpc({ config: input.config, image: input.image, fetchImpl });
  }

  const parsed = (await response.json()) as { id?: number; source_url?: string; link?: string; alt_text?: string };
  if (typeof parsed.id !== "number" || !parsed.source_url) {
    throw new Error("WordPress media response missing id or source_url.");
  }

  return {
    role: input.image.role,
    prompt: input.image.prompt,
    altText: parsed.alt_text || input.image.altText,
    mediaId: parsed.id,
    sourceUrl: parsed.source_url,
    link: parsed.link ?? parsed.source_url,
  };
}

export async function uploadPierPulseImagesToWordPress(input: {
  config: PierPulseWordPressConfig;
  images: PierPulseGeneratedImage[];
  fetchImpl?: typeof fetch;
}): Promise<PierPulseWordPressMediaResult[]> {
  const uploaded: PierPulseWordPressMediaResult[] = [];
  for (const image of input.images) {
    uploaded.push(await uploadWordPressMedia({ config: input.config, image, fetchImpl: input.fetchImpl }));
  }
  return uploaded;
}

async function uploadWordPressMediaWithXmlRpc(input: {
  config: PierPulseWordPressConfig;
  image: PierPulseGeneratedImage;
  fetchImpl?: typeof fetch;
}): Promise<PierPulseWordPressMediaResult> {
  const uploadImage = await optimizeImageForXmlRpcUpload(input.image);
  const xml = await callWordPressXmlRpc({
    config: input.config,
    methodName: "wp.uploadFile",
    params: [
      0,
      input.config.username,
      input.config.appPassword,
      {
        name: uploadImage.filename,
        type: uploadImage.mimeType,
        bits: { base64: Buffer.from(uploadImage.data).toString("base64") },
        overwrite: false,
      },
    ],
    fetchImpl: input.fetchImpl,
  });
  const mediaId = Number(getXmlRpcMember(xml, "id") ?? getXmlRpcMember(xml, "attachment_id") ?? "0");
  const sourceUrl = getXmlRpcMember(xml, "url");
  if (!mediaId || !sourceUrl) throw new Error("WordPress XML-RPC media response missing id or url.");
  return {
    role: input.image.role,
    prompt: input.image.prompt,
    altText: input.image.altText,
    mediaId,
    sourceUrl,
    link: sourceUrl,
  };
}

async function optimizeImageForXmlRpcUpload(image: PierPulseGeneratedImage): Promise<PierPulseGeneratedImage> {
  if (image.data.byteLength < 900_000) return image;
  try {
    const sharp = (await import("sharp")).default;
    const optimized = await sharp(Buffer.from(image.data)).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    return {
      ...image,
      filename: image.filename.replace(/\.[a-z0-9]+$/i, ".jpg"),
      mimeType: "image/jpeg",
      data: optimized,
    };
  } catch {
    return image;
  }
}

async function createWordPressDraftWithXmlRpc(input: {
  config: PierPulseWordPressConfig;
  payload: PierPulseWordPressDraftPayload;
  fetchImpl?: typeof fetch;
}): Promise<PierPulseWordPressDraftResult> {
  const customFields = Object.entries(input.payload.meta ?? {}).map(([key, value]) => ({ key, value: String(value) }));
  const postIdXml = await callWordPressXmlRpc({
    config: input.config,
    methodName: "wp.newPost",
    params: [
      0,
      input.config.username,
      input.config.appPassword,
      {
        post_type: "post",
        post_status: "draft",
        post_title: input.payload.title,
        post_content: input.payload.content,
        post_excerpt: input.payload.excerpt,
        post_thumbnail: input.payload.featured_media,
        custom_fields: customFields,
      },
    ],
    fetchImpl: input.fetchImpl,
  });
  const id = Number(getXmlRpcScalar(postIdXml));
  if (!id) throw new Error("WordPress XML-RPC draft response missing post id.");

  const postXml = await callWordPressXmlRpc({
    config: input.config,
    methodName: "wp.getPost",
    params: [0, input.config.username, input.config.appPassword, id],
    fetchImpl: input.fetchImpl,
  });
  const status = getXmlRpcMember(postXml, "post_status");
  if (status !== "draft") throw new Error("WordPress XML-RPC returned a non-draft post status; refusing to treat it as safe.");
  const link = getXmlRpcMember(postXml, "link") ?? `${input.config.baseUrl.replace(/\/$/, "")}/?p=${id}`;
  return { id, link, status: "draft" };
}

async function callWordPressXmlRpc(input: {
  config: PierPulseWordPressConfig;
  methodName: string;
  params: unknown[];
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const endpoint = `${input.config.baseUrl.replace(/\/$/, "")}/xmlrpc.php`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "text/xml" },
    body: buildXmlRpcRequest(input.methodName, input.params),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`WordPress XML-RPC ${input.methodName} failed with ${response.status}: ${text.slice(0, 300)}`);
  const faultString = getXmlRpcMember(text, "faultString");
  if (faultString) throw new Error(`WordPress XML-RPC ${input.methodName} fault: ${faultString}`);
  return text;
}

function buildXmlRpcRequest(methodName: string, params: unknown[]) {
  return `<?xml version="1.0"?><methodCall><methodName>${escapeXml(methodName)}</methodName><params>${params
    .map((param) => `<param>${xmlRpcValue(param)}</param>`)
    .join("")}</params></methodCall>`;
}

function xmlRpcValue(value: unknown): string {
  if (typeof value === "number") return `<value><int>${value}</int></value>`;
  if (typeof value === "boolean") return `<value><boolean>${value ? 1 : 0}</boolean></value>`;
  if (typeof value === "string") return `<value><string>${escapeXml(value)}</string></value>`;
  if (Array.isArray(value)) return `<value><array><data>${value.map((item) => xmlRpcValue(item)).join("")}</data></array></value>`;
  if (value && typeof value === "object" && "base64" in value && typeof (value as { base64?: unknown }).base64 === "string") {
    return `<value><base64>${(value as { base64: string }).base64}</base64></value>`;
  }
  if (value && typeof value === "object") {
    return `<value><struct>${Object.entries(value as Record<string, unknown>)
      .map(([key, memberValue]) => `<member><name>${escapeXml(key)}</name>${xmlRpcValue(memberValue)}</member>`)
      .join("")}</struct></value>`;
  }
  return "<value><string></string></value>";
}

function getXmlRpcScalar(xml: string) {
  const value = xml.match(/<param>\s*<value>([\s\S]*?)<\/value>\s*<\/param>/i)?.[1] ?? "";
  return stripXmlTags(value).trim();
}

function getXmlRpcMember(xml: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<member>\\s*<name>${escapedName}<\\/name>\\s*<value>([\\s\\S]*?)<\\/value>\\s*<\\/member>`, "i"));
  return match ? decodeXml(stripXmlTags(match[1]).trim()) : null;
}

function stripXmlTags(value: string) {
  return value.replace(/<[^>]+>/g, "");
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function decodeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

const PIER_PULSE_WRITER_JSON_INSTRUCTION =
  "Return JSON only with keys: title, html, excerpt, heroImagePrompt, middleImagePrompts. middleImagePrompts must contain exactly 3 strings.";

const PIER_PULSE_SOCIAL_JSON_INSTRUCTION =
  "Return JSON only with keys: linkedin, facebook, instagram. Each platform object must contain copy and hashtags.";

export function buildGeminiWriterRequest(input: { prompt: string; model?: string }) {
  const model = input.model ?? process.env.PIER_PULSE_GEMINI_MODEL ?? "gemini-2.5-flash";
  return {
    model,
    body: {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${input.prompt}\n\n${PIER_PULSE_WRITER_JSON_INSTRUCTION}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.35,
        responseMimeType: "application/json",
      },
    },
  };
}

export function buildOpenAiWriterRequest(input: { prompt: string; model?: string }) {
  const model = input.model ?? process.env.PIER_PULSE_OPENAI_MODEL ?? "gpt-4.1-mini";
  return {
    model,
    body: {
      model,
      response_format: { type: "json_object" },
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content:
            "You write polished, draft-first commercial real estate market intelligence for PIER Commercial Real Estate. Return JSON only.",
        },
        {
          role: "user",
          content: `${input.prompt}\n\n${PIER_PULSE_WRITER_JSON_INSTRUCTION}`,
        },
      ],
    },
  };
}

export async function writeWithConfiguredCloudModel(input: {
  prompt: string;
  fetchImpl?: typeof fetch;
}): Promise<PierPulseWriterOutputInput | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (geminiKey) {
    const request = buildGeminiWriterRequest({ prompt: input.prompt });
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.body),
      },
    );
    if (response.ok) {
      const parsed = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const geminiOutput = parseWriterJson(text);
      if (geminiOutput) return geminiOutput;
    }
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    const request = buildOpenAiWriterRequest({ prompt: input.prompt });
    const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${openAiKey}`, "content-type": "application/json" },
      body: JSON.stringify(request.body),
    });
    if (!response.ok) return null;
    const parsed = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return parseWriterJson(parsed.choices?.[0]?.message?.content ?? "");
  }

  return null;
}

export async function writeSocialDraftsWithConfiguredCloudModel(input: {
  prompt: string;
  fetchImpl?: typeof fetch;
}): Promise<Partial<PierPulseSocialDraftSet> | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const socialPrompt = `${input.prompt}\n\n${PIER_PULSE_SOCIAL_JSON_INSTRUCTION}`;
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (geminiKey) {
    const request = buildGeminiWriterRequest({ prompt: socialPrompt });
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.body),
      },
    );
    if (response.ok) {
      const parsed = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const geminiOutput = parseSocialJson(parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
      if (geminiOutput) return geminiOutput;
    }
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    const request = buildOpenAiWriterRequest({ prompt: socialPrompt });
    const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${openAiKey}`, "content-type": "application/json" },
      body: JSON.stringify(request.body),
    });
    if (!response.ok) return null;
    const parsed = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return parseSocialJson(parsed.choices?.[0]?.message?.content ?? "");
  }

  return null;
}

export const PIER_PULSE_IMAGE_GENERATION_GUARDRAIL =
  "Premium commercial real estate visual only: realistic local CRE photography, high-end stylized, conceptual, cinematic, 3D architectural, abstract, and premium editorial CRE imagery are all allowed when tied to the story theme, corridor, and Source Pack facts. Absolutely no alphabetic characters, no numbers, no text, no words, no labels, no captions, no typography, no logos, no readable signage, no route names, and no legends. Keep the visual grounded in the corridor and Source Pack facts; never use generic stock imagery.";

export async function generatePierPulseImageWithOpenAI(input: {
  imageInput: PierPulseImageGenerationInput;
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): Promise<PierPulseGeneratedImage | null> {
  const apiKey = input.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const fetchImpl = input.fetchImpl ?? fetch;
  const model = input.model ?? process.env.PIER_PULSE_OPENAI_IMAGE_MODEL ?? "gpt-image-1";
  const response = await fetchImpl("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: `${input.imageInput.prompt}\n\n${PIER_PULSE_IMAGE_GENERATION_GUARDRAIL}`,
      size: "1536x1024",
      quality: "medium",
      n: 1,
    }),
  });

  if (!response.ok) return null;
  const parsed = (await response.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = parsed.data?.[0]?.b64_json;
  if (!b64) return null;

  return {
    role: input.imageInput.role,
    prompt: input.imageInput.prompt,
    altText: buildPierPulseImageAltText(input.imageInput),
    filename: buildPierPulseImageFilename({
      role: input.imageInput.role,
      index: input.imageInput.index,
      title: input.imageInput.title,
      extension: "png",
    }),
    mimeType: "image/png",
    data: Buffer.from(b64, "base64"),
  };
}

function parseWriterJson(text: string): PierPulseWriterOutputInput | null {
  try {
    const parsed = JSON.parse(text) as PierPulseWriterOutputInput;
    if (parsed.title && parsed.html && parsed.excerpt) return parsed;
  } catch {
    return null;
  }
  return null;
}

function parseSocialJson(text: string): Partial<PierPulseSocialDraftSet> | null {
  try {
    const parsed = JSON.parse(text) as Partial<PierPulseSocialDraftSet>;
    if (parsed.linkedin || parsed.facebook || parsed.instagram) return parsed;
  } catch {
    return null;
  }
  return null;
}
