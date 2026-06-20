import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { buildPropertyPortalUrl, createPropertyPortalProxyError, getPropertyPortalInternalHeaders, safePropertyPortalFetch } from "@/lib/property-portal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

const PRODUCTION_FACTORY_MESSAGE = "Your site is being built at the PIER Website Production Factory. Check back in 5 minutes, then 10 minutes, then 15 minutes. The link will appear here automatically when it is ready.";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNestedRecord(source: Record<string, unknown>, key: string) {
  const value = source[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeManusJob(listingId: string, payload: Record<string, unknown>) {
  const sourceJob = readNestedRecord(payload, "job");
  const status = clean(payload.status) || clean(sourceJob?.status) || "building";
  const taskId = clean(payload.task_id) || clean(payload.taskId) || clean(sourceJob?.id);
  const url = clean(payload.url) || clean(payload.publicUrl) || clean(readNestedRecord(sourceJob ?? {}, "deployment")?.publicUrl) || clean(sourceJob?.publicUrl);
  const now = new Date().toISOString();
  return {
    ...(sourceJob ?? {}),
    id: listingId,
    listingId,
    status: url || status === "complete" ? "deployed" : status,
    createdAt: clean(sourceJob?.createdAt) || now,
    updatedAt: clean(sourceJob?.updatedAt) || now,
    completedAt: url ? clean(sourceJob?.completedAt) || now : clean(sourceJob?.completedAt) || null,
    deployment: {
      ...(readNestedRecord(sourceJob ?? {}, "deployment") ?? {}),
      publicUrl: url || null,
      customDomain: url || null,
      routed: Boolean(url),
    },
    logs: Array.isArray(sourceJob?.logs) ? sourceJob.logs : [{ level: "info", stage: "manus", message: taskId ? `Manus task ${taskId} accepted by PIER Website Production Factory.` : PRODUCTION_FACTORY_MESSAGE, createdAt: now }],
    error: clean(payload.error) || clean(sourceJob?.error) || undefined,
    message: url ? "Your site is live" : clean(payload.message) || clean(sourceJob?.message) || PRODUCTION_FACTORY_MESSAGE,
  };
}

async function forwardManusLaunch(listingId: string) {
  return safePropertyPortalFetch(fetch, buildPropertyPortalUrl(`/api/offering-sites/${encodeURIComponent(listingId)}`), {
    method: "POST",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...getPropertyPortalInternalHeaders(),
    },
  }, "Manus offering site launch");
}

async function forwardManusStatus(listingId: string) {
  return safePropertyPortalFetch(fetch, buildPropertyPortalUrl(`/api/offering-sites/${encodeURIComponent(listingId)}/status`), {
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...getPropertyPortalInternalHeaders(),
    },
  }, "Manus offering site status");
}

export async function GET(request: Request) {
  try {
    await requirePierManagerAuth();
    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId")?.trim();
    if (!jobId) return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    const response = await forwardManusStatus(jobId);
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    return NextResponse.json({ ...data, job: normalizeManusJob(jobId, data) }, { status: response.status });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const normalized = createPropertyPortalProxyError(error, "offering site status");
    return NextResponse.json({ error: normalized.message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    await requirePierManagerAuth();
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const listingId = clean(body.listingId);
    if (!listingId) return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    const response = await forwardManusLaunch(listingId);
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    return NextResponse.json({ ...data, job: normalizeManusJob(listingId, data) }, { status: response.status });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const normalized = createPropertyPortalProxyError(error, "offering site launch/retry");
    return NextResponse.json({ error: normalized.message }, { status: 503 });
  }
}
