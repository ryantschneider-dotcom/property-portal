"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { buildBrokerHubIntakePayload, type BrokerHubIntakeInput, type BrokerHubSuiteInput, type BrokerHubTransactionType } from "@/lib/pier-manager-intake";
import type { AuthRole } from "@/lib/auth";
import { normalizeIncomingBrokerReviewDraft } from "@/lib/broker-review-draft-normalizer";
import { normalizePropertyPortalDraftPreviewUrl, type PropertyPortalActiveListing } from "@/lib/property-portal-client";
import { getListingRevisionValidationError } from "@/lib/pier-manager-form-decoupling";
import { summarizeDeltaChanges } from "@/lib/pier-manager-delta-summary";
import type { BrokerReviewDraft } from "@/lib/property-portal-ai";

const inputClass = "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#CB521E]/50 focus:ring-2 focus:ring-[#CB521E]/10";
const textareaClass = `${inputClass} min-h-[110px]`;
const cardClass = "rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm";
const requiredFields = ["Street Address", "City", "State", "County", "Parcel ID", "Property Type", "Lead Broker", "Hero Photo"];
// Legacy static-test copy retained for compatibility: Generate Revised Listing Draft; Generating Draft... Please Wait
const counties = ["Chatham", "Bryan", "Effingham", "Liberty", "Jasper", "Beaufort", "Charleston", "Other"];
const propertyTypes = ["Retail", "Industrial", "Office", "Flex", "Land", "Multifamily", "Mixed-Use", "Hospitality", "Special Purpose"];
const brokers = ["Ryan T. Schneider", "Anthony", "Joel", "Other PIER Broker"];
const rentTypes = ["NNN", "Modified Gross", "Full Service", "Gross", "Monthly", "Call for details"];
type MailchimpBrokerContext = { name: string; email: string; source?: string };

const brokerSenderProfiles: Record<string, { name: string; email: string }> = {
  ryan: { name: "Ryan T. Schneider, CCIM", email: "ryan@piercommercial.com" },
  joel: { name: "Joel Boblasky", email: "joel@piercommercial.com" },
  anthony: { name: "Anthony Wagner", email: "anthony@piercommercial.com" },
};

function getBrokerSenderProfile(brokerId: string) {
  return brokerSenderProfiles[brokerId] ?? brokerSenderProfiles.ryan;
}

function getMailchimpFallbackBrokerContext(activeBrokerId: string): MailchimpBrokerContext {
  const sender = getBrokerSenderProfile(activeBrokerId);
  return { ...sender, source: `impersonation-fallback:${activeBrokerId}` };
}

const MAX_DRAFT_PREVIEW_UPLOAD_BYTES = 850_000;
const PDFJS_WORKER_VERSION = "6.0.227";
const PRODUCTION_FACTORY_MESSAGE = "Your site is being built at the PIER Website Production Factory. Check back in 5 minutes, then 10 minutes, then 15 minutes. The link will appear here automatically when it is ready.";

type IntakeFormState = Omit<BrokerHubIntakeInput, "heroPhotoCount" | "suites">;

function fileListToArray(files: FileList | null) {
  return files ? Array.from(files) : [];
}

async function compressImageForDraftPreview(file: File) {
  if (!file.type.startsWith("image/") || file.size <= MAX_DRAFT_PREVIEW_UPLOAD_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, Math.sqrt(MAX_DRAFT_PREVIEW_UPLOAD_BYTES / Math.max(file.size, 1)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  context?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
}

async function prepareDraftPreviewAssets(stagedAssets: File[], mode: "draft-preview" | "publish-live") {
  if (mode !== "draft-preview") return { assets: stagedAssets, skippedCount: 0 };
  const prepared: File[] = [];
  let skippedCount = 0;
  for (const asset of stagedAssets) {
    const candidate = await compressImageForDraftPreview(asset);
    if (candidate.size > MAX_DRAFT_PREVIEW_UPLOAD_BYTES) {
      skippedCount += 1;
      continue;
    }
    prepared.push(candidate);
  }
  return { assets: prepared, skippedCount };
}


function isPdfFile(file: File) {
  return /pdf/i.test(file.type || "") || /\.pdf$/i.test(file.name || "");
}

function configurePdfJsWorker(pdfjs: { GlobalWorkerOptions?: { workerSrc?: string } }) {
  if (typeof window === "undefined") return;
  const workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_WORKER_VERSION}/build/pdf.worker.mjs`;
  if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
}

async function safePdfJsTeardown(resources: { page?: unknown; pdf?: unknown; loadingTask?: unknown }) {
  const cleanupCalls = [
    () => (resources.page as { cleanup?: () => unknown })?.cleanup?.(),
    () => (resources.pdf as { cleanup?: () => unknown })?.cleanup?.(),
    () => (resources.loadingTask as { destroy?: () => unknown })?.destroy?.(),
    () => (resources.pdf as { destroy?: () => unknown })?.destroy?.(),
  ];
  for (const cleanup of cleanupCalls) {
    try {
      await cleanup();
    } catch (error) {
      console.warn("Ignored PDF.js cleanup failure after successful floor plan render", error);
    }
  }
}

function assertCanvasHasVisiblePdfContent(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const sampleWidth = canvas.width;
  const sampleHeight = canvas.height;
  const imageData = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let visiblePixels = 0;
  const stride = Math.max(4, Math.floor(imageData.length / 120_000 / 4) * 4);
  for (let index = 0; index < imageData.length; index += stride) {
    const red = imageData[index] ?? 255;
    const green = imageData[index + 1] ?? 255;
    const blue = imageData[index + 2] ?? 255;
    if (red < 245 || green < 245 || blue < 245) visiblePixels += 1;
  }
  if (visiblePixels < 12) {
    throw new Error("The PDF floor plan rendered as a blank white page. Please upload a PDF page with visible plan content.");
  }
}

async function renderPdfFirstPageToImageFile(file: File) {
  if (typeof window === "undefined") throw new Error("PDF floor plan rasterization must run in the browser.");
  const pdfjs = await import("pdfjs-dist");
  configurePdfJsWorker(pdfjs);
  const loadingTask = (pdfjs as any).getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let pdf: unknown;
  let page: unknown;
  try {
    pdf = await loadingTask.promise;
    page = await (pdf as { getPage: (pageNumber: number) => Promise<any> }).getPage(1);
    const baseViewport = (page as { getViewport: (options: { scale: number }) => { width: number; height: number } }).getViewport({ scale: 1 });
    const scale = Math.min(2.2, Math.max(1, 1400 / Math.max(baseViewport.width, 1)));
    const viewport = (page as { getViewport: (options: { scale: number }) => unknown }).getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor((viewport as { width: number }).width));
    canvas.height = Math.max(1, Math.floor((viewport as { height: number }).height));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create browser canvas for PDF floor plan rendering.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await (page as { render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown; annotationMode?: number; renderInteractiveForms?: boolean }) => { promise: Promise<void> } }).render({
      canvasContext: context,
      viewport,
      annotationMode: (pdfjs as any).AnnotationMode?.ENABLE_FORMS ?? 2,
      renderInteractiveForms: true,
    }).promise;
    assertCanvasHasVisiblePdfContent(canvas);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) throw new Error("Could not convert PDF floor plan page to an image.");
    return new File([blob], file.name.replace(/\.pdf$/i, "-page-1.jpg"), { type: "image/jpeg" });
  } finally {
    await safePdfJsTeardown({ page, pdf, loadingTask });
  }
}

async function uploadClientFloorPlanImageViaMissionControl(file: File, context: { slug: string; index: number }) {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("slug", context.slug);
  formData.set("index", String(context.index));
  const response = await fetch("/api/listingstream/client-floorplan-upload", {
    method: "POST",
    body: formData,
  });
  const data = await parseJsonResponse(response) as { url?: string };
  if (!data.url) throw new Error("Mission Control floor plan image upload did not return a Firebase download URL.");
  return data.url;
}

function extractSuiteTargetFromDraft(draft: BrokerReviewDraft, fileName: string) {
  const sourceInput = isRecord(draft.sourceInput) ? draft.sourceInput : {};
  const text = [sourceInput.instructions, fileName, draft.title].filter(Boolean).join(" ");
  return text.match(/suite\s*#?\s*([A-Za-z0-9-]+)/i)?.[1]?.trim().toLowerCase() || "";
}

function addSuiteFloorPlanUrlToDraft(draft: BrokerReviewDraft, fileName: string, url: string): BrokerReviewDraft {
  const target = extractSuiteTargetFromDraft(draft, fileName);
  const clone = JSON.parse(JSON.stringify(draft)) as BrokerReviewDraft;
  const structuredUpdates = isRecord(clone.structuredUpdates) ? clone.structuredUpdates as Record<string, unknown> : {};
  const admin = isRecord(structuredUpdates.admin) ? structuredUpdates.admin as Record<string, unknown> : {};
  const suites = Array.isArray(admin.suites) ? admin.suites : [];
  if (!suites.length) return clone;
  let matched = false;
  const nextSuites = suites.map((suite, index) => {
    if (!isRecord(suite)) return suite;
    const suiteNumber = String(suite.suiteNumber ?? "").trim().toLowerCase();
    const shouldAttach = target ? suiteNumber === target : suites.length === 1 && index === 0;
    if (!shouldAttach) return suite;
    matched = true;
    const existing = Array.isArray(suite.suiteFloorPlans) ? suite.suiteFloorPlans.map((item) => String(item ?? "")).filter(Boolean) : [];
    return { ...suite, suiteFloorPlans: [...existing, url] };
  });
  if (!matched && isRecord(nextSuites[0])) {
    const first = nextSuites[0] as Record<string, unknown>;
    const existing = Array.isArray(first.suiteFloorPlans) ? first.suiteFloorPlans.map((item) => String(item ?? "")).filter(Boolean) : [];
    nextSuites[0] = { ...first, suiteFloorPlans: [...existing, url] };
  }
  clone.structuredUpdates = { ...structuredUpdates, admin: { ...admin, suites: nextSuites } } as BrokerReviewDraft["structuredUpdates"];
  return clone;
}

async function prepareClientSideSuiteFloorPlanImages(input: { draft: BrokerReviewDraft; assets: File[]; slug: string }) {
  let draft = input.draft;
  const assetsForApi: File[] = [];
  let convertedCount = 0;
  for (const asset of input.assets) {
    if (!isPdfFile(asset)) {
      assetsForApi.push(asset);
      continue;
    }
    const imageFile = await renderPdfFirstPageToImageFile(asset);
    const imageUrl = await uploadClientFloorPlanImageViaMissionControl(imageFile, { slug: input.slug, index: convertedCount + 1 });
    draft = addSuiteFloorPlanUrlToDraft(draft, asset.name, imageUrl);
    convertedCount += 1;
  }
  return { draft, assetsForApi, convertedCount };
}

function createSuite(): BrokerHubSuiteInput {
  return { suiteNumber: "", availableSqFt: "", baseRent: "", rentType: "NNN", unpriced: false };
}

function formatAudienceCount(value: number | null | undefined) {
  return typeof value === "number" ? `${value.toLocaleString()} contacts` : "contact count unavailable";
}

function getMailchimpCampaignTitle(listing: PropertyPortalActiveListing, subjectLine: string) {
  return `${listing.title || listing.address || listing.slug || "PIER Listing"} — ${subjectLine || "Email Blast Draft"}`;
}

function requiredLabel(label: string, required = true) {
  return (
    <span className="text-sm font-semibold text-zinc-800">
      {label} {required ? <span className="text-[#CB521E]">*</span> : <span className="text-xs font-normal text-zinc-400">optional</span>}
    </span>
  );
}

async function parseJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => {
      throw new Error("Malformed ListingStream JSON response. The draft API returned unreadable JSON; please retry, and if it repeats contact Hermes with the timestamp.");
    })
    : { error: await response.text().catch(() => "") };
  if (!response.ok) throw new Error(String((data as { error?: unknown }).error || `ListingStream backend request failed (${response.status}).`));
  return data;
}

const PIER_MANAGER_FRONTIER_DRAFT_TIMEOUT_MS = 300_000;

function requireDraftResponse(data: unknown, label: string) {
  if (!isRecord(data) || !isRecord(data.draft)) {
    const message = isRecord(data) && typeof data.error === "string" ? data.error : `${label} returned no draft payload. Please retry; the UI stopped instead of staying stuck.`;
    throw new Error(message);
  }
  return data.draft;
}

function getAbortableErrorMessage(error: unknown, fallback: string) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "AI draft generation timed out in the browser. The request was stopped so the page would not stay stuck; please try again with shorter instructions.";
  }
  return error instanceof Error ? error.message : fallback;
}

function extractDraftPreviewUrl(result: {
  previewUrl?: string;
  result?: { previewUrl?: string; slug?: string };
  save?: { previewUrl?: string; slug?: string };
  launch?: { previewUrl?: string; slug?: string; result?: { previewUrl?: string; slug?: string }; save?: { previewUrl?: string; slug?: string } };
}) {
  const explicit = result.previewUrl
    || result.result?.previewUrl
    || result.launch?.previewUrl
    || result.launch?.result?.previewUrl
    || result.save?.previewUrl
    || result.launch?.save?.previewUrl;
  if (explicit) return explicit;
  const slug = result.result?.slug || result.launch?.result?.slug || result.save?.slug || result.launch?.save?.slug || result.launch?.slug;
  return slug ? `/preview/${slug}` : "";
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return await parseJsonResponse(response);
  } finally {
    window.clearTimeout(timeout);
  }
}

function reviewChecklistItems(items: string[]) {
  return items.length ? items : ["No items flagged yet."];
}

function renderChecklistColumn(title: string, items: string[], tone: "good" | "warn" | "bad" | "ready") {
  const toneClass = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    bad: "border-rose-200 bg-rose-50 text-rose-900",
    ready: "border-sky-200 bg-sky-50 text-sky-900",
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <h5 className="text-sm font-semibold">{title}</h5>
      <ul className="mt-3 space-y-2 text-sm">
        {reviewChecklistItems(items).map((item) => <li key={`${title}-${item}`}>• {item}</li>)}
      </ul>
    </div>
  );
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
}

function defaultReviewChecklist() {
  return {
    autoFilled: [] as string[],
    needsManualInput: [] as string[],
    failedScrapes: [] as string[],
    listingStreamReady: [] as string[],
  };
}

function getDraftReviewChecklist(draft: BrokerReviewDraft) {
  const review: Record<string, unknown> = isRecord(draft.review) ? draft.review : {};
  const checklist: Record<string, unknown> = isRecord(review.checklist) ? review.checklist : {};
  return {
    autoFilled: normalizeStringList(checklist.autoFilled),
    needsManualInput: normalizeStringList(checklist.needsManualInput),
    failedScrapes: normalizeStringList(checklist.failedScrapes),
    listingStreamReady: normalizeStringList(checklist.listingStreamReady),
  };
}

function getDraftRevisionCount(draft: BrokerReviewDraft) {
  const review: Record<string, unknown> = isRecord(draft.review) ? draft.review : {};
  return typeof review.revisionCount === "number" ? review.revisionCount : 0;
}

type AssessorReviewField = {
  key: "yearBuilt" | "totalSqFt" | "lotSize" | "zoning";
  label: string;
  placeholder: string;
};

const assessorReviewFields: AssessorReviewField[] = [
  { key: "yearBuilt", label: "Year Built", placeholder: "Example: 1987" },
  { key: "totalSqFt", label: "Total Sq. Ft.", placeholder: "Example: 12,500 SF" },
  { key: "lotSize", label: "Lot Size", placeholder: "Example: 1.24 AC" },
  { key: "zoning", label: "Zoning", placeholder: "Example: B-C / commercial" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readPathValue(source: unknown, path: string[]) {
  let current = source;
  for (const key of path) {
    if (!isRecord(current)) return "";
    current = current[key];
  }
  return typeof current === "string" || typeof current === "number" ? String(current) : "";
}

function getAssessorFieldValue(draft: BrokerReviewDraft, key: AssessorReviewField["key"]) {
  const pathCandidates: Record<AssessorReviewField["key"], string[][]> = {
    yearBuilt: [["property", "yearBuilt"], ["property", "building", "yearBuilt"], ["yearBuilt"]],
    totalSqFt: [["property", "totalSqFt"], ["property", "totalSquareFeet"], ["property", "buildingSize"], ["property", "buildingSqFt"], ["totalSqFt"]],
    lotSize: [["property", "lotSize"], ["property", "lotSizeAcres"], ["property", "landSize"], ["lotSize"]],
    zoning: [["property", "zoning"], ["zoning"]],
  };

  for (const source of [draft.structuredUpdates, draft.sourceInput, draft.currentListing]) {
    for (const path of pathCandidates[key]) {
      const value = readPathValue(source, path);
      if (value) return value;
    }
  }
  return "";
}

function getListingSelectionValue(listing: PropertyPortalActiveListing) {
  return listing.slug || listing.id;
}

function getListingSearchLabel(listing: PropertyPortalActiveListing) {
  const primary = listing.address || listing.title || listing.slug || listing.id;
  const titleSuffix = listing.title && listing.title !== primary ? ` — ${listing.title}` : "";
  const transactionSuffix = listing.transactionLabel ? ` — ${listing.transactionLabel}` : "";
  return `${primary}${titleSuffix}${transactionSuffix}`;
}

function searchableListingText(listing: PropertyPortalActiveListing) {
  return [listing.address, listing.title, listing.slug, listing.id, listing.transactionLabel, listing.propertyType, listing.propertyTypeLabel, listing.category, listing.type, listing.listingType].filter(Boolean).join(" ").toLowerCase();
}

function isForSaleListing(listing: PropertyPortalActiveListing) {
  return /\bfor\s*sale\b|\bsale\b/i.test([listing.transactionLabel, listing.listingType].filter(Boolean).join(" "));
}

function isLandListing(listing: PropertyPortalActiveListing) {
  return /\bland\b|\blot\b|\bpad\b|\boutparcel\b/i.test([listing.propertyType, listing.propertyTypeLabel, listing.category, listing.type, listing.title].filter(Boolean).join(" "));
}

const initialIntakeState: IntakeFormState = {
  addressStreet: "",
  city: "",
  state: "",
  county: "",
  parcelId: "",
  latitude: "",
  longitude: "",
  propertyType: "",
  leadBroker: "",
  transactionType: "" as BrokerHubTransactionType,
  salePrice: "",
  saleUnpriced: false,
  listingTitle: "",
  propertyDescription: "",
  neighborhoodDescription: "",
  areaBusinesses: "",
  roadwaysTransportation: "",
  bulletPoints: "",
  notes: "",
};

const initialIntakeStatus = "Ready for Broker Hub intake — launch a listing that already feels half-finished.";
const initialModificationStatus = "Select an active ListingStream property and describe the change in plain English.";
const submissionSuccessLabel = "Submission Successful";

type SyndicationChannelStatus = "queued" | "running" | "succeeded" | "blocked" | "failed" | "skipped";
type SyndicationChannel = {
  platform: string;
  status: SyndicationChannelStatus;
  strategy: string;
  attempts: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  message: string;
};
type SyndicationJobSummary = {
  id: string;
  slug: string;
  listingTitle: string;
  eventType: string;
  status: string;
  updatedAt: string;
  channels: Record<string, SyndicationChannel>;
};
type SyndicationReadiness = { platform: string; enabled: boolean; strategy: string; hasCredentialSurface: boolean; message: string };

type SyndicationStatusPayload = {
  success?: boolean;
  readiness?: SyndicationReadiness[];
  jobs?: SyndicationJobSummary[];
  error?: string;
};


type OfferingSiteJobStatus = "queued" | "ready-for-generation" | "blocked" | "generating" | "deploying" | "deployed" | "failed" | string;
type OfferingSiteGenerationJob = {
  id: string;
  listingId?: string;
  slug?: string;
  status: OfferingSiteJobStatus;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
  baseline?: { validation?: { isValid?: boolean; missingFields?: string[]; missingRequiredFields?: string[] } };
  enrichment?: unknown;
  siteText?: { framework?: string };
  deployment?: { publicUrl?: string | null; customDomain?: string | null; deploymentUrl?: string | null; routePath?: string | null; routed?: boolean; assetCdnValidated?: boolean };
  logs?: { level?: string; stage?: string; message?: string; createdAt?: string }[];
  error?: string;
};
type OfferingSiteCommandPayload = {
  job?: OfferingSiteGenerationJob;
  baseline?: { validation?: { isValid?: boolean; missingFields?: string[]; missingRequiredFields?: string[] } };
  gate2?: unknown;
  status?: string;
  message?: string;
  task_id?: string;
  url?: string;
  error?: string;
};


export function PierManagerListingConsole({ userRole, activeBrokerId = "ryan" }: { userRole: AuthRole; activeBrokerId?: string }) {
  const [intakeForm, setIntakeForm] = useState<IntakeFormState>(initialIntakeState);
  const [suites, setSuites] = useState<BrokerHubSuiteInput[]>([createSuite()]);
  const [heroPhoto, setHeroPhoto] = useState<File | null>(null);
  const [intakeAssets, setIntakeAssets] = useState<File[]>([]);
  const [intakeStatus, setIntakeStatus] = useState(initialIntakeStatus);
  const [intakeSubmitting, setIntakeSubmitting] = useState(false);
  const [formResetKey, setFormResetKey] = useState(0);
  const [pierManagerMode, setPierManagerMode] = useState<"unselected" | "new" | "existing">("unselected");
  const newListingIntakeOpen = pierManagerMode === "new";

  const [activeListings, setActiveListings] = useState<PropertyPortalActiveListing[]>([]);
  const [activeListingsStatus, setActiveListingsStatus] = useState("Loading active listings from ListingStream backend…");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [listingSearchText, setListingSearchText] = useState("");
  const [listingPickerOpen, setListingPickerOpen] = useState(true);
  const [modificationInstructions, setModificationInstructions] = useState("");
  const [modificationAssets, setModificationAssets] = useState<File[]>([]);
  const [modificationStatus, setModificationStatus] = useState(initialModificationStatus);
  const [modificationError, setModificationError] = useState("");
  const [modificationSubmitting, setModificationSubmitting] = useState(false);
  const [mailchimpAudiences, setMailchimpAudiences] = useState<{ id: string; name: string; memberCount: number | null }[]>([]);
  const [mailchimpAudienceId, setMailchimpAudienceId] = useState("");
  const [mailchimpSubjectLine, setMailchimpSubjectLine] = useState("");
  const mailchimpFallbackBrokerContext = useMemo(() => getMailchimpFallbackBrokerContext(activeBrokerId), [activeBrokerId]);
  const [mailchimpFromName, setMailchimpFromName] = useState(mailchimpFallbackBrokerContext.name);
  const [mailchimpFromEmail, setMailchimpFromEmail] = useState(mailchimpFallbackBrokerContext.email);
  const [mailchimpBrokerContext, setMailchimpBrokerContext] = useState<MailchimpBrokerContext>(mailchimpFallbackBrokerContext);
  const [includeFinancials, setIncludeFinancials] = useState(false);
  const [mailchimpLoading, setMailchimpLoading] = useState(false);
  const [mailchimpGenerating, setMailchimpGenerating] = useState(false);
  const [mailchimpCampaignId, setMailchimpCampaignId] = useState("");
  const [mailchimpPreviewHtml, setMailchimpPreviewHtml] = useState("");
  const [mailchimpSmokeTestSent, setMailchimpSmokeTestSent] = useState(false);
  const [mailchimpStatus, setMailchimpStatus] = useState("Load audiences, choose a list, then create an embedded draft preview. Nothing sends automatically.");
  const [omRevisionInstructions, setOmRevisionInstructions] = useState("");
  const [omDraftId, setOmDraftId] = useState("");
  const [omDraftPreviewHtml, setOmDraftPreviewHtml] = useState("");
  const [omInlinePreviewUrl, setOmInlinePreviewUrl] = useState("");
  const [omInlinePreviewHtml, setOmInlinePreviewHtml] = useState("");
  const [omRevisionSummary, setOmRevisionSummary] = useState<string[]>([]);
  const [omRevisionAction, setOmRevisionAction] = useState<"idle" | "rendering" | "approving">("idle");
  const omRevisionRendering = omRevisionAction === "rendering";
  const omRevisionApproving = omRevisionAction === "approving";
  const omRevisionBusy = omRevisionAction !== "idle";
  const [syndicationPayload, setSyndicationPayload] = useState<SyndicationStatusPayload | null>(null);
  const [syndicationStatus, setSyndicationStatus] = useState("Loading syndication command center…");
  const [syndicationBusy, setSyndicationBusy] = useState(false);
  const [offeringSiteSelectedListingId, setOfferingSiteSelectedListingId] = useState("");
  const [offeringSiteJob, setOfferingSiteJob] = useState<OfferingSiteGenerationJob | null>(null);
  const [offeringSiteLastJobId, setOfferingSiteLastJobId] = useState("");
  const [offeringSiteStatus, setOfferingSiteStatus] = useState("Select an active listing to launch a PIER Commercial offering website build.");
  const [offeringSiteError, setOfferingSiteError] = useState("");
  const [offeringSiteBusy, setOfferingSiteBusy] = useState(false);

  const [reviewDraft, setReviewDraft] = useState<BrokerReviewDraft | null>(null);
  const [revisionFeedback, setRevisionFeedback] = useState("");
  const [reviewStatus, setReviewStatus] = useState("No draft ready yet.");
  const [reviewError, setReviewError] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [draftPreviewUrl, setDraftPreviewUrl] = useState("");
  const [publishSuccessMessage, setPublishSuccessMessage] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [omGenerating, setOmGenerating] = useState(false);
  const [omError, setOmError] = useState("");
  const [includeRetailAerial, setIncludeRetailAerial] = useState(false);
  const [includeRentRoll, setIncludeRentRoll] = useState(false);
  const [includeProforma, setIncludeProforma] = useState(false);
  const reviewPanelRef = useRef<HTMLElement | null>(null);
  const finalPublishActionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/listingstream/active-listings?portfolio=all&brokerId=${encodeURIComponent(activeBrokerId)}`, { cache: "no-store" })
      .then(parseJsonResponse)
      .then((data) => {
        if (cancelled) return;
        const items = Array.isArray(data.items) ? (data.items as PropertyPortalActiveListing[]) : [];
        setActiveListings(items);
        setActiveListingsStatus(items.length ? `${items.length} active ListingStream listings loaded from the ListingStream backend.` : "No active ListingStream listings returned yet.");
      })
      .catch((error) => {
        if (!cancelled) setActiveListingsStatus(error instanceof Error ? error.message : "Could not load active listings.");
      });
    return () => {
      cancelled = true;
    };
  }, [activeBrokerId]);

  async function loadMailchimpAudiences(options: { silent?: boolean } = {}) {
    setMailchimpLoading(true);
    if (!options.silent) setMailchimpStatus("Loading Mailchimp audiences/lists…");
    try {
      const data = await parseJsonResponse(await fetch("/api/listingstream/mailchimp/lists", { cache: "no-store" }));
      const items = Array.isArray(data.items) ? (data.items as { id: string; name: string; memberCount: number | null }[]) : [];
      setMailchimpAudiences(items);
      setMailchimpAudienceId((current) => current || items[0]?.id || "");
      setMailchimpStatus(items.length ? `${items.length} Mailchimp audience/list option(s) loaded. Choose one and create a draft campaign when ready.` : String(data.error || "No Mailchimp audiences returned yet."));
    } catch (error) {
      setMailchimpStatus(error instanceof Error ? error.message : "Could not load Mailchimp audiences.");
    } finally {
      setMailchimpLoading(false);
    }
  }

  useEffect(() => {
    void loadMailchimpAudiences({ silent: true });
  }, []);

  async function refreshSyndicationStatus() {
    setSyndicationBusy(true);
    try {
      const data = await fetch("/api/listingstream/syndication", { cache: "no-store" }).then(parseJsonResponse) as SyndicationStatusPayload;
      setSyndicationPayload(data);
      const attentionCount = (data.jobs ?? []).filter((job) => job.status === "attention").length;
      setSyndicationStatus(attentionCount ? `${attentionCount} syndication job${attentionCount === 1 ? "" : "s"} need attention.` : "Syndication command center is current.");
    } catch (error) {
      setSyndicationStatus(error instanceof Error ? error.message : "Could not load syndication status.");
    } finally {
      setSyndicationBusy(false);
    }
  }

  useEffect(() => {
    void refreshSyndicationStatus();
  }, []);

  async function retrySyndicationJob(jobId: string, platform?: string) {
    setSyndicationBusy(true);
    setSyndicationStatus("Manual retry queued…");
    try {
      await fetch("/api/listingstream/syndication", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "retry", jobId, platform }),
      }).then(parseJsonResponse);
      await refreshSyndicationStatus();
    } catch (error) {
      setSyndicationStatus(error instanceof Error ? error.message : "Manual retry failed.");
    } finally {
      setSyndicationBusy(false);
    }
  }


  async function launchOfferingSiteBuild(listingId?: string, retryJob?: OfferingSiteGenerationJob | null) {
    const targetListingId = listingId || offeringSiteSelectedListingId;
    if (!targetListingId) {
      setOfferingSiteError("Select an active ListingStream listing before launching a PIER Commercial site build.");
      return;
    }
    setOfferingSiteBusy(true);
    setOfferingSiteError("");
    setOfferingSiteStatus(retryJob ? "Re-sending this offering site build to the PIER/Vercel Website Production Factory…" : "Sending this listing to the PIER/Vercel Website Production Factory…");
    try {
      const payload = await fetch("/api/listingstream/offering-sites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId: targetListingId, requestedBy: "pier-manager-desktop", workflow: "vercel-offering-site" }),
      }).then(parseJsonResponse) as OfferingSiteCommandPayload;
      if (payload.job) {
        setOfferingSiteJob(payload.job);
        setOfferingSiteLastJobId(payload.job.listingId || targetListingId);
        const missingFields = payload.job.baseline?.validation?.missingRequiredFields ?? payload.job.baseline?.validation?.missingFields ?? payload.baseline?.validation?.missingRequiredFields ?? payload.baseline?.validation?.missingFields ?? [];
        // Legacy blocked states can still surface validation metadata, but Vercel launches should not expose obsolete external-hosting workflows.
        if (payload.job.status === "blocked") {
          setOfferingSiteError(`Build blocked by missing data${missingFields.length ? `: ${missingFields.join(", ")}` : "."}`);
          setOfferingSiteStatus("Offering site build needs more public data. Use Auto-Enrich Data to query public records and patch the listing payload, then retry the PIER/Vercel build.");
        } else {
          setOfferingSiteStatus(payload.job.deployment?.publicUrl || payload.job.status === "deployed" ? "PIER/Vercel returned the live offering site URL. Open it below." : payload.message || PRODUCTION_FACTORY_MESSAGE);
        }
      } else {
        setOfferingSiteError(payload.error || "PIER/Vercel did not return an offering site job.");
      }
    } catch (error) {
      setOfferingSiteError(error instanceof Error ? error.message : "Offering site build failed.");
      setOfferingSiteStatus("Offering site build needs attention.");
    } finally {
      setOfferingSiteBusy(false);
    }
  }

  async function refreshOfferingSiteJob(jobId = offeringSiteLastJobId) {
    if (!jobId) return;
    setOfferingSiteBusy(true);
    setOfferingSiteError("");
    try {
      const payload = await fetch(`/api/listingstream/offering-sites?jobId=${encodeURIComponent(jobId)}`, { cache: "no-store" }).then(parseJsonResponse) as OfferingSiteCommandPayload;
      if (payload.job) {
        setOfferingSiteJob(payload.job);
        setOfferingSiteStatus(payload.job.deployment?.publicUrl || payload.job.status === "deployed" ? "PIER/Vercel returned the live offering site URL. Open it below." : payload.message || "The PIER/Vercel Website Production Factory is still building the offering site. The link will appear here automatically when it is ready.");
      } else {
        setOfferingSiteError(payload.error || "No offering site job returned.");
      }
    } catch (error) {
      setOfferingSiteError(error instanceof Error ? error.message : "Could not refresh offering site job.");
    } finally {
      setOfferingSiteBusy(false);
    }
  }

  function retryOfferingSiteBuild() {
    void launchOfferingSiteBuild(offeringSiteJob?.listingId || offeringSiteSelectedListingId, offeringSiteJob);
  }

  useEffect(() => {
    const status = String(offeringSiteJob?.status || "").toLowerCase();
    const hasLiveUrl = Boolean(offeringSiteJob?.deployment?.publicUrl || offeringSiteJob?.deployment?.customDomain);
    const shouldPoll = Boolean(offeringSiteLastJobId && offeringSiteJob && !hasLiveUrl && !["deployed", "failed", "blocked"].includes(status));
    if (!shouldPoll) return;
    const timer = window.setInterval(() => {
      void refreshOfferingSiteJob(offeringSiteLastJobId);
    }, 180_000);
    return () => window.clearInterval(timer);
  }, [offeringSiteJob, offeringSiteLastJobId]);

  async function autoEnrichOfferingSiteData() {
    const targetListingId = offeringSiteJob?.listingId || offeringSiteSelectedListingId;
    if (!targetListingId) {
      setOfferingSiteError("Select an active ListingStream listing before running Auto-Enrich Data.");
      return;
    }
    setOfferingSiteBusy(true);
    setOfferingSiteError("");
    setOfferingSiteStatus("Auto-Enrich Data is querying public GIS and tax assessor records, then patching missing ListingStream fields…");
    try {
      const payload = await fetch("/api/listingstream/auto-enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId: targetListingId, requestedBy: "pier-manager-desktop" }),
      }).then(parseJsonResponse) as { ok?: boolean; status?: string; message?: string; missingAfter?: string[]; patch?: Record<string, unknown> };
      await refreshActiveListingsAfterPublish(targetListingId);
      const remaining = Array.isArray(payload.missingAfter) ? payload.missingAfter : [];
      if (payload.ok && remaining.length === 0) {
        setOfferingSiteStatus(payload.message || "Auto-Enrich Data patched public records into ListingStream. Relaunching the offering site build…");
        await launchOfferingSiteBuild(targetListingId, offeringSiteJob);
      } else {
        setOfferingSiteStatus(payload.message || "Auto-Enrich Data completed, but the offering site still needs source data review.");
        if (remaining.length) setOfferingSiteError(`Auto-Enrich Data still needs: ${remaining.join(", ")}`);
      }
    } catch (error) {
      setOfferingSiteError(error instanceof Error ? error.message : "Auto-Enrich Data failed.");
      setOfferingSiteStatus("Auto-Enrich Data needs attention.");
    } finally {
      setOfferingSiteBusy(false);
    }
  }

  function revealReviewDraft(target: "panel" | "actions" = "panel") {
    window.setTimeout(() => {
      const element = target === "actions" ? finalPublishActionsRef.current ?? reviewPanelRef.current : reviewPanelRef.current;
      element?.scrollIntoView({ behavior: "smooth", block: "start" });
      element?.focus?.({ preventScroll: true });
    }, 75);
  }

  function scrollToSubmissionSuccess() {
    window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 75);
  }

  function resetPierManagerSubmissionState() {
    setIntakeForm(initialIntakeState);
    setSuites([createSuite()]);
    setHeroPhoto(null);
    setIntakeAssets([]);
    setIntakeStatus(initialIntakeStatus);
    setPierManagerMode("unselected");
    setSelectedPropertyId("");
    setListingSearchText("");
    setListingPickerOpen(true);
    setModificationInstructions("");
    setModificationAssets([]);
    setModificationStatus(initialModificationStatus);
    setReviewDraft(null);
    setRevisionFeedback("");
    setDraftPreviewUrl("");
    setReviewStatus("No draft ready yet.");
    setOmGenerating(false);
    setOmError("");
    setIncludeRetailAerial(false);
    setIncludeRentRoll(false);
    setIncludeProforma(false);
    setMailchimpAudienceId("");
    setMailchimpSubjectLine("");
    const fallbackBrokerContext = getMailchimpFallbackBrokerContext(activeBrokerId);
    setMailchimpFromName(fallbackBrokerContext.name);
    setMailchimpFromEmail(fallbackBrokerContext.email);
    setMailchimpBrokerContext(fallbackBrokerContext);
    setIncludeFinancials(false);
    setMailchimpCampaignId("");
    setMailchimpPreviewHtml("");
    setMailchimpSmokeTestSent(false);
    setMailchimpStatus("Load audiences, choose a list, then create an embedded draft preview. Nothing sends automatically.");
    setMailchimpLoading(false);
    setMailchimpGenerating(false);
    setOmRevisionInstructions("");
    setOmDraftId("");
    setOmDraftPreviewHtml("");
    if (omInlinePreviewUrl) URL.revokeObjectURL(omInlinePreviewUrl);
    setOmInlinePreviewUrl("");
    setOmInlinePreviewHtml("");
    setOmRevisionSummary([]);
    setOmRevisionAction("idle");
    setFormResetKey((current) => current + 1);
  }

  function completeSuccessfulSubmission() {
    resetPierManagerSubmissionState();
    setPublishSuccessMessage(submissionSuccessLabel);
    setToastMessage("");
    scrollToSubmissionSuccess();
  }

  useEffect(() => {
    if (reviewDraft) revealReviewDraft("actions");
  }, [reviewDraft]);

  const isSale = intakeForm.transactionType === "Sale";
  const isLease = intakeForm.transactionType === "Lease";
  const selectedListing = useMemo(() => activeListings.find((item) => item.id === selectedPropertyId || item.slug === selectedPropertyId), [activeListings, selectedPropertyId]);
  const hasActivePropertyContext = Boolean(selectedListing && !listingPickerOpen) && pierManagerMode === "existing";

  useEffect(() => {
    if (hasActivePropertyContext) return;
    setMailchimpBrokerContext(mailchimpFallbackBrokerContext);
    setMailchimpFromName(mailchimpFallbackBrokerContext.name);
    setMailchimpFromEmail(mailchimpFallbackBrokerContext.email);
  }, [hasActivePropertyContext, mailchimpFallbackBrokerContext]);

  const showFinancialToggles = Boolean(selectedListing && isForSaleListing(selectedListing) && !isLandListing(selectedListing));
  const filteredAddressListings = useMemo(() => {
    const query = listingSearchText.trim().toLowerCase();
    return query ? activeListings.filter((listing) => searchableListingText(listing).includes(query)) : activeListings;
  }, [activeListings, listingSearchText]);
  const intakeRequiredSummary = useMemo(() => [...requiredFields, isSale ? "Sale Price or Unpriced / Inquire" : "At least one complete suite row"].join(" · "), [isSale]);

  useEffect(() => {
    if (!showFinancialToggles) {
      setIncludeRentRoll(false);
      setIncludeProforma(false);
    }
  }, [showFinancialToggles]);


  useEffect(() => {
    if (!hasActivePropertyContext || !selectedListing) return;
    const slug = encodeURIComponent(getListingSelectionValue(selectedListing));
    setMailchimpBrokerContext(mailchimpFallbackBrokerContext);
    setMailchimpFromName(mailchimpFallbackBrokerContext.name);
    setMailchimpFromEmail(mailchimpFallbackBrokerContext.email);
    let cancelled = false;
    async function loadBrokerContext() {
      try {
        const data = await parseJsonResponse(await fetch(`/api/listingstream/broker-context/${slug}`, { cache: "no-store" })) as { broker?: MailchimpBrokerContext };
        if (cancelled) return;
        if (!data.broker) {
          setMailchimpBrokerContext(mailchimpFallbackBrokerContext);
          setMailchimpFromName(mailchimpFallbackBrokerContext.name);
          setMailchimpFromEmail(mailchimpFallbackBrokerContext.email);
          return;
        }
        setMailchimpBrokerContext(data.broker);
        setMailchimpFromName(data.broker.name);
        setMailchimpFromEmail(data.broker.email);
      } catch (error) {
        if (cancelled) return;
        setMailchimpBrokerContext(mailchimpFallbackBrokerContext);
        setMailchimpFromName(mailchimpFallbackBrokerContext.name);
        setMailchimpFromEmail(mailchimpFallbackBrokerContext.email);
        setMailchimpStatus(error instanceof Error ? `Broker sender lookup fell back to active View As broker: ${error.message}` : "Broker sender lookup fell back to active View As broker.");
      }
    }
    void loadBrokerContext();
    return () => { cancelled = true; };
  }, [hasActivePropertyContext, selectedListing, mailchimpFallbackBrokerContext]);


  async function refreshActiveListingsAfterPublish(preferredPropertyId: string) {
    const cacheBust = Date.now();
    const data = await parseJsonResponse(await fetch(`/api/listingstream/active-listings?portfolio=all&fresh=${cacheBust}&brokerId=${encodeURIComponent(activeBrokerId)}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
        Pragma: "no-cache",
      },
    }));
    const items = Array.isArray(data.items) ? (data.items as PropertyPortalActiveListing[]) : [];
    setActiveListings(items);
    const refreshedSelection = items.find((item) => item.id === preferredPropertyId || item.slug === preferredPropertyId);
    if (refreshedSelection) {
      const value = getListingSelectionValue(refreshedSelection);
      setSelectedPropertyId(value);
      setListingSearchText(getListingSearchLabel(refreshedSelection));
    }
    return items;
  }

  function resetOmRevisionPanelState() {
    setOmRevisionInstructions("");
    setOmDraftId("");
    setOmDraftPreviewHtml("");
    if (omInlinePreviewUrl) URL.revokeObjectURL(omInlinePreviewUrl);
    setOmInlinePreviewUrl("");
    setOmInlinePreviewHtml("");
    setOmRevisionSummary([]);
    setOmRevisionAction("idle");
  }

  function selectActiveListing(value: string) {
    setPierManagerMode("existing");
    setSelectedPropertyId(value);
    setListingPickerOpen(false);
    setOmGenerating(false);
    setOmError("");
    resetOmRevisionPanelState();
    setIncludeRentRoll(false);
    setIncludeProforma(false);
    const listing = activeListings.find((item) => item.id === value || item.slug === value);
    setOfferingSiteSelectedListingId(value);
    if (listing) setListingSearchText(getListingSearchLabel(listing));
  }

  function updateListingSearch(value: string) {
    setListingSearchText(value);
  }

  function reopenListingPicker() {
    setPierManagerMode("unselected");
    setSelectedPropertyId("");
    setListingSearchText("");
    setPierManagerMode("existing");
    setListingPickerOpen(true);
    setOmGenerating(false);
    setOmError("");
    resetOmRevisionPanelState();
    setIncludeRentRoll(false);
    setIncludeProforma(false);
    setOfferingSiteSelectedListingId("");
  }

  function updateIntake<K extends keyof IntakeFormState>(key: K, value: IntakeFormState[K]) {
    setIntakeForm((current) => ({ ...current, [key]: value }));
  }

  function updateSuite(index: number, patch: Partial<BrokerHubSuiteInput>) {
    setSuites((current) => current.map((suite, suiteIndex) => (suiteIndex === index ? { ...suite, ...patch } : suite)));
  }

  function removeSuite(index: number) {
    setSuites((current) => (current.length <= 1 ? current : current.filter((_, suiteIndex) => suiteIndex !== index)));
  }

  function updateDraftAssessorField(key: AssessorReviewField["key"], value: string) {
    setReviewDraft((current) => {
      if (!current) return current;
      const structuredUpdates = { ...current.structuredUpdates };
      const property = isRecord(structuredUpdates.property) ? { ...structuredUpdates.property } : {};
      property[key] = value;
      structuredUpdates.property = property;

      const checklist = getDraftReviewChecklist(current);
      const listingStreamReady = checklist.listingStreamReady.includes(key)
        ? checklist.listingStreamReady
        : [...checklist.listingStreamReady, key];

      return {
        ...current,
        structuredUpdates,
        review: {
          ...current.review,
          checklist: {
            ...checklist,
            listingStreamReady,
          },
        },
      };
    });
  }

  async function submitBrokerHubIntake(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIntakeSubmitting(true);
    setReviewError("");
    setPublishSuccessMessage("");
    setToastMessage("");
    setIntakeStatus("AI is analyzing property data... Drafting premium marketing copy, assessor/parcel gaps, and location intelligence...");
    try {
      const input = buildBrokerHubIntakePayload({ ...intakeForm, suites, heroPhotoCount: heroPhoto ? 1 : 0 });
      const data = (await fetchJsonWithTimeout("/api/listingstream/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "new-listing", input }),
      }, PIER_MANAGER_FRONTIER_DRAFT_TIMEOUT_MS)) as { draft: unknown };
      const draftPayload = requireDraftResponse(data, "New listing draft API");
      const draft = normalizeIncomingBrokerReviewDraft(draftPayload, { kind: "new-listing", title: intakeForm.listingTitle || intakeForm.addressStreet || "New listing draft", sourceInput: input });
      setReviewDraft(draft);
      revealReviewDraft("actions");
      setReviewStatus(`Review Draft ready for ${draft.title}. Hero photo and media stay staged until approval.`);
      setIntakeStatus(`The PIER Commercial Big Brain enrichment draft is ready for broker review. ${[heroPhoto, ...intakeAssets].filter(Boolean).length} media file(s) staged.`);
    } catch (error) {
      const message = getAbortableErrorMessage(error, "Could not generate listing review draft.");
      setReviewError(message);
      setIntakeStatus(message);
    } finally {
      setIntakeSubmitting(false);
    }
  }

  async function generateModificationDraft(instructions: string, options: { source: "listing-revision" | "om-revision" } = { source: "listing-revision" }) {
    const cleanInstructions = instructions.trim();
    if (!selectedPropertyId || !cleanInstructions) return;
    setModificationSubmitting(true);
    setModificationError("");
    setReviewError("");
    setPublishSuccessMessage("");
    setToastMessage("");
    const isOmRevision = options.source === "om-revision";
    setModificationStatus(isOmRevision
      ? "Routing OM revision through the frontier ListingStream interpreter, then preparing the Offering Memorandum review draft…"
      : "Frontier revision engine is mapping the broker instruction, cross-checking the JSON payload, and drafting premium copy without publishing…");
    try {
      const data = (await fetchJsonWithTimeout("/api/listingstream/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "modification", propertyIdOrSlug: selectedPropertyId, instructions: cleanInstructions }),
      }, PIER_MANAGER_FRONTIER_DRAFT_TIMEOUT_MS)) as { draft: unknown };
      const draftPayload = requireDraftResponse(data, "Listing modification draft API");
      const draft = normalizeIncomingBrokerReviewDraft(draftPayload, {
        kind: "modification",
        title: selectedListing?.title || selectedListing?.address || selectedPropertyId || "Listing modification draft",
        sourceInput: { propertyIdOrSlug: selectedPropertyId, instructions: cleanInstructions, source: options.source },
      });
      setReviewDraft(draft);
      revealReviewDraft("actions");
      setReviewStatus(`Review Draft ready for ${isOmRevision ? "OM revision" : "modification"}. ${modificationAssets.length} media/document file(s) staged for the portal update.`);
      setModificationStatus(isOmRevision
        ? "OM revision draft ready. Approve the ListingStream draft update, then regenerate the OM from the revised listing data."
        : "Revised listing draft ready for broker review; nothing has been published yet.");
    } catch (error) {
      const message = getAbortableErrorMessage(error, isOmRevision ? "Could not generate OM revision draft." : "Could not generate listing modification draft.");
      setModificationError(message);
      setModificationStatus(message);
    } finally {
      setModificationSubmitting(false);
    }
  }

  async function submitModification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = getListingRevisionValidationError({
      selectedPropertyId,
      instructions: modificationInstructions,
      mailchimpAudienceId,
    });
    if (validationError) {
      setModificationStatus(validationError);
      return;
    }
    await generateModificationDraft(modificationInstructions, { source: "listing-revision" });
  }

  async function requestOfferingMemorandumRevision() {
    const cleanInstructions = omRevisionInstructions.trim();
    if (!selectedListing || !cleanInstructions || omRevisionBusy) return;
    setOmRevisionAction("rendering");
    setOmError("");
    setPublishSuccessMessage("");
    setToastMessage("");
    setModificationStatus("AI is translating your vibe-code instruction into draft-only OM changes and rendering a responsive review preview…");
    try {
      const slug = encodeURIComponent(getListingSelectionValue(selectedListing));
      const data = (await fetchJsonWithTimeout(`/api/listingstream/offering-memorandums/${slug}/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: cleanInstructions, draftId: omDraftId || undefined }),
      }, 180_000)) as { draftId?: string; previewHtml?: string; parsedSummary?: string[]; error?: string };
      if (!data.draftId || !data.previewHtml) {
        throw new Error(data.error || "AI failed to apply changes. Try rephrasing with the exact suite, size, pricing, or lease-type change.");
      }
      setOmDraftId(data.draftId);
      setOmDraftPreviewHtml(data.previewHtml);
      setOmRevisionSummary(Array.isArray(data.parsedSummary) ? data.parsedSummary.map((item) => String(item)).filter(Boolean) : []);
      setModificationStatus("AI OM preview ready. Review it below, then approve + publish or send another vibe-code refinement.");
    } catch (error) {
      const message = getAbortableErrorMessage(error, "Could not generate AI OM preview.");
      setOmError(message);
      setModificationStatus(message);
    } finally {
      setOmRevisionAction("idle");
    }
  }

  async function approveOfferingMemorandumDraft() {
    if (!selectedListing || !omDraftId || omRevisionBusy) return;
    setOmRevisionAction("approving");
    setOmError("");
    setModificationStatus("Finalizing the approved OM, generating the PDF, and attaching it to the live ListingStream document array…");
    try {
      const slug = encodeURIComponent(getListingSelectionValue(selectedListing));
      const data = (await fetchJsonWithTimeout(`/api/listingstream/offering-memorandums/${slug}/drafts/${encodeURIComponent(omDraftId)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }, 300_000)) as { document?: { url?: string; title?: string } };
      const url = data.document?.url || "";
      setModificationStatus(url ? `Approved OM published and attached to the public listing documents: ${url}` : "Approved OM published and attached to the public listing documents.");
      setPublishSuccessMessage("Offering Memorandum approved, PDF generated, and public ListingStream document attached.");
    } catch (error) {
      const message = getAbortableErrorMessage(error, "Could not approve and publish OM draft.");
      setOmError(message);
      setModificationStatus(message);
    } finally {
      setOmRevisionAction("idle");
    }
  }

  async function generateOfferingMemorandum(format: "pdf" | "html") {
    if (!selectedListing) return;
    setOmGenerating(true);
    setOmError("");
    setModificationStatus(format === "pdf" ? "Generating Offering Memorandum PDF. This can take a few minutes while maps, demographics, and PDF rendering complete…" : "Generating Offering Memorandum HTML preview…");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 780_000);
    try {
      const slug = encodeURIComponent(getListingSelectionValue(selectedListing));
      const params = new URLSearchParams();
      if (format === "html") params.set("format", "html");
      if (includeRetailAerial) params.set("includeAerial", "1");
      if (showFinancialToggles && includeRentRoll) params.set("includeRentRoll", "1");
      if (showFinancialToggles && includeProforma) params.set("includeProforma", "1");
      const query = params.toString();
      const url = `/api/listingstream/offering-memorandums/${slug}/pdf${query ? `?${query}` : ""}`;
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        const payload = contentType.includes("application/json") ? await response.json().catch(() => ({})) as { error?: string } : { error: await response.text().catch(() => "") };
        throw new Error(payload.error || `Offering Memorandum generation failed (${response.status}).`);
      }
      if (omInlinePreviewUrl) URL.revokeObjectURL(omInlinePreviewUrl);
      if (format === "html") {
        const html = await response.text();
        setOmInlinePreviewHtml(html);
        setOmInlinePreviewUrl("");
        setModificationStatus("Offering Memorandum HTML preview rendered inline. Iterate with the vibe-code panel, then publish when ready.");
      } else {
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        setOmInlinePreviewUrl(blobUrl);
        setOmInlinePreviewHtml("");
        setModificationStatus("Offering Memorandum PDF rendered inline. No hard-drive download was forced.");
      }
    } catch (error) {
      const message = error instanceof DOMException && error.name === "AbortError"
        ? "Offering Memorandum generation timed out in the browser after 13 minutes. Please try again; if it repeats, the backend returned no PDF before the Vercel limit."
        : error instanceof Error ? error.message : "Could not generate Offering Memorandum.";
      setOmError(message);
      setModificationStatus(message);
    } finally {
      window.clearTimeout(timeout);
      setOmGenerating(false);
    }
  }

  async function createMailchimpEmailDraft() {
    if (!selectedListing || !mailchimpAudienceId || !mailchimpSubjectLine.trim()) return;
    setMailchimpGenerating(true);
    setMailchimpCampaignId("");
    setMailchimpPreviewHtml("");
    setMailchimpSmokeTestSent(false);
    setMailchimpStatus("Creating embedded Mailchimp campaign preview through the API. No external Mailchimp login is required.");
    try {
      const data = await parseJsonResponse(await fetch("/api/listingstream/mailchimp/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create-draft",
          audienceId: mailchimpAudienceId,
          subjectLine: mailchimpSubjectLine.trim(),
          fromName: mailchimpFromName.trim(),
          fromEmail: mailchimpFromEmail.trim(),
          title: getMailchimpCampaignTitle(selectedListing, mailchimpSubjectLine.trim()),
          previewText: selectedListing.address || selectedListing.title || "PIER Commercial listing update",
          listing: selectedListing,
          includeFinancials,
        }),
      })) as { campaign?: { id?: string; archiveUrl?: string | null }; previewHtml?: string; smokeTestRequired?: boolean };
      const campaignId = data.campaign?.id || "";
      setMailchimpCampaignId(campaignId);
      setMailchimpPreviewHtml(data.previewHtml || "");
      const campaignLabel = campaignId ? ` Campaign ${campaignId} is saved in Mailchimp.` : " Campaign is saved in Mailchimp.";
      setMailchimpStatus(`Embedded draft blast created for ${mailchimpFromName} <${mailchimpFromEmail}>.${campaignLabel} Review the desktop preview below, then send the broker-only smoke test before any list deployment.`);
    } catch (error) {
      setMailchimpStatus(error instanceof Error ? error.message : "Could not create Mailchimp draft.");
    } finally {
      setMailchimpGenerating(false);
    }
  }

  async function sendMailchimpBrokerSmokeTest() {
    if (!mailchimpCampaignId || !mailchimpFromEmail.trim()) return;
    setMailchimpGenerating(true);
    setMailchimpStatus(`Sending broker-only smoke test to ${mailchimpFromEmail.trim()} before list deployment…`);
    try {
      const data = await parseJsonResponse(await fetch("/api/listingstream/mailchimp/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "send-test",
          campaignId: mailchimpCampaignId,
          fromEmail: mailchimpFromEmail.trim(),
          brokerEmail: mailchimpFromEmail.trim(),
        }),
      })) as { previewHtml?: string; smokeTest?: { sentAt?: string; testEmail?: string } };
      if (data.previewHtml) setMailchimpPreviewHtml(data.previewHtml);
      setMailchimpSmokeTestSent(true);
      setMailchimpStatus(`Broker smoke test sent to ${data.smokeTest?.testEmail || mailchimpFromEmail.trim()}. Confirm the delivered layout, then deploy to the selected list when ready.`);
    } catch (error) {
      setMailchimpStatus(error instanceof Error ? error.message : "Could not send broker smoke test.");
    } finally {
      setMailchimpGenerating(false);
    }
  }

  async function deployMailchimpCampaignToList() {
    if (!mailchimpCampaignId || !mailchimpSmokeTestSent) return;
    setMailchimpGenerating(true);
    setMailchimpStatus("Deploying approved campaign to the selected Mailchimp audience…");
    try {
      const data = await parseJsonResponse(await fetch("/api/listingstream/mailchimp/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "send-live",
          campaignId: mailchimpCampaignId,
          smokeTestConfirmed: true,
        }),
      })) as { send?: { sentAt?: string }; campaign?: { status?: string } };
      setMailchimpStatus(`Campaign deployed to the selected list. Mailchimp status: ${data.campaign?.status || "sent"}.`);
    } catch (error) {
      setMailchimpStatus(error instanceof Error ? error.message : "Could not deploy Mailchimp campaign.");
    } finally {
      setMailchimpGenerating(false);
    }
  }

  async function submitMailchimpEmailBlast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createMailchimpEmailDraft();
  }

  async function reviseDraft() {
    if (!reviewDraft || !revisionFeedback.trim()) return;
    setReviewBusy(true);
    setReviewError("");
    setPublishSuccessMessage("");
    setToastMessage("");
    setReviewStatus("The PIER Commercial Big Brain is revising the draft from broker feedback…");
    try {
      const data = (await fetchJsonWithTimeout("/api/listingstream/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "revise", draft: reviewDraft, feedback: revisionFeedback.trim() }),
      }, PIER_MANAGER_FRONTIER_DRAFT_TIMEOUT_MS)) as { draft: unknown };
      const draftPayload = requireDraftResponse(data, "Draft revision API");
      const draft = normalizeIncomingBrokerReviewDraft(draftPayload, {
        kind: reviewDraft.kind,
        title: reviewDraft.title,
        sourceInput: reviewDraft.sourceInput,
        currentListing: reviewDraft.currentListing,
      });
      setReviewDraft(draft);
      setRevisionFeedback("");
      setReviewStatus(`Revised draft ready. Revision count: ${getDraftRevisionCount(draft)}.`);
    } catch (error) {
      const message = getAbortableErrorMessage(error, "Could not revise draft.");
      setReviewError(message);
      setReviewStatus(message);
    } finally {
      setReviewBusy(false);
    }
  }

  async function publishDraft(mode: "draft-preview" | "publish-live") {
    if (!reviewDraft) return;
    setReviewBusy(true);
    setToastMessage("");
    setPublishSuccessMessage("");
    setDraftPreviewUrl("");
    setReviewStatus(mode === "draft-preview"
      ? "Saving ListingStream draft preview... Ascendix will be bypassed for this safety test."
      : "Uploading staged photos, flyers, and documents... Publishing live and syncing Ascendix...");
    try {
      const stagedAssets = reviewDraft.kind === "new-listing" ? [heroPhoto, ...intakeAssets].filter((asset): asset is File => Boolean(asset)) : modificationAssets;
      const initialSlug = selectedPropertyId || visibleReviewDraft?.title || "listing";
      const clientPrepared = await prepareClientSideSuiteFloorPlanImages({ draft: reviewDraft, assets: stagedAssets, slug: initialSlug });
      if (clientPrepared.convertedCount) {
        setReviewStatus(`Rendered ${clientPrepared.convertedCount} PDF floor plan(s) in the browser and uploaded image thumbnails to Firebase before publishing.`);
      }
      const draftForPublish = clientPrepared.draft;
      const assetsForApi = clientPrepared.assetsForApi;
      const formData = new FormData();
      formData.set("draft", JSON.stringify(draftForPublish));
      formData.set("mode", mode);
      const { assets: preparedAssets, skippedCount } = await prepareDraftPreviewAssets(assetsForApi, mode);
      for (const asset of preparedAssets) formData.append("assets", asset);
      if (mode === "draft-preview" && assetsForApi.length) {
        setReviewStatus(skippedCount
          ? `Compressed draft preview media under Vercel upload limits. Skipped oversized extras: ${skippedCount}.`
          : "Compressed draft preview media under Vercel upload limits.");
      }
      const response = await fetch("/api/listingstream/approve-draft", {
        method: "POST",
        body: formData,
      });
      const result = await parseJsonResponse(response) as Parameters<typeof extractDraftPreviewUrl>[0];
      const publishedPropertyId = selectedPropertyId;
      if (mode === "draft-preview") {
        const previewUrl = extractDraftPreviewUrl(result);
        const normalizedPreviewUrl = previewUrl ? normalizePropertyPortalDraftPreviewUrl(previewUrl) : "";
        setDraftPreviewUrl(normalizedPreviewUrl);
        const message = "Success! Draft preview saved. Ascendix was not touched and the draft remains hidden from the public website grid.";
        setPublishSuccessMessage(message);
        setToastMessage(normalizedPreviewUrl ? `${message} Open the clickable Draft Preview link below.` : `${message} Preview URL was not returned; check the dropdown for the saved draft.`);
        setReviewStatus(`${message} ${normalizedPreviewUrl ? `Draft URL: ${normalizedPreviewUrl}` : "No preview URL came back from ListingStream."}`);
      } else {
        const autoEnrich = (result as { autoEnrich?: { queued?: boolean; jobId?: string; status?: string } }).autoEnrich;
        const enrichmentNote = autoEnrich?.queued
          ? ` Global Auto-Enrich is running asynchronously in the background (job ${autoEnrich.jobId}); you can keep working from this desktop console while SAGIS/municipal data backfills the table.`
          : "";
        const message = `Success! Modifications have been published and will be live on the website shortly.${enrichmentNote}`;
        setReviewStatus(`${message} Refreshing the live ListingStream baseline so the next edit starts from the newly published document…`);
        await refreshActiveListingsAfterPublish(publishedPropertyId);
        completeSuccessfulSubmission();
      }
      if (mode === "draft-preview") {
        refreshActiveListingsAfterPublish(publishedPropertyId).catch(() => undefined);
      }
    } catch (error) {
      setReviewStatus(error instanceof Error ? error.message : "Could not publish draft.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function runListingLifecycle(action: "delete-draft" | "make-live" | "delete-property") {
    if (!selectedPropertyId) return;
    const selectedName = selectedListing?.address || selectedListing?.title || selectedListing?.slug || selectedPropertyId;
    if (action === "delete-property" && !window.confirm(`Permanently delete ${selectedName} from ListingStream? This hard-deletes the Firestore listing and clears the public website cache.`)) return;
    setReviewBusy(true);
    setToastMessage("");
    setPublishSuccessMessage("");
    setModificationError("");
    setModificationStatus(action === "delete-draft" ? "Deleting draft from Firestore and clearing cache..." : action === "make-live" ? "Making draft live, writing Firestore, and clearing cache..." : "Hard-deleting listing from Firestore and clearing cache...");
    try {
      const response = await fetch("/api/listingstream/approve-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, propertyIdOrSlug: selectedPropertyId }),
      });
      await parseJsonResponse(response);
      const items = await refreshActiveListingsAfterPublish(selectedPropertyId);
      if (action === "delete-property" || action === "delete-draft") {
        const nextSelection = items[0]?.slug || items[0]?.id || "";
        setSelectedPropertyId(nextSelection);
        if (nextSelection) {
          const nextListing = items.find((item) => item.slug === nextSelection || item.id === nextSelection);
          setListingSearchText(nextListing ? getListingSearchLabel(nextListing) : "");
        } else {
          setListingSearchText("");
        }
      }
      const message = action === "delete-draft"
        ? "Draft deleted. Firestore and ListingStream cache are clear."
        : action === "make-live"
          ? "Draft is now live. Firestore, Ascendix sync, and ListingStream cache are updated."
          : "Listing deleted. Firestore hard-delete completed and ListingStream cache is clear.";
      setModificationStatus(message);
      setToastMessage(message);
      setPublishSuccessMessage(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update listing lifecycle.";
      setModificationStatus(message);
      setModificationError(message);
    } finally {
      setReviewBusy(false);
    }
  }

  const visibleReviewDraft = reviewDraft
    ? normalizeIncomingBrokerReviewDraft(reviewDraft, {
      kind: reviewDraft.kind,
      title: reviewDraft.title,
      sourceInput: reviewDraft.sourceInput,
      currentListing: reviewDraft.currentListing,
    })
    : null;
  const reviewChecklist = visibleReviewDraft ? getDraftReviewChecklist(visibleReviewDraft) : defaultReviewChecklist();
  const deltaSummaryRows = visibleReviewDraft?.kind === "modification" ? summarizeDeltaChanges(visibleReviewDraft.review.deltaPreview) : [];
  const syndicationJobs = syndicationPayload?.jobs ?? [];
  const latestSyndicationJob = syndicationJobs[0] ?? null;
  const syndicationReadiness = syndicationPayload?.readiness ?? [];

  const offeringSiteSelectedListing = useMemo(() => activeListings.find((item) => item.id === offeringSiteSelectedListingId || item.slug === offeringSiteSelectedListingId), [activeListings, offeringSiteSelectedListingId]);
  const selectedListingPublicUrl = selectedListing
    ? selectedListing.publicUrl || normalizePropertyPortalDraftPreviewUrl(`/property/${selectedListing.slug || selectedListing.id}`)
    : "";
  const offeringSiteCanRetry = Boolean(offeringSiteJob && ["blocked", "failed"].includes(String(offeringSiteJob.status)));
  const offeringSiteLogs = (offeringSiteJob?.logs ?? []).filter((log) => log?.message);
  const offeringSiteErrorLog = [...offeringSiteLogs].reverse().find((log) => String(log.level || "").toLowerCase() === "error");
  const offeringSiteRootCause = offeringSiteJob?.error || offeringSiteErrorLog?.message || offeringSiteError;
  const offeringSiteMissingFields = [
    ...(offeringSiteJob?.baseline?.validation?.missingRequiredFields ?? []),
    ...(offeringSiteJob?.baseline?.validation?.missingFields ?? []),
  ].filter((field, index, fields) => field && fields.indexOf(field) === index);

  return (
    <div className="space-y-6">
      {toastMessage ? (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
          {toastMessage}
        </div>
      ) : null}

      {publishSuccessMessage ? (
        <div data-testid="submission-success-bubble" role="status" className="rounded-3xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm text-emerald-900 shadow-[0_18px_50px_rgba(16,185,129,0.18)]">
          <div data-testid="publish-success-banner" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xl font-extrabold tracking-tight">{publishSuccessMessage}</p>
            <button type="button" onClick={() => setPublishSuccessMessage("")} className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100">
              Close message
            </button>
          </div>
          {draftPreviewUrl ? (
            <div className="mt-3">
              <a data-testid="draft-preview-link" href={draftPreviewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-xl bg-[#CB521E] px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#CB521E]/20 hover:bg-[#a94318]">View Draft Preview</a>
              <p className="mt-2 break-all text-xs">{draftPreviewUrl}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <section data-testid="pier-manager-global-context" className="rounded-[1.6rem] border border-[#CB521E]/25 bg-[linear-gradient(180deg,#ffffff,#fff8f4)] p-5 shadow-[0_22px_70px_rgba(15,23,42,0.10)] sm:p-6 xl:p-8">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#CB521E]">PIER Manager V2</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-zinc-950 xl:text-4xl">Choose your workflow</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">Start with a clean fork in the road. Create a new ListingStream record, or establish an existing property context before operational tools render.</p>
          </div>
          {pierManagerMode !== "unselected" ? (
            <button type="button" onClick={() => { setPierManagerMode("unselected"); setSelectedPropertyId(""); setListingPickerOpen(true); setListingSearchText(""); }} className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-bold text-zinc-800 shadow-sm transition hover:border-[#CB521E]/40 hover:text-[#CB521E]">
              Change Workflow
            </button>
          ) : null}
        </div>

        {pierManagerMode === "unselected" ? (
          <div data-testid="pier-manager-fork" className="mt-6 grid gap-4 lg:grid-cols-2">
            <button type="button" onClick={() => { setPierManagerMode("new"); setSelectedPropertyId(""); setListingPickerOpen(false); }} className="rounded-[1.35rem] border border-[#CB521E]/30 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl xl:p-7">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#CB521E]">New Listing</p>
              <h3 className="mt-3 text-2xl font-extrabold text-zinc-950">Enter a New Listing</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">Open only the intake pipeline for a fresh property record. Existing-listing tools stay out of the way.</p>
            </button>
            <button type="button" onClick={() => { setPierManagerMode("existing"); setListingPickerOpen(true); }} className="rounded-[1.35rem] border border-zinc-200 bg-zinc-950 p-5 text-left text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl xl:p-7">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#f6a87f]">Existing Listing</p>
              <h3 className="mt-3 text-2xl font-extrabold text-white">Work with an Existing Listing</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-300">Select one ListingStream property, then unlock Site Builder, OM Generator, Listing Editor, and syndication controls.</p>
            </button>
          </div>
        ) : null}

        {pierManagerMode === "existing" && listingPickerOpen ? (
          <div data-testid="listing-picker-panel" className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm xl:p-5">
            <label className="space-y-2 block">
              {requiredLabel("Filter active listings", false)}
              <input data-testid="listing-filter-input" value={listingSearchText} onChange={(event) => updateListingSearch(event.target.value)} className={inputClass} placeholder="Type to filter, or scroll the full property list below" autoComplete="off" />
            </label>
            <div className="mt-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              <span>Active ListingStream properties</span>
              <span>{filteredAddressListings.length} shown</span>
            </div>
            <div data-testid="active-listing-scrollbox" role="listbox" aria-label="Active ListingStream properties" className="mt-2 max-h-[52vh] overflow-y-auto overscroll-contain rounded-xl border border-zinc-200 bg-zinc-50 shadow-inner sm:max-h-96 xl:max-h-[32rem]">
              {activeListings.length === 0 ? <p className="px-4 py-3 text-sm text-zinc-500">{activeListingsStatus}</p> : filteredAddressListings.length === 0 ? <p className="px-4 py-3 text-sm text-zinc-500">No listings match your search.</p> : filteredAddressListings.map((listing) => {
                const value = getListingSelectionValue(listing);
                const enrichment = listing.publicRecordEnrichment;
                const enrichmentLabel = enrichment?.countyPortal
                  ? `${enrichment.status || "queued"} via ${enrichment.countyPortal}`
                  : listing.enrichmentStatus
                    ? `Auto-Enrich ${listing.enrichmentStatus}`
                    : "Auto-Enrich will queue on intake";
                return <button key={listing.id} data-testid="active-listing-option" type="button" role="option" aria-selected={false} onClick={() => selectActiveListing(value)} className="w-full border-b border-zinc-100 px-4 py-3 text-left text-sm text-zinc-700 transition last:border-0 hover:bg-[#CB521E]/5 focus:outline-none focus:ring-2 focus:ring-[#CB521E]/40"><span>{getListingSearchLabel(listing)}</span><span className="mt-1 block text-xs font-normal text-zinc-500">{listing.transactionLabel || "ListingStream listing"}{listing.publishStatus === "draft" ? " • Draft Preview" : ""}</span><span className="mt-2 inline-flex rounded-full border border-[#CB521E]/20 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#CB521E]">{enrichmentLabel}</span></button>;
              })}
            </div>
          </div>
        ) : null}

        {selectedListing && hasActivePropertyContext ? (
          <div data-testid="selected-listing-summary" className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p><span className="font-extrabold">Active context:</span> {selectedListing.address || selectedListing.title || selectedListing.slug}{selectedListing.publishStatus === "draft" ? " • Draft Preview" : ""}</p>
              <button type="button" onClick={reopenListingPicker} className="w-full rounded-xl border border-[#CB521E]/30 bg-white px-4 py-2 text-sm font-semibold text-[#CB521E] transition hover:bg-[#CB521E]/5 sm:w-auto">Change Selection</button>
            </div>
          </div>
        ) : null}

        {pierManagerMode === "existing" && !hasActivePropertyContext ? (
          <p data-testid="pier-manager-tools-hidden-state" className="mt-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-600">Operational tools are hidden until you select a listing.</p>
        ) : null}
      </section>

      {(newListingIntakeOpen || hasActivePropertyContext) ? (
        <>
      <section className="grid gap-4 lg:grid-cols-3">
        <div data-testid="broker-hub-premium-header" className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(203,82,30,0.22),transparent_34%),linear-gradient(135deg,#111827_0%,#172033_58%,#263245_100%)] p-5 text-white shadow-[0_22px_70px_rgba(15,23,42,0.22)] lg:col-span-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-zinc-400">PIER Broker Hub</p>
          <h3 className="mt-2 text-2xl font-extrabold tracking-[-0.04em] text-white">Launch a listing that already feels half-finished.</h3>
          <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-zinc-300">
            Brokers enter the deal facts they know, attach a hero photo, and leave the repetitive public-record, location intelligence, and premium copy work to The PIER Commercial Big Brain before review.
          </p>
        </div>
        <div className="rounded-[1.35rem] border border-zinc-950 bg-zinc-950 p-5 text-white shadow-[0_18px_60px_rgba(15,23,42,0.22)]">
          <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#f6a87f]">Minimum to submit</p>
          <p className="mt-3 text-sm leading-6 text-zinc-300">{intakeRequiredSummary}</p>
        </div>
      </section>


      {hasActivePropertyContext ? (
      <> 
      <section data-testid="offering-site-command-center" className="rounded-[1.35rem] border border-[#CB521E]/20 bg-[linear-gradient(180deg,#ffffff,#fff8f4)] p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#CB521E]">Offering Site Command Center</p>
            <h3 className="mt-1 text-xl font-extrabold tracking-tight text-zinc-950">PIER Commercial website builds</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">Launch or refresh the live PIER offering site for the selected property. Broker-visible build logs now expose the exact root cause for Vercel build crashes, schema mismatches, missing required variables, and data-blocking validation errors.</p>
          </div>
          <button type="button" onClick={() => void refreshOfferingSiteJob()} disabled={offeringSiteBusy || !offeringSiteLastJobId} className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-bold text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50">
            {offeringSiteBusy ? "Refreshing…" : "Refresh Status"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="space-y-2">
            <span className="text-xs font-extrabold uppercase tracking-[0.18em] text-zinc-500">Active ListingStream property</span>
            <select value={offeringSiteSelectedListingId} onChange={(event) => setOfferingSiteSelectedListingId(event.target.value)} className={inputClass}>
              <option value="">Select listing to build</option>
              {activeListings.map((listing) => (
                <option key={listing.id} value={getListingSelectionValue(listing)}>{listing.title || listing.address || listing.slug}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void launchOfferingSiteBuild()} disabled={offeringSiteBusy || !offeringSiteSelectedListingId} className="self-end rounded-xl bg-[#CB521E] px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#CB521E]/20 transition hover:bg-[#a94318] disabled:cursor-wait disabled:opacity-60">
            {offeringSiteBusy ? "Building…" : "Launch PIER Offering Site Build"}
          </button>
        </div>

        {offeringSiteSelectedListing ? (
          <p className="mt-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600"><span className="font-bold text-zinc-950">Selected:</span> {offeringSiteSelectedListing.address || offeringSiteSelectedListing.title || offeringSiteSelectedListing.slug}</p>
        ) : null}

        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm font-medium text-zinc-700">{offeringSiteStatus}</div>
        {offeringSiteError ? (
          <div role="alert" className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
            {offeringSiteError}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void autoEnrichOfferingSiteData()} disabled={offeringSiteBusy || !offeringSiteSelectedListingId} className="rounded-xl bg-[#CB521E] px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50">Auto-Enrich Data</button>
              <button type="button" onClick={retryOfferingSiteBuild} disabled={offeringSiteBusy || !offeringSiteCanRetry} className="rounded-xl border border-amber-400 bg-white px-4 py-2 text-sm font-extrabold text-amber-900 disabled:opacity-50">Retry Build</button>
            </div>
          </div>
        ) : null}

        {offeringSiteJob ? (
          <div data-testid="offering-site-simple-status" className={`mt-4 rounded-2xl border p-4 text-sm font-semibold ${offeringSiteJob.status === "failed" || offeringSiteJob.status === "blocked" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
            {offeringSiteJob.status === "deployed" || offeringSiteJob.deployment?.publicUrl || offeringSiteJob.deployment?.routed ? "Offering site is live." : offeringSiteJob.status === "failed" ? `Offering site failed: ${offeringSiteRootCause || "Root cause not returned by backend."}` : offeringSiteJob.status === "blocked" ? `Offering site blocked: ${offeringSiteMissingFields.length ? `Missing ${offeringSiteMissingFields.join(", ")}` : offeringSiteRootCause || "Listing data is incomplete."}` : "Offering site build is in progress."}
          </div>
        ) : null}

        {offeringSiteJob ? (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 text-xs leading-5 text-zinc-500">
            <p><span className="font-bold text-zinc-900">Status:</span> {offeringSiteJob.status === "deployed" || offeringSiteJob.deployment?.publicUrl ? "Live" : offeringSiteJob.status === "failed" ? "Failed — see root cause below" : offeringSiteJob.status === "blocked" ? "Blocked — missing listing data shown below" : "Working"}</p>
            {offeringSiteRootCause ? <p className="mt-2 break-words text-sm font-bold text-amber-800"><span className="text-zinc-900">Root cause:</span> {offeringSiteRootCause}</p> : null}
            {offeringSiteMissingFields.length ? <p className="mt-2 text-sm font-semibold text-amber-800"><span className="text-zinc-900">Missing fields:</span> {offeringSiteMissingFields.join(", ")}</p> : null}
            {(offeringSiteJob.deployment?.publicUrl || offeringSiteJob.deployment?.customDomain) ? <a data-testid="offering-site-live-url" className="mt-2 inline-flex rounded-xl bg-[#CB521E] px-4 py-2 font-extrabold text-white" href={(offeringSiteJob.deployment.publicUrl || offeringSiteJob.deployment.customDomain) as string} target="_blank" rel="noopener noreferrer">Open live offering site</a> : null}
          </div>
        ) : null}

        {offeringSiteJob && offeringSiteLogs.length ? (
          <div data-testid="offering-site-build-logs" className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm xl:p-5">
            <div className="flex flex-col gap-1 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#CB521E]">Transparent Build Logs</p>
                <h4 className="mt-1 text-base font-extrabold text-zinc-950">Actionable pipeline output</h4>
              </div>
              <p className="text-xs font-semibold text-zinc-500">Wide-screen log table optimized for desktop review.</p>
            </div>
            <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200">
              <table className="min-w-[980px] w-full divide-y divide-zinc-200 text-left text-xs">
                <thead className="bg-zinc-50 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
                  <tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Level</th><th className="px-3 py-2">Stage</th><th className="px-3 py-2">Message</th></tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {offeringSiteLogs.slice(-12).map((log, index) => (
                    <tr key={`${log.createdAt || index}-${log.message}`} className={String(log.level || "").toLowerCase() === "error" ? "bg-amber-50 text-amber-950" : "text-zinc-700"}>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px]">{log.createdAt || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-black uppercase">{log.level || "info"}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold">{log.stage || "pipeline"}</td>
                      <td className="px-3 py-2 font-medium leading-5">{log.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <section data-testid="syndication-command-center" className="rounded-[1.35rem] border border-[#CB521E]/20 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#CB521E]">Syndication Command Center</p>
            <h3 className="mt-1 text-xl font-extrabold tracking-tight text-zinc-950">Official external listing distribution</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">Mobile-first control plane for the finalized external channels: CoStar / LoopNet and Crexi. Successful rows confirm the structured listing email was accepted by Resend for the official recipient; ListingStream remains the internal source of truth.</p>
          </div>
          <button type="button" onClick={() => void refreshSyndicationStatus()} disabled={syndicationBusy} className="rounded-xl border border-[#CB521E]/30 bg-[#CB521E] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#a94318] disabled:cursor-wait disabled:opacity-60">
            {syndicationBusy ? "Refreshing…" : "Refresh status"}
          </button>
        </div>
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm font-medium text-zinc-700">{syndicationStatus}</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {syndicationReadiness.map((channel) => (
            <div key={channel.platform} className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-zinc-500">{channel.platform}</p>
              <p className={`mt-2 text-sm font-bold ${channel.enabled && channel.hasCredentialSurface ? "text-emerald-700" : "text-amber-700"}`}>{channel.enabled && channel.hasCredentialSurface ? "Ready" : "Needs credentials"}</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">{channel.strategy}</p>
            </div>
          ))}
        </div>
        {latestSyndicationJob ? (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">Latest job</p>
                <h4 className="mt-1 text-base font-bold text-zinc-950">{latestSyndicationJob.listingTitle}</h4>
                <p className="mt-1 break-all text-xs text-zinc-500">{latestSyndicationJob.slug} • {latestSyndicationJob.status} • {latestSyndicationJob.updatedAt}</p>
              </div>
              <button type="button" onClick={() => void retrySyndicationJob(latestSyndicationJob.id)} disabled={syndicationBusy} className="rounded-xl border border-zinc-300 px-4 py-3 text-sm font-bold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-60">Manual retry</button>
            </div>
            <div className="mt-3 space-y-2">
              {Object.values(latestSyndicationJob.channels ?? {}).map((channel) => (
                <div key={channel.platform} className="flex flex-col gap-2 rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-bold text-zinc-900">{channel.platform}: {channel.status}</p>
                    <p className="mt-1 text-zinc-500">{channel.message}</p>
                  </div>
                  <button type="button" onClick={() => void retrySyndicationJob(latestSyndicationJob.id, channel.platform)} disabled={syndicationBusy} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-bold text-zinc-700 disabled:opacity-60">Retry channel</button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm leading-6 text-zinc-500">No syndication events have been queued yet. The first publish or approved update will create the initial distribution job.</p>
        )}
      </section>
      </>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[1.2rem] border border-[color:rgba(217,119,6,0.16)] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#CB521E]">The PIER Big Brain is Working</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-zinc-950">Leave the repetitive parts to me.</h3>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-zinc-700">
            <li>• Public-record scrape for parcel, lot, building size, year built, and zoning</li>
            <li>• Property-portal payload lookup for active listing modifications</li>
            <li>• Draft title, descriptions, bullet points, and structured deltas where you leave blanks</li>
          </ul>
        </div>
        <div className="rounded-[1.2rem] border border-zinc-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-zinc-500">Broker Note</p>
          <p className="mt-2 text-sm leading-7 text-zinc-700">
            Use the left form to launch a brand-new listing. Use the right form when a listing is already active and you only need a broker delta — price changes, suite availability, fresh photos, or corrected property details.
          </p>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] 2xl:grid-cols-[1.35fr_0.65fr]">
        {newListingIntakeOpen ? (
        <form key={`intake-${formResetKey}`} onSubmit={submitBrokerHubIntake} className={`${cardClass} space-y-6`}>
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#CB521E]">New Listing Intake</p>
            <h3 className="mt-2 text-xl font-semibold text-zinc-950">Broker Hub structure → Big Brain enrichment review</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">Required fields keep the launch grounded. Optional narrative seeds let brokers add nuance without slowing down.</p>
          </div>

          <section className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">1. Property basics</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">{requiredLabel("Street Address")}<input value={intakeForm.addressStreet} onChange={(event) => updateIntake("addressStreet", event.target.value)} className={inputClass} required /></label>
              <label className="space-y-2">{requiredLabel("City")}<input value={intakeForm.city} onChange={(event) => updateIntake("city", event.target.value)} className={inputClass} required /></label>
              <label className="space-y-2">{requiredLabel("State")}<select value={intakeForm.state} onChange={(event) => updateIntake("state", event.target.value)} className={inputClass} required><option value="">Select state</option><option value="GA">GA</option><option value="SC">SC</option></select></label>
              <label className="space-y-2">{requiredLabel("County")}<select value={intakeForm.county} onChange={(event) => updateIntake("county", event.target.value)} className={inputClass} required><option value="">Select county</option>{counties.map((county) => <option key={county}>{county}</option>)}</select></label>
              <label className="space-y-2">{requiredLabel("Parcel ID")}<input value={intakeForm.parcelId} onChange={(event) => updateIntake("parcelId", event.target.value)} className={inputClass} required /></label>
              <label className="space-y-2">{requiredLabel("Latitude", false)}<input value={intakeForm.latitude || ""} onChange={(event) => updateIntake("latitude", event.target.value)} className={inputClass} inputMode="decimal" placeholder="32.043014" aria-label="Manual latitude" /></label>
              <label className="space-y-2">{requiredLabel("Longitude", false)}<input value={intakeForm.longitude || ""} onChange={(event) => updateIntake("longitude", event.target.value)} className={inputClass} inputMode="decimal" placeholder="-81.294012" aria-label="Manual longitude" /></label>
              <label className="space-y-2">{requiredLabel("Property Type")}<select value={intakeForm.propertyType} onChange={(event) => updateIntake("propertyType", event.target.value)} className={inputClass} required><option value="">Select property type</option>{propertyTypes.map((propertyType) => <option key={propertyType}>{propertyType}</option>)}</select></label>
              <label className="space-y-2">{requiredLabel("Lead Broker")}<select value={intakeForm.leadBroker} onChange={(event) => updateIntake("leadBroker", event.target.value)} className={inputClass} required><option value="">Select lead broker</option>{brokers.map((broker) => <option key={broker}>{broker}</option>)}</select></label>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">2. Deal structure</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["Sale", "Lease"] as BrokerHubTransactionType[]).map((type) => (
                <button key={type} type="button" onClick={() => updateIntake("transactionType", type)} className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${intakeForm.transactionType === type ? "border-[#CB521E] bg-[#CB521E]/10 text-[#CB521E]" : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-[#CB521E]/40"}`}>
                  For {type}
                </button>
              ))}
            </div>

            {isSale ? (
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <label className="space-y-2">{requiredLabel("Sale Price", !intakeForm.saleUnpriced)}<input value={intakeForm.salePrice} onChange={(event) => updateIntake("salePrice", event.target.value)} className={inputClass} disabled={Boolean(intakeForm.saleUnpriced)} required={!intakeForm.saleUnpriced} placeholder="$ amount" /></label>
                <label className="mt-7 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700"><input type="checkbox" checked={Boolean(intakeForm.saleUnpriced)} onChange={(event) => updateIntake("saleUnpriced", event.target.checked)} className="h-4 w-4 accent-[#CB521E]" />Unpriced / Inquire</label>
              </div>
            ) : null}

            {isLease ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-zinc-600">Each lease listing needs at least one complete suite row.</p>
                  <button type="button" onClick={() => setSuites((current) => [...current, createSuite()])} className="rounded-xl border border-[#CB521E] px-4 py-2 text-sm font-semibold text-[#CB521E]">+ Add suite</button>
                </div>
                {suites.map((suite, index) => (
                  <div key={index} className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-6">
                    <label className="space-y-2">{requiredLabel("Suite #")}<input value={suite.suiteNumber} onChange={(event) => updateSuite(index, { suiteNumber: event.target.value })} className={inputClass} required={index === 0} /></label>
                    <label className="space-y-2">{requiredLabel("Suite size")}<input value={suite.availableSqFt} onChange={(event) => updateSuite(index, { availableSqFt: event.target.value })} className={inputClass} required={index === 0} placeholder="SF" /></label>
                    <label className="space-y-2">{requiredLabel("Base rent", !suite.unpriced)}<input value={suite.baseRent} onChange={(event) => updateSuite(index, { baseRent: event.target.value })} className={inputClass} disabled={Boolean(suite.unpriced)} required={index === 0 && !suite.unpriced} /></label>
                    <label className="space-y-2">{requiredLabel("Rent type")}<select value={suite.rentType} onChange={(event) => updateSuite(index, { rentType: event.target.value })} className={inputClass} required={index === 0}>{rentTypes.map((rentType) => <option key={rentType}>{rentType}</option>)}</select></label>
                    <label className="mt-7 flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700"><input type="checkbox" checked={Boolean(suite.unpriced)} onChange={(event) => updateSuite(index, { unpriced: event.target.checked })} className="h-4 w-4 accent-[#CB521E]" />Unpriced</label>
                    <button type="button" onClick={() => removeSuite(index)} disabled={suites.length <= 1} className="mt-7 rounded-xl border border-rose-200 bg-white px-3 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">Remove</button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">3. Optional narrative seeds</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">{requiredLabel("Listing Title", false)}<input value={intakeForm.listingTitle} onChange={(event) => updateIntake("listingTitle", event.target.value)} className={inputClass} placeholder="Optional custom title" /></label>
              <label className="space-y-2">{requiredLabel("Property description", false)}<textarea value={intakeForm.propertyDescription} onChange={(event) => updateIntake("propertyDescription", event.target.value)} className={textareaClass} /></label>
              <label className="space-y-2">{requiredLabel("Neighborhood", false)}<textarea value={intakeForm.neighborhoodDescription} onChange={(event) => updateIntake("neighborhoodDescription", event.target.value)} className={textareaClass} /></label>
              <label className="space-y-2">{requiredLabel("Area businesses / retail", false)}<textarea value={intakeForm.areaBusinesses} onChange={(event) => updateIntake("areaBusinesses", event.target.value)} className={textareaClass} /></label>
              <label className="space-y-2">{requiredLabel("Roadways / transportation", false)}<textarea value={intakeForm.roadwaysTransportation} onChange={(event) => updateIntake("roadwaysTransportation", event.target.value)} className={textareaClass} /></label>
              <label className="space-y-2">{requiredLabel("Bullet points", false)}<textarea value={intakeForm.bulletPoints} onChange={(event) => updateIntake("bulletPoints", event.target.value)} className={textareaClass} placeholder="One per line" /></label>
              <label className="space-y-2">{requiredLabel("General broker notes", false)}<textarea value={intakeForm.notes} onChange={(event) => updateIntake("notes", event.target.value)} className={textareaClass} /></label>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">4. Media</h4>
            <label className="space-y-2 block">{requiredLabel("Hero Photo")}<input type="file" accept="image/*" onChange={(event) => setHeroPhoto(fileListToArray(event.target.files)[0] ?? null)} className={inputClass} required /></label>
            <label className="space-y-2 block">{requiredLabel("Additional photos / flyers / documents", false)}<input type="file" multiple onChange={(event) => setIntakeAssets(fileListToArray(event.target.files))} className={inputClass} /></label>
          </section>

          <button disabled={intakeSubmitting} className="rounded-xl bg-[#CB521E] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#a94318] disabled:opacity-50">
            {intakeSubmitting ? "Drafting…" : "Generate Enriched Review Draft"}
          </button>
          <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">{intakeStatus}</p>
        </form>
        ) : null}

        {hasActivePropertyContext ? (
        <form id="listing-revision-form" onSubmit={submitModification} data-testid="listing-revision-tool" key={`modification-${formResetKey}`} className={`${cardClass} h-fit`} noValidate>
          <div className="mb-5">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#CB521E]">Existing Listing Modification</p>
            <h3 className="mt-2 text-xl font-semibold text-zinc-950">Active ListingStream property → plain-English edit</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">The PIER Commercial Big Brain is wired directly to the ListingStream backend and applies only the broker delta.</p>
          </div>
          <div className="space-y-4">
            <select value={selectedPropertyId} onChange={() => undefined} className="sr-only" aria-hidden="true" tabIndex={-1}>
              <option value="">Select active ListingStream listing</option>
              {activeListings.map((listing) => (
                <option key={listing.id} value={getListingSelectionValue(listing)}>{listing.title || listing.address || listing.slug}</option>
              ))}
            </select>
            {listingPickerOpen ? (
              <div data-testid="listing-picker-panel" className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <label className="space-y-2 block">
                  {requiredLabel("Filter active listings", false)}
                  <input
                    data-testid="listing-filter-input"
                    value={listingSearchText}
                    onChange={(event) => updateListingSearch(event.target.value)}
                    className={inputClass}
                    placeholder="Type to filter, or scroll the full property list below"
                    autoComplete="off"
                  />
                </label>
                <div className="mt-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  <span>Active ListingStream properties</span>
                  <span>{filteredAddressListings.length} shown</span>
                </div>
                <div data-testid="active-listing-scrollbox" role="listbox" aria-label="Active ListingStream properties" className="mt-2 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-zinc-200 bg-zinc-50 shadow-inner">
                  {activeListings.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-zinc-500">{activeListingsStatus}</p>
                  ) : filteredAddressListings.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-zinc-500">No listings match your search.</p>
                  ) : (
                    filteredAddressListings.map((listing) => {
                      const value = getListingSelectionValue(listing);
                      return (
                        <button
                          key={listing.id}
                          data-testid="active-listing-option"
                          type="button"
                          role="option"
                          aria-selected={false}
                          onClick={() => selectActiveListing(value)}
                          className="w-full border-b border-zinc-100 px-4 py-3 text-left text-sm text-zinc-700 transition last:border-0 hover:bg-[#CB521E]/5 focus:outline-none focus:ring-2 focus:ring-[#CB521E]/40"
                        >
                          <span>{getListingSearchLabel(listing)}</span>
                          <span className="mt-1 block text-xs font-normal text-zinc-500">{listing.transactionLabel || "ListingStream listing"}{listing.publishStatus === "draft" ? " • Draft Preview" : ""}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
            {selectedListing && !listingPickerOpen ? (
              <div data-testid="selected-listing-summary" className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p><span className="font-semibold text-zinc-900">Selected:</span> {selectedListing.address || selectedListing.title || selectedListing.slug}{selectedListing.publishStatus === "draft" ? " • Draft Preview" : ""}</p>
                  <button type="button" onClick={reopenListingPicker} className="w-full rounded-xl border border-[#CB521E]/30 bg-white px-4 py-2 text-sm font-semibold text-[#CB521E] transition hover:bg-[#CB521E]/5 sm:w-auto">
                    Change Selection
                  </button>
                </div>
              </div>
            ) : null}
            {selectedListing && !listingPickerOpen ? (
              <div data-testid="live-listing-preview-panel" className="overflow-hidden rounded-2xl border border-zinc-300 bg-white shadow-sm">
                <div className="flex flex-col gap-2 border-b border-zinc-200 bg-zinc-950 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#f6a87f]">Embedded Live Public Listing</p>
                    <p className="mt-1 text-sm font-semibold text-white">Current public state for broker review before any edit</p>
                  </div>
                  {selectedListingPublicUrl ? <a href={selectedListingPublicUrl} target="_blank" rel="noopener noreferrer" className="w-full rounded-xl border border-white/20 bg-white px-4 py-2 text-center text-sm font-bold text-zinc-950 transition hover:bg-zinc-100 sm:w-auto">Open full page</a> : null}
                </div>
                {selectedListingPublicUrl ? (
                  <iframe data-testid="live-listing-preview-frame" title={`Live ListingStream preview for ${selectedListing.title || selectedListing.address || selectedListing.slug}`} src={selectedListingPublicUrl} className="h-[72vh] min-h-[520px] w-full bg-white sm:h-[76vh]" />
                ) : (
                  <p className="px-4 py-3 text-sm text-zinc-600">Live public URL is not available for this selection.</p>
                )}
              </div>
            ) : null}
            {selectedListing && !listingPickerOpen ? (
              <div data-testid="live-database-editor" className="rounded-[1.35rem] border-2 border-rose-300 bg-rose-50 p-4 shadow-[0_18px_45px_rgba(225,29,72,0.12)] sm:p-5">
                <div className="rounded-2xl border border-rose-200 bg-white px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-rose-700">Live Database Editor</p>
                  <h4 className="mt-1 text-xl font-extrabold text-zinc-950">Revise or remove the live ListingStream record</h4>
                  <p className="mt-2 text-sm leading-6 text-zinc-700">This tool changes the public database after final approval. It is intentionally isolated from OM/marketing tools so brokers can distinguish listing data changes from marketing collateral edits.</p>
                </div>
                {selectedListing.publishStatus === "draft" ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-950">Draft lifecycle controls</p>
                    <p className="mt-1 text-sm text-amber-900">Draft listings are visible here and by direct preview URL, but hidden from the public website grid until made live.</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {selectedListing.previewUrl ? <a href={selectedListing.previewUrl} target="_blank" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-center text-sm font-semibold text-zinc-900">Open Preview</a> : null}
                      <button type="button" onClick={() => runListingLifecycle("delete-draft")} disabled={reviewBusy} className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">Delete Draft</button>
                      <button type="button" onClick={() => runListingLifecycle("make-live")} disabled={reviewBusy} className="rounded-xl bg-[#CB521E] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Make Live</button>
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 rounded-2xl border border-rose-200 bg-white p-4">
                  <p className="text-sm font-semibold text-rose-950">Permanent delete controls</p>
                  <p className="mt-1 text-sm text-rose-800">Delete removes this listing from Firestore and immediately clears ListingStream public pages, previews, API responses, and listing grids.</p>
                  <button type="button" onClick={() => runListingLifecycle("delete-property")} disabled={reviewBusy || !selectedPropertyId} className="mt-3 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:opacity-50">
                    Delete Listing
                  </button>
                </div>
                <label className="mt-4 block space-y-2">
                  {requiredLabel("Live listing database instructions", false)}
                  <textarea form="listing-revision-form" value={modificationInstructions} onChange={(event) => setModificationInstructions(event.target.value)} className={`${textareaClass} min-h-36 text-base leading-7 sm:text-sm`} placeholder={'Example: "Remove Suite 100 because it leased, add the new TPO roof, and drop the asking rate to $22/SF." To remove the listing, say "archive/remove this listing from the public portal."'} />
                </label>
                <label className="mt-4 block space-y-2">
                  {requiredLabel("Database/media attachments", false)}
                  <input form="listing-revision-form" type="file" multiple onChange={(event) => setModificationAssets(fileListToArray(event.target.files))} className={inputClass} />
                </label>
                <button disabled={modificationSubmitting || !selectedPropertyId} aria-busy={modificationSubmitting} className="mt-4 w-full rounded-xl bg-zinc-950 px-5 py-3 text-sm font-extrabold text-white transition hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-70 sm:w-auto">
                  {modificationSubmitting ? "Generating Database Draft... Please Wait" : "Generate Live Database Revision Draft"}
                </button>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <p className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">{activeListingsStatus}</p>
                  <p className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">{modificationStatus}</p>
                  {modificationError ? <p data-testid="listing-revision-error" role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{modificationError}</p> : null}
                </div>
              </div>
            ) : null}
            {selectedListing && !listingPickerOpen ? (
              <div data-testid="selected-listing-actions" className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                <label className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
                  <input type="checkbox" checked={includeRetailAerial} onChange={(event) => setIncludeRetailAerial(event.target.checked)} disabled={omGenerating} className="mt-1 h-4 w-4 accent-[#CB521E]" />
                  <span><strong className="text-zinc-900">Include advanced retail aerial map</strong><br />On-demand only: queries nearby businesses and composites logo badges onto an aerial map before the Location/Demographics pages.</span>
                </label>
                {showFinancialToggles ? (
                  <div data-testid="om-financial-controls" className="mt-3 rounded-xl border border-[#CB521E]/20 bg-white px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#CB521E]">Phase 5 Financials</p>
                    <p className="mt-1 text-sm text-zinc-600">Manual control only: choose whether the OM generator should build rent roll and proforma pages for this sale listing.</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                        <span><strong className="block text-zinc-900">Include Rent Roll</strong><span className="text-xs text-zinc-500">Add a dedicated rent roll page if source data is available.</span></span>
                        <input type="checkbox" role="switch" checked={includeRentRoll} onChange={(event) => setIncludeRentRoll(event.target.checked)} disabled={omGenerating} className="h-5 w-5 accent-[#CB521E]" />
                      </label>
                      <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                        <span><strong className="block text-zinc-900">Include Proforma</strong><span className="text-xs text-zinc-500">Add a dedicated proforma page if source data is available.</span></span>
                        <input type="checkbox" role="switch" checked={includeProforma} onChange={(event) => setIncludeProforma(event.target.checked)} disabled={omGenerating} className="h-5 w-5 accent-[#CB521E]" />
                      </label>
                    </div>
                  </div>
                ) : null}
                <div data-testid="om-action-buttons" className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button type="button" onClick={() => generateOfferingMemorandum("pdf")} disabled={omGenerating} aria-busy={omGenerating} className="w-full rounded-xl bg-[#CB521E] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a94318] disabled:cursor-wait disabled:opacity-60 sm:w-auto">
                    {omGenerating ? "Generating OM…" : "Generate OM Inline Preview"}
                  </button>
                  <button type="button" onClick={() => generateOfferingMemorandum("html")} disabled={omGenerating} className="w-full rounded-xl border border-[#CB521E]/30 bg-white px-4 py-2 text-sm font-semibold text-[#CB521E] transition hover:bg-[#CB521E]/5 disabled:cursor-wait disabled:opacity-60 sm:w-auto">
                    Preview OM HTML Inline
                  </button>
                </div>
                {(omInlinePreviewUrl || omInlinePreviewHtml) ? (
                  <div data-testid="om-inline-preview-sandbox" className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
                    <div className="flex flex-col gap-1 border-b border-zinc-200 bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
                      <span>Inline OM Preview Sandbox</span>
                      <span>Review here; iterate below; publish only after approval</span>
                    </div>
                    {omInlinePreviewUrl ? <iframe data-testid="om-inline-pdf-frame" title="Inline Offering Memorandum PDF preview" src={omInlinePreviewUrl} className="h-[78vh] w-full bg-white xl:h-[82vh]" /> : null}
                    {omInlinePreviewHtml ? <iframe data-testid="om-inline-html-frame" title="Inline Offering Memorandum HTML preview" srcDoc={omInlinePreviewHtml} className="h-[78vh] w-full bg-white xl:h-[82vh]" /> : null}
                  </div>
                ) : null}
                <div data-testid="om-revision-request" className="mt-4 rounded-2xl border border-[#CB521E]/25 bg-white px-4 py-4 shadow-sm sm:px-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#CB521E]">AI OM Revision Loop</p>
                      <h5 className="mt-1 text-base font-semibold text-zinc-950">Vibe-code this specific OM draft</h5>
                      <p className="mt-1 text-sm leading-6 text-zinc-600">Type localized OM-only changes. The live listing data stays untouched until you approve the rendered preview; approval generates the PDF and attaches it to public listing documents automatically.</p>
                    </div>
                    {omDraftId ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Draft {omDraftId.substring(0, 8)}</span> : null}
                  </div>
                  <label className="mt-4 space-y-2 block">
                    {requiredLabel("Vibe-code instruction", false)}
                    <textarea data-testid="om-vibe-code-textarea" value={omRevisionInstructions} onChange={(event) => setOmRevisionInstructions(event.target.value)} className={`${textareaClass} min-h-32 text-base leading-7 sm:text-sm`} placeholder="Example: Swap the hero image to https://…, insert this floorplan on page 3, and change the highlighted text to Great parking; Road signage available." />
                  </label>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      onClick={requestOfferingMemorandumRevision}
                      disabled={omRevisionBusy || !selectedPropertyId || !omRevisionInstructions.trim()}
                      aria-busy={omRevisionRendering}
                      className={`w-full rounded-xl border border-[#CB521E]/30 bg-white px-4 py-3 text-sm font-semibold text-[#CB521E] transition hover:bg-[#CB521E]/5 disabled:opacity-60 sm:w-auto ${omRevisionRendering ? "cursor-wait" : "disabled:cursor-not-allowed"}`}
                    >
                      {omRevisionRendering ? "Rendering Preview…" : "Generate AI OM Preview"}
                    </button>
                    <button
                      data-testid="om-approve-publish"
                      type="button"
                      onClick={approveOfferingMemorandumDraft}
                      disabled={omRevisionBusy || !omDraftId || !omDraftPreviewHtml}
                      aria-busy={omRevisionApproving}
                      className={`w-full rounded-xl bg-[#CB521E] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#a94318] disabled:opacity-60 sm:w-auto ${omRevisionApproving ? "cursor-wait" : "disabled:cursor-not-allowed"}`}
                    >
                      {omRevisionApproving ? "Publishing OM…" : "Approve + Publish OM"}
                    </button>
                  </div>
                  {omError ? <p data-testid="om-revision-error" role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{omError}</p> : null}
                  {!omDraftPreviewHtml && !omRevisionBusy && !omError ? (
                    <p data-testid="om-revision-idle-state" className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                      Idle: enter a vibe-code instruction, then tap Generate AI OM Preview. No preview rendering starts automatically.
                    </p>
                  ) : null}
                  {omRevisionSummary.length ? (
                    <ul className="mt-3 space-y-1 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      {omRevisionSummary.map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  ) : null}
                  {omDraftPreviewHtml ? (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
                      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        <span>Mobile OM Preview</span>
                        <span>Pinch/scroll inside preview</span>
                      </div>
                      <iframe data-testid="om-draft-preview-frame" title="AI revised OM draft preview" srcDoc={omDraftPreviewHtml} className="w-full min-h-[65vh] bg-white" />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </form>
        ) : null}

        {hasActivePropertyContext ? (
          <form id="email-blast-form" onSubmit={submitMailchimpEmailBlast} data-testid="mailchimp-email-blast" className={`${cardClass} h-fit min-w-0 overflow-hidden`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#CB521E]">Email Blast</p>
            <h4 className="mt-1 text-base font-semibold text-zinc-950">Generate an embedded PIER-branded listing blast preview</h4>
            <p className="mt-1 text-sm leading-6 text-zinc-600">Create and preview the Mailchimp draft inside PIER Manager. Deployment stays locked until a broker-only smoke test is sent to the initiating broker address.</p>
            <p data-testid="mailchimp-broker-context" className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold text-zinc-600">Sender: {mailchimpBrokerContext.name} &lt;{mailchimpBrokerContext.email}&gt;</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <span className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>{requiredLabel("Audience Selector — Mailchimp List / Audience")}</span>
                  <button type="button" onClick={() => loadMailchimpAudiences()} disabled={mailchimpLoading} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-[#CB521E]/40 hover:text-[#CB521E] disabled:cursor-wait disabled:opacity-60 sm:w-auto">
                    {mailchimpLoading ? "Refreshing…" : "Refresh Audiences"}
                  </button>
                </span>
                <select data-testid="mailchimp-audience-select" value={mailchimpAudienceId} onChange={(event) => setMailchimpAudienceId(event.target.value)} className={`${inputClass} w-full min-w-0`} required>
                  <option value="">{mailchimpLoading ? "Loading lists…" : "Select list"}</option>
                  {mailchimpAudiences.map((audience) => <option key={audience.id} value={audience.id}>{audience.name} — {formatAudienceCount(audience.memberCount)}</option>)}
                </select>
              </label>
              <label className="space-y-2 md:col-span-2">
                {requiredLabel("Subject Line")}
                <input value={mailchimpSubjectLine} onChange={(event) => setMailchimpSubjectLine(event.target.value)} className={inputClass} placeholder="Property address | For Sale/Lease | Market" />
              </label>
              <label className="space-y-2">
                {requiredLabel("From Name")}
                <input name="mailchimpFromName" value={mailchimpFromName} onChange={(event) => setMailchimpFromName(event.target.value)} className={inputClass} />
              </label>
              <label className="space-y-2">
                {requiredLabel("From Email")}
                <input name="mailchimpFromEmail" type="email" value={mailchimpFromEmail} onChange={(event) => setMailchimpFromEmail(event.target.value)} className={inputClass} />
              </label>
              <label className="flex items-start justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 md:col-span-2">
                <span><strong className="block text-zinc-900">Include high-level financials</strong><span className="text-xs text-zinc-500">For Building For Sale blasts only; adds available NOI/cap rate/occupancy fields when ListingStream has them.</span></span>
                <input type="checkbox" checked={includeFinancials} onChange={(event) => setIncludeFinancials(event.target.checked)} className="mt-1 h-5 w-5 accent-[#CB521E]" />
              </label>
            </div>
            <div data-testid="mailchimp-action-buttons" className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button type="submit" disabled={mailchimpGenerating || mailchimpLoading || !mailchimpAudienceId || !mailchimpSubjectLine.trim() || !mailchimpFromName.trim() || !mailchimpFromEmail.trim()} aria-busy={mailchimpGenerating} className="w-full rounded-xl bg-[#CB521E] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a94318] disabled:cursor-wait disabled:opacity-60 sm:w-auto">
                {mailchimpGenerating ? "Working…" : "Create Embedded Draft Preview"}
              </button>
              <button type="button" onClick={sendMailchimpBrokerSmokeTest} disabled={mailchimpGenerating || !mailchimpCampaignId} className="w-full rounded-xl border border-[#CB521E]/30 bg-white px-4 py-2 text-sm font-semibold text-[#CB521E] transition hover:bg-[#CB521E]/5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
                Send Broker Smoke Test
              </button>
              <button type="button" onClick={deployMailchimpCampaignToList} disabled={mailchimpGenerating || !mailchimpCampaignId || !mailchimpSmokeTestSent} className="w-full rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
                Deploy to Selected List
              </button>
            </div>
            <p className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">{mailchimpStatus}</p>
            {mailchimpPreviewHtml ? (
              <div data-testid="mailchimp-embedded-preview" className="mt-4 overflow-hidden rounded-2xl border border-zinc-300 bg-zinc-100 shadow-sm">
                <div className="flex flex-col gap-1 border-b border-zinc-200 bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
                  <span>Embedded Mailchimp Draft Preview</span>
                  <span>{mailchimpSmokeTestSent ? "Broker test sent — list deployment unlocked" : "Broker smoke test required before deployment"}</span>
                </div>
                <iframe title="Embedded Mailchimp campaign preview" srcDoc={mailchimpPreviewHtml} className="h-[76vh] min-h-[620px] w-full bg-white xl:h-[82vh]" />
              </div>
            ) : null}
          </form>
        ) : null}
      </div>

      </>
      ) : null}

      {visibleReviewDraft ? (
        <section ref={reviewPanelRef} id="broker-review-draft" tabIndex={-1} data-testid="review-draft-panel" className="rounded-3xl border border-[#CB521E]/30 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-[#CB521E]">Review Draft</p>
              <h3 className="mt-2 text-2xl font-semibold text-zinc-950">{visibleReviewDraft.title}</h3>
              <p className="mt-2 text-sm text-zinc-500">{visibleReviewDraft.kind === "new-listing" ? "New listing Big Brain enrichment" : "Existing listing revised draft"} • {visibleReviewDraft.status}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
              Review all assessor fields, checklist items, revision feedback, and payload preview before final approval.
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm leading-7 text-zinc-800" dangerouslySetInnerHTML={{ __html: visibleReviewDraft.descriptionHtml }} />

          <div data-testid="broker-revise-loop" className="mt-6 rounded-3xl border border-[#CB521E]/25 bg-[#CB521E]/5 p-5">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#CB521E]">Plain-text revise loop</p>
            <h4 className="mt-2 text-lg font-semibold text-zinc-950">Send corrections back to The PIER Commercial Big Brain before publishing</h4>
            <p className="mt-2 text-sm leading-6 text-zinc-700">Type broker feedback here to revise the draft copy or structured payload. This keeps review from becoming a forced publish screen.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <textarea value={revisionFeedback} onChange={(event) => setRevisionFeedback(event.target.value)} className={textareaClass} placeholder="Revise: type broker feedback for The PIER Commercial Big Brain to process before approval" />
              <button type="button" onClick={reviseDraft} disabled={reviewBusy || !revisionFeedback.trim()} className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:border-[#CB521E]/40 hover:bg-[#CB521E]/5 disabled:opacity-50">Revise Draft</button>
            </div>
            {reviewError ? <p data-testid="listing-revision-error" role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{reviewError}</p> : null}
          </div>

          <div data-testid="assessor-data-fields" className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#CB521E]">Assessor Data Review</p>
            <h4 className="mt-2 text-lg font-semibold text-zinc-950">Editable public-record fields before publish</h4>
            <p className="mt-2 text-sm leading-6 text-amber-900">These fields always remain available for manual broker entry when assessor scrape or enrichment data is blank, partial, or wrong.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {assessorReviewFields.map((field) => (
                <label key={field.key} className="space-y-2">
                  {requiredLabel(field.label, false)}
                  <input
                    value={getAssessorFieldValue(visibleReviewDraft, field.key)}
                    onChange={(event) => updateDraftAssessorField(field.key, event.target.value)}
                    className={inputClass}
                    placeholder={field.placeholder}
                  />
                </label>
              ))}
            </div>
          </div>

          {visibleReviewDraft.highlights.length ? (
            <ul className="mt-5 grid gap-2 md:grid-cols-2">{visibleReviewDraft.highlights.map((highlight) => <li key={highlight} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">{highlight}</li>)}</ul>
          ) : null}
          {visibleReviewDraft.mediaNotes.length ? <p className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">Media notes: {visibleReviewDraft.mediaNotes.join(" • ")}</p> : null}

          <div data-testid="review-checklist-panel" className="mt-6 rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#CB521E]">Review Checklist</p>
            <h4 className="mt-2 text-lg font-semibold text-zinc-950">Mack enrichment review</h4>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {renderChecklistColumn("Auto-filled", reviewChecklist.autoFilled, "good")}
              {renderChecklistColumn("Needs manual input", reviewChecklist.needsManualInput, "warn")}
              {renderChecklistColumn("Failed / blocked scrapes", reviewChecklist.failedScrapes, "bad")}
              {renderChecklistColumn("ListingStream-ready", reviewChecklist.listingStreamReady, "ready")}
            </div>
          </div>

          {visibleReviewDraft.kind === "modification" && visibleReviewDraft.review.deltaPreview ? (
            <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.28em] text-[#CB521E]">Before / After Delta</p>
                  <h4 className="mt-2 text-lg font-semibold text-zinc-950">Natural-language structured changes</h4>
                </div>
                {visibleReviewDraft.review.interpreter ? <p className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">Interpreter Confidence: {visibleReviewDraft.review.interpreter.confidence}</p> : null}
              </div>
              {visibleReviewDraft.review.interpreter?.summary.length ? (
                <ul className="mt-4 grid gap-2 md:grid-cols-2">{visibleReviewDraft.review.interpreter.summary.map((item) => <li key={item} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{item}</li>)}</ul>
              ) : null}
              {visibleReviewDraft.review.interpreter?.flags.length ? (
                <ul className="mt-4 grid gap-2 md:grid-cols-2">{visibleReviewDraft.review.interpreter.flags.map((item) => <li key={item} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{item}</li>)}</ul>
              ) : null}
              <div data-testid="delta-summary-list" className="mt-4 space-y-2">
                {deltaSummaryRows.length ? deltaSummaryRows.map((row) => (
                  <div key={`${row.label}-${row.before}-${row.after}`} className="grid gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm md:grid-cols-[1.1fr_0.9fr] md:items-center">
                    <span className="font-semibold text-zinc-900">{row.label}</span>
                    <span className="text-zinc-700"><span className="font-medium">{row.before}</span> <span className="px-1 text-[#CB521E]">➔</span> <span className="font-semibold text-zinc-950">{row.after}</span></span>
                  </div>
                )) : <p className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">No field-level changes detected.</p>}
              </div>
            </div>
          ) : null}


          <div ref={finalPublishActionsRef} id="final-publish-actions" data-testid="final-publish-actions" className="mt-5 rounded-3xl border border-[#CB521E]/30 bg-white p-5">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#CB521E]">Final approval after payload review</p>
            <h4 className="mt-2 text-lg font-semibold text-zinc-950">Save a hidden preview or publish live</h4>
            <p className="mt-2 text-sm leading-6 text-zinc-600">Use Draft Preview for safe review without Ascendix. Use Approve & Publish Live only after the checklist, manual assessor data, and visible review fields are correct.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => publishDraft("draft-preview")} disabled={reviewBusy} className="rounded-xl border border-[#CB521E] bg-white px-5 py-3 text-sm font-semibold text-[#CB521E] transition hover:bg-[#CB521E]/5 disabled:opacity-50">Save as Draft & Preview</button>
              <button type="button" onClick={() => publishDraft("publish-live")} disabled={reviewBusy} className="rounded-xl bg-[#CB521E] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#a94318] disabled:opacity-50">Approve & Publish Live</button>
            </div>
          </div>

          {draftPreviewUrl ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <p className="font-semibold">Draft preview saved successfully.</p>
              <a data-testid="draft-preview-link" href={draftPreviewUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex rounded-xl bg-[#CB521E] px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#CB521E]/20 hover:bg-[#a94318]">View Draft Preview</a>
              <p className="mt-2 break-all text-xs">{draftPreviewUrl}</p>
            </div>
          ) : null}
          <p className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">{reviewStatus}</p>
          {reviewError ? <p data-testid="listing-revision-error" role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{reviewError}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
