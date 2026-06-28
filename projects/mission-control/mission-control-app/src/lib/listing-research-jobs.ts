import { randomUUID } from "node:crypto";

import { getFirebaseAccessToken } from "@/lib/mission-control-firebase-storage";
import type { ListingResearchInput, ListingResearchReviewDraft } from "@/lib/listing-research-orchestrator";

export type ListingResearchJobStatus = "queued" | "running" | "completed" | "failed";

export type ListingResearchJob = {
  id: string;
  mode: "new-listing";
  status: ListingResearchJobStatus;
  input: ListingResearchInput;
  requestedBy: string;
  workerId: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  result: ListingResearchReviewDraft | null;
  dossierUrl: string | null;
  draftUrl: string | null;
  error: string | null;
  providerErrors?: Record<string, string>;
};

export function getListingResearchJobCollectionPath() {
  return "listingResearchJobs";
}

function firebaseProjectId() {
  const projectId = (process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim();
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required for listingResearchJobs queue operations.");
  return projectId;
}

function firestoreBaseUrl() {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseProjectId())}/databases/(default)/documents`;
}

function nowIso(now = new Date()) {
  return now.toISOString();
}

export function buildListingResearchJob(input: {
  mode: "new-listing";
  input: ListingResearchInput;
  requestedBy?: string;
  now?: Date;
}): ListingResearchJob {
  const timestamp = nowIso(input.now);
  return {
    id: "",
    mode: input.mode,
    status: "queued",
    input: input.input || {},
    requestedBy: input.requestedBy || "pier-manager",
    workerId: null,
    attempts: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: null,
    completedAt: null,
    result: null,
    dossierUrl: null,
    draftUrl: null,
    error: null,
  };
}

function encodeValue(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  return { stringValue: JSON.stringify(value) };
}

function decodeValue(value: any): unknown {
  if (!value || typeof value !== "object") return null;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("integerValue" in value) return Number(value.integerValue || 0);
  if ("doubleValue" in value) return Number(value.doubleValue || 0);
  return null;
}

function maybeJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function firestoreFieldsForJob(job: ListingResearchJob) {
  return {
    mode: encodeValue(job.mode),
    status: encodeValue(job.status),
    inputJson: encodeValue(job.input),
    requestedBy: encodeValue(job.requestedBy),
    workerId: encodeValue(job.workerId),
    attempts: encodeValue(job.attempts),
    createdAt: encodeValue(job.createdAt),
    updatedAt: encodeValue(job.updatedAt),
    startedAt: encodeValue(job.startedAt),
    completedAt: encodeValue(job.completedAt),
    resultJson: encodeValue(job.result),
    dossierUrl: encodeValue(job.dossierUrl),
    draftUrl: encodeValue(job.draftUrl),
    error: encodeValue(job.error),
    providerErrorsJson: encodeValue(job.providerErrors || null),
  };
}

function idFromName(name?: string) {
  return String(name || "").split("/").pop() || "";
}

export function normalizeListingResearchJob(id: string, fields: Record<string, unknown> = {}): ListingResearchJob {
  return {
    id,
    mode: fields.mode === "new-listing" ? "new-listing" : "new-listing",
    status: ["queued", "running", "completed", "failed"].includes(String(fields.status)) ? fields.status as ListingResearchJobStatus : "queued",
    input: maybeJson<ListingResearchInput>(fields.inputJson, typeof fields.input === "object" && fields.input ? fields.input as ListingResearchInput : {}),
    requestedBy: String(fields.requestedBy || "pier-manager"),
    workerId: fields.workerId ? String(fields.workerId) : null,
    attempts: Number(fields.attempts || 0),
    createdAt: String(fields.createdAt || nowIso()),
    updatedAt: String(fields.updatedAt || fields.createdAt || nowIso()),
    startedAt: fields.startedAt ? String(fields.startedAt) : null,
    completedAt: fields.completedAt ? String(fields.completedAt) : null,
    result: maybeJson<ListingResearchReviewDraft | null>(fields.resultJson, null),
    dossierUrl: fields.dossierUrl ? String(fields.dossierUrl) : null,
    draftUrl: fields.draftUrl ? String(fields.draftUrl) : null,
    error: fields.error ? String(fields.error) : null,
    providerErrors: maybeJson<Record<string, string> | undefined>(fields.providerErrorsJson, undefined),
  };
}

function jobFromFirestoreDocument(document: any): ListingResearchJob {
  const rawFields = document?.fields || {};
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawFields)) fields[key] = decodeValue(value);
  return normalizeListingResearchJob(idFromName(document?.name), fields);
}

async function firestoreFetch(pathOrUrl: string, init: RequestInit = {}) {
  const token = await getFirebaseAccessToken();
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${firestoreBaseUrl()}${pathOrUrl}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Firestore listingResearchJobs request failed (${response.status}): ${JSON.stringify(payload).slice(0, 500)}`);
  return payload;
}

export async function createListingResearchJob(input: {
  mode: "new-listing";
  input: ListingResearchInput;
  requestedBy?: string;
}) {
  const jobId = `lrj_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const job = { ...buildListingResearchJob(input), id: jobId };
  const payload = await firestoreFetch(`/${getListingResearchJobCollectionPath()}?documentId=${encodeURIComponent(jobId)}`, {
    method: "POST",
    body: JSON.stringify({ fields: firestoreFieldsForJob(job) }),
  });
  return jobFromFirestoreDocument(payload);
}

export async function getListingResearchJob(jobId: string) {
  const payload = await firestoreFetch(`/${getListingResearchJobCollectionPath()}/${encodeURIComponent(jobId)}`, { method: "GET" });
  return jobFromFirestoreDocument(payload);
}

export async function listListingResearchJobs() {
  const payload = await firestoreFetch(`/${getListingResearchJobCollectionPath()}?pageSize=50`, { method: "GET" });
  return Array.isArray(payload.documents) ? payload.documents.map(jobFromFirestoreDocument) : [];
}

export function isListingResearchJobReadyForWorker(job: ListingResearchJob, now = new Date(), staleRunningMs = 20 * 60_000) {
  if (job.status === "queued") return true;
  if (job.status !== "running") return false;
  const updated = Date.parse(job.updatedAt || job.startedAt || "");
  return Number.isFinite(updated) && now.getTime() - updated > staleRunningMs;
}

export async function updateListingResearchJob(job: ListingResearchJob) {
  const payload = await firestoreFetch(`/${getListingResearchJobCollectionPath()}/${encodeURIComponent(job.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: firestoreFieldsForJob(job) }),
  });
  return jobFromFirestoreDocument(payload);
}

export async function claimNextListingResearchJob(input: { workerId: string; staleRunningMs?: number; now?: Date }) {
  const now = input.now || new Date();
  const jobs = (await listListingResearchJobs())
    .filter((job: ListingResearchJob) => isListingResearchJobReadyForWorker(job, now, input.staleRunningMs))
    .sort((a: ListingResearchJob, b: ListingResearchJob) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const job = jobs[0];
  if (!job) return null;
  return updateListingResearchJob({
    ...job,
    status: "running",
    workerId: input.workerId,
    attempts: (job.attempts || 0) + 1,
    startedAt: job.startedAt || nowIso(now),
    updatedAt: nowIso(now),
    error: null,
  });
}

export async function completeListingResearchJob(job: ListingResearchJob, result: ListingResearchReviewDraft) {
  const meta = (result.structuredUpdates?.meta || {}) as Record<string, unknown>;
  const mirror = (meta.firebaseResearchMirror || {}) as Record<string, unknown>;
  const dossier = (meta.researchDossier || {}) as { providerErrors?: Record<string, string> };
  return updateListingResearchJob({
    ...job,
    status: "completed",
    result,
    providerErrors: dossier.providerErrors,
    dossierUrl: typeof mirror.dossier === "string" ? mirror.dossier : job.dossierUrl,
    draftUrl: typeof mirror.draft === "string" ? mirror.draft : job.draftUrl,
    completedAt: nowIso(),
    updatedAt: nowIso(),
    error: null,
  });
}

export async function failListingResearchJob(job: ListingResearchJob, error: unknown) {
  return updateListingResearchJob({
    ...job,
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
    completedAt: nowIso(),
    updatedAt: nowIso(),
  });
}
