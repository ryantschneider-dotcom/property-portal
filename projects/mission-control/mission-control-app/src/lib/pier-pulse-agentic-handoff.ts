import { fetchPropertyPortalListing } from "@/lib/property-portal-ai";
import { type PierPulseSourceCandidateInput } from "@/lib/pier-pulse";
import { type PropertyPortalFetch } from "@/lib/property-portal-client";

export type PierPulseAgenticExtractionSource = {
  url: string;
  title?: string;
  sourceName?: string;
  corridorHint?: string;
  sourceType?: "municipal_url" | "municipal_pdf" | "agenda" | "news" | "other";
  instructions?: string;
};

export type PierPulseAgenticExtractionResult = {
  provider: "openai" | "anthropic" | "mock";
  model: string;
  extractedAt: string;
  candidates: PierPulseSourceCandidateInput[];
  facts: string[];
  limitations: string[];
  raw?: unknown;
};

export type PierPulseAgenticHandoffOptions = {
  sources: PierPulseAgenticExtractionSource[];
  corridorName: string;
  provider?: "openai" | "anthropic";
  model?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

export type ListingStreamPulseExtractionOptions = {
  propertyIdOrSlug: string;
  eventType?: "new-listing" | "just-leased" | "just-sold" | "listing-update";
  baseUrl?: string;
  fetchImpl?: PropertyPortalFetch;
  now?: () => Date;
};

const DEFAULT_OPENAI_AGENT_MODEL = "gpt-4.1-mini";
const DEFAULT_ANTHROPIC_AGENT_MODEL = "claude-3-5-sonnet-latest";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = asString(value);
    if (text) return text;
  }
  return "";
}

function coerceNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = asString(value).replace(/,/g, "");
  const match = text.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function formatAddress(value: unknown) {
  const direct = asString(value);
  if (direct) return direct;
  const record = asRecord(value);
  const parts = [
    firstString(record.street, record.streetAddress, record.address1, record.line1),
    firstString(record.city),
    firstString(record.state),
    firstString(record.zip, record.zipCode, record.postalCode),
  ].filter(Boolean);
  return parts.join(", ").replace(/, ([A-Z]{2}), /, ", $1 ").trim();
}

function cleanJsonText(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fenced) return fenced.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export function buildAgenticExtractionPrompt(input: { sources: PierPulseAgenticExtractionSource[]; corridorName: string }) {
  return `You are a senior municipal-research agent for PIER Commercial Real Estate.

Mission:
- Use web/browser/search capabilities available to your cloud environment to inspect the provided municipal URLs, agenda links, public PDFs, or source pages.
- Extract granular, source-grounded commercial real estate facts for a PIER Pulse market-intelligence draft.
- Prefer public agencies, agendas, minutes, permit records, planning packets, zoning records, infrastructure notices, public PDFs, and development authority materials.
- Do not invent. If a link is blocked or the record is unavailable, return limitations instead of filling gaps.

Return strict JSON only with this shape:
{
  "facts": ["specific sourced fact"],
  "limitations": ["what could not be verified"],
  "candidates": [
    {
      "title": "source-specific title",
      "url": "source URL",
      "sourceName": "public body or publication",
      "publishedAt": "ISO date if available or empty string",
      "summary": "2-4 sentence factual CRE-relevant summary",
      "topics": ["permit", "project", "agenda", "zoning", "infrastructure", "development", "leasing", "industrial", "retail", "office", "other"],
      "facts": ["specific fact 1", "specific fact 2"],
      "corridorHint": "${input.corridorName}"
    }
  ]
}

Corridor: ${input.corridorName}
Sources:
${JSON.stringify(input.sources, null, 2)}`;
}

export function parseAgenticExtractionJson(text: string, fallback: { provider: PierPulseAgenticExtractionResult["provider"]; model: string; extractedAt: string }): PierPulseAgenticExtractionResult {
  const parsed = asRecord(JSON.parse(cleanJsonText(text)));
  const candidatesRaw = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  return {
    provider: fallback.provider,
    model: fallback.model,
    extractedAt: fallback.extractedAt,
    facts: asStringArray(parsed.facts),
    limitations: asStringArray(parsed.limitations),
    candidates: candidatesRaw.map((item, index) => coerceAgenticCandidate(item, index)).filter(Boolean) as PierPulseSourceCandidateInput[],
    raw: parsed,
  };
}

function coerceAgenticCandidate(item: unknown, index: number): PierPulseSourceCandidateInput | null {
  const record = asRecord(item);
  const title = firstString(record.title, `Agentic municipal source ${index + 1}`);
  const url = asString(record.url);
  const sourceName = firstString(record.sourceName, record.source, "Cloud municipal research agent");
  if (!url) return null;
  return {
    title,
    url,
    sourceName,
    publishedAt: asString(record.publishedAt),
    summary: asString(record.summary),
    topics: asStringArray(record.topics),
    facts: asStringArray(record.facts),
    corridorHint: asString(record.corridorHint),
  };
}

export async function runPierPulseAgenticHandoff(options: PierPulseAgenticHandoffOptions): Promise<PierPulseAgenticExtractionResult> {
  const provider = options.provider ?? (process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY ? "anthropic" : "openai");
  if (provider === "anthropic") return runAnthropicAgenticHandoff(options);
  return runOpenAiAgenticHandoff(options);
}

async function runOpenAiAgenticHandoff(options: PierPulseAgenticHandoffOptions): Promise<PierPulseAgenticExtractionResult> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for PIER Pulse OpenAI agentic handoff.");
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = options.model ?? process.env.PIER_PULSE_OPENAI_AGENT_MODEL ?? DEFAULT_OPENAI_AGENT_MODEL;
  const extractedAt = (options.now?.() ?? new Date()).toISOString();
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      input: buildAgenticExtractionPrompt({ sources: options.sources, corridorName: options.corridorName }),
      tools: [{ type: "web_search_preview" }],
      tool_choice: "auto",
      temperature: 0.1,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(`OpenAI agentic handoff failed with ${response.status}: ${formatProviderError(payload)}`);
  const text = extractOpenAiResponseText(payload);
  if (!text) throw new Error("OpenAI agentic handoff returned no output text.");
  return parseAgenticExtractionJson(text, { provider: "openai", model, extractedAt });
}

async function runAnthropicAgenticHandoff(options: PierPulseAgenticHandoffOptions): Promise<PierPulseAgenticExtractionResult> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for PIER Pulse Anthropic agentic handoff.");
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = options.model ?? process.env.PIER_PULSE_ANTHROPIC_AGENT_MODEL ?? DEFAULT_ANTHROPIC_AGENT_MODEL;
  const extractedAt = (options.now?.() ?? new Date()).toISOString();
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 1800,
      temperature: 0.1,
      messages: [{ role: "user", content: buildAgenticExtractionPrompt({ sources: options.sources, corridorName: options.corridorName }) }],
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(`Anthropic agentic handoff failed with ${response.status}: ${formatProviderError(payload)}`);
  const text = extractAnthropicResponseText(payload);
  if (!text) throw new Error("Anthropic agentic handoff returned no output text.");
  return parseAgenticExtractionJson(text, { provider: "anthropic", model, extractedAt });
}

function formatProviderError(payload: Record<string, unknown>) {
  const error = payload.error;
  if (typeof error === "string") return error.slice(0, 300);
  if (error && typeof error === "object") return JSON.stringify(error).slice(0, 300);
  return JSON.stringify(payload).slice(0, 300);
}

function extractOpenAiResponseText(payload: Record<string, unknown>) {
  const direct = asString(payload.output_text);
  if (direct) return direct;
  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    const content = Array.isArray(asRecord(item).content) ? asRecord(item).content as unknown[] : [];
    for (const part of content) {
      const record = asRecord(part);
      const text = firstString(record.text, record.output_text);
      if (text) chunks.push(text);
    }
  }
  return chunks.join("\n").trim();
}

function extractAnthropicResponseText(payload: Record<string, unknown>) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  return content.map((part) => asString(asRecord(part).text)).filter(Boolean).join("\n").trim();
}

export async function extractListingStreamPulseCandidate(options: ListingStreamPulseExtractionOptions): Promise<PierPulseSourceCandidateInput> {
  const payload = await fetchPropertyPortalListing({ propertyIdOrSlug: options.propertyIdOrSlug, baseUrl: options.baseUrl, fetchImpl: options.fetchImpl });
  return buildListingStreamPulseCandidate({ payload, propertyIdOrSlug: options.propertyIdOrSlug, eventType: options.eventType, generatedAt: (options.now?.() ?? new Date()).toISOString() });
}

export function buildListingStreamPulseCandidate(input: { payload: Record<string, unknown>; propertyIdOrSlug: string; eventType?: ListingStreamPulseExtractionOptions["eventType"]; generatedAt: string }): PierPulseSourceCandidateInput {
  const payload = input.payload;
  const content = asRecord(payload.content);
  const details = asRecord(payload.details);
  const pricing = asRecord(payload.pricing);
  const location = asRecord(payload.location);
  const sale = asRecord(payload.sale);
  const lease = asRecord(payload.lease);
  const admin = asRecord(payload.admin);
  const title = firstString(payload.title, content.saleTitle, content.leaseTitle, details.propertyName, input.propertyIdOrSlug);
  const address = firstString(formatAddress(payload.address), formatAddress(location.address), formatAddress(details.address), formatAddress(content.address), formatAddress(location));
  const propertyType = firstString(payload.propertyType, details.propertyType, admin.propertyType);
  const transactionLabel = firstString(payload.transactionLabel, payload.listingType, details.listingType, sale.status, lease.status);
  const squareFeet = coerceNumber(firstString(payload.squareFeet, details.squareFeet, details.buildingSize, admin.totalBuildingSize, content.squareFeet));
  const acreage = coerceNumber(firstString(payload.acreage, details.acreage, admin.acreage, location.acreage));
  const price = firstString(pricing.askingPrice, pricing.salePrice, sale.price, payload.price, content.price);
  const leaseRate = firstString(pricing.leaseRate, lease.rate, lease.baseRent, payload.leaseRate, content.leaseRate);
  const highlights = [
    ...asStringArray(payload.highlights),
    ...asStringArray(content.highlights),
    ...asStringArray(payload.bullets),
  ].slice(0, 6);
  const facts = [
    address ? `Address: ${address}` : "",
    propertyType ? `Property type: ${propertyType}` : "",
    transactionLabel ? `Listing status/type: ${transactionLabel}` : "",
    squareFeet ? `Building/available size: ${squareFeet.toLocaleString()} SF` : "",
    acreage ? `Site size: ${acreage} acres` : "",
    price ? `Pricing: ${price}` : "",
    leaseRate ? `Lease rate: ${leaseRate}` : "",
    ...highlights,
  ].filter(Boolean);
  const eventLabel = input.eventType === "just-leased" ? "Just Leased" : input.eventType === "just-sold" ? "Just Sold" : input.eventType === "listing-update" ? "Listing Update" : "New Listing";
  return {
    title: `${eventLabel}: ${title}`,
    url: firstString(payload.publicUrl, payload.previewUrl, `listingstream://${input.propertyIdOrSlug}`),
    sourceName: "ListingStream verified property payload",
    publishedAt: input.generatedAt,
    summary: `${eventLabel} signal from PIER's active ListingStream database${address ? ` for ${address}` : ""}. ${facts.slice(0, 4).join(" ")}`.trim(),
    topics: ["leasing", "development", propertyType.toLowerCase().includes("industrial") ? "industrial" : propertyType.toLowerCase().includes("retail") ? "retail" : propertyType.toLowerCase().includes("office") ? "office" : "other"],
    facts,
    corridorHint: firstString(location.market, location.city, payload.market, "Coastal Georgia / Lowcountry"),
  };
}
