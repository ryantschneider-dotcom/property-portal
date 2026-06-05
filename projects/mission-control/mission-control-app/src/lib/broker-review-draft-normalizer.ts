import type { BrokerReviewDraft, PropertyPortalReviewChecklist } from "@/lib/property-portal-ai";
import type { BrokerEditInterpreterResult } from "@/lib/broker-edit-interpreter";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asString(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function asStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

function asRecord(value: unknown) {
  return isRecord(value) ? value : {};
}

function normalizeChecklist(value: unknown): PropertyPortalReviewChecklist {
  const checklist = asRecord(value);
  return {
    autoFilled: asStringList(checklist.autoFilled),
    needsManualInput: asStringList(checklist.needsManualInput),
    failedScrapes: asStringList(checklist.failedScrapes),
    listingStreamReady: asStringList(checklist.listingStreamReady),
  };
}

function normalizeInterpreter(value: unknown): BrokerEditInterpreterResult | undefined {
  if (!isRecord(value)) return undefined;
  const confidence: BrokerEditInterpreterResult["confidence"] = value.confidence === "high" || value.confidence === "medium" || value.confidence === "low" ? value.confidence : "low";
  return {
    summary: asStringList(value.summary),
    flags: asStringList(value.flags),
    confidence,
    updatePayload: asRecord(value.updatePayload),
  };
}

function normalizeDeltaPreview(value: unknown) {
  if (!isRecord(value)) return undefined;
  return {
    before: asRecord(value.before),
    after: asRecord(value.after),
  };
}

export function normalizeIncomingBrokerReviewDraft(
  value: unknown,
  fallback: { kind?: BrokerReviewDraft["kind"]; title?: string; sourceInput?: Record<string, unknown>; currentListing?: Record<string, unknown> } = {},
): BrokerReviewDraft {
  const raw = asRecord(value);
  const nestedReadyDraft = raw.ready_for_broker_review ?? raw.readyForBrokerReview ?? raw.brokerReviewDraft ?? raw.reviewDraft;
  const draft = isRecord(nestedReadyDraft) ? nestedReadyDraft : raw;
  const review = asRecord(draft.review);
  const kind = draft.kind === "new-listing" || draft.kind === "modification" ? draft.kind : fallback.kind ?? "modification";
  const structuredUpdates = asRecord(draft.structuredUpdates);
  const sourceInput = Object.keys(asRecord(draft.sourceInput)).length ? asRecord(draft.sourceInput) : fallback.sourceInput ?? {};
  const currentListing = Object.keys(asRecord(draft.currentListing)).length ? asRecord(draft.currentListing) : fallback.currentListing;
  const checklist = normalizeChecklist(review.checklist);

  if (!checklist.listingStreamReady.length) {
    checklist.listingStreamReady = ["Broker review draft", "Approval controls"];
  }
  if (!checklist.needsManualInput.length && !Object.keys(structuredUpdates).length) {
    checklist.needsManualInput = ["Review AI output before publishing; the draft payload was partial."];
  }

  return {
    id: asString(draft.id, `draft-${Date.now()}`),
    kind,
    status: "ready_for_broker_review",
    publishLive: false,
    title: asString(draft.title, fallback.title ?? "AI draft ready for broker review"),
    descriptionHtml: asString(draft.descriptionHtml || draft.description, "<p>The AI returned a partial draft. Review the fields below, revise if needed, then save a draft preview or publish live.</p>"),
    highlights: asStringList(draft.highlights || draft.bullets),
    structuredUpdates,
    mediaNotes: asStringList(draft.mediaNotes),
    sourceInput,
    currentListing,
    review: {
      approved: false,
      revisionCount: typeof review.revisionCount === "number" && Number.isFinite(review.revisionCount) ? review.revisionCount : 0,
      feedbackHistory: asStringList(review.feedbackHistory),
      checklist,
      interpreter: normalizeInterpreter(review.interpreter),
      deltaPreview: normalizeDeltaPreview(review.deltaPreview),
    },
  };
}
