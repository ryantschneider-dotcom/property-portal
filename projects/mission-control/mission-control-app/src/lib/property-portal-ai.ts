import { interpretBrokerEditRequest, type BrokerEditInterpreterResult } from "@/lib/broker-edit-interpreter";
import { buildPropertyPortalUrl, type PropertyPortalFetch, withPropertyPortalTimeout } from "@/lib/property-portal-client";

export type PropertyPortalAiWriterResult = {
  title: string;
  descriptionHtml: string;
  highlights: string[];
  structuredUpdates: Record<string, unknown>;
  mediaNotes: string[];
};

export type PropertyPortalCloudWriter = (prompt: string) => Promise<PropertyPortalAiWriterResult>;

export type PropertyPortalReviewChecklist = {
  autoFilled: string[];
  needsManualInput: string[];
  failedScrapes: string[];
  listingStreamReady: string[];
};

export type PropertyPortalDeltaPreview = {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

export type BrokerReviewDraft = PropertyPortalAiWriterResult & {
  id: string;
  kind: "new-listing" | "modification";
  status: "ready_for_broker_review";
  publishLive: false;
  sourceInput: Record<string, unknown>;
  currentListing?: Record<string, unknown>;
  review: {
    approved: false;
    revisionCount: number;
    feedbackHistory: string[];
    checklist: PropertyPortalReviewChecklist;
    interpreter?: BrokerEditInterpreterResult;
    deltaPreview?: PropertyPortalDeltaPreview;
  };
};

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function safeJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function normalizeHighlights(value: unknown) {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean).slice(0, 8) : [];
}

function normalizeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeWriterResult(value: unknown): PropertyPortalAiWriterResult {
  const parsed = normalizeRecord(value);
  const descriptionHtml = asString(parsed.descriptionHtml || parsed.description || parsed.propertyDescription);
  return {
    title: asString(parsed.title || parsed.saleTitle || "AI-drafted listing review"),
    descriptionHtml,
    highlights: normalizeHighlights(parsed.highlights || parsed.bullets),
    structuredUpdates: normalizeRecord(parsed.structuredUpdates || parsed.updatePayload),
    mediaNotes: normalizeHighlights(parsed.mediaNotes),
  };
}

export function parseCloudWriterJson(content: string): PropertyPortalAiWriterResult {
  const text = asString(content);
  if (!text) throw new Error("Cloud writer returned an empty message while drafting premium marketing copy.");

  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fenced) candidates.push(fenced);

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(text.slice(objectStart, objectEnd + 1));

  for (const candidate of candidates) {
    try {
      return normalizeWriterResult(JSON.parse(candidate));
    } catch {
      // Try the next extraction strategy before surfacing a clean route error.
    }
  }

  throw new Error("Cloud writer returned invalid JSON while drafting premium marketing copy. Please retry with a shorter, specific instruction.");
}

export function buildNewListingEnrichmentPrompt(input: Record<string, unknown>) {
  return `You are Hermes writing for PIER Commercial Real Estate. Produce a premium fully formatted commercial real estate property description from Broker Hub intake notes. Return strict JSON only.

Required JSON keys:
- title: premium listing title
- descriptionHtml: polished HTML paragraphs suitable for a commercial listing page
- highlights: 4-6 concise bullets
- structuredUpdates: property-portal compatible content/pricing/property updates inferred from the facts; when suites are present, include nested admin.suites[].spaceType only for true architectural/use types explicitly stated by the broker (Office, Retail, Industrial, Warehouse, Storage, Flex, Medical Office, Restaurant, Showroom), never the generic phrase "Available Space"
- mediaNotes: notes about uploaded media placement or gaps

Enrichment responsibilities:
- Attempt to identify missing assessor/parcel facts that should be auto-filled or researched: parcel, lot/building size, year built, zoning, property class, and other safe public-record fields
- Attempt to develop location intelligence from provided facts: neighborhood, corridor/submarket, nearby businesses, transportation/roadway context, and tenant/investor value drivers
- Clearly flag unknowns or blockers inside structuredUpdates.reviewFlags instead of inventing unsupported facts
- Preserve broker-provided narrative seeds when accurate and improve them into commercial-broker copy

Tone and standards:
- CCIM-level brokerage voice: professional, data-driven, concise, and specific
- Highlight key investment or tenant value propositions
- Do not invent unsupported facts, tenants, zoning, environmental claims, incentives, or measurements
- If a spec is unknown, omit it or flag it rather than writing filler
- Keep live publishing out of scope; this draft is for broker review only

Broker Hub intake:
${safeJson(input)}`;
}

export function buildModificationDeltaPrompt(input: { currentListing: Record<string, unknown>; instructions: string; interpreter?: BrokerEditInterpreterResult }) {
  const interpretedSection = input.interpreter ? `\n\nDeterministic broker-edit-interpreter result to honor before copy refinement:\n${safeJson(input.interpreter)}` : "";
  return `You are Hermes updating a property-portal listing draft. Return strict JSON only.

Task:
- Read the current property-portal listing payload
- Read the plain-text broker instruction
- Autonomously rewrite the description, update specs, or flag media changes accurately based solely on that delta
- Preserve unchanged facts from the current listing
- Never return generic shell text like "AI-drafted listing review" as title or content
- For a status-only change, keep title, media, images, description, pricing, location, brokers, and unchanged content out of structuredUpdates
- For status changes, use the deterministic interpreter fields exactly. The frontend normalizer reads top-level status, statusBadgeLabel, underContract, leased, sold and nested visibility.status/statusBadgeLabel/underContract/leased/sold; set data.leased=true for Leased, data.sold=true for Sold, and data.underContract=true for Under Contract
- Valid status values are: "leased", "sold", and "under_contract". Matching display labels are: "Leased", "Sold", and "Under Contract"
- Return only fields that should change in structuredUpdates; unchanged fields are merged by backend from the canonical listing
- For multi-tenant suite instructions, aggressively extract the broker's exact Available Sq. Ft. and Rent Rate values into structuredUpdates.admin.suites[].availableSqFt and .baseRent. The "Call" fallback is strictly prohibited when the broker supplied a number, including labels like "Available Sq. Ft.: 1,900" or "Rent Rate: $1,900/month".
- When changing one suite, preserve every existing suite not explicitly mentioned by the broker. Return an admin.suites array that includes all unchanged suites plus the corrected changed suite rows. Only omit/delete suite rows when the broker explicitly says a suite is leased/removed/deleted/dropped, or says to remove/clear all suites. Do not append duplicate suites, do not carry stale duplicate suite rows forward, and never default to "Call" when the broker supplied a price.
- For suite-specific uploaded files, never put file descriptions or user-provided labels into URLs. The backend will attach actual Firebase Storage download URLs to suites[].suitePhotos or suites[].suiteFloorPlans; do not place suite floor plans/photos in parent media, photos, heroImageUrl, or listing.photos.
- For suite rows, extract admin.suites[].spaceType only when the broker explicitly describes a real architectural/use type such as Office, Retail, Industrial, Warehouse, Storage, Flex, Medical Office, Restaurant, or Showroom. Never write "Available Space" as a suite spaceType; omit the field when unstated so ListingStream can inherit root propertyType.
- Do not invent unsupported facts

Required JSON keys:
- title
- descriptionHtml
- highlights
- structuredUpdates
- mediaNotes

Current property-portal listing payload:
${safeJson(input.currentListing)}${interpretedSection}

Plain-text broker instruction:
${input.instructions}`;
}

export function buildRevisionPrompt(input: { draft: BrokerReviewDraft; feedback: string }) {
  return `You are Hermes revising a broker review draft for PIER Commercial Real Estate. Return strict JSON only.

Broker feedback:
${input.feedback}

Existing draft:
${safeJson({
    title: input.draft.title,
    descriptionHtml: input.draft.descriptionHtml,
    highlights: input.draft.highlights,
    structuredUpdates: input.draft.structuredUpdates,
    mediaNotes: input.draft.mediaNotes,
    sourceInput: input.draft.sourceInput,
  })}

Rules:
- Apply only the broker feedback and preserve accurate facts
- Maintain CCIM-level brokerage tone
- Keep status as broker-review draft only; do not publish`;
}

export async function defaultPropertyPortalCloudWriter(prompt: string): Promise<PropertyPortalAiWriterResult> {
  const apiKey = asString(process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_PRODUCTION || process.env.OPENAI_KEY);
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for PIER Manager cloud writer.");
  const model = asString(process.env.OPENAI_MODEL) || "gpt-4o";
  const normalizedModel = model.startsWith("openai/") ? model.slice("openai/".length) : model;

  const response = await withPropertyPortalTimeout(fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: normalizedModel,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You produce strict JSON for premium commercial real estate listing drafts and broker-requested listing deltas.",
        },
        { role: "user", content: prompt },
      ],
    }),
  }), Number(process.env.PIER_MANAGER_CLOUD_WRITER_TIMEOUT_MS ?? 45_000), "Cloud writer timed out while drafting premium marketing copy.");

  const text = await response.text();
  if (!response.ok) throw new Error(`Cloud writer failed (${response.status}): ${text.slice(0, 600)}`);
  const payload = JSON.parse(text) as Record<string, unknown>;
  const content = asString((payload.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content);
  return parseCloudWriterJson(content);
}

function normalizeReviewChecklist(structuredUpdates: Record<string, unknown>): PropertyPortalReviewChecklist {
  const reviewFlags = normalizeRecord(structuredUpdates.reviewFlags);
  const autoFilled = normalizeHighlights(reviewFlags.autoFilled || reviewFlags.successfulAutoFill || reviewFlags.autoFilledFields);
  const needsManualInput = normalizeHighlights(reviewFlags.needsManualInput || reviewFlags.manualInputNeeded || reviewFlags.humanConfirmationNeeded);
  const failedScrapes = normalizeHighlights(reviewFlags.failedScrapes || reviewFlags.blockedScrapes || reviewFlags.scrapeFailures);
  const listingStreamReady = normalizeHighlights(reviewFlags.listingStreamReady || reviewFlags.readyFields || reviewFlags.readyForListingStream);
  return {
    autoFilled: autoFilled.length ? autoFilled : inferAutoFilledFields(structuredUpdates),
    needsManualInput,
    failedScrapes,
    listingStreamReady: listingStreamReady.length ? listingStreamReady : inferListingStreamReadyFields(structuredUpdates),
  };
}

function inferAutoFilledFields(structuredUpdates: Record<string, unknown>) {
  const fields: string[] = [];
  if (structuredUpdates.property) fields.push("Property facts");
  if (structuredUpdates.pricing) fields.push("Pricing / availability");
  if (structuredUpdates.content) fields.push("Marketing copy");
  if (structuredUpdates.locationIntelligence) fields.push("Location intelligence");
  return fields;
}

function inferListingStreamReadyFields(structuredUpdates: Record<string, unknown>) {
  const fields = ["Broker review draft", "Premium marketing copy"];
  if (structuredUpdates.content) fields.push("Listing content payload");
  if (structuredUpdates.pricing) fields.push("Pricing payload");
  if (structuredUpdates.property) fields.push("Property facts payload");
  return fields;
}

function deepMergeRecords(...records: Record<string, unknown>[]) {
  const output: Record<string, unknown> = {};
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      const existing = output[key];
      if (normalizeRecord(existing) === existing && normalizeRecord(value) === value) {
        output[key] = deepMergeRecords(existing as Record<string, unknown>, value as Record<string, unknown>);
      } else {
        output[key] = value;
      }
    }
  }
  return output;
}

function suiteKey(value: unknown) {
  const record = normalizeRecord(value);
  return asString(record.suiteNumber || record.suite || record.name).toLowerCase();
}

function instructionAllowsSuiteOmission(instructions: string) {
  return /\b(?:remove|delete|drop|clear)\s+(?:all\s+)?suites?\b/i.test(instructions)
    || /\bsuite\s+[A-Za-z0-9-]+\s+(?:is\s+)?(?:leased|removed|deleted|dropped)\b/i.test(instructions)
    || /\b(?:remove|delete|drop)\s+suite\s+[A-Za-z0-9-]+\b/i.test(instructions);
}

function mergePartialSuiteUpdates(currentListing: Record<string, unknown>, updates: Record<string, unknown>, instructions: string) {
  if (instructionAllowsSuiteOmission(instructions)) return updates;

  const updateAdmin = normalizeRecord(updates.admin);
  const updateSuites = updateAdmin.suites;
  if (!Array.isArray(updateSuites) || updateSuites.length === 0) return updates;

  const currentAdmin = normalizeRecord(currentListing.admin);
  const currentSuites = Array.isArray(currentAdmin.suites) ? currentAdmin.suites : [];
  if (!currentSuites.length) return updates;

  const remainingAdditions: unknown[] = [];
  const mergedSuites = currentSuites.map((currentSuite) => {
    const currentKey = suiteKey(currentSuite);
    const updateIndex = updateSuites.findIndex((suite) => currentKey && suiteKey(suite) === currentKey);
    if (updateIndex === -1) return currentSuite;
    const [suiteUpdate] = updateSuites.splice(updateIndex, 1);
    return deepMergeRecords(normalizeRecord(currentSuite), normalizeRecord(suiteUpdate));
  });

  for (const suiteUpdate of updateSuites) {
    if (suiteKey(suiteUpdate)) remainingAdditions.push(suiteUpdate);
  }

  return deepMergeRecords(updates, {
    admin: {
      suites: [...mergedSuites, ...remainingAdditions],
    },
  });
}

function pickDeltaPreviewFields(property: Record<string, unknown>) {
  const preview: Record<string, unknown> = {};
  for (const key of [
    "status",
    "listingStatus",
    "availabilityStatus",
    "transactionStatus",
    "dealStatus",
    "statusBadgeLabel",
    "statusLabel",
    "underContract",
    "leased",
    "sold",
    "visibility",
    "pricing",
    "property",
    "content",
    "admin",
  ]) {
    if (property[key] !== undefined) preview[key] = property[key];
  }
  return preview;
}

function applyStructuredUpdates(property: Record<string, unknown>, updates: Record<string, unknown>) {
  return deepMergeRecords(property, updates);
}

function buildDeltaPreview(currentListing: Record<string, unknown>, updates: Record<string, unknown>): PropertyPortalDeltaPreview {
  return {
    before: pickDeltaPreviewFields(currentListing),
    after: pickDeltaPreviewFields(applyStructuredUpdates(currentListing, updates)),
  };
}

export function buildBrokerReviewState(input: {
  kind: BrokerReviewDraft["kind"];
  sourceInput: Record<string, unknown>;
  writerResult: PropertyPortalAiWriterResult;
  currentListing?: Record<string, unknown>;
  revisionCount?: number;
  feedbackHistory?: string[];
  checklist?: PropertyPortalReviewChecklist;
  interpreter?: BrokerEditInterpreterResult;
  deltaPreview?: PropertyPortalDeltaPreview;
}): BrokerReviewDraft {
  return {
    id: crypto.randomUUID(),
    kind: input.kind,
    status: "ready_for_broker_review",
    publishLive: false,
    sourceInput: input.sourceInput,
    currentListing: input.currentListing,
    review: {
      approved: false,
      revisionCount: input.revisionCount ?? 0,
      feedbackHistory: input.feedbackHistory ?? [],
      checklist: input.checklist ?? normalizeReviewChecklist(input.writerResult.structuredUpdates),
      interpreter: input.interpreter,
      deltaPreview: input.deltaPreview,
    },
    ...input.writerResult,
  };
}

export async function createNewListingReviewDraft(input: { input: Record<string, unknown>; writer?: PropertyPortalCloudWriter }) {
  const writer = input.writer ?? defaultPropertyPortalCloudWriter;
  const writerResult = await writer(buildNewListingEnrichmentPrompt(input.input));
  return buildBrokerReviewState({ kind: "new-listing", sourceInput: { ...input.input }, writerResult });
}

export async function fetchPropertyPortalListing(input: { propertyIdOrSlug: string; baseUrl?: string; fetchImpl?: PropertyPortalFetch }) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await withPropertyPortalTimeout(
    fetchImpl(buildPropertyPortalUrl(`/api/properties/${encodeURIComponent(input.propertyIdOrSlug)}`, input.baseUrl), {
      cache: "no-store",
    }),
    Number(process.env.PROPERTY_PORTAL_LISTING_FETCH_TIMEOUT_MS ?? 20_000),
    "ListingStream backend request timed out while fetching the current listing for AI drafting. Please try again shortly.",
  );
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(asString(data.error) || "Could not fetch property-portal listing.");
  return data;
}

export async function createModificationReviewDraft(input: {
  propertyIdOrSlug: string;
  instructions: string;
  baseUrl?: string;
  fetchImpl?: PropertyPortalFetch;
  writer?: PropertyPortalCloudWriter;
}) {
  const currentListing = await fetchPropertyPortalListing(input);
  const interpreter = interpretBrokerEditRequest(currentListing, input.instructions);
  const currentTitle = asString(currentListing.title) || asString((currentListing.content as Record<string, unknown> | undefined)?.saleTitle) || input.propertyIdOrSlug;

  if (interpreter.lifecycleAction) {
    const lifecycleLabel = interpreter.lifecycleAction === "archive" ? "Archive Listing" : "Delete Listing";
    const structuredUpdates = { ...interpreter.updatePayload };
    const deltaPreview = buildDeltaPreview(currentListing, structuredUpdates);
    return buildBrokerReviewState({
      kind: "modification",
      sourceInput: { propertyIdOrSlug: input.propertyIdOrSlug, instructions: input.instructions, lifecycleAction: interpreter.lifecycleAction },
      currentListing,
      writerResult: {
        title: `${lifecycleLabel}: ${currentTitle}`,
        descriptionHtml: `<p>${interpreter.summary.join(" ")}</p>`,
        highlights: interpreter.summary,
        structuredUpdates,
        mediaNotes: [],
      },
      interpreter,
      deltaPreview,
    });
  }

  const writer = input.writer ?? defaultPropertyPortalCloudWriter;
  const writerResult = await writer(buildModificationDeltaPrompt({ currentListing, instructions: input.instructions, interpreter }));
  const writerStructuredUpdates = mergePartialSuiteUpdates(currentListing, writerResult.structuredUpdates, input.instructions);
  const structuredUpdates = deepMergeRecords(writerStructuredUpdates, interpreter.updatePayload);
  const deltaPreview = buildDeltaPreview(currentListing, structuredUpdates);
  const safeWriterResult = {
    ...writerResult,
    title: /^(ai[- ]drafted listing review|ai draft ready for broker review)$/i.test(asString(writerResult.title)) ? currentTitle || writerResult.title : writerResult.title,
    structuredUpdates,
  };
  return buildBrokerReviewState({
    kind: "modification",
    sourceInput: { propertyIdOrSlug: input.propertyIdOrSlug, instructions: input.instructions },
    currentListing,
    writerResult: safeWriterResult,
    interpreter,
    deltaPreview,
  });
}

export async function reviseBrokerReviewDraft(input: { draft: BrokerReviewDraft; feedback: string; writer?: PropertyPortalCloudWriter }) {
  const writer = input.writer ?? defaultPropertyPortalCloudWriter;
  const writerResult = await writer(buildRevisionPrompt({ draft: input.draft, feedback: input.feedback }));
  return buildBrokerReviewState({
    kind: input.draft.kind,
    sourceInput: input.draft.sourceInput,
    currentListing: input.draft.currentListing,
    writerResult,
    revisionCount: input.draft.review.revisionCount + 1,
    feedbackHistory: [...input.draft.review.feedbackHistory, input.feedback],
  });
}
