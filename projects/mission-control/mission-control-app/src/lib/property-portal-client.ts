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
  return urls.length > 0 && urls.every(isAbsoluteHttpUrl);
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

  return {
    ...merged,
    slug: input.slug || clean(merged.slug as string | undefined) || clean(existing.slug as string | undefined) || undefined,
    title: finalTitle,
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

  if (input.assets?.length) {
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
        { method: "POST", headers: getPropertyPortalInternalHeaders(), body: buildPortalFormData({ payload: { ...intakePayload, aiApprovedDraft: input.draft }, assets: input.assets }) },
        "new listing media upload",
      );
      mediaResult = await parsePortalResponse(intakeResponse);
    } else {
      const revisionFormData = new FormData();
      revisionFormData.set("propertyId", slug || clean(source.propertyId as string | undefined));
      revisionFormData.set("instructions", clean(source.instructions as string | undefined) || "Broker-approved AI delta with supporting media.");
      revisionFormData.set("draft", JSON.stringify(input.draft));
      for (const asset of input.assets) revisionFormData.append("assets", asset);
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
  if (isRecord(savePayload.meta)) {
    savePayload.meta = deepMergeRecords(savePayload.meta, { brokerReview: { mediaUploadResult: mediaResult } });
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
