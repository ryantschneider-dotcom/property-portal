import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  buildPierPulseSocialDraftPrompt,
  buildPierPulseWriterPrompt,
  buildSourcePack,
  buildWordPressDraftPayload,
  getCorridorForRun,
  normalizeSocialDraftSet,
  normalizeSourceCandidate,
  type PierPulseSocialDraftSet,
  type PierPulseSourceCandidateInput,
  type PierPulseSourcePack,
  type PierPulseWordPressDraftPayload,
} from "@/lib/pier-pulse";
import {
  extractListingStreamPulseCandidate,
  runPierPulseAgenticHandoff,
  type PierPulseAgenticExtractionResult,
  type PierPulseAgenticExtractionSource,
} from "@/lib/pier-pulse-agentic-handoff";
import {
  buildGeneratedImageManifest,
  buildPierPulseImageGenerationInputs,
  buildPremiumPierPulseHtml,
  insertUploadedImagesIntoHtml,
  type PierPulseGeneratedImageManifest,
  type PierPulseImageGenerator,
  type PierPulseUploadedImage,
} from "@/lib/pier-pulse-images";

const execFileAsync = promisify(execFile);

export type PierPulseWriterOutput = {
  title: string;
  html: string;
  excerpt: string;
  heroImagePrompt: string;
  middleImagePrompts: [string, string, string];
};

export type PierPulseWriterOutputInput = {
  title: string;
  html: string;
  excerpt: string;
  heroImagePrompt?: string;
  middleImagePrompts?: string[];
};

export type PierPulseExtractionInput = {
  corridorName: string;
  candidate: PierPulseSourceCandidateInput;
};

export type PierPulseWriteInput = {
  sourcePack: PierPulseSourcePack;
  prompt: string;
};

export type PierPulseSocialWriteInput = {
  sourcePack: PierPulseSourcePack;
  prompt: string;
  articleUrl: string;
};

export type PierPulseLlmProviders = {
  extract?: (input: PierPulseExtractionInput) => Promise<PierPulseSourceCandidateInput>;
  write?: (input: PierPulseWriteInput) => Promise<PierPulseWriterOutputInput>;
  writeSocial?: (input: PierPulseSocialWriteInput) => Promise<unknown>;
  generateImage?: PierPulseImageGenerator;
  uploadImages?: (images: Awaited<ReturnType<PierPulseImageGenerator>>[]) => Promise<PierPulseUploadedImage[]>;
};

export type PierPulseLiveCollectorResult = {
  collectorId: string;
  corridor: string;
  collectedAt: string;
  candidates: PierPulseSourceCandidateInput[];
  errors: string[];
};

export type PierPulseProviderModes = {
  extractor: "mock" | "ollama" | "fallback";
  writer: "mock" | "cloud" | "fallback";
};

export type PierPulseRunArtifact = {
  generatedAt: string;
  sourcePack: PierPulseSourcePack;
  writerOutput: PierPulseWriterOutput;
  wordpressPayload: PierPulseWordPressDraftPayload;
  generatedImages: PierPulseGeneratedImageManifest[];
  uploadedImages: PierPulseUploadedImage[];
  socialDrafts: PierPulseSocialDraftSet | null;
  agenticExtractions: PierPulseAgenticExtractionResult[];
  listingStreamSourceSlugs: string[];
  providerModes: PierPulseProviderModes;
  published: false;
  wordpressDraftUrl: null;
};

export type PierPulseDryRunOptions = {
  runIndex: number;
  sourceFixturePath?: string;
  artifactsDir: string;
  providers?: PierPulseLlmProviders;
  providerModes?: Partial<PierPulseProviderModes>;
  generatedAt?: string;
  liveCollectorResults?: PierPulseLiveCollectorResult[];
  agenticSources?: PierPulseAgenticExtractionSource[];
  listingStreamPropertySlugs?: string[];
  listingStreamEventType?: "new-listing" | "just-leased" | "just-sold" | "listing-update";
  socialArticleUrl?: string;
};

export type PierPulseDryRunResult = PierPulseRunArtifact & {
  artifactPath: string;
};

export type PierPulseRunSummary = {
  ok: true;
  corridor: string;
  sourcesReviewed: number;
  sourcesUsed: number;
  artifactPath: string;
  published: false;
  status: PierPulseWordPressDraftPayload["status"];
  heroImagePrompt: string;
  middleImagePrompts: [string, string, string];
};

export async function parseSourceFixture(fixturePath: string): Promise<PierPulseSourceCandidateInput[]> {
  const raw = await fs.readFile(fixturePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("PIER Pulse source fixture must be a JSON array");
  }

  return parsed.map((item, index) => coerceCandidateInput(item, index));
}

export function buildExtractionPrompt(input: { corridorName: string; title: string; url: string; text: string }) {
  const boundedText = input.text.slice(0, 2400);
  return `Bounded extraction task for local Qwen/Ollama source triage.

Corridor: ${input.corridorName}
Title: ${input.title}
URL: ${input.url}

Return JSON only with this exact shape:
{
  "summary": "2-3 sentence factual summary",
  "topics": ["sublease", "rent", "permit", "project", "event", "agenda", "zoning", "infrastructure", "development", "leasing", "retail", "industrial", "office", "other"],
  "facts": ["specific fact 1", "specific fact 2"],
  "corridorHint": "best matching Coastal Georgia corridor or empty string",
  "relevance_score": 0
}

Rules:
- Keep this bounded extraction small; do not write the article.
- Treat sublease availability, asking rent/lease rate movement, commercial permits, site plan/project announcements, ribbon cutting/groundbreaking events, public agendas, zoning/rezoning, and infrastructure approvals as first-class market intelligence signals.
- Deep sourcing mandate: actively elevate under-the-radar CRE intelligence from city council, county commission, planning commission, zoning board, development authority, port/airport authority, utility authority, and infrastructure/transportation agendas even when written in dry public-meeting language.
- Prioritize zoning change requests, site plan reviews, proposed developments, annexations, variances, special-use permits, development agreements, impact fees, SPLOST/TSPLOST/CIP work, water/sewer capacity, utility upgrades, road access, rail/port/airport/logistics improvements, incentives, and projects entering the pipeline.
- Preserve specific hearing or agenda item titles, dates, public-body names, parcels, roads, project names, applicant/developer/tenant names, approvals requested, and infrastructure facts when present.
- Focus on commercial real estate relevance, public infrastructure, development, leasing, investment, zoning, permits, business expansion, port/logistics, and market signals.
- If facts are weak, return fewer facts and a lower relevance_score.

Source text:
${boundedText}`;
}

export async function runPierPulseDryRun(options: PierPulseDryRunOptions): Promise<PierPulseDryRunResult> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const corridor = getCorridorForRun(options.runIndex);
  const fixtureInputs = options.sourceFixturePath ? await parseSourceFixture(options.sourceFixturePath) : [];
  const agenticExtractions = options.agenticSources?.length
    ? [await runPierPulseAgenticHandoff({ sources: options.agenticSources, corridorName: corridor.name })]
    : [];
  const listingStreamSourceSlugs = options.listingStreamPropertySlugs?.map((slug) => slug.trim()).filter(Boolean) ?? [];
  const listingStreamInputs = await Promise.all(
    listingStreamSourceSlugs.map((propertyIdOrSlug) =>
      extractListingStreamPulseCandidate({ propertyIdOrSlug, eventType: options.listingStreamEventType }),
    ),
  );
  const sourceInputs = [
    ...fixtureInputs,
    ...mergeLiveCollectorResults(options.liveCollectorResults ?? []),
    ...agenticExtractions.flatMap((result) => result.candidates),
    ...listingStreamInputs,
  ];
  const extractedInputs = await Promise.all(
    sourceInputs.map(async (candidate) => {
      if (!options.providers?.extract) return candidate;
      return options.providers.extract({ corridorName: corridor.name, candidate });
    }),
  );
  const normalized = extractedInputs.map((candidate) => normalizeSourceCandidate(candidate));
  const sourcePack = buildSourcePack({ corridor, candidates: normalized, generatedAt });
  const prompt = buildPierPulseWriterPrompt(sourcePack);
  const writerOutputInput = options.providers?.write ? await options.providers.write({ sourcePack, prompt }) : buildFallbackWriterOutput(sourcePack);
  const writerOutput = normalizeWriterOutput(writerOutputInput, sourcePack);
  const socialArticleUrl = options.socialArticleUrl ?? "https://www.piercommercial.com/";
  const socialDrafts = options.providers?.writeSocial
    ? normalizeSocialDraftSet(
        await options.providers.writeSocial({
          sourcePack,
          articleUrl: socialArticleUrl,
          prompt: buildPierPulseSocialDraftPrompt({
            title: writerOutput.title,
            excerpt: writerOutput.excerpt,
            corridorName: sourcePack.corridor.name,
            editorialAngle: sourcePack.editorialAngle,
            articleUrl: socialArticleUrl,
          }),
        }),
        sourcePack,
        socialArticleUrl,
      )
    : null;
  const imagePlan = await preparePierPulseImages({
    writerOutput,
    sourcePack,
    generatedAt,
    generateImage: options.providers?.generateImage,
    uploadImages: options.providers?.uploadImages,
  });
  const htmlForWordPress = imagePlan.uploadedImages.length
    ? insertUploadedImagesIntoHtml({ html: imagePlan.premiumHtml, images: imagePlan.uploadedImages })
    : imagePlan.premiumHtml;
  const heroImage = imagePlan.uploadedImages.find((image) => image.role === "hero");
  const wordpressPayload = buildWordPressDraftPayload({
    title: writerOutput.title,
    html: htmlForWordPress,
    excerpt: writerOutput.excerpt,
    sourcePack,
    featuredMediaId: heroImage?.mediaId,
    heroImagePrompt: writerOutput.heroImagePrompt,
    middleImagePrompts: writerOutput.middleImagePrompts,
    socialDrafts: socialDrafts ?? undefined,
  });
  const artifact = buildPierPulseRunArtifact({
    generatedAt,
    sourcePack,
    writerOutput,
    wordpressPayload,
    generatedImages: imagePlan.generatedImages,
    uploadedImages: imagePlan.uploadedImages,
    socialDrafts,
    agenticExtractions,
    listingStreamSourceSlugs,
    providerModes: {
      extractor: options.providerModes?.extractor ?? (options.providers?.extract ? "mock" : "fallback"),
      writer: options.providerModes?.writer ?? (options.providers?.write ? "mock" : "fallback"),
    },
  });

  await fs.mkdir(options.artifactsDir, { recursive: true });
  const artifactPath = path.join(options.artifactsDir, `${sourcePack.id}-dry-run.json`);
  await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2), "utf8");

  return { ...artifact, artifactPath };
}

export function buildPierPulseRunSummary(result: PierPulseDryRunResult): PierPulseRunSummary {
  return {
    ok: true,
    corridor: result.sourcePack.corridor.name,
    sourcesReviewed: result.sourcePack.sourceCountReviewed,
    sourcesUsed: result.sourcePack.sources.length,
    artifactPath: result.artifactPath,
    published: false,
    status: result.wordpressPayload.status,
    heroImagePrompt: result.writerOutput.heroImagePrompt,
    middleImagePrompts: result.writerOutput.middleImagePrompts,
  };
}

export function buildPierPulseRunArtifact(input: {
  generatedAt: string;
  sourcePack: PierPulseSourcePack;
  writerOutput: PierPulseWriterOutputInput;
  wordpressPayload: PierPulseWordPressDraftPayload;
  generatedImages?: PierPulseGeneratedImageManifest[];
  uploadedImages?: PierPulseUploadedImage[];
  socialDrafts?: PierPulseSocialDraftSet | null;
  agenticExtractions?: PierPulseAgenticExtractionResult[];
  listingStreamSourceSlugs?: string[];
  providerModes: PierPulseProviderModes;
}): PierPulseRunArtifact {
  return {
    generatedAt: input.generatedAt,
    sourcePack: input.sourcePack,
    writerOutput: normalizeWriterOutput(input.writerOutput, input.sourcePack),
    wordpressPayload: input.wordpressPayload,
    generatedImages: input.generatedImages ?? [],
    uploadedImages: input.uploadedImages ?? [],
    socialDrafts: input.socialDrafts ?? null,
    agenticExtractions: input.agenticExtractions ?? [],
    listingStreamSourceSlugs: input.listingStreamSourceSlugs ?? [],
    providerModes: input.providerModes,
    published: false,
    wordpressDraftUrl: null,
  };
}

export async function extractWithOllamaQwen(input: {
  ollamaUrl?: string;
  model?: string;
  timeoutMs?: number;
  corridorName: string;
  candidate: PierPulseSourceCandidateInput;
}): Promise<PierPulseSourceCandidateInput> {
  const ollamaUrl = input.ollamaUrl ?? process.env.PIER_PULSE_OLLAMA_URL ?? "http://127.0.0.1:11434";
  const model = input.model ?? process.env.PIER_PULSE_OLLAMA_MODEL ?? "qwen2.5-coder:3b-mack-safe";
  const timeoutMs = input.timeoutMs ?? Number(process.env.PIER_PULSE_OLLAMA_TIMEOUT_MS ?? "20000");
  const prompt = buildExtractionPrompt({
    corridorName: input.corridorName,
    title: input.candidate.title,
    url: input.candidate.url,
    text: input.candidate.summary ?? input.candidate.title,
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20000);
    const response = await fetch(`${ollamaUrl.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ model, prompt, stream: false, options: { num_predict: 500, temperature: 0.1 } }),
    });
    clearTimeout(timeout);
    if (!response.ok) return input.candidate;
    const payload = (await response.json()) as { response?: string };
    const parsed = parseLooseJson(payload.response ?? "");
    if (!parsed || typeof parsed !== "object") return input.candidate;
    const candidatePatch = parsed as {
      summary?: string;
      topics?: string[];
      facts?: string[];
      corridorHint?: string;
    };
    return {
      ...input.candidate,
      summary: candidatePatch.summary ?? input.candidate.summary,
      topics: candidatePatch.topics ?? input.candidate.topics,
      facts: candidatePatch.facts ?? input.candidate.facts,
      corridorHint: candidatePatch.corridorHint ?? input.candidate.corridorHint,
    };
  } catch {
    return input.candidate;
  }
}

export function normalizeWriterOutput(output: PierPulseWriterOutputInput, sourcePack: PierPulseSourcePack): PierPulseWriterOutput {
  const fallback = buildFallbackWriterOutput(sourcePack);
  const middleImagePrompts = output.middleImagePrompts?.filter(Boolean).slice(0, 3) ?? [];

  while (middleImagePrompts.length < 3) {
    middleImagePrompts.push(fallback.middleImagePrompts[middleImagePrompts.length]);
  }

  return {
    title: output.title,
    html: output.html,
    excerpt: output.excerpt,
    heroImagePrompt: enforcePhotographicImagePrompt(output.heroImagePrompt?.trim() || fallback.heroImagePrompt, sourcePack, "hero", 0),
    middleImagePrompts: [
      enforcePhotographicImagePrompt(middleImagePrompts[0], sourcePack, "body", 1),
      enforcePhotographicImagePrompt(middleImagePrompts[1], sourcePack, "body", 2),
      enforcePhotographicImagePrompt(middleImagePrompts[2], sourcePack, "body", 3),
    ],
  };
}

const IMAGE_PROMPT_GUARDRAIL_PHRASE =
  "no alphabetic characters, no numbers, no text, no words, no labels, no captions, no typography, no logos";
const GENERIC_STOCK_IMAGE_RE =
  /\b(generic|random|airport terminal|terminal interior|courtroom|city council chamber|industrial pipes?|interior building|building lobby|lobby|stock photo|unsourced)\b/i;
const TEXT_RISK_IMAGE_RE = /\b(signage text|route names?|captions?|legends?|labels?|letters?|numerals?|typography|logos?)\b/i;
const LOCAL_GROUNDING_RE =
  /\b(Coastal Georgia landscape|Savannah River maritime shipping logistics|Port-adjacent warehouse environment|Savannah|Chatham|Pooler|Bloomingdale|Port Wentworth|Garden City|Brunswick|St\. Simons|Camden|Glynn|McIntosh|Hinesville|Liberty County|Statesboro|Bulloch|Rincon|Effingham|Pembroke|Bluffton|Hilton Head|Hardeeville|Jasper|Beaufort)\b/i;
const APPROVED_ABSTRACT_IMAGE_RE =
  /\b(A clean, minimalist, text-free architectural site plan blueprint|An abstract vector layout representing regional logistics network paths|A modern, text-free commercial real estate growth chart graphic)\b/i;
const APPROVED_CREATIVE_IMAGE_RE =
  /\b(stylized|conceptual|cinematic|3D architectural|hyper-stylized|abstract|premium editorial|architectural outline|dramatic)\b/i;

function enforcePhotographicImagePrompt(prompt: string, sourcePack: PierPulseSourcePack, role: "hero" | "body", index: number) {
  const trimmed = prompt.trim();
  const promptWithoutGuardrail = trimmed.replace(new RegExp(escapeRegExp(IMAGE_PROMPT_GUARDRAIL_PHRASE), "i"), "");
  const hasGenericStockConcept = GENERIC_STOCK_IMAGE_RE.test(promptWithoutGuardrail);
  const hasTextRisk = TEXT_RISK_IMAGE_RE.test(promptWithoutGuardrail);
  const isApprovedAbstract = APPROVED_ABSTRACT_IMAGE_RE.test(promptWithoutGuardrail);
  const isApprovedCreative = APPROVED_CREATIVE_IMAGE_RE.test(promptWithoutGuardrail);
  const hasLocalGrounding = LOCAL_GROUNDING_RE.test(promptWithoutGuardrail) || containsCorridorToken(promptWithoutGuardrail, sourcePack);
  const hasSourceFactGrounding = sourcePack.sources.some((source) =>
    source.facts.some((fact) => fact.length > 8 && promptWithoutGuardrail.toLowerCase().includes(fact.toLowerCase().slice(0, 24))),
  );
  const hasThemeGrounding = containsSourceThemeToken(promptWithoutGuardrail, sourcePack);
  const hasAcceptableGrounding = hasLocalGrounding && (hasSourceFactGrounding || hasThemeGrounding || isApprovedCreative || isApprovedAbstract);
  const shouldReplace = !trimmed || hasGenericStockConcept || hasTextRisk || !hasAcceptableGrounding;
  const photographicPrompt = shouldReplace ? buildGroundedImagePrompt(sourcePack, role, index) : ensureGroundingSuffix(trimmed, sourcePack);
  const guardrail = ` ${IMAGE_PROMPT_GUARDRAIL_PHRASE}.`;
  return photographicPrompt.toLowerCase().includes(IMAGE_PROMPT_GUARDRAIL_PHRASE) ? photographicPrompt : `${photographicPrompt}${guardrail}`;
}

function buildGroundedImagePrompt(sourcePack: PierPulseSourcePack, role: "hero" | "body", index: number) {
  const fact = sourcePack.sources.flatMap((source) => source.facts).find((item) => item.trim()) ?? sourcePack.editorialAngle;
  const topics = new Set(sourcePack.sources.flatMap((source) => source.topics.map((topic) => topic.toLowerCase())));
  const topicText = Array.from(topics).join(" ");
  const corridorContext = buildCorridorImageContext(sourcePack);
  const factContext = `Source Pack fact grounding: ${fact}.`;

  if (/\b(power|utility|substation|electrical|electric|energy|capacity|transformer)\b/i.test(`${topicText} ${fact} ${sourcePack.editorialAngle}`)) {
    const infrastructurePrompts = [
      `A dramatic, hyper-stylized 3D architectural outline of an industrial electrical substation for ${sourcePack.corridor.name}, glowing blue at night with a lightning-strike energy motif, premium conceptual commercial real estate infrastructure visual, ${corridorContext}. ${factContext}`,
      `Cinematic conceptual CRE infrastructure scene for ${sourcePack.corridor.name}: stylized power-grid geometry, industrial park silhouettes, premium blue-and-PIER-orange lighting, no signage. ${factContext}`,
      `High-end abstract 3D architectural visualization for ${sourcePack.corridor.name}: utility capacity, industrial site-readiness, warehouse outlines, energy-flow forms, premium editorial market intelligence style. ${factContext}`,
      `Premium stylized architectural detail for ${sourcePack.corridor.name}: electrical infrastructure, concrete pads, steel utility forms, dramatic night lighting, commercial real estate site-selection theme. ${factContext}`,
    ];
    return infrastructurePrompts[Math.max(0, Math.min(role === "hero" ? 0 : index, infrastructurePrompts.length - 1))];
  }

  if (/\b(zoning|agenda|permit|site plan|site-plan|project|development|council|workshop|sewer|spill)\b/i.test(`${topicText} ${fact} ${sourcePack.editorialAngle}`)) {
    const abstractPrompts = [
      `A clean, minimalist, text-free architectural site plan blueprint for ${sourcePack.corridor.name} commercial real estate, ${corridorContext}, premium paper-and-linework aesthetic, no readable markings. ${factContext}`,
      `An abstract vector layout representing regional logistics network paths for ${sourcePack.corridor.name}, ${corridorContext}, premium commercial real estate planning visual, no readable markings. ${factContext}`,
      `A modern, text-free commercial real estate growth chart graphic for ${sourcePack.corridor.name}, ${corridorContext}, abstract shapes and clean PIER-orange accent forms only, no readable markings. ${factContext}`,
      `A clean, minimalist, text-free architectural site plan blueprint for ${sourcePack.corridor.name} site-review context, ${corridorContext}, premium planning desk aesthetic, no readable markings. ${factContext}`,
    ];
    return abstractPrompts[Math.max(0, Math.min(role === "hero" ? 0 : index, abstractPrompts.length - 1))];
  }

  if (/\b(port|logistics|warehouse|transport|container|highway|drayage|industrial supply|industrial vacancy)\b/i.test(`${topicText} ${fact} ${sourcePack.editorialAngle}`)) {
    const logisticsPrompts = [
      `High-end realistic commercial real estate photography for ${sourcePack.corridor.name}: ${corridorContext}, active container terminals, gantry cranes, drayage trucks, heavy transport logistics on regional highways, port-adjacent warehouses, premium editorial market-report composition. ${factContext}`,
      `Professional drone-style commercial real estate photography for ${sourcePack.corridor.name}: ${corridorContext}, Port-adjacent warehouse environment with regional highway access, container logistics movement, modern tilt-wall industrial buildings, polished Coastal Georgia market intelligence aesthetic. ${factContext}`,
      `High-quality architectural commercial real estate photo for ${sourcePack.corridor.name}: ${corridorContext}, modern industrial warehouse façades, truck courts, container logistics context, realistic premium lighting, no stock-photo interiors. ${factContext}`,
      `Abstract premium architectural detail photograph for ${sourcePack.corridor.name}: ${corridorContext}, steel, concrete, loading dock geometry, warehouse façade texture, shallow depth of field, grounded in port-adjacent commercial real estate. ${factContext}`,
    ];
    return logisticsPrompts[Math.max(0, Math.min(role === "hero" ? 0 : index, logisticsPrompts.length - 1))];
  }


  const generalPrompts = [
    `High-end realistic commercial real estate photography for ${sourcePack.corridor.name}: ${corridorContext}, modern commercial property exterior or tilt-wall industrial warehouse at dusk, premium architectural lighting, professional market-report aesthetic. ${factContext}`,
    `High-quality architectural commercial real estate photo for ${sourcePack.corridor.name}: ${corridorContext}, modern property exterior detail, realistic materials, premium editorial lighting. ${factContext}`,
    `Professional drone-style commercial real estate photography for ${sourcePack.corridor.name}: ${corridorContext}, active construction site or retail outparcel composition, realistic and polished. ${factContext}`,
    `Abstract premium architectural detail photograph for ${sourcePack.corridor.name}: ${corridorContext}, glass, concrete, steel, storefront or warehouse façade textures, shallow depth of field. ${factContext}`,
  ];
  return generalPrompts[Math.max(0, Math.min(role === "hero" ? 0 : index, generalPrompts.length - 1))];
}

function buildCorridorImageContext(sourcePack: PierPulseSourcePack) {
  if (sourcePack.corridor.id === "savannah-chatham") {
    return "Coastal Georgia landscape, Savannah River maritime shipping logistics, Port-adjacent warehouse environment";
  }
  return `Coastal Georgia landscape, ${sourcePack.corridor.name} commercial real estate corridor, regional logistics and property-market context`;
}

function containsCorridorToken(prompt: string, sourcePack: PierPulseSourcePack) {
  const lower = prompt.toLowerCase();
  return [sourcePack.corridor.name, ...sourcePack.corridor.keywords].some((token) => token && lower.includes(token.toLowerCase()));
}

function containsSourceThemeToken(prompt: string, sourcePack: PierPulseSourcePack) {
  const lower = prompt.toLowerCase();
  const explicitTokens = [
    "industrial",
    "warehouse",
    "logistics",
    "port",
    "zoning",
    "site plan",
    "development",
    "infrastructure",
    "utility",
    "power",
    "substation",
    "electrical",
    "road",
    "sewer",
    "water",
    "retail",
    "office",
    "medical",
    "construction",
    "permit",
    "agenda",
    "planning",
  ];
  const sourceTokens = sourcePack.sources.flatMap((source) => [
    ...source.topics,
    ...source.title.split(/\W+/),
    ...source.summary.split(/\W+/),
    ...source.facts.flatMap((fact) => fact.split(/\W+/)),
  ]);
  return [...explicitTokens, ...sourceTokens]
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 5)
    .some((token) => lower.includes(token));
}

function ensureGroundingSuffix(prompt: string, sourcePack: PierPulseSourcePack) {
  const fact = sourcePack.sources.flatMap((source) => source.facts).find((item) => item.trim());
  const pieces = [prompt.trim()];
  if (!prompt.toLowerCase().includes(sourcePack.corridor.name.toLowerCase())) {
    pieces.push(`Corridor: ${sourcePack.corridor.name}.`);
  }
  if (!/\b(Coastal Georgia landscape|Savannah River maritime shipping logistics|Port-adjacent warehouse environment)\b/i.test(prompt)) {
    pieces.push(`Grounded in ${buildCorridorImageContext(sourcePack)}.`);
  }
  if (fact && !prompt.toLowerCase().includes(fact.toLowerCase().slice(0, 24))) {
    pieces.push(`Source Pack fact grounding: ${fact}.`);
  }
  return pieces.join(" ");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildFallbackWriterOutput(sourcePack: PierPulseSourcePack): PierPulseWriterOutput {
  const keySignal = sourcePack.sources[0]?.facts[0] ?? sourcePack.editorialAngle;
  const heroImagePrompt = enforcePhotographicImagePrompt("", sourcePack, "hero", 0);
  return {
    title: `${sourcePack.corridor.name} Market Intel: ${sourcePack.sources.length} Signals to Watch`,
    html: `<p>${escapeHtml(sourcePack.editorialAngle)}</p><h2>The Signal</h2><blockquote><p>${escapeHtml(keySignal)}</p><cite>PIER Staff</cite></blockquote><h2>What's Happening</h2><p>${escapeHtml(sourcePack.editorialAngle)}</p><h2>Why It Matters</h2><p>This signal is worth watching for owners, tenants, investors, and operators across Coastal Georgia commercial real estate.</p><h2>How To Play It</h2><p>Use the signal to pressure-test leasing, acquisition, disposition, and property strategy before the broader market catches up.</p><h2>What To Watch</h2><p>Watch adjacent activity, public approvals, tenant movement, capital selectivity, and pricing pressure.</p><h2>THE BOTTOM LINE</h2><p>If you own, lease, or invest in ${escapeHtml(sourcePack.corridor.name)}, now is the time to re-underwrite how this signal could affect site selection and pricing.</p><p>PIER Commercial Real Estate can help turn this signal into market analytics for leasing, acquisition, disposition, and property strategy decisions.</p><p>We can also help identify off-market opportunities and nearby submarkets that may become more attractive as secondary plays.</p><p>Contact PIER Commercial Real Estate today.</p><p>Phone: 912.353.7707 | Website: piercommercial.com | Instagram: @piercommercial</p><p><a href="https://www.piercommercial.com/contact-us/">Contact Us</a></p>`,
    excerpt: sourcePack.editorialAngle,
    heroImagePrompt,
    middleImagePrompts: [
      enforcePhotographicImagePrompt("", sourcePack, "body", 1),
      enforcePhotographicImagePrompt("", sourcePack, "body", 2),
      enforcePhotographicImagePrompt("", sourcePack, "body", 3),
    ],
  };
}

export async function preparePierPulseImages(input: {
  writerOutput: PierPulseWriterOutput;
  sourcePack: PierPulseSourcePack;
  generatedAt: string;
  generateImage?: PierPulseImageGenerator;
  uploadImages?: (images: Awaited<ReturnType<PierPulseImageGenerator>>[]) => Promise<PierPulseUploadedImage[]>;
}) {
  const premiumHtml = buildPremiumPierPulseHtml({
    html: input.writerOutput.html,
    corridorName: input.sourcePack.corridor.name,
    title: input.writerOutput.title,
  });

  if (!input.generateImage) {
    return { premiumHtml, generatedImages: [] as PierPulseGeneratedImageManifest[], uploadedImages: [] as PierPulseUploadedImage[] };
  }

  const imageInputs = buildPierPulseImageGenerationInputs({
    title: input.writerOutput.title,
    corridorName: input.sourcePack.corridor.name,
    heroImagePrompt: input.writerOutput.heroImagePrompt,
    middleImagePrompts: input.writerOutput.middleImagePrompts,
  });
  const generated = await Promise.all(imageInputs.map((imageInput) => input.generateImage?.(imageInput)));
  const images = generated.filter((image): image is Awaited<ReturnType<PierPulseImageGenerator>> => Boolean(image));
  const generatedImages = images.map((image) => buildGeneratedImageManifest(image));
  const uploadedImages = input.uploadImages ? await input.uploadImages(images) : [];

  return { premiumHtml, generatedImages, uploadedImages };
}

export function ingestLiveCollectorResult(raw: unknown): PierPulseLiveCollectorResult {
  if (!raw || typeof raw !== "object") throw new Error("PIER Pulse live collector result must be an object");
  const record = raw as Partial<PierPulseLiveCollectorResult>;
  if (!record.collectorId || typeof record.collectorId !== "string") throw new Error("PIER Pulse live collector result requires collectorId");
  if (!record.corridor || typeof record.corridor !== "string") throw new Error("PIER Pulse live collector result requires corridor");
  if (!record.collectedAt || typeof record.collectedAt !== "string") throw new Error("PIER Pulse live collector result requires collectedAt");
  if (!Array.isArray(record.candidates)) throw new Error("PIER Pulse live collector result requires candidates array");
  if (record.errors && !Array.isArray(record.errors)) throw new Error("PIER Pulse live collector result errors must be an array");
  return {
    collectorId: record.collectorId,
    corridor: record.corridor,
    collectedAt: record.collectedAt,
    candidates: record.candidates.map((item, index) => coerceCandidateInput(item, index)),
    errors: (record.errors ?? []).map((error) => String(error)),
  };
}

export function mergeLiveCollectorResults(results: PierPulseLiveCollectorResult[]): PierPulseSourceCandidateInput[] {
  const seen = new Set<string>();
  const merged: PierPulseSourceCandidateInput[] = [];
  for (const result of results) {
    for (const candidate of result.candidates) {
      const key = candidate.url.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(candidate);
    }
  }
  return merged;
}

export type PierPulseLiveCollectorsConfig = {
  collectors: Array<Record<string, unknown>>;
};

export async function runPierPulseLiveCollectors(input: {
  configPath: string;
  scriptPath?: string;
  collectedAt?: string;
  pythonBin?: string;
  corridorId?: string;
}): Promise<PierPulseLiveCollectorResult[]> {
  const raw = JSON.parse(await fs.readFile(input.configPath, "utf8")) as unknown;
  const allCollectors = isLiveCollectorsConfig(raw) ? raw.collectors : [raw as Record<string, unknown>];
  const collectors = input.corridorId ? allCollectors.filter((collector) => collector.corridor === input.corridorId) : allCollectors;
  const scriptPath = input.scriptPath ?? path.join(process.cwd(), "scripts/pier-pulse-live-collector.py");
  const pythonBin = input.pythonBin ?? process.env.PIER_PULSE_PYTHON_BIN ?? "python3";
  const timeoutMs = Number(process.env.PIER_PULSE_LIVE_COLLECTOR_TIMEOUT_MS ?? "60000");
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pier-pulse-live-collectors-"));

  try {
    const results: PierPulseLiveCollectorResult[] = [];
    for (let index = 0; index < collectors.length; index += 1) {
      const collectorConfigPath = path.join(tempDir, `collector-${index}.json`);
      await fs.writeFile(collectorConfigPath, JSON.stringify(collectors[index], null, 2), "utf8");
      const args = [scriptPath, "--config", collectorConfigPath];
      if (input.collectedAt) args.push("--collected-at", input.collectedAt);
      const { stdout } = await execFileAsync(pythonBin, args, {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 10,
        timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60000,
      });
      results.push(ingestLiveCollectorResult(JSON.parse(stdout) as unknown));
    }
    return results;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function isLiveCollectorsConfig(raw: unknown): raw is PierPulseLiveCollectorsConfig {
  return Boolean(raw && typeof raw === "object" && Array.isArray((raw as { collectors?: unknown }).collectors));
}

function coerceCandidateInput(item: unknown, index: number): PierPulseSourceCandidateInput {
  if (!item || typeof item !== "object") {
    throw new Error(`PIER Pulse source fixture item ${index} must be an object`);
  }
  const record = item as Partial<PierPulseSourceCandidateInput>;
  if (!record.title || !record.url || !record.sourceName) {
    throw new Error(`PIER Pulse source fixture item ${index} requires title, url, and sourceName`);
  }
  return {
    title: String(record.title),
    url: String(record.url),
    sourceName: String(record.sourceName),
    publishedAt: record.publishedAt ? String(record.publishedAt) : undefined,
    summary: record.summary ? String(record.summary) : undefined,
    topics: Array.isArray(record.topics) ? record.topics.map(String) : undefined,
    facts: Array.isArray(record.facts) ? record.facts.map(String) : undefined,
    corridorHint: record.corridorHint ? String(record.corridorHint) : undefined,
  };
}

function parseLooseJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as unknown;
    } catch {
      return null;
    }
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
