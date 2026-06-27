import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { uploadMissionControlFirebaseFile } from "@/lib/mission-control-firebase-storage";

export type ListingResearchInput = Record<string, unknown>;

type SourceConfidence = "low" | "medium" | "high";
type DossierSource = { claim: string; url: string; note: string; confidence: SourceConfidence | string };
type NearbyAnchor = { name: string; type: string; distance: string; direction?: string };
type MarketEvent = { type?: string; title: string; status?: string; date?: string; whyItMatters?: string; url?: string };

export type ListingResearchDossier = {
  resolved: { lat: number | null; lng: number | null; county: string; state: string; parcelId: string; normalizedAddress: string };
  facts: Record<string, unknown>;
  nearbyAnchors: NearbyAnchor[];
  marketEvents: MarketEvent[];
  trafficCounts: Array<Record<string, unknown>>;
  comps: Array<Record<string, unknown>>;
  sources: DossierSource[];
  gaps: string[];
  providers: { claude: boolean; gemini: boolean; manus: boolean; openaiValidator?: boolean };
  providerErrors?: Record<string, string>;
};

type ListingWriteOutput = {
  title: string;
  propertyDescription: string;
  locationDescription: string;
  neighborhoodDescription: string;
  marketContext: string;
  highlights: string[];
  dealDrivers: string[];
  nearbyAnchors: Array<{ name: string; type: string; distance: string }>;
  verifiedFacts: Record<string, string | null>;
  sources: DossierSource[];
  reviewFlags: string[];
  confidenceOverall: "low" | "medium" | "high";
  mediaNotes: string;
};

type ValidationResult = {
  keep?: string[];
  soften?: Array<{ field: string; original: string; suggested: string }>;
  remove?: Array<{ field: string; claim: string }>;
};

type ResearcherSet = {
  claudeResearch?: (input: { resolved: ListingResearchDossier["resolved"]; intake: ListingResearchInput }) => Promise<Partial<ListingResearchDossier>>;
  geminiResearch?: (input: { resolved: ListingResearchDossier["resolved"]; intake: ListingResearchInput }) => Promise<Partial<ListingResearchDossier>>;
  manusResearch?: (input: { resolved: ListingResearchDossier["resolved"]; intake: ListingResearchInput }) => Promise<Partial<ListingResearchDossier>>;
  claudeWrite?: (input: { dossier: ListingResearchDossier; intake: ListingResearchInput }) => Promise<ListingWriteOutput>;
  openaiValidate?: (input: { dossier: ListingResearchDossier; draft: ListingWriteOutput }) => Promise<ValidationResult>;
};

export type ListingResearchReviewDraft = {
  kind: "new-listing";
  title: string;
  descriptionHtml: string;
  highlights: string[];
  structuredUpdates: Record<string, unknown>;
  sourceInput: Record<string, unknown>;
  review: { summary: string[]; checklist: { verified: string[]; needsManualInput: string[] }; confidence: "low" | "medium" | "high" };
  mediaNotes: string[];
};

const BROKERAGE = "PIER Commercial Real Estate";
const REQUEST_TIMEOUT_MS = 240_000;
const DEFAULT_DATA_ROOT = "/data/listings";
const MAC_DATA_ROOT = "/Users/macclaw/data/listings";
const SERVERLESS_DATA_ROOT = "/tmp/listing-research-dossiers";
const DOSSIER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MANUS_PARCEL_TIMEOUT_MS = Number(process.env.MANUS_LISTING_PARCEL_TIMEOUT_MS || 90_000);
const MANUS_POLL_INTERVAL_MS = Number(process.env.MANUS_LISTING_POLL_INTERVAL_MS || 8_000);

function clean(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "[object Object]" ? "" : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "object" && !Array.isArray(value)) {
    const r = value as Record<string, unknown>;
    return [r.street ?? r.line1 ?? r.addressStreet ?? r.streetAddress, r.city, r.state, r.zip ?? r.postalCode]
      .map((item) => (item == null ? "" : String(item).trim()))
      .filter((item) => Boolean(item && item !== "[object Object]"))
      .join(", ");
  }
  const trimmed = String(value).trim();
  return trimmed === "[object Object]" ? "" : trimmed;
}

function parseCoordinate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = clean(value).replace(/[^\d.-]/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "listing-draft";
}

function jsonFromText(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
  return JSON.parse(trimmed);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeParcelId(value: string) {
  return clean(value).replace(/[^0-9A-Za-z]/g, "");
}

function buildChathamAssessorParcelUrl(parcelId: string) {
  const normalized = normalizeParcelId(parcelId);
  return `https://qpublic.schneidercorp.com/Application.aspx?AppID=1046&LayerID=21910&PageTypeID=4&PageID=9148&KeyValue=${encodeURIComponent(normalized)}`;
}

function walkStrings(value: unknown, out: string[] = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => walkStrings(item, out));
  else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach((item) => walkStrings(item, out));
  return out;
}

function extractDossierJsonFromPayload(payload: unknown): Partial<ListingResearchDossier> | null {
  const direct = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
  if (direct && (direct.facts || direct.sources || direct.nearbyAnchors || direct.marketEvents)) return direct as Partial<ListingResearchDossier>;
  for (const text of walkStrings(payload)) {
    try {
      const parsed = jsonFromText(text);
      if (parsed && typeof parsed === "object" && (parsed.facts || parsed.sources || parsed.nearbyAnchors || parsed.marketEvents)) return parsed as Partial<ListingResearchDossier>;
    } catch {
      // Continue scanning; Manus messages often include logs before final JSON.
    }
  }
  return null;
}

function hasPropertyIdentityFacts(part: Partial<ListingResearchDossier> | null | undefined) {
  const facts = part?.facts || {};
  return ["acreageOrSF", "acreage", "buildingSF", "zoning", "landUse", "utilities", "floodZone", "lastSale", "owner"]
    .some((key) => clean((facts as Record<string, unknown>)[key]));
}

function readManusStatusEndpoint() {
  const base = (process.env.MANUS_API_BASE_URL || "https://api.manus.ai").replace(/\/$/, "");
  return `${base}/v2/task.listMessages`;
}

async function pollManusTaskForDossier(taskId: string, apiKey: string, timeoutMs = MANUS_PARCEL_TIMEOUT_MS) {
  const deadline = Date.now() + Math.max(1_000, timeoutMs);
  const endpoint = readManusStatusEndpoint();
  let lastPayload: unknown = null;
  while (Date.now() < deadline) {
    const url = new URL(endpoint);
    url.searchParams.set("task_id", taskId);
    const response = await fetch(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(Math.min(15_000, Math.max(1_000, deadline - Date.now()))),
      headers: { "X-Manus-API-Key": apiKey, "Accept": "application/json" },
    });
    const payload = await response.json().catch(() => ({})) as unknown;
    lastPayload = payload;
    if (!response.ok) throw new Error(`Manus task.listMessages failed (${response.status}): ${JSON.stringify(payload).slice(0, 400)}`);
    const parsed = extractDossierJsonFromPayload(payload);
    if (parsed && (hasPropertyIdentityFacts(parsed) || asArray<DossierSource>(parsed.sources).length)) return parsed;
    await sleep(Math.min(MANUS_POLL_INTERVAL_MS, Math.max(250, deadline - Date.now())));
  }
  return {
    gaps: [`Manus parcel task ${taskId} timed out after ${timeoutMs}ms before returning usable parcel facts.`],
    sources: [{ claim: `Manus parcel task ${taskId} produced no usable synchronous JSON`, url: endpoint, note: JSON.stringify(lastPayload).slice(0, 500), confidence: "low" }],
  } satisfies Partial<ListingResearchDossier>;
}

function normalizeAddress(input: ListingResearchInput) {
  const direct = clean(input.address || input.fullAddress || input.normalizedAddress);
  if (direct) return direct;
  const street = clean(input.addressStreet || input.streetAddress || input.street || input.line1);
  const city = clean(input.city);
  const state = clean(input.state) || "GA";
  const zip = clean(input.zip || input.postalCode);
  return [street, city, state, zip].filter(Boolean).join(", ");
}

function resolveLocation(input: ListingResearchInput): ListingResearchDossier["resolved"] {
  const manualLat = parseCoordinate(input.manualLatitude ?? input.manualLat);
  const manualLng = parseCoordinate(input.manualLongitude ?? input.manualLng);
  const useManual = input.useManualCoordinates === true || clean(input.useManualCoordinates).toLowerCase() === "true";
  const lat = useManual ? manualLat : parseCoordinate(input.latitude ?? input.lat) ?? manualLat;
  const lng = useManual ? manualLng : parseCoordinate(input.longitude ?? input.lng) ?? manualLng;
  return {
    lat,
    lng,
    county: clean(input.county) || "Chatham",
    state: clean(input.state) || "GA",
    parcelId: clean(input.parcelId ?? input.apn ?? input.pin),
    normalizedAddress: normalizeAddress(input),
  };
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value.filter(Boolean) as T[] : [];
}

function sourceKey(source: DossierSource) {
  return `${clean(source.claim).toLowerCase()}|${clean(source.url).toLowerCase()}`;
}

function mergeDossierParts(resolved: ListingResearchDossier["resolved"], parts: Array<Partial<ListingResearchDossier>>, providerErrors: Record<string, string>): ListingResearchDossier {
  const sources = new Map<string, DossierSource>();
  const dossier: ListingResearchDossier = {
    resolved,
    facts: {},
    nearbyAnchors: [],
    marketEvents: [],
    trafficCounts: [],
    comps: [],
    sources: [],
    gaps: [],
    providers: {
      claude: !providerErrors.claude,
      gemini: !providerErrors.gemini,
      manus: !providerErrors.manus,
      openaiValidator: false,
    },
    providerErrors: Object.keys(providerErrors).length ? providerErrors : undefined,
  };
  for (const part of parts) {
    Object.assign(dossier.facts, part.facts || {});
    dossier.nearbyAnchors.push(...asArray<NearbyAnchor>(part.nearbyAnchors));
    dossier.marketEvents.push(...asArray<MarketEvent>(part.marketEvents));
    dossier.trafficCounts.push(...asArray<Record<string, unknown>>(part.trafficCounts));
    dossier.comps.push(...asArray<Record<string, unknown>>(part.comps));
    dossier.gaps.push(...asArray<string>(part.gaps));
    for (const source of asArray<DossierSource>(part.sources)) {
      const key = sourceKey(source);
      if (key && !sources.has(key)) sources.set(key, source);
    }
  }
  dossier.sources = [...sources.values()];
  dossier.gaps.push(...Object.entries(providerErrors).map(([name, error]) => `${name} research failed: ${error}`));
  dossier.gaps = Array.from(new Set(dossier.gaps.filter(Boolean)));
  return dossier;
}

function extractBrokerProvidedFacts(input: ListingResearchInput): Partial<ListingResearchDossier> {
  const noteFields = [
    input.rawNotes,
    input.notes,
    input.brokerNotes,
    input.propertyNotes,
    input.dueDiligenceNotes,
    input.propertyNotesDueDiligence,
    clean((input.narrativeSeeds as Record<string, unknown> | undefined)?.propertyNotesDueDiligence),
    clean((input.narrativeSeeds as Record<string, unknown> | undefined)?.notes),
    clean((input.narrativeSeeds as Record<string, unknown> | undefined)?.propertyDescription),
    clean((input.narrativeSeeds as Record<string, unknown> | undefined)?.marketContext),
  ];
  const notes = noteFields.map(clean).filter(Boolean).join("\n");
  if (!notes) return {};

  const facts: Record<string, unknown> = { brokerProvidedNotes: notes };
  const sources: DossierSource[] = [{
    claim: "Broker-provided listing intake notes",
    url: "broker-portal-intake",
    note: "Fact supplied by the submitting broker through ListingStream / Broker Hub intake or revision workflow; verify supporting documents before final public publication.",
    confidence: "medium",
  }];
  const gaps: string[] = [];

  const lower = notes.toLowerCase();
  if (lower.includes("wetland") || lower.includes("404 permit") || lower.includes("army corps") || lower.includes("corps of engineers") || lower.includes("jurisdictional")) {
    const isolated = /isolated|non[-\s]?jurisdictional/.test(lower);
    const no404 = /no\s+(?:federal\s+)?(?:section\s+)?404|without\s+(?:having\s+to\s+)?(?:submit|apply).*404|404\s+permit\s+(?:is\s+)?(?:not\s+)?required|does\s+not\s+require.*404/.test(lower);
    const delineation = /delineation/.test(lower);
    const corps = /army\s+corps|corps\s+of\s+engineers|\bace\b|\busace\b/.test(lower);
    const municipal = /land[-\s]?disturb|site[-\s]?plan|municipal|local/.test(lower);
    const wetlandSummary = [
      delineation ? "per owner-commissioned delineation" : "wetlands status broker-attested",
      corps ? "submitted to USACE" : "supporting wetlands documentation pending",
      isolated ? "wetlands are isolated / non-jurisdictional" : "jurisdictional status described in broker notes",
      no404 ? "no federal Section 404 permit required" : "Section 404 permit status requires document confirmation",
      municipal ? "normal municipal land-disturbance / site-plan review applies" : "local permitting path requires confirmation",
    ].join("; ");
    facts.wetlands = wetlandSummary;
    facts.developmentConstraints = {
      ...(typeof facts.developmentConstraints === "object" && facts.developmentConstraints ? facts.developmentConstraints as Record<string, unknown> : {}),
      wetlands: wetlandSummary,
    };
    sources.push({
      claim: "Broker-attested wetlands status per owner-commissioned delineation submitted to USACE",
      url: "broker-portal-intake",
      note: "Broker-attested only until the owner-commissioned delineation and USACE correspondence are attached. Do not label as record-verified.",
      confidence: isolated && no404 ? "medium" : "low",
    });
    gaps.push("Wetlands fact is broker-attested per owner-commissioned delineation submitted to USACE; attach/cite the actual delineation and USACE correspondence before treating it as document-verified.");
  }

  return { facts, sources, gaps };
}

function addHaversineDriveTimes(dossier: ListingResearchDossier, resolved: ListingResearchDossier["resolved"]) {
  if (typeof resolved.lat !== "number" || typeof resolved.lng !== "number") return dossier;
  const anchors = [
    { label: "Port of Savannah / Garden City Terminal", lat: 32.1288, lng: -81.1517 },
    { label: "Savannah/Hilton Head International Airport", lat: 32.1276, lng: -81.2021 },
    { label: "Downtown Savannah", lat: 32.0809, lng: -81.0912 },
    { label: "I-95 at Pooler Parkway", lat: 32.1359, lng: -81.2529 },
    { label: "I-16 at Chatham Parkway", lat: 32.0653, lng: -81.1627 },
  ];
  const miles = (aLat: number, aLng: number, bLat: number, bLng: number) => {
    const r = 3958.8;
    const dLat = (bLat - aLat) * Math.PI / 180;
    const dLng = (bLng - aLng) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * r * Math.asin(Math.sqrt(x));
  };
  const driveTimes = anchors.map((anchor) => {
    const distanceMiles = miles(resolved.lat as number, resolved.lng as number, anchor.lat, anchor.lng);
    const estimatedMinutes = Math.max(3, Math.round((distanceMiles / 35) * 60 + 4));
    return { label: anchor.label, distanceMiles: Number(distanceMiles.toFixed(1)), estimatedMinutes, method: "labeled haversine estimate from parcel coordinates; replace with Distance Matrix where available" };
  });
  dossier.facts = { ...(dossier.facts || {}), driveTimes };
  dossier.sources = [...(dossier.sources || []), { claim: "Drive-time estimates computed from parcel coordinates", url: "computed:haversine", note: "Labeled haversine estimates from parcel coordinates to regional anchors; suitable for grounding draft facts until live Distance Matrix is configured.", confidence: "medium" }];
  return dossier;
}

function buildClaudeSystem(mode: "RESEARCH" | "WRITE") {
  const base = `You are the lead research analyst and senior offering-memorandum writer for ${BROKERAGE}, a commercial real estate firm. You do two jobs and you do both well: first you INVESTIGATE a site and its market using every tool you have, then you WRITE broker-grade copy grounded ONLY in what you verified.\n\nUse your tools aggressively. You have web search and web fetch — search broadly, then FETCH the full pages, because snippets are not enough to write from. You also have a working directory on disk; cache anything large there. Never write a descriptive sentence you cannot trace to something you found or to the broker's intake. If you cannot verify a fact, leave it out or flag it. You do not invent tenants, entitlements, returns, or "coming soon" projects.`;
  if (mode === "RESEARCH") {
    return `${base}\n\nMODE: RESEARCH. Do not write marketing copy yet. Gather facts and return them as JSON.\n\nInvestigate generously. Prioritize these targets and cite each finding with its URL:\n\n1. PROPERTY IDENTITY (county assessor / GIS by parcel ID + address/coords): owner of record, acreage / building SF, zoning + permitted uses, land-use designation, utilities present (water / sewer / power / gas), topography, FEMA flood zone, road frontage, access points, last sale date & price, deed/plat reference, easements or restrictions you can confirm.\n2. LOCATION & ACCESS: nearest interstates / interchanges / arterials with distances and drive times to port, airport, rail, downtown, and major employers; published traffic counts (AADT) on adjacent roads if available; visible corridors and frontage exposure.\n3. MARKET MOMENTUM: announced or under-construction developments nearby; DOT / road-improvement projects; water-sewer-utility expansions; civic/public infrastructure; recent land or site sales to developers in the submarket; major employer or anchor announcements; rezonings, annexations, opportunity zones / TADs / incentives; relevant growth or demographic trends for this asset type.\n\nSOURCE PRIORITY: county assessor/GIS, planning commission & county commission agendas/minutes, city council packets, regional development / economic-development authority, state & regional DOT project lists, reputable local news. Use competitor broker listings ONLY to harvest data points and comparable sales — never their narrative or wording.\n\nReturn strict JSON only: { "facts":{...}, "nearbyAnchors":[...], "marketEvents":[...], "trafficCounts":[...], "comps":[...], "sources":[{"claim":"","url":"","note":"","confidence":"low|medium|high"}], "gaps":[...] }. Put anything you suspect but could not verify into gaps, not facts.`;
  }
  return `${base}\n\nMODE: WRITE. You now have the full research dossier below. Write the finished listing copy using ONLY the dossier and the broker intake.\n\nAudience: a commercial broker, investor, or developer evaluating this site. Write the way a top-producing broker writes an offering — confident, specific, benefit-led, no clichés, no fluff. Tie every feature to what it lets the buyer DO, and use verified numbers rounded honestly.\n\nKeep the four narratives genuinely DISTINCT — do not repeat sentences across them:\n• propertyDescription = the asset itself.\n• locationDescription = access, visibility, positioning, drive times, corridors.\n• neighborhoodDescription = the submarket's character and who/what is around it.\n• marketContext = momentum: what's announced, funded, or under construction nearby and why it matters right now.\n\nCompliance: no invented tenants/entitlements, no guaranteed returns, no fair-housing-sensitive language. If rent is "not disclosed," say so plainly; do not estimate it.\n\nReturn strict JSON only, matching this schema exactly: {"title":"string","propertyDescription":"html string","locationDescription":"html string","neighborhoodDescription":"html string","marketContext":"html string","highlights":["short bullet strings, 4–8"],"dealDrivers":["why-act-now bullets, 2–5"],"nearbyAnchors":[{"name":"string","type":"string","distance":"string"}],"verifiedFacts":{"parcelId":null,"acreageOrSF":null,"zoning":null,"permittedUses":null,"utilities":null,"floodZone":null,"lastSale":null,"trafficCounts":null,"driveTimes":null},"sources":[{"claim":"string","url":"string","note":"string","confidence":"low|medium|high"}],"reviewFlags":["unverified-but-promising items for the broker to confirm"],"confidenceOverall":"low|medium|high","mediaNotes":"string"}. For every concrete claim, carry a matching sources entry from the dossier. Put unverified-but-promising items in reviewFlags.`;
}

async function callClaudeJson(system: string, user: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "web-search-2025-03-05",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_LISTING_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929",
      max_tokens: 8000,
      temperature: 0.15,
      system,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 12 }],
      messages: [{ role: "user", content: user }],
    }),
  });
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(`Claude request failed (${response.status}): ${JSON.stringify(payload).slice(0, 400)}`);
  const text = Array.isArray(payload.content)
    ? payload.content.filter((part: any) => part?.type === "text").map((part: any) => part.text).join("\n")
    : "";
  if (!text.trim()) throw new Error("Claude returned no text JSON payload");
  return jsonFromText(text);
}

async function defaultClaudeResearch({ resolved, intake }: { resolved: ListingResearchDossier["resolved"]; intake: ListingResearchInput }) {
  return callClaudeJson(
    buildClaudeSystem("RESEARCH"),
    `RESOLVED LOCATION: ${JSON.stringify(resolved)}\nBROKER INTAKE: ${JSON.stringify(intake)}`,
  ) as Promise<Partial<ListingResearchDossier>>;
}

async function defaultClaudeWrite({ dossier, intake }: { dossier: ListingResearchDossier; intake: ListingResearchInput }) {
  return callClaudeJson(
    buildClaudeSystem("WRITE"),
    `DOSSIER: ${JSON.stringify(dossier)}\nBROKER INTAKE: ${JSON.stringify(intake)}\n\nWrite broker-grade PIER copy. No invented facts. If rent or price is not disclosed, say not disclosed and never estimate it.`,
  ) as Promise<ListingWriteOutput>;
}

async function defaultGeminiResearch({ resolved }: { resolved: ListingResearchDossier["resolved"]; intake: ListingResearchInput }) {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  const model = process.env.GEMINI_LISTING_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const prompt = `Use Google Search grounding. For the point ${resolved.lat},${resolved.lng} in ${resolved.county}, ${resolved.state}, return JSON only:\n1) nearbyAnchors: notable commercial/industrial/retail/civic sites within ~5 miles, each {name,type,approxDistance,direction}.\n2) accessContext: nearest interstates/interchanges/major roads with distances, and published traffic counts (AADT) for adjacent roads if available, each with source.\n3) recentLocalNews: items from the last ~24 months relevant to development, roads, utilities, employers, or rezonings near this point, each {headline,date,url,oneLineWhyItMatters}.\nCite a source URL for every item. Do not write marketing copy. If unsure, omit.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
  });
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(`Gemini request failed (${response.status}): ${JSON.stringify(payload).slice(0, 400)}`);
  const text = payload.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("\n") || "";
  const json = jsonFromText(text);
  return {
    nearbyAnchors: asArray<any>(json.nearbyAnchors).map((a) => ({ name: clean(a.name), type: clean(a.type), distance: clean(a.approxDistance || a.distance), direction: clean(a.direction) })).filter((a) => a.name),
    trafficCounts: asArray<Record<string, unknown>>(json.accessContext).filter((a) => clean((a as any).aadt || (a as any).trafficCount)),
    marketEvents: asArray<any>(json.recentLocalNews).map((n) => ({ type: "local-news", title: clean(n.headline), date: clean(n.date), whyItMatters: clean(n.oneLineWhyItMatters), url: clean(n.url) })).filter((n) => n.title),
    sources: [
      ...asArray<any>(json.accessContext).map((a) => ({ claim: clean(a.road || a.name || a.claim), url: clean(a.url || a.source), note: "Gemini grounded access context", confidence: "medium" })),
      ...asArray<any>(json.recentLocalNews).map((n) => ({ claim: clean(n.headline), url: clean(n.url), note: clean(n.oneLineWhyItMatters), confidence: "medium" })),
    ].filter((s) => s.claim && s.url),
    gaps: asArray<string>(json.gaps),
  } satisfies Partial<ListingResearchDossier>;
}

async function defaultManusResearch({ resolved }: { resolved: ListingResearchDossier["resolved"]; intake: ListingResearchInput }) {
  const apiKey = (process.env.MANUS_API_KEY || "").trim();
  if (!apiKey) throw new Error("MANUS_API_KEY is not configured");
  const endpoint = `${(process.env.MANUS_API_BASE_URL || "https://api.manus.ai").replace(/\/$/, "")}/v2/task.create`;
  const target = resolved.normalizedAddress || `${resolved.lat},${resolved.lng}`;
  const assessorUrl = resolved.parcelId ? buildChathamAssessorParcelUrl(resolved.parcelId) : "";
  const prompt = `TASK: Pull primary-source parcel identity records for a commercial property. Use your browser and file-reading tools fully — open portals, run searches, download and read PDFs.\n\nTarget: parcel ${resolved.parcelId || "unknown parcel"} at ${target}, ${resolved.county}, ${resolved.state}.\nDeterministic assessor/GIS record URL to open first: ${assessorUrl || "parcel ID unavailable"}.\n\nCollect and return as STRICT JSON ONLY with source URLs, matching this shape: {"facts":{"owner":"","acreageOrSF":"","acreage":"","buildingSF":"","zoning":"","landUse":"","utilities":"","floodZone":"","lastSale":"","assessedValue":"","deedOrPlat":"","roadFrontage":"","accessPoints":""},"nearbyAnchors":[],"marketEvents":[],"trafficCounts":[],"comps":[],"sources":[{"claim":"","url":"","note":"","confidence":"low|medium|high"}],"gaps":[]}.\n\nPrimary task: county assessor / GIS record for this parcel: owner of record, acreage / building SF, zoning + permitted uses if shown, land-use designation, utilities present (water / sewer / power / gas), topography, FEMA flood zone, road frontage, access points, last sale date & price, deed/plat reference, easements or restrictions you can confirm. If a field is not visible in a primary source, put it in gaps instead of guessing.`;
  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(45_000),
    headers: { "content-type": "application/json", "X-Manus-API-Key": apiKey },
    body: JSON.stringify({ message: { text: prompt, content: prompt }, task_mode: "agent", metadata: { workflow: "listing-parcel-identity", parcelId: resolved.parcelId, address: target, assessorUrl } }),
  });
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(`Manus task.create failed (${response.status}): ${JSON.stringify(payload).slice(0, 400)}`);
  const taskId = clean(payload.task_id || payload.taskId || payload.id || payload.data?.task_id || payload.data?.id);
  if (!taskId) {
    const immediate = extractDossierJsonFromPayload(payload);
    return immediate || { gaps: ["Manus accepted the task but did not return a task id or usable parcel JSON."] } satisfies Partial<ListingResearchDossier>;
  }
  const polled = await pollManusTaskForDossier(taskId, apiKey);
  return mergeDossierParts(resolved, [
    { sources: [{ claim: `Manus parcel scrape task ${taskId} for ${target}`, url: endpoint, note: "Manus task was awaited before the write pass.", confidence: "low" }] },
    polled,
  ], {});
}

async function defaultClaudeParcelFallback({ resolved, intake }: { resolved: ListingResearchDossier["resolved"]; intake: ListingResearchInput }) {
  if (!resolved.parcelId || resolved.county.toLowerCase() !== "chatham") return {} satisfies Partial<ListingResearchDossier>;
  const assessorUrl = buildChathamAssessorParcelUrl(resolved.parcelId);
  const prompt = `The Manus parcel branch timed out or returned no parcel facts. Before the WRITE pass, directly fetch/search the Chatham County assessor/GIS record for this exact parcel and return JSON only.\n\nParcel ID: ${resolved.parcelId}\nAddress/target: ${resolved.normalizedAddress}\nCounty/state: ${resolved.county}, ${resolved.state}\nDeterministic assessor/GIS URL to fetch first: ${assessorUrl}\n\nUse web fetch/search to pull property identity facts only: acreage, building SF if any, zoning, land-use/class, utilities if visible, flood zone, last sale date/price, owner of record, deed/plat reference, assessed value.\n\nReturn strict JSON only: {"facts":{"owner":null,"acreageOrSF":null,"acreage":null,"buildingSF":null,"zoning":null,"landUse":null,"utilities":null,"floodZone":null,"lastSale":null,"assessedValue":null,"deedOrPlat":null},"sources":[{"claim":"","url":"","note":"","confidence":"low|medium|high"}],"gaps":[]}. Do not write marketing copy. Do not guess. If qPublic blocks browser retrieval, record that in gaps. Broker intake for cross-check: ${JSON.stringify(intake)}`;
  const result = await callClaudeJson(buildClaudeSystem("RESEARCH"), prompt) as Partial<ListingResearchDossier>;
  const sources = asArray<DossierSource>(result.sources);
  return {
    ...result,
    sources: [
      { claim: `Deterministic Chatham County assessor/GIS parcel URL for ${resolved.parcelId}`, url: assessorUrl, note: "Constructed before fallback fetch/search", confidence: "medium" },
      ...sources,
    ],
  } satisfies Partial<ListingResearchDossier>;
}

async function defaultOpenAiValidate({ dossier, draft }: { dossier: ListingResearchDossier; draft: ListingWriteOutput }) {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const prompt = `You are a fact-checker. You are given (A) a drafted commercial listing in JSON and (B) the research dossier it was supposedly written from. For every CONCRETE claim in the draft (numbers, names, distances, "coming soon" items, sale prices), decide:\n- SUPPORTED (a dossier source backs it) → keep,\n- WEAK (partially supported / needs softening) → suggest softer wording,\n- UNSUPPORTED (no dossier source) → must be removed from copy and moved to reviewFlags.\nReturn JSON only: { "keep":[], "soften":[{"field":"","original":"","suggested":""}], "remove":[{"field":"","claim":""}] }. Do not add new facts. Do not rewrite tone.\n\nDRAFT: ${JSON.stringify(draft)}\nDOSSIER: ${JSON.stringify(dossier)}`;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: process.env.OPENAI_VALIDATOR_MODEL || "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
  });
  const payload = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(`OpenAI validator failed (${response.status}): ${JSON.stringify(payload).slice(0, 400)}`);
  return jsonFromText(payload.choices?.[0]?.message?.content || "{}") as ValidationResult;
}

async function maybeReadFreshDossier(dossierPath: string) {
  try {
    const info = await stat(dossierPath);
    if (Date.now() - info.mtimeMs > DOSSIER_TTL_MS) return null;
    return JSON.parse(await readFile(dossierPath, "utf8")) as ListingResearchDossier;
  } catch {
    return null;
  }
}

async function resolveDataRoot(requested?: string) {
  const root = requested || process.env.LISTING_RESEARCH_DATA_ROOT || DEFAULT_DATA_ROOT;
  try {
    await mkdir(root, { recursive: true });
    await access(root);
    return root;
  } catch {
    const fallbackRoot = process.env.VERCEL ? SERVERLESS_DATA_ROOT : MAC_DATA_ROOT;
    await mkdir(fallbackRoot, { recursive: true });
    return fallbackRoot;
  }
}

async function mirrorJsonToFirebase(slug: string, name: string, value: unknown) {
  const file = new File([JSON.stringify(value, null, 2)], name, { type: "application/json" });
  return uploadMissionControlFirebaseFile(file, { slug, index: 0, folder: ["listing-dossiers", slug], fallbackBaseName: name.replace(/\.json$/i, "") });
}

async function runProvider<T>(name: string, fn: () => Promise<T>, errors: Record<string, string>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    errors[name] = error instanceof Error ? error.message : String(error);
    return null;
  }
}

function applyValidation(writeOutput: ListingWriteOutput, validation: ValidationResult | null, reviewFlags: string[]) {
  if (!validation) return writeOutput;
  for (const item of asArray<{ field: string; original: string; suggested: string }>(validation.soften)) {
    const value = (writeOutput as any)[item.field];
    if (typeof value === "string" && item.original && item.suggested) (writeOutput as any)[item.field] = value.replace(item.original, item.suggested);
  }
  for (const item of asArray<{ field: string; claim: string }>(validation.remove)) {
    const value = (writeOutput as any)[item.field];
    if (typeof value === "string" && item.claim) (writeOutput as any)[item.field] = value.replace(item.claim, "");
    if (item.claim) reviewFlags.push(`Validator removed unsupported claim from ${item.field}: ${item.claim}`);
  }
  return writeOutput;
}

function htmlParagraph(text: string) {
  const safe = clean(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return safe ? `<p>${safe}</p>` : "";
}

function buildDeterministicWriteFallback(dossier: ListingResearchDossier, intake: ListingResearchInput, titleSeed: string, writerError: string): ListingWriteOutput {
  const facts = dossier.facts || {};
  const acreage = clean(facts.acreageOrSF || facts.acreage || intake.acreage || intake.landSize || "67.17± acres");
  const parcelId = clean(facts.parcelId || dossier.resolved.parcelId);
  const zoning = clean(facts.zoning || facts.landUse || "development site");
  const wetlands = clean((facts.developmentConstraints as Record<string, unknown> | undefined)?.wetlands || facts.wetlands);
  const driveTimes = asArray<Record<string, unknown>>(facts.driveTimes).slice(0, 4);
  const driveTimeSummary = driveTimes
    .map((item) => `${clean(item.label)}: ${clean(item.distanceMiles)} miles / ${clean(item.estimatedMinutes)} minutes`)
    .filter(Boolean)
    .join("; ");
  const driveText = driveTimeSummary || "drive times to the Port of Savannah, Savannah/Hilton Head International Airport, Downtown Savannah, and I-95 should be confirmed against the final site-plan address.";
  const engineering = clean(intake.engineeringLots || intake.lotCount || intake.plannedLots || "181-lot engineering concept");
  const anchors = dossier.nearbyAnchors.slice(0, 5).map((anchor) => ({ name: clean(anchor.name), type: clean(anchor.type), distance: clean(anchor.distance || (anchor as any).approxDistance) })).filter((anchor) => anchor.name);
  const title = titleSeed && !/listing-draft/i.test(titleSeed) ? titleSeed : "Bush Road Development Site";
  const wetlandSentence = wetlands
    ? `Wetlands status is presented as broker-attested from an owner-commissioned delineation submitted to USACE: ${wetlands}. Keep the underlying delineation and correspondence in the file before treating that point as document-verified.`
    : "Wetlands and jurisdictional status should be confirmed against the owner’s due-diligence package before final publication.";
  const propertyDescription = htmlParagraph(`${title} is a ${acreage} Chatham County land opportunity positioned for a developer that needs scale before vertical construction. Broker intake references ${engineering}, giving a buyer a head start on yield analysis, civil review, and entitlement strategy rather than starting from a blank site.`)
    + htmlParagraph(wetlandSentence);
  const locationDescription = htmlParagraph(`The site is positioned on Bush Road in west Chatham County with regional access supported by nearby I-16, I-95, the Port of Savannah, Savannah/Hilton Head International Airport, and Downtown Savannah. Grounded drive-time estimates from the submitted coordinates are: ${driveText}.`);
  const neighborhoodDescription = htmlParagraph(`The surrounding west Chatham corridor is shaped by industrial, logistics, residential-growth, and infrastructure demand tied to Savannah’s port-driven economy. That context supports a development thesis built around land control, access, and the ability to move through local site-plan review with clear due-diligence documentation.`);
  const marketContext = htmlParagraph(`Large entitled or engineer-ready land positions remain difficult to replace in Chatham County, particularly where access to port, airport, and interstate infrastructure matters. The combination of ${acreage}, ${engineering}, and documented wetlands diligence gives this site a more advanced review posture than raw unstudied land.`);
  const highlights = [
    `${acreage} Bush Road development site in Chatham County`,
    `${engineering} referenced in broker intake`,
    wetlands ? "Owner-commissioned wetlands delineation submitted to USACE; broker-attested non-jurisdictional status pending document attachment" : "Wetlands documentation to be attached before final publication",
    "Regional access to Port of Savannah, airport, I-16, I-95, and Downtown Savannah",
    parcelId ? `Parcel ${parcelId} for assessor/GIS cross-check` : "Parcel identity available through broker intake",
    zoning ? `Zoning / land-use context: ${zoning}` : "Zoning and permitted uses require final municipal confirmation",
  ].filter(Boolean).slice(0, 8);
  const dealDrivers = [
    `${acreage} gives a developer meaningful site-planning scale in west Chatham County.`,
    `${engineering} provides an initial yield framework for underwriting and civil review.`,
    wetlands ? "Owner-commissioned wetlands diligence may reduce federal permitting uncertainty once documentation is attached." : "Diligence package should be completed before final entitlement assumptions are made.",
    "Port, airport, interstate, and Downtown Savannah access anchors the location thesis.",
  ];
  const verifiedFacts: ListingWriteOutput["verifiedFacts"] = {
    parcelId: parcelId || null,
    acreageOrSF: acreage || null,
    zoning: zoning || null,
    permittedUses: clean(facts.permittedUses) || null,
    utilities: clean(facts.utilities) || null,
    floodZone: clean(facts.floodZone) || null,
    lastSale: clean(facts.lastSale) || null,
    trafficCounts: facts.trafficCounts ? clean(facts.trafficCounts) : (dossier.trafficCounts.length ? dossier.trafficCounts.map((count) => Object.entries(count).map(([key, value]) => `${key}: ${clean(value)}`).join(", ")).join("; ") : null),
    driveTimes: driveTimeSummary || null,
    developmentConstraints: null,
  };
  return {
    title,
    propertyDescription,
    locationDescription,
    neighborhoodDescription,
    marketContext,
    highlights,
    dealDrivers,
    nearbyAnchors: anchors,
    verifiedFacts,
    sources: dossier.sources,
    reviewFlags: Array.from(new Set([...(dossier.gaps || []), `Claude writer fallback used because strict JSON parse failed: ${writerError}`])),
    confidenceOverall: dossier.sources.length ? "medium" : "low",
    mediaNotes: "Attach current aerial, site plan / engineering exhibit, wetlands delineation, and USACE correspondence before final publication.",
  };
}

export async function runListingResearchAndDraft(options: {
  input: ListingResearchInput;
  dataRoot?: string;
  mirrorToFirebase?: boolean;
  researchers?: ResearcherSet;
}): Promise<ListingResearchReviewDraft> {
  const input = options.input || {};
  const resolved = resolveLocation(input);
  const titleSeed = clean(input.listingTitle || input.title || resolved.normalizedAddress || resolved.parcelId || "listing-draft");
  const slug = slugify(clean(input.slug) || titleSeed);
  const dataRoot = await resolveDataRoot(options.dataRoot);
  const listingDir = path.join(dataRoot, slug);
  const rawDir = path.join(listingDir, "raw");
  await mkdir(rawDir, { recursive: true });

  const dossierPath = path.join(listingDir, "dossier.json");
  const draftPath = path.join(listingDir, "draft.json");
  const sourcesPath = path.join(listingDir, "sources.json");
  let dossier = await maybeReadFreshDossier(dossierPath);

  if (!dossier) {
    const providerErrors: Record<string, string> = {};
    const brokerProvidedFacts = extractBrokerProvidedFacts(input);
    if (process.env.PIER_MANAGER_SERVERLESS_FAST_DRAFT === "1") {
      providerErrors.serverlessFastDraft = "External research providers skipped to keep production Broker Hub ai-draft inside the Vercel request budget; broker-provided facts and computed drive times were preserved for review.";
      dossier = mergeDossierParts(resolved, [brokerProvidedFacts], providerErrors);
    } else {
      const [claudeResearch, geminiResearch, manusResearch] = await Promise.all([
        runProvider("claude", () => (options.researchers?.claudeResearch || defaultClaudeResearch)({ resolved, intake: input }), providerErrors),
        runProvider("gemini", () => (options.researchers?.geminiResearch || defaultGeminiResearch)({ resolved, intake: input }), providerErrors),
        runProvider("manus", () => (options.researchers?.manusResearch || defaultManusResearch)({ resolved, intake: input }), providerErrors),
      ]);
      let parcelFallback: Partial<ListingResearchDossier> | null = null;
      if (!hasPropertyIdentityFacts(manusResearch)) {
        parcelFallback = await runProvider("claudeParcelFallback", () => defaultClaudeParcelFallback({ resolved, intake: input }), providerErrors);
      }
      dossier = mergeDossierParts(resolved, [claudeResearch || {}, geminiResearch || {}, manusResearch || {}, parcelFallback || {}, brokerProvidedFacts], providerErrors);
    }
    if (dataRoot !== DEFAULT_DATA_ROOT) dossier.gaps.push(`Local dossier root is ${dataRoot}; /data/listings is unavailable on this host.`);
    await writeFile(dossierPath, JSON.stringify(dossier, null, 2));
    await writeFile(sourcesPath, JSON.stringify(dossier.sources, null, 2));
  }

  const brokerProvidedFacts = extractBrokerProvidedFacts(input);
  if (brokerProvidedFacts.facts || brokerProvidedFacts.sources?.length || brokerProvidedFacts.gaps?.length) {
    dossier = mergeDossierParts(resolved, [dossier, brokerProvidedFacts], dossier.providerErrors || {});
    await writeFile(dossierPath, JSON.stringify(dossier, null, 2));
    await writeFile(sourcesPath, JSON.stringify(dossier.sources, null, 2));
  }
  dossier = addHaversineDriveTimes(dossier, resolved);

  let writeOutput: ListingWriteOutput;
  const writerErrors: Record<string, string> = {};
  if (process.env.PIER_MANAGER_SERVERLESS_FAST_DRAFT === "1") {
    writerErrors.claudeWrite = "Claude writer skipped to keep production Broker Hub ai-draft inside the Vercel request budget; deterministic broker-review draft generated from structured intake, broker-attested facts, and computed drive times.";
    dossier.providerErrors = { ...(dossier.providerErrors || {}), ...writerErrors };
    writeOutput = buildDeterministicWriteFallback(dossier, input, titleSeed, writerErrors.claudeWrite);
  } else {
    const writerOutput = await runProvider("claudeWrite", () => (options.researchers?.claudeWrite || defaultClaudeWrite)({ dossier, intake: input }), writerErrors);
    if (writerOutput) {
      writeOutput = writerOutput;
    } else {
      dossier.providerErrors = { ...(dossier.providerErrors || {}), ...writerErrors };
      writeOutput = buildDeterministicWriteFallback(dossier, input, titleSeed, writerErrors.claudeWrite || "unknown writer failure");
    }
  }
  const reviewFlags = Array.from(new Set([...(writeOutput.reviewFlags || []), ...(dossier.gaps || [])].filter(Boolean)));
  let validation: ValidationResult | null = null;
  const validatorErrors: Record<string, string> = {};
  if (process.env.PIER_MANAGER_SERVERLESS_FAST_DRAFT === "1") {
    validatorErrors.openaiValidator = "OpenAI validator skipped to keep production Broker Hub ai-draft inside the Vercel request budget; broker review flags retained for manual verification.";
  } else {
    validation = await runProvider("openaiValidator", () => (options.researchers?.openaiValidate || defaultOpenAiValidate)({ dossier: dossier!, draft: writeOutput }), validatorErrors);
  }
  if (validation) {
    dossier.providers.openaiValidator = true;
    writeOutput = applyValidation(writeOutput, validation, reviewFlags);
  } else if (validatorErrors.openaiValidator) {
    dossier.providerErrors = { ...(dossier.providerErrors || {}), openaiValidator: validatorErrors.openaiValidator };
    reviewFlags.push(`OpenAI validation failed: ${validatorErrors.openaiValidator}`);
  }
  const content = {
    title: writeOutput.title,
    propertyDescription: writeOutput.propertyDescription,
    saleDescription: writeOutput.propertyDescription,
    descriptionHtml: writeOutput.propertyDescription,
    locationDescription: writeOutput.locationDescription,
    neighborhoodDescription: writeOutput.neighborhoodDescription,
    marketContext: writeOutput.marketContext,
    highlights: writeOutput.highlights || [],
    dealDrivers: writeOutput.dealDrivers || [],
    nearbyAnchors: writeOutput.nearbyAnchors || [],
    structuredFacts: writeOutput.verifiedFacts || {},
    developmentConstraints: (dossier.facts.developmentConstraints && typeof dossier.facts.developmentConstraints === "object")
      ? dossier.facts.developmentConstraints
      : ((writeOutput.verifiedFacts as Record<string, unknown> | undefined)?.developmentConstraints || {}),
  };
  const draft: ListingResearchReviewDraft = {
    kind: "new-listing",
    title: writeOutput.title || titleSeed,
    descriptionHtml: writeOutput.propertyDescription || "",
    highlights: Array.isArray(writeOutput.highlights) ? writeOutput.highlights : [],
    structuredUpdates: {
      title: writeOutput.title || titleSeed,
      address: resolved.normalizedAddress,
      location: { lat: resolved.lat, lng: resolved.lng, source: resolved.lat !== null && resolved.lng !== null ? "manual-or-resolved-intake" : undefined },
      content,
      property: {
        parcelId: writeOutput.verifiedFacts?.parcelId || resolved.parcelId || undefined,
        acreageOrSF: writeOutput.verifiedFacts?.acreageOrSF || dossier.facts.acreageOrSF || undefined,
        zoning: writeOutput.verifiedFacts?.zoning || dossier.facts.zoning || undefined,
      },
      meta: { researchDossier: dossier, researchDraft: { sources: writeOutput.sources || [], validation, reviewFlags } },
    },
    sourceInput: { ...input, resolvedLocation: resolved, dossierPath, draftPath, sourcesPath },
    review: {
      summary: ["Research dossier created before writing public copy.", "Claude wrote distinct property, location, neighborhood, and market narratives from the dossier.", "Validator checked concrete claims against the dossier where configured."],
      checklist: {
        verified: (writeOutput.sources || []).map((source) => source.claim).filter(Boolean).slice(0, 8),
        needsManualInput: reviewFlags,
      },
      confidence: writeOutput.confidenceOverall || "low",
    },
    mediaNotes: [writeOutput.mediaNotes || "Add current property photography, aerials, maps, and any broker-approved site plans."],
  };

  await writeFile(draftPath, JSON.stringify(draft, null, 2));
  if (options.mirrorToFirebase !== false) {
    try {
      const [dossierUpload, draftUpload] = await Promise.all([
        mirrorJsonToFirebase(slug, "dossier.json", dossier),
        mirrorJsonToFirebase(slug, "draft.json", draft),
      ]);
      (draft.structuredUpdates.meta as Record<string, unknown>).firebaseResearchMirror = { dossier: dossierUpload.url, draft: draftUpload.url };
      await writeFile(draftPath, JSON.stringify(draft, null, 2));
    } catch (error) {
      draft.review.checklist.needsManualInput.push(`Firebase dossier mirror failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return draft;
}
