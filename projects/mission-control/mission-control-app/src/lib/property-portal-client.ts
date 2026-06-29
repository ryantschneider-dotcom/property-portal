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
  propertyType?: string;
  propertyTypeLabel?: string;
  category?: string;
  type?: string;
  listingType?: string;
  ownerEmail?: string;
  reviewState?: string;
  missingFieldCount?: number;
  blockedIssueCount?: number;
  buildoutReady?: boolean;
  enrichmentStatus?: string;
  publicRecordEnrichment?: {
    status?: string;
    message?: string;
    countyPortal?: string;
    updatedAt?: string;
  };
  revisionWorkflow?: unknown;
  workflowStatus?: string;
  publishStatus?: string;
  previewUrl?: string;
  publicUrl?: string;
  offeringWebsiteUrl?: string;
  propertyWebsiteUrl?: string;
  links?: {
    offeringWebsiteUrl?: string;
    propertyWebsiteUrl?: string;
    [key: string]: unknown;
  };
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

export type StagedListingImageUpload = {
  url: string;
  path?: string;
  contentType?: string;
  size?: number;
  originalName?: string;
};

export type StagedListingImageUploader = (file: File, options: { slug?: string; index: number; draft: PropertyPortalReviewDraftForApproval }) => Promise<StagedListingImageUpload | null>;

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

function clean(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "[object Object]" ? "" : trimmed;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const a = value as Record<string, unknown>;
    const street = a.street ?? a.line1 ?? a.address1 ?? a.streetAddress;
    const city = a.city;
    const state = a.state;
    const zip = a.zip ?? a.zipCode ?? a.postalCode;
    return [street, city, state, zip]
      .map((v) => (v == null ? "" : String(v).trim()))
      .filter((v) => Boolean(v && v !== "[object Object]"))
      .join(", ");
  }
  const trimmed = String(value).trim();
  return trimmed === "[object Object]" ? "" : trimmed;
}

function parseCoordinate(value: unknown) {
  if (typeof value !== "number" && !clean(value)) return null;
  const parsed = typeof value === "number" ? value : Number(clean(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function composeListingAddress(...records: Array<Record<string, unknown> | undefined>) {
  for (const record of records) {
    if (!record) continue;
    const address = clean(record.address);
    if (address) return address;
  }

  for (const record of records) {
    if (!record) continue;
    const street = clean(record.addressStreet) || clean(record.streetAddress) || clean(record.street);
    const city = clean(record.city);
    const state = clean(record.state);
    const zip = clean(record.zip) || clean(record.zipCode) || clean(record.postalCode);
    const composed = [street, city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (street && (city || state || zip)) return composed;
  }

  return "";
}

const DANGEROUS_TRANSIT_PAYLOAD_KEYS = new Set([
  "arrayBuffer",
  "base64",
  "blob",
  "buffer",
  "bytes",
  "data",
  "file",
  "fileData",
  "fileObject",
  "localPath",
  "raw",
  "rawFile",
  "uploadPayload",
]);

function isSafePublicTransitUrl(value: unknown) {
  if (typeof value !== "string") return false;
  const url = value.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(url)) return false;
  if (/^https?:\/\/firebase\.storage\.url\//i.test(url)) return false;
  if (/^https?:\/\/storage\.cloud\.google\.com\//i.test(url)) return false;
  if (/^(?:gs|data|blob):/i.test(url)) return false;
  return true;
}

function normalizeTransitAssetUrls(value: unknown) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(new Set(items.map(extractAssetUrl).filter((url): url is string => Boolean(url && isSafePublicTransitUrl(url)))));
}

export function sanitizeListingStreamJsonTransitPayload(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return /^(?:gs|data|blob):/i.test(trimmed) ? undefined : value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const sanitizedItems = value.map(sanitizeListingStreamJsonTransitPayload).filter((item) => item !== undefined);
    return sanitizedItems;
  }
  if (!isRecord(value)) return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (DANGEROUS_TRANSIT_PAYLOAD_KEYS.has(key)) continue;
    if (/^(suiteFloorPlans|suitePhotos)$/i.test(key)) {
      const urls = normalizeTransitAssetUrls(nested);
      output[key] = urls;
      continue;
    }
    const sanitized = sanitizeListingStreamJsonTransitPayload(nested);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (isRecord(value)) return Object.values(value).some(hasMeaningfulValue);
  return true;
}

function shouldApplyMergedValue(path: string[], value: unknown) {
  if (value === undefined) return false;
  if (Array.isArray(value)) return true;
  if (value === null) return path.includes("links") || path.includes("documents") || path.includes("attachments") || path.includes("media");
  if (typeof value === "string") return value.trim().length > 0 || path.includes("links");
  if (isRecord(value)) return true;
  return hasMeaningfulValue(value);
}

function deepMergeRecordList(records: Record<string, unknown>[], path: string[] = []) {
  const output: Record<string, unknown> = {};
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      const nextPath = [...path, key];
      if (!shouldApplyMergedValue(nextPath, value)) continue;
      const existing = output[key];
      if (isRecord(existing) && isRecord(value)) output[key] = deepMergeRecordList([existing, value], nextPath);
      else output[key] = value;
    }
  }
  return output;
}

function deepMergeRecords(...records: Record<string, unknown>[]) {
  return deepMergeRecordList(records);
}

function isGenericReviewTitle(title: string) {
  return /^(ai[- ]drafted listing review|ai draft ready for broker review)$/i.test(clean(title));
}

function isNormalizerFallbackDescription(description: string) {
  const text = clean(description);
  return /the ai returned a partial draft/i.test(text) || /^<?p?>?\s*property details coming soon\.?\s*(?:<\/p>)?$/i.test(text);
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

function readSuitesFromRecord(value: Record<string, unknown>) {
  const directSuites = Array.isArray(value.suites) ? value.suites.filter(isRecord) : [];
  const admin = isRecord(value.admin) ? value.admin : {};
  const adminSuites = Array.isArray(admin.suites) ? admin.suites.filter(isRecord) : [];
  return adminSuites.length || Array.isArray(admin.suites) ? adminSuites : directSuites;
}

function suiteRentUnit(suite: Record<string, unknown>, fallback = "") {
  const rentType = sourceString(suite, "rentType") || sourceString(suite, "leaseType") || fallback;
  return /month|monthly|\/mo|\/month/i.test(rentType) ? "monthly" : "annual";
}

function normalizeSuitePricingFields(suite: Record<string, unknown>) {
  const rentType = sourceString(suite, "rentType") || sourceString(suite, "leaseType");
  const rate = parsePositiveNumber(suite.baseRent) ?? parsePositiveNumber(suite.ratePerSf) ?? parsePositiveNumber(suite.askingRatePerSf) ?? parsePositiveNumber(suite.askingPriceRatePerSf);
  if (!rate) return suite;
  if (suiteRentUnit(suite) === "monthly") {
    return { ...suite, monthlyRate: rate, monthlyBaseRent: rate, rentType };
  }
  return { ...suite, baseRent: rate, ratePerSf: rate, askingRatePerSf: rate, askingPriceRatePerSf: rate, rentType };
}

function buildLeasePricingFromSuites(suites: Record<string, unknown>[], fallbackRateText = "") {
  const pricing: Record<string, unknown> = {};
  const pricedSuite = suites.find((suite) => parsePositiveNumber(suite.baseRent) || parsePositiveNumber(suite.ratePerSf) || parsePositiveNumber(suite.askingRatePerSf) || parsePositiveNumber(suite.monthlyRate));
  const leaseRate = parsePositiveNumber(pricedSuite?.baseRent) ?? parsePositiveNumber(pricedSuite?.ratePerSf) ?? parsePositiveNumber(pricedSuite?.askingRatePerSf) ?? parsePositiveNumber(fallbackRateText);
  const monthlyRate = parsePositiveNumber(pricedSuite?.monthlyRate) ?? parsePositiveNumber(pricedSuite?.monthlyRent);
  const unit = pricedSuite ? suiteRentUnit(pricedSuite, fallbackRateText) : (/month|monthly/i.test(fallbackRateText) ? "monthly" : "annual");
  if (unit === "monthly" && (monthlyRate || leaseRate)) {
    const value = monthlyRate ?? leaseRate;
    pricing.monthlyRate = value;
    pricing.monthlyRent = value;
    pricing.leaseRate = value;
    pricing.rateType = sourceString(pricedSuite ?? {}, "rentType") || "Monthly";
    pricing.leaseRateUnit = "monthly";
  } else if (leaseRate) {
    pricing.askingPriceRatePerSf = leaseRate;
    pricing.leaseRatePerSf = leaseRate;
    pricing.ratePerSf = leaseRate;
    pricing.rateType = sourceString(pricedSuite ?? {}, "rentType") || "NNN";
    pricing.leaseRateUnit = "annual";
  } else if (suites.some((suite) => suite.unpriced === true || /unpriced|inquire|call/i.test(sourceString(suite, "baseRent")))) {
    pricing.hiddenPriceLabel = "Call for Rate";
  }
  return pricing;
}

function suitePricingHasNumericRate(pricing: Record<string, unknown>) {
  return parsePositiveNumber(pricing.leaseRate)
    || parsePositiveNumber(pricing.monthlyRate)
    || parsePositiveNumber(pricing.monthlyRent)
    || parsePositiveNumber(pricing.askingPriceRatePerSf)
    || parsePositiveNumber(pricing.leaseRatePerSf)
    || parsePositiveNumber(pricing.ratePerSf);
}

function shouldApplySuitePricing(pricing: Record<string, unknown>, existingPricing: Record<string, unknown>) {
  if (suitePricingHasNumericRate(pricing)) return true;
  if (!hasMeaningfulValue(existingPricing)) return hasMeaningfulValue(pricing);
  return false;
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

  const suites = readSuitesFromRecord(source).map(normalizeSuitePricingFields);
  if (transactionType === "lease" || suites.length) {
    visibility.leaseActive = true;
    visibility.saleActive = false;
    Object.assign(pricing, buildLeasePricingFromSuites(suites, sourceString(source, "priceContext")));
  }

  return { pricing, visibility, suites };
}

function collectMediaUrls(value: unknown): string[] {
  if (typeof value === "string") return /\.(avif|gif|jpe?g|png|webp)(\?|#|$)/i.test(value.trim()) ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(collectMediaUrls);
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, nested]) => {
    if (/^(url|original|full|xlarge|large|medium|thumb|thumbnail|heroImageUrl|heroImage|heroPhoto|photoUrl|src)$/i.test(key)) return collectMediaUrls(nested);
    return isRecord(nested) || Array.isArray(nested) ? collectMediaUrls(nested) : [];
  });
}

function isValidMediaPayload(media: unknown) {
  if (!isRecord(media)) return false;
  const urls = collectMediaUrls(media);
  return urls.length > 0 && urls.every(isRenderableImageUrl);
}

function extractAssetUrl(value: unknown): string | null {
  if (typeof value === "string") return clean(value);
  if (!isRecord(value)) return null;
  return clean(value.url as string | undefined) || clean(value.href as string | undefined) || clean(value.downloadUrl as string | undefined) || clean(value.downloadURL as string | undefined) || clean(value.publicUrl as string | undefined) || clean(value.publicURL as string | undefined) || clean(value.src as string | undefined) || null;
}

function isExternalAssetUrl(value: unknown) {
  const url = extractAssetUrl(value);
  if (!url || !/^https?:\/\/[^\s]+$/i.test(url)) return false;
  if (/^https?:\/\/firebase\.storage\.url\//i.test(url)) return false;
  if (/^https?:\/\/storage\.cloud\.google\.com\//i.test(url)) return false;
  if (/^gs:\/\//i.test(url)) return false;
  return true;
}

function normalizeExternalAssetUrls(value: unknown) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.map(extractAssetUrl).filter((url): url is string => Boolean(url && isExternalAssetUrl(url)));
}

function buildSlugFromTitle(title: string) {
  return clean(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function getApprovedPayloadStatus(updates: Record<string, unknown>, mode?: PropertyPortalPublishMode) {
  if (mode === "draft-preview") return "draft";
  const status = clean(updates.status as string | undefined).toLowerCase();
  return ["leased", "sold", "under_contract"].includes(status) ? status : "active";
}

function resolvePropertyUseFields(merged: Record<string, unknown>, existing: Record<string, unknown>, updates: Record<string, unknown>) {
  const mergedProperty = isRecord(merged.property) ? merged.property : {};
  const existingProperty = isRecord(existing.property) ? existing.property : {};
  const updateProperty = isRecord(updates.property) ? updates.property : {};
  const propertyType = clean(updates.propertyType as string | undefined)
    || clean(updateProperty.propertyType as string | undefined)
    || clean(updateProperty.type as string | undefined)
    || clean(merged.propertyType as string | undefined)
    || clean(mergedProperty.propertyType as string | undefined)
    || clean(mergedProperty.type as string | undefined)
    || clean(existing.propertyType as string | undefined)
    || clean(existingProperty.propertyType as string | undefined)
    || clean(existingProperty.type as string | undefined)
    || undefined;
  const category = clean(updates.category as string | undefined)
    || clean(updateProperty.category as string | undefined)
    || clean(merged.category as string | undefined)
    || clean(mergedProperty.category as string | undefined)
    || clean(existing.category as string | undefined)
    || clean(existingProperty.category as string | undefined)
    || propertyType;
  return {
    propertyType,
    category,
    type: propertyType || clean(merged.type as string | undefined),
    listingType: propertyType || clean(merged.listingType as string | undefined),
    property: deepMergeRecords(mergedProperty, propertyType ? { propertyType, type: propertyType } : {}, category ? { category } : {}),
  };
}

export function buildPropertyPortalApprovedPayload(input: { draft: PropertyPortalReviewDraftForApproval; mode?: PropertyPortalPublishMode; slug?: string }) {
  const rawUpdates = isRecord(input.draft.structuredUpdates) ? input.draft.structuredUpdates : {};
  const existing = isRecord(input.draft.currentListing) ? input.draft.currentListing : {};
  const updates = { ...rawUpdates };
  if (input.draft.kind === "new-listing") {
    // New Broker Hub intake should follow the legacy ListingStream path: submit a
    // single geocodeable address and let ListingStream populate coordinates. The
    // enrichment model may return parcel/placeholder coordinates, but those can
    // override geocoding and drop the public map on the wrong tract.
    delete updates.location;
  }
  if (input.draft.kind === "modification" && hasMeaningfulValue(updates.media) && !isValidMediaPayload(updates.media)) {
    delete updates.media;
  }
  if (input.draft.kind === "modification" && isRecord(updates.admin) && Array.isArray((updates.admin as Record<string, unknown>).suites)) {
    // Suite-specific revisions must never let AI/user descriptive media text replace
    // the parent listing hero/photos. Durable suite uploads are mapped below into
    // admin.suites[].suitePhotos/suiteFloorPlans exclusively.
    delete updates.photos;
    if (isRecord(updates.media) && !isValidMediaPayload(updates.media)) delete updates.media;
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
  const propertyNarrative = clean(updateContent.propertyDescription)
    || clean(updateContent.saleDescription)
    || clean(updateContent.leaseDescription)
    || clean(updateContent.descriptionHtml)
    || clean(updates.propertyDescription)
    || clean(updates.saleDescription as string | undefined)
    || clean(updates.leaseDescription as string | undefined)
    || clean(updates.descriptionHtml as string | undefined)
    || clean(updates.description as string | undefined);
  if (propertyNarrative) {
    finalContent.propertyDescription = propertyNarrative;
    finalContent.saleDescription = propertyNarrative;
    finalContent.descriptionHtml = propertyNarrative;
    finalContent.description = propertyNarrative;
  }
  const structuredDescriptionWasExplicitlyUpdated = hasMeaningfulValue(updateContent.propertyDescription)
    || hasMeaningfulValue(updateContent.saleDescription)
    || hasMeaningfulValue(updateContent.leaseDescription)
    || hasMeaningfulValue(updateContent.locationDescription)
    || hasMeaningfulValue(updateContent.neighborhoodDescription)
    || hasMeaningfulValue(updateContent.marketContext)
    || hasMeaningfulValue(updates.propertyDescription)
    || hasMeaningfulValue(updates.saleDescription)
    || hasMeaningfulValue(updates.leaseDescription)
    || hasMeaningfulValue(updates.descriptionHtml)
    || hasMeaningfulValue(updates.description);
  const draftDescription = clean(input.draft.descriptionHtml);
  const safeDraftDescription = isNormalizerFallbackDescription(draftDescription) ? "" : draftDescription;
  // Legacy/new-listing drafts may only have descriptionHtml. Structured research
  // drafts now carry distinct narratives, so never let the legacy fallback overwrite
  // property/location/neighborhood/market fields that Claude wrote separately.
  if (hasMeaningfulValue(safeDraftDescription) && !hasMeaningfulValue(propertyNarrative)) {
    finalContent.propertyDescription = safeDraftDescription;
    finalContent.saleDescription = safeDraftDescription;
    finalContent.leaseDescription = safeDraftDescription;
    finalContent.descriptionHtml = safeDraftDescription;
    finalContent.description = safeDraftDescription;
  } else if (input.draft.kind !== "modification" || structuredDescriptionWasExplicitlyUpdated) {
    if (hasMeaningfulValue(propertyNarrative)) {
      finalContent.saleDescription = propertyNarrative;
      finalContent.descriptionHtml = propertyNarrative;
      finalContent.description = propertyNarrative;
      if (!hasMeaningfulValue(finalContent.leaseDescription)) finalContent.leaseDescription = propertyNarrative;
    }
  }
  const structuredBulletsWereExplicitlyUpdated = hasMeaningfulValue(updateContent.saleBullets)
    || hasMeaningfulValue(updateContent.leaseBullets)
    || hasMeaningfulValue(updates.saleBullets)
    || hasMeaningfulValue(updates.leaseBullets);
  if (input.draft.kind !== "modification" || structuredBulletsWereExplicitlyUpdated) {
    finalContent.saleBullets = input.draft.highlights.length ? input.draft.highlights : (Array.isArray(updateContent.saleBullets) ? updateContent.saleBullets : finalContent.saleBullets);
  }
  if (input.draft.kind !== "modification" || titleWasExplicitlyUpdated) {
    finalContent.saleTitle = finalTitle;
  }

  const OFFERING_ONLY_CONTENT_DEFAULTS: Record<string, unknown> = {
    marketContext: "",
    structuredFacts: {},
    nearbyAnchors: [],
    dealDrivers: [],
    developmentConstraints: {},
  };
  // ListingStream public listing pages are intentionally simpler than separate
  // generated offering websites. Keep research/diligence sections in broker
  // review meta, not in the live listing form. Because ListingStream publishes
  // through Firestore set(..., { merge: true }), omissions do not clear old
  // nested content keys; write empty values so stale OM sections are actually
  // removed from the live public record.
  Object.assign(finalContent, OFFERING_ONLY_CONTENT_DEFAULTS);
  if (merged.visibility && isRecord(merged.visibility) && (merged.visibility as Record<string, unknown>).leaseActive === true) {
    finalContent.saleDescription = "";
    if (!hasMeaningfulValue(finalContent.leaseDescription) && hasMeaningfulValue(finalContent.propertyDescription)) {
      finalContent.leaseDescription = finalContent.propertyDescription;
    }
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
  const finalAdmin = isRecord(merged.admin) ? { ...merged.admin } : undefined;
  const finalAdminSuites = finalAdmin && Array.isArray(finalAdmin.suites)
    ? finalAdmin.suites.filter(isRecord).map(normalizeSuitePricingFields)
    : null;
  if (finalAdmin && finalAdminSuites) finalAdmin.suites = finalAdminSuites;
  const suitePricing = finalAdminSuites ? buildLeasePricingFromSuites(finalAdminSuites) : {};
  const existingPricingForSuiteGuard = isRecord(merged.pricing) ? merged.pricing : {};
  const finalPricing = deepMergeRecords(
    existingPricingForSuiteGuard,
    sourcePricing.pricing,
    isRecord(updates.pricing) ? updates.pricing : {},
    shouldApplySuitePricing(suitePricing, existingPricingForSuiteGuard) ? suitePricing : {},
  );
  const finalVisibility = deepMergeRecords(
    isRecord(merged.visibility) ? merged.visibility : {},
    sourcePricing.visibility,
    finalAdminSuites ? { leaseActive: true, saleActive: false } : {},
    isRecord(updates.visibility) ? updates.visibility : {},
  );
  const propertyUseFields = resolvePropertyUseFields(merged, existing, updates);
  const canonicalAddress = composeListingAddress(
    updates,
    isRecord(updates.property) ? updates.property : undefined,
    input.draft.sourceInput,
    merged,
    isRecord(merged.property) ? merged.property : undefined,
    existing,
    isRecord(existing.property) ? existing.property : undefined,
  );
  const manualLatitude = parseCoordinate(input.draft.sourceInput?.latitude ?? input.draft.sourceInput?.manualLatitude);
  const manualLongitude = parseCoordinate(input.draft.sourceInput?.longitude ?? input.draft.sourceInput?.manualLongitude);
  const hasManualCoordinates = manualLatitude !== null && manualLongitude !== null && Math.abs(manualLatitude) <= 90 && Math.abs(manualLongitude) <= 180;
  const mergedLocation = isRecord(merged.location) ? merged.location : {};

  return {
    ...merged,
    ...propertyUseFields,
    slug: input.slug || clean(merged.slug as string | undefined) || clean(existing.slug as string | undefined) || undefined,
    title: finalTitle,
    ...(canonicalAddress ? { address: canonicalAddress } : {}),
    leadBroker: brokerProfile?.name || clean(merged.leadBroker as string | undefined) || clean(existing.leadBroker as string | undefined) || undefined,
    ownerEmail: brokerProfile?.email || clean(merged.ownerEmail as string | undefined) || clean(existing.ownerEmail as string | undefined) || undefined,
    brokerProfile: brokerProfile ? deepMergeRecords(isRecord(merged.brokerProfile) ? merged.brokerProfile : {}, brokerProfile) : merged.brokerProfile,
    ...(hasManualCoordinates ? {
      useManualCoordinates: true,
      manualLatitude,
      manualLongitude,
      manualCoordinates: { enabled: true, lat: manualLatitude, lng: manualLongitude, source: "pier-manager-intake" },
      location: { ...mergedLocation, lat: manualLatitude, lng: manualLongitude, source: "manual-intake-override" },
    } : {}),
    pricing: finalPricing,
    visibility: finalVisibility,
    transactionTypes: finalVisibility.saleActive === true ? ["sale"] : finalVisibility.leaseActive === true ? ["lease"] : merged.transactionTypes,
    status: getApprovedPayloadStatus(updates, input.mode),
    workflowStatus: input.mode === "draft-preview" ? "draft_preview" : "approved",
    content: finalContent,
    saleDescription: finalContent.saleDescription,
    leaseDescription: finalContent.leaseDescription || finalContent.saleDescription,
    descriptionHtml: finalContent.descriptionHtml || finalContent.saleDescription,
    description: finalContent.description || finalContent.saleDescription,
    media: input.draft.kind === "modification" ? (updateMediaIsValid ? { ...(isRecord(mergedMedia) ? mergedMedia : {}), replaceImages: true } : existingMedia) : mergedMedia,
    ...(finalAdmin ? { admin: finalAdmin } : {}),
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

async function fileToDraftImageUpload(file: File, options: { slug?: string; index: number; draft: PropertyPortalReviewDraftForApproval; uploadStagedImage?: StagedListingImageUploader }): Promise<StagedListingImageUpload | null> {
  // Remote main intentionally disables inline/base64 staged uploads because
  // Firestore documents cap at 1 MiB. Keep suite-aware mapping behind an
  // explicit durable upload adapter so dropped files never overwrite parent
  // hero media or get inlined into ListingStream records.
  if (!options.uploadStagedImage) return null;
  return options.uploadStagedImage(file, { slug: options.slug, index: options.index, draft: options.draft });
}

function isPdfUpload(upload: StagedListingImageUpload) {
  return /pdf/i.test(upload.contentType || "") || /\.pdf$/i.test(upload.originalName || "") || /\.pdf(?:\?|$)/i.test(upload.url);
}

function instructionsRequestFloorPlan(draft: PropertyPortalReviewDraftForApproval) {
  if (draft.kind !== "modification") return false;
  const instructions = clean(draft.sourceInput?.instructions as string | undefined);
  return /floor\s*plans?|site\s*plans?|plan\s*(?:image|photo|file)?/i.test(instructions);
}

function uploadLooksLikeFloorPlan(upload: StagedListingImageUpload, draft: PropertyPortalReviewDraftForApproval) {
  if (isPdfUpload(upload)) return true;
  const name = [upload.originalName, upload.path, upload.url].filter(Boolean).join(" ");
  const nameLooksLikeFloorPlan = /floor[-_\s]*plans?|site[-_\s]*plans?|plans?/i.test(name);
  const nameLooksLikePhoto = /photos?|pictures?|images?|hero|front|exterior|interior/i.test(name);
  if (nameLooksLikeFloorPlan && instructionsRequestFloorPlan(draft)) return true;
  if (nameLooksLikePhoto) return false;
  return instructionsRequestFloorPlan(draft) && instructionsRequestSuiteMedia(draft);
}

function instructionsRequestSuiteMedia(draft: PropertyPortalReviewDraftForApproval) {
  if (draft.kind !== "modification") return false;
  const instructions = clean(draft.sourceInput?.instructions as string | undefined);
  return /suite\s+[A-Za-z0-9-]+[^.\n]*(?:photo|image|media|attachment|attach|upload|file|document|details|floor\s*plan|site\s*plan|plan)/i.test(instructions)
    || /(?:photo|image|media|attachment|attach|upload|file|document|details|floor\s*plan|site\s*plan|plan)[^.\n]*suite\s+[A-Za-z0-9-]+/i.test(instructions);
}

function getSuiteTargetFromDraft(draft: PropertyPortalReviewDraftForApproval) {
  if (draft.kind !== "modification") return "";
  const instructions = clean(draft.sourceInput?.instructions as string | undefined);
  return instructions.match(/suite\s+([A-Za-z0-9-]+)/i)?.[1]?.trim() || "";
}

function attachUploadsToSuiteMedia(draft: PropertyPortalReviewDraftForApproval, uploads: StagedListingImageUpload[]) {
  const suiteTarget = getSuiteTargetFromDraft(draft);
  const updates = isRecord(draft.structuredUpdates) ? draft.structuredUpdates : {};
  const admin = isRecord(updates.admin) ? updates.admin : {};
  const suites = Array.isArray(admin.suites) ? admin.suites : [];
  if (!suiteTarget || !suites.length || !instructionsRequestSuiteMedia(draft)) return null;
  const nextSuites = suites.map((suite) => {
    if (!isRecord(suite)) return suite;
    const suiteNumber = clean(suite.suiteNumber as string | undefined);
    if (suiteNumber.toLowerCase() !== suiteTarget.toLowerCase()) return suite;
    const floorPlanUploads = uploads.filter((upload) => uploadLooksLikeFloorPlan(upload, draft)).map((upload) => upload.url).filter(isExternalAssetUrl);
    const photoUploads = uploads.filter((upload) => !uploadLooksLikeFloorPlan(upload, draft)).map((upload) => upload.url).filter(isExternalAssetUrl);
    return {
      ...suite,
      suitePhotos: [
        ...normalizeExternalAssetUrls(suite.suitePhotos),
        ...photoUploads,
      ],
      suiteFloorPlans: [
        ...normalizeExternalAssetUrls(suite.suiteFloorPlans),
        ...floorPlanUploads,
      ],
    };
  });
  return { admin: { ...admin, suites: nextSuites }, images: [] as StagedListingImageUpload[] };
}

async function buildStagedDraftMedia(input: { assets: File[] | undefined; slug?: string; draft: PropertyPortalReviewDraftForApproval; uploadStagedImage?: StagedListingImageUploader }) {
  const uploads = (await Promise.all((input.assets ?? []).map((file, index) => fileToDraftImageUpload(file, { slug: input.slug, index: index + 1, draft: input.draft, uploadStagedImage: input.uploadStagedImage })))).filter((upload): upload is StagedListingImageUpload => Boolean(upload?.url));
  if (!uploads.length) return null;
  const suiteMedia = attachUploadsToSuiteMedia(input.draft, uploads);
  if (suiteMedia) return suiteMedia;
  const imageUploads = uploads.filter((upload) => !isPdfUpload(upload));
  if (!imageUploads.length) return null;
  const imageUrls = imageUploads.map((upload) => upload.url);
  const photos = imageUploads.map((upload, index) => ({
    id: `pier-manager-staged-${index + 1}`,
    title: index === 0 ? "Hero Photo" : `Photo ${index + 1}`,
    source: "pier-manager-durable-upload",
    url: upload.url,
    href: upload.url,
    downloadUrl: upload.url,
    storagePath: upload.path,
    contentType: upload.contentType,
    size: upload.size,
    originalName: upload.originalName,
  }));
  const targetSlug = clean(input.slug) || clean(input.draft.sourceInput?.propertyIdOrSlug as string | undefined) || clean(input.draft.sourceInput?.slug as string | undefined);
  return {
    media: {
      heroImageUrl: imageUrls[0],
      heroPhoto: imageUrls[0],
      photos,
      images: imageUploads.map((upload, index) => ({
        id: upload.path ? `pier-manager-${upload.path}` : `pier-manager-staged-${index + 1}`,
        title: upload.originalName || (index === 0 ? "Hero Photo" : `Photo ${index + 1}`),
        source: "pier-manager-durable-upload",
        boundPropertySlug: targetSlug || null,
        storagePath: upload.path,
        contentType: upload.contentType,
        size: upload.size,
        uploadedAt: new Date().toISOString(),
        urls: { original: upload.url, full: upload.url, xlarge: upload.url, large: upload.url, medium: upload.url, thumb: upload.url },
      })),
    },
    images: imageUploads,
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

function mergeMediaPayload(existingMedia: unknown, stagedMedia: Record<string, unknown>) {
  const existing = isRecord(existingMedia) ? existingMedia : {};
  const staged = isRecord(stagedMedia.media) ? stagedMedia.media : {};
  const merged = deepMergeRecords(existing, staged);
  const existingImages = Array.isArray(existing.images) ? existing.images : [];
  const stagedImages = Array.isArray(staged.images) ? staged.images : [];
  if (existingImages.length || stagedImages.length) {
    const seen = new Set<string>();
    merged.images = [...existingImages, ...stagedImages].filter((image) => {
      const key = isRecord(image)
        ? clean(image.id as string | undefined) || clean(image.storagePath as string | undefined) || clean((isRecord(image.urls) ? image.urls.original : "") as string | undefined)
        : String(image ?? "");
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return merged;
}

export async function approvePropertyPortalReviewDraft(input: PropertyPortalRequestOptions & { draft: PropertyPortalReviewDraftForApproval; assets?: File[]; mode?: PropertyPortalPublishMode; uploadStagedImage?: StagedListingImageUploader }): Promise<PropertyPortalApprovalResult> {
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
  const savePayload = buildPropertyPortalApprovedPayload({ draft: input.draft, mode: input.mode, slug: saveSlug }) as Record<string, unknown>;
  const stagedMedia = await buildStagedDraftMedia({ assets: input.assets, slug: saveSlug, draft: input.draft, uploadStagedImage: input.uploadStagedImage });
  if (stagedMedia) {
    const stagedMediaRecord = stagedMedia as Record<string, unknown>;
    if (isRecord(stagedMediaRecord.media)) {
      savePayload.media = mergeMediaPayload(savePayload.media, stagedMediaRecord);
      savePayload.photos = (stagedMediaRecord.media as Record<string, unknown>).photos;
    }
    if (isRecord(stagedMediaRecord.admin)) {
      savePayload.admin = deepMergeRecords(
        isRecord(savePayload.admin) ? savePayload.admin : {},
        stagedMediaRecord.admin,
      );
    }
  }
  if (isRecord(savePayload.meta)) {
    savePayload.meta = deepMergeRecords(savePayload.meta, { brokerReview: { mediaUploadResult: mediaResult, stagedAssetCount, stagedImageCount: stagedMedia?.images.length ?? 0 } });
  }

  const approvedSlug = saveSlug || clean(savePayload.slug as string | undefined) || buildSlugFromTitle(clean(savePayload.title as string | undefined));
  const outboundApprovedPayload = sanitizeListingStreamJsonTransitPayload({ ...savePayload, slug: approvedSlug }) as Record<string, unknown>;
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
      approvedPayload: outboundApprovedPayload,
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
