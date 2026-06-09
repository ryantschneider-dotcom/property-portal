export type PropertyPortalFetch = typeof fetch;

export type MinimalListingIntakeInput = {
  address: string;
  basicSpecs: string;
  priceContext?: string;
  unpriced?: boolean;
  rawNotes: string;
};

export type MinimalListingIntakePayload = MinimalListingIntakeInput & {
  mode: "minimal-intake";
  reviewOnly: true;
  publishLive: false;
  requestedWorkflow: "cloud-writer-draft-review";
};

export type PropertyPortalActiveListing = {
  id: string;
  slug: string;
  title: string;
  address: string;
  transactionLabel?: string;
  ownerEmail?: string;
  reviewState?: string;
  missingFieldCount?: number;
  blockedIssueCount?: number;
  buildoutReady?: boolean;
  enrichmentStatus?: string;
  revisionWorkflow?: unknown;
  workflowStatus?: string;
  publishStatus?: string;
  previewUrl?: string;
};

export type PropertyPortalRequestOptions = {
  baseUrl?: string;
  fetchImpl?: PropertyPortalFetch;
};

export type PortalSubmissionResult = {
  ok?: boolean;
  success?: boolean;
  error?: string;
  workflowStatus?: string;
  draftId?: string;
  propertyId?: string;
  slug?: string;
  [key: string]: unknown;
};

export type PropertyPortalReviewDraftForApproval = {
  kind?: "new-listing" | "modification";
  title: string;
  descriptionHtml: string;
  highlights: string[];
  structuredUpdates: Record<string, unknown>;
  sourceInput?: Record<string, unknown>;
  currentListing?: Record<string, unknown>;
};

export type PropertyPortalApprovalResult = {
  media?: PortalSubmissionResult | null;
  save: PortalSubmissionResult;
  launch: PortalSubmissionResult;
  ascendix?: PortalSubmissionResult | null;
  previewUrl?: string | null;
};

export type PropertyPortalPublishMode = "draft-preview" | "publish-live";
export type PropertyPortalPropertyLifecycleAction = "archive" | "restore" | "delete";

const DEFAULT_LISTINGSTREAM_PORTAL_BASE_URL = "https://listingstream-portal.vercel.app";
const DEFAULT_PROPERTY_PORTAL_TIMEOUT_MS = 30_000;

export function createPropertyPortalProxyError(error: unknown, operation: string) {
  const message = error instanceof Error ? error.message : String(error ?? "unknown error");
  if (/timeout|timed out/i.test(message)) {
    return new Error(`ListingStream backend request timed out while handling ${operation}. Please try again shortly.`);
  }
  return new Error(`ListingStream backend is temporarily unreachable while handling ${operation}. Please try again shortly.`);
}

export function withPropertyPortalTimeout<T>(promise: Promise<T>, timeoutMs = DEFAULT_PROPERTY_PORTAL_TIMEOUT_MS, message = "ListingStream backend request timed out. Please try again shortly.") {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

export async function safePropertyPortalFetch(fetchImpl: PropertyPortalFetch, url: string, init: (RequestInit & { cache?: RequestCache }) | undefined, operation: string) {
  try {
    return await withPropertyPortalTimeout(fetchImpl(url, init), DEFAULT_PROPERTY_PORTAL_TIMEOUT_MS, `ListingStream backend request timed out while handling ${operation}. Please try again shortly.`);
  } catch (error) {
    throw createPropertyPortalProxyError(error, operation);
  }
}

function clean(value: string | undefined | null) {
  return String(value ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (isRecord(value)) return Object.values(value).some(hasMeaningfulValue);
  return true;
}

function deepMergeRecords(...records: Record<string, unknown>[]) {
  const output: Record<string, unknown> = {};
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (!hasMeaningfulValue(value)) continue;
      const existing = output[key];
      if (isRecord(existing) && isRecord(value)) output[key] = deepMergeRecords(existing, value);
      else output[key] = value;
    }
  }
  return output;
}

function isGenericReviewTitle(title: string) {
  return /^(ai[- ]drafted listing review|ai draft ready for broker review)$/i.test(clean(title));
}

function isNormalizerFallbackDescription(description: string) {
  return /the ai returned a partial draft/i.test(clean(description));
}

function isAbsoluteHttpUrl(value: unknown) {
  return typeof value === "string" && /^https?:\/\/[^\s]+$/i.test(value.trim());
}

function isRenderableImageUrl(value: unknown) {
  return isAbsoluteHttpUrl(value);
}

type BrokerProfilePayload = { name: string; title: string; company: string; email: string; phone: string; headshotUrl: string };

const RYAN_BROKER_PROFILE: BrokerProfilePayload = { name: "Ryan Schneider", title: "President", company: "PIER Commercial Real Estate", email: "ryan@piercommercial.com", phone: "(912) 239-6298", headshotUrl: "/brokers/4.jpg" };
const JOEL_BROKER_PROFILE: BrokerProfilePayload = { name: "Joel Boblasky", title: "Associate Broker", company: "PIER Commercial Real Estate", email: "joel@piercommercial.com", phone: "(912) 239-6299", headshotUrl: "/brokers/Joel-Formal-Photo-e1770779536472.jpg" };
const ANTHONY_BROKER_PROFILE: BrokerProfilePayload = { name: "Anthony Wagner", title: "Associate Broker", company: "PIER Commercial Real Estate", email: "anthony@piercommercial.com", phone: "(912) 239-6297", headshotUrl: "/brokers/6-e1770779064297.jpg" };

const BROKER_DIRECTORY: Record<string, BrokerProfilePayload> = {
  "ryan": RYAN_BROKER_PROFILE,
  "ryan schneider": RYAN_BROKER_PROFILE,
  "ryan t schneider": RYAN_BROKER_PROFILE,
  "joel": JOEL_BROKER_PROFILE,
  "joel boblasky": JOEL_BROKER_PROFILE,
  "anthony": ANTHONY_BROKER_PROFILE,
  "anthony wagner": ANTHONY_BROKER_PROFILE,
};

function normalizeBrokerKey(value: unknown) {
  return typeof value === "string" ? value.toLowerCase().replace(/[^a-z]+/g, " ").trim() : "";
}

function resolveBrokerProfile(...candidates: unknown[]): BrokerProfilePayload | (Record<string, unknown> & BrokerProfilePayload) | null {
  for (const candidate of candidates) {
    if (isRecord(candidate)) {
      const nested: BrokerProfilePayload | (Record<string, unknown> & BrokerProfilePayload) | null = resolveBrokerProfile(candidate.name, candidate.email);
      if (nested) return { ...candidate, ...nested } as Record<string, unknown> & BrokerProfilePayload;
    }
    const key = normalizeBrokerKey(candidate);
    if (key && BROKER_DIRECTORY[key]) return BROKER_DIRECTORY[key];
    if (typeof candidate === "string" && candidate.includes("@")) {
      const match = Object.values(BROKER_DIRECTORY).find((broker) => broker.email.toLowerCase() === candidate.toLowerCase().trim());
      if (match) return match;
    }
  }
  return null;
}

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (!text || /unpriced|inquire|call/.test(text)) return null;
  const match = text.match(/\$?\s*([\d,.]+(?:\.\d+)?)(\s*[mk])?/i);
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const suffix = match[2]?.trim().toLowerCase();
  if (suffix === "m") return parsed * 1_000_000;
  if (suffix === "k") return parsed * 1_000;
  return parsed;
}

function sourceString(source: Record<string, unknown>, key: string) {
  return clean(source[key] as string | undefined);
}

function buildPricingFromSourceInput(source: Record<string, unknown>) {
  const pricing: Record<string, unknown> = {};
  const visibility: Record<string, unknown> = {};
  const transactionType = sourceString(source, "transactionType").toLowerCase();
  const salePriceText = sourceString(source, "salePrice") || sourceString(source, "priceContext") || sourceString(source, "askingPrice");
  const salePrice = parsePositiveNumber(salePriceText);
  const saleUnpriced = source.saleUnpriced === true || source.unpriced === true || /unpriced|inquire|call/i.test(salePriceText);

  if (transactionType === "sale" || salePrice || source.salePrice !== undefined) {
    visibility.saleActive = true;
    visibility.leaseActive = false;
    if (salePrice) {
      pricing.salePriceDollars = salePrice;
      pricing.hideSalePrice = false;
      pricing.hiddenPriceLabel = null;
    } else if (saleUnpriced) {
      pricing.hideSalePrice = true;
      pricing.hiddenPriceLabel = "Call for Price";
    }
  }

  const suites = Array.isArray(source.suites) ? source.suites.filter(isRecord) : [];
  if (transactionType === "lease" || suites.length) {
    visibility.leaseActive = true;
    visibility.saleActive = false;
    const pricedSuite = suites.find((suite) => parsePositiveNumber(suite.baseRent) || parsePositiveNumber(suite.ratePerSf) || parsePositiveNumber(suite.askingRatePerSf));
    const leaseRate = parsePositiveNumber(pricedSuite?.baseRent) ?? parsePositiveNumber(pricedSuite?.ratePerSf) ?? parsePositiveNumber(pricedSuite?.askingRatePerSf) ?? parsePositiveNumber(sourceString(source, "priceContext"));
    if (leaseRate) {
      pricing.askingPriceRatePerSf = leaseRate;
      pricing.leaseRatePerSf = leaseRate;
      pricing.rateType = sourceString(pricedSuite ?? {}, "rentType") || "NNN";
      pricing.leaseRateUnit = /month|monthly/i.test(sourceString(pricedSuite ?? {}, "rentType") || sourceString(source, "priceContext")) ? "monthly" : "annual";
    } else if (suites.some((suite) => suite.unpriced === true || /unpriced|inquire|call/i.test(sourceString(suite, "baseRent")))) {
      pricing.hiddenPriceLabel = "Call for Rate";
    }
  }

  return { pricing, visibility };
}

function collectMediaUrls(value: unknown): string[] {
  if (typeof value === "string") return /\.(avif|gif|jpe?g|png|webp)(\?|#|$)/i.test(value.trim()) ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(collectMediaUrls);
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, nested]) => {
    if (/^(url|original|full|xlarge|large|medium|thumb|thumbnail|heroImageUrl|src)$/i.test(key)) return collectMediaUrls(nested);
    return isRecord(nested) || Array.isArray(nested) ? collectMediaUrls(nested) : [];
  });
}

function isValidMediaPayload(media: unknown) {
  if (!isRecord(media)) return false;
  const urls = collectMediaUrls(media);
  return urls.length > 0 && urls.every(isRenderableImageUrl);
}

function buildSlugFromTitle(title: string) {
  return clean(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function getApprovedPayloadStatus(updates: Record<string, unknown>, mode?: PropertyPortalPublishMode) {
  if (mode === "draft-preview") return "draft";
  const status = clean(updates.status as string | undefined).toLowerCase();
  return ["leased", "sold", "under_contract"].includes(status) ? status : "active";
}

export function buildPropertyPortalApprovedPayload(input: { draft: PropertyPortalReviewDraftForApproval; mode?: PropertyPortalPublishMode; slug?: string }) {
  const rawUpdates = isRecord(input.draft.structuredUpdates) ? input.draft.structuredUpdates : {};
  const existing = isRecord(input.draft.currentListing) ? input.draft.currentListing : {};
  const updates = { ...rawUpdates };
  if (input.draft.kind === "modification" && hasMeaningfulValue(updates.media) && !isValidMediaPayload(updates.media)) {
    delete updates.media;
  }
  const base = input.draft.kind === "modification" ? existing : {};
  const merged = deepMergeRecords(base, updates);
  const existingContent = isRecord(existing.content) ? existing.content : {};
  const updateContent = isRecord(updates.content) ? updates.content : {};
  const draftTitle = clean(input.draft.title);
  const existingTitle = clean(existing.title as string | undefined);
  const titleWasExplicitlyUpdated = hasMeaningfulValue(updates.title) || hasMeaningfulValue(updateContent.saleTitle);
  const finalTitle = input.draft.kind === "modification" && !titleWasExplicitlyUpdated
    ? existingTitle || draftTitle || clean(input.slug)
    : (isGenericReviewTitle(draftTitle) ? existingTitle || draftTitle : draftTitle || existingTitle);
  const finalContent = deepMergeRecords(existingContent, updateContent);
  const draftDescription = clean(input.draft.descriptionHtml);
  const safeDraftDescription = isNormalizerFallbackDescription(draftDescription) ? "" : draftDescription;
  if (input.draft.kind !== "modification" || hasMeaningfulValue(safeDraftDescription)) {
    finalContent.saleDescription = safeDraftDescription;
  }
  if (input.draft.kind !== "modification" || input.draft.highlights.length) {
    finalContent.saleBullets = input.draft.highlights;
  }
  if (input.draft.kind !== "modification" || titleWasExplicitlyUpdated) {
    finalContent.saleTitle = finalTitle;
  }

  const existingMedia = existing.media;
  const mergedMedia = merged.media;
  const updateMediaIsValid = isValidMediaPayload(updates.media);
  const brokerProfile = resolveBrokerProfile(
    updates.brokerProfile,
    updates.leadBroker,
    rawUpdates.broker,
    input.draft.sourceInput?.leadBroker,
    input.draft.sourceInput?.broker,
    existing.brokerProfile,
    existing.leadBroker,
  );
  const sourcePricing = buildPricingFromSourceInput(input.draft.sourceInput ?? {});
  const finalPricing = deepMergeRecords(
    isRecord(merged.pricing) ? merged.pricing : {},
    sourcePricing.pricing,
    isRecord(updates.pricing) ? updates.pricing : {},
  );
  const finalVisibility = deepMergeRecords(
    isRecord(merged.visibility) ? merged.visibility : {},
    sourcePricing.visibility,
    isRecord(updates.visibility) ? updates.visibility : {},
  );

  return {
    ...merged,
    slug: input.slug || clean(merged.slug as string | undefined) || clean(existing.slug as string | undefined) || undefined,
    title: finalTitle,
    leadBroker: brokerProfile?.name || clean(merged.leadBroker as string | undefined) || clean(existing.leadBroker as string | undefined) || undefined,
    ownerEmail: brokerProfile?.email || clean(merged.ownerEmail as string | undefined) || clean(existing.ownerEmail as string | undefined) || undefined,
    brokerProfile: brokerProfile ? deepMergeRecords(isRecord(merged.brokerProfile) ? merged.brokerProfile : {}, brokerProfile) : merged.brokerProfile,
    pricing: finalPricing,
    visibility: finalVisibility,
    transactionTypes: finalVisibility.saleActive === true ? ["sale"] : finalVisibility.leaseActive === true ? ["lease"] : merged.transactionTypes,
    status: getApprovedPayloadStatus(updates, input.mode),
    workflowStatus: input.mode === "draft-preview" ? "draft_preview" : "approved",
    content: finalContent,
    media: input.draft.kind === "modification" ? (updateMediaIsValid ? mergedMedia : existingMedia) : mergedMedia,
    meta: deepMergeRecords(isRecord(existing.meta) ? existing.meta : {}, isRecord(merged.meta) ? merged.meta : {}, {
      brokerReview: {
        approvedAt: input.mode === "draft-preview" ? null : new Date().toISOString(),
        draftPreviewSavedAt: input.mode === "draft-preview" ? new Date().toISOString() : null,
        source: "pier-manager-ai-review",
      },
      listingStream: {
        primaryCms: true,
        wordpressBypassed: true,
      },
    }),
  };
}

export function getPropertyPortalInternalHeaders(): Record<string, string> {
  const token = clean(process.env.PROPERTY_PORTAL_INTERNAL_TOKEN);
  return token ? { "x-pier-manager-internal": token } : {};
}

export function getPropertyPortalBaseUrl(explicitBaseUrl?: string) {
  // Mission Control's PIER Manager now talks to ListingStream exclusively.
  // Keep the legacy function name for compatibility, but do not let stale
  // PROPERTY_PORTAL_* Vercel env vars route active-listing search back to the
  // deprecated broker/property portal.
  return clean(explicitBaseUrl)
    || clean(process.env.LISTINGSTREAM_PORTAL_BASE_URL)
    || clean(process.env.NEXT_PUBLIC_LISTINGSTREAM_PORTAL_BASE_URL)
    || DEFAULT_LISTINGSTREAM_PORTAL_BASE_URL;
}

export function buildPropertyPortalUrl(path: string, explicitBaseUrl?: string) {
  const baseUrl = getPropertyPortalBaseUrl(explicitBaseUrl).replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export function buildPropertyPortalDraftPreviewPath(slug: string) {
  const cleaned = clean(slug).replace(/^\/+|\/+$/g, "");
  return cleaned ? `/preview/${encodeURIComponent(cleaned)}` : "/preview";
}

export function normalizePropertyPortalDraftPreviewUrl(rawPreviewUrl: string, explicitBaseUrl?: string) {
  const fallbackBase = getPropertyPortalBaseUrl(explicitBaseUrl).replace(/\/+$/, "");
  if (/^https?:\/\//i.test(rawPreviewUrl)) {
    const url = new URL(rawPreviewUrl);
    if (url.pathname.startsWith("/properties/")) {
      url.pathname = url.pathname.replace(/^\/properties\//, "/preview/");
    }
    return url.toString();
  }
  const normalizedPath = rawPreviewUrl.startsWith("/properties/") ? rawPreviewUrl.replace(/^\/properties\//, "/preview/") : rawPreviewUrl;
  return buildPropertyPortalUrl(normalizedPath, fallbackBase);
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  if (typeof Buffer !== "undefined") return Buffer.from(buffer).toString("base64");
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.byteLength; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

async function fileToDraftImageUrl(_file: File): Promise<string | null> {
  // Do not inline staged binary uploads as data URLs in ListingStream records.
  // Firestore caps each document at 1 MiB; even compressed intake images can
  // expand to multi-megabyte base64 strings and crash draft saves. Only durable
  // public URLs already present in the draft payload are allowed through the
  // media mapper until a real ListingStream storage upload endpoint is wired.
  return null;
}
async function buildStagedDraftMedia(assets: File[] | undefined) {
  const imageUrls = (await Promise.all((assets ?? []).map(fileToDraftImageUrl))).filter((url): url is string => Boolean(url));
  if (!imageUrls.length) return null;
  return {
    heroImageUrl: imageUrls[0],
    images: imageUrls.map((url, index) => ({
      id: `pier-manager-staged-${index + 1}`,
      title: index === 0 ? "Hero Photo" : `Photo ${index + 1}`,
      source: "pier-manager-staged-draft",
      urls: { original: url, full: url, large: url, thumb: url },
    })),
  };
}

export function getMinimalIntakeMissingFields(input: Partial<MinimalListingIntakeInput>) {
  const missing: string[] = [];
  if (!clean(input.address)) missing.push("address");
  if (!clean(input.basicSpecs)) missing.push("basicSpecs");
  if (!input.unpriced && !clean(input.priceContext)) missing.push("priceContext");
  if (!clean(input.rawNotes)) missing.push("rawNotes");
  return missing;
}

export function buildMinimalListingIntakePayload(input: MinimalListingIntakeInput): MinimalListingIntakePayload {
  const missing = getMinimalIntakeMissingFields(input);
  if (missing.length) {
    throw new Error(`Missing required minimal listing intake fields: ${missing.join(", ")}`);
  }

  return {
    mode: "minimal-intake",
    reviewOnly: true,
    publishLive: false,
    requestedWorkflow: "cloud-writer-draft-review",
    address: clean(input.address),
    basicSpecs: clean(input.basicSpecs),
    priceContext: input.unpriced ? "Unpriced / Inquire" : clean(input.priceContext),
    unpriced: Boolean(input.unpriced),
    rawNotes: clean(input.rawNotes),
  };
}

export function buildPortalFormData(input: { payload: Record<string, unknown>; assets?: File[] }) {
  const formData = new FormData();
  formData.set(
    "payload",
    JSON.stringify({
      reviewOnly: true,
      publishLive: false,
      ...input.payload,
    }),
  );
  for (const asset of input.assets ?? []) {
    formData.append("assets", asset);
  }
  return formData;
}

async function parsePortalResponse(response: Response): Promise<PortalSubmissionResult> {
  const data = (await response.json().catch(() => ({}))) as PortalSubmissionResult;
  if (!response.ok) {
    throw new Error(String(data.error ?? `Property portal request failed with status ${response.status}`));
  }
  return data;
}

export async function submitPropertyPortalMinimalListingIntake(input: PropertyPortalRequestOptions & MinimalListingIntakeInput & { assets?: File[] }) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const payload = buildMinimalListingIntakePayload(input);
  const response = await fetchImpl(buildPropertyPortalUrl("/api/broker/intake", input.baseUrl), {
    method: "POST",
    headers: getPropertyPortalInternalHeaders(),
    body: buildPortalFormData({ payload, assets: input.assets }),
  });
  return parsePortalResponse(response);
}

export async function fetchPropertyPortalActiveListings(options: PropertyPortalRequestOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(buildPropertyPortalUrl("/api/broker/active-listings", options.baseUrl), {
    cache: "no-store",
    headers: getPropertyPortalInternalHeaders(),
  });
  const data = await parsePortalResponse(response);
  return (Array.isArray(data.items) ? data.items : []) as PropertyPortalActiveListing[];
}

export async function submitPropertyPortalListingModification(input: PropertyPortalRequestOptions & { propertyId: string; instructions: string; assets?: File[] }) {
  const propertyId = clean(input.propertyId);
  const instructions = clean(input.instructions);
  if (!propertyId) throw new Error("Property is required for listing modification.");
  if (!instructions) throw new Error("Plain-text modification instructions are required.");

  const formData = new FormData();
  formData.set("propertyId", propertyId);
  formData.set("instructions", instructions);
  for (const asset of input.assets ?? []) {
    formData.append("assets", asset);
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(buildPropertyPortalUrl("/api/broker/revisions", input.baseUrl), {
    method: "POST",
    headers: getPropertyPortalInternalHeaders(),
    body: formData,
  });
  return parsePortalResponse(response);
}

export async function approvePropertyPortalReviewDraft(input: PropertyPortalRequestOptions & { draft: PropertyPortalReviewDraftForApproval; assets?: File[]; mode?: PropertyPortalPublishMode }): Promise<PropertyPortalApprovalResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const source = input.draft.sourceInput ?? {};
  const slug = clean(source.slug as string | undefined) || clean(source.propertyIdOrSlug as string | undefined) || clean(input.draft.structuredUpdates.slug as string | undefined);
  const lifecycle = isRecord(input.draft.structuredUpdates.lifecycle) ? input.draft.structuredUpdates.lifecycle : {};
  const lifecycleAction = clean(lifecycle.action as string | undefined);
  if (input.draft.kind === "modification" && ["archive", "delete"].includes(lifecycleAction)) {
    const lifecycleResult = await changePropertyPortalPropertyLifecycle({
      baseUrl: input.baseUrl,
      fetchImpl,
      propertyIdOrSlug: slug,
      action: lifecycleAction as "archive" | "delete",
    });
    return {
      media: null,
      save: lifecycleResult,
      launch: lifecycleResult,
      ascendix: null,
      previewUrl: null,
    };
  }
  let mediaResult: PortalSubmissionResult | null = null;
  const stagedAssetCount = input.assets?.length ?? 0;
  const legacyMediaUploadAssets = process.env.LISTINGSTREAM_ENABLE_LEGACY_MEDIA_UPLOAD === "1" ? (input.assets ?? []) : [];

  // ListingStream production does not expose the legacy /api/broker/intake or
  // /api/broker/revisions media-upload endpoints. Save/publish must therefore
  // go straight through the launch-package endpoint; otherwise draft preview
  // fails with a downstream 404 before ListingStream can save the draft.
  if (legacyMediaUploadAssets.length) {
    if (input.draft.kind === "new-listing") {
      const intakePayload = buildMinimalListingIntakePayload({
        address: clean(source.address as string | undefined) || input.draft.title,
        basicSpecs: clean(source.basicSpecs as string | undefined) || "AI-approved listing draft",
        priceContext: clean(source.priceContext as string | undefined) || "Unpriced / Inquire",
        unpriced: Boolean(source.unpriced),
        rawNotes: clean(source.rawNotes as string | undefined) || input.draft.descriptionHtml,
      });
      const intakeResponse = await safePropertyPortalFetch(
        fetchImpl,
        buildPropertyPortalUrl("/api/broker/intake", input.baseUrl),
        { method: "POST", headers: getPropertyPortalInternalHeaders(), body: buildPortalFormData({ payload: { ...intakePayload, aiApprovedDraft: input.draft }, assets: legacyMediaUploadAssets }) },
        "new listing media upload",
      );
      mediaResult = await parsePortalResponse(intakeResponse);
    } else {
      const revisionFormData = new FormData();
      revisionFormData.set("propertyId", slug || clean(source.propertyId as string | undefined));
      revisionFormData.set("instructions", clean(source.instructions as string | undefined) || "Broker-approved AI delta with supporting media.");
      revisionFormData.set("draft", JSON.stringify(input.draft));
      for (const asset of legacyMediaUploadAssets) revisionFormData.append("assets", asset);
      const revisionResponse = await safePropertyPortalFetch(
        fetchImpl,
        buildPropertyPortalUrl("/api/broker/revisions", input.baseUrl),
        { method: "POST", headers: getPropertyPortalInternalHeaders(), body: revisionFormData },
        "modification media upload",
      );
      mediaResult = await parsePortalResponse(revisionResponse);
    }
  }

  const mediaSlug = clean(mediaResult?.slug);
  const saveSlug = mediaSlug || slug;
  const savePayload = buildPropertyPortalApprovedPayload({ draft: input.draft, mode: input.mode, slug: saveSlug });
  const stagedMedia = await buildStagedDraftMedia(input.assets);
  if (stagedMedia) {
    savePayload.media = deepMergeRecords(
      isRecord(savePayload.media) ? savePayload.media : {},
      { heroImageUrl: stagedMedia.heroImageUrl, heroPhoto: stagedMedia.heroImageUrl, photos: stagedMedia.images.map((image) => image.urls.original), images: stagedMedia.images },
    );
  }
  if (isRecord(savePayload.meta)) {
    savePayload.meta = deepMergeRecords(savePayload.meta, { brokerReview: { mediaUploadResult: mediaResult, stagedAssetCount, stagedImageCount: stagedMedia?.images.length ?? 0 } });
  }

  const approvedSlug = saveSlug || clean(savePayload.slug as string | undefined) || buildSlugFromTitle(clean(savePayload.title as string | undefined));
  const launchResponse = await safePropertyPortalFetch(fetchImpl, buildPropertyPortalUrl("/api/admin/properties/launch-package", input.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getPropertyPortalInternalHeaders(),
    },
    body: JSON.stringify({
      slug: approvedSlug,
      actorEmail: "pier-manager@piercommercial.com",
      action: input.mode === "draft-preview" ? "save-draft" : "publish-live",
      note: input.mode === "draft-preview" ? "Saved as draft preview from PIER Manager broker review loop. Ascendix intentionally bypassed." : "Approved live from PIER Manager broker review loop.",
      approvedPayload: { ...savePayload, slug: approvedSlug },
    }),
  }, "ListingStream launch-package publish and Ascendix sync");
  const launchResult = await parsePortalResponse(launchResponse);
  const saveResult = ((launchResult.save as PortalSubmissionResult | undefined) ?? { success: true, slug: approvedSlug, directLaunchPackageSave: true }) as PortalSubmissionResult;
  const resultPayload = (launchResult.result && typeof launchResult.result === "object" ? launchResult.result : {}) as PortalSubmissionResult;
  const rawPreviewUrl = typeof resultPayload.previewUrl === "string" ? resultPayload.previewUrl : buildPropertyPortalDraftPreviewPath(approvedSlug);
  const previewUrl = normalizePropertyPortalDraftPreviewUrl(rawPreviewUrl, input.baseUrl);
  return { media: mediaResult, save: saveResult, launch: launchResult, ascendix: (launchResult.sync as PortalSubmissionResult | undefined) ?? null, previewUrl };
}

export async function changePropertyPortalDraftLifecycle(input: PropertyPortalRequestOptions & { propertyIdOrSlug: string; action: "delete-draft" | "make-live" }) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const propertyIdOrSlug = clean(input.propertyIdOrSlug);
  if (!propertyIdOrSlug) throw new Error("Draft property is required.");
  const response = await safePropertyPortalFetch(fetchImpl, buildPropertyPortalUrl("/api/admin/properties/launch-package", input.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getPropertyPortalInternalHeaders(),
    },
    body: JSON.stringify({
      action: input.action,
      slug: propertyIdOrSlug,
      actorEmail: "pier-manager@piercommercial.com",
    }),
  }, input.action === "make-live" ? "make draft live and Ascendix sync" : "delete ListingStream draft");
  return parsePortalResponse(response);
}

export async function changePropertyPortalPropertyLifecycle(input: PropertyPortalRequestOptions & { propertyIdOrSlug: string; action: PropertyPortalPropertyLifecycleAction }) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const propertyIdOrSlug = clean(input.propertyIdOrSlug);
  if (!propertyIdOrSlug) throw new Error("Property is required for lifecycle action.");
  const response = await safePropertyPortalFetch(fetchImpl, buildPropertyPortalUrl("/api/admin/properties/lifecycle", input.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getPropertyPortalInternalHeaders(),
    },
    body: JSON.stringify({
      slug: propertyIdOrSlug,
      action: input.action,
    }),
  }, `${input.action} property lifecycle`);
  return parsePortalResponse(response);
}
