import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { getListingResearchJob, findRecentCompletedListingResearchJob, type ListingResearchJob } from "@/lib/listing-research-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3, delayMs = 750): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
  throw new Error(`${label} failed after ${attempts} attempt(s): ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    await requirePierManagerAuth();
    const { jobId } = await context.params;
    if (!jobId) return NextResponse.json({ error: "Missing listing research job id" }, { status: 400 });
    const job = await withRetry<ListingResearchJob>("listing research job status lookup", () => getListingResearchJob(jobId));
    if (job.status === "completed" && !job.result) {
      const recovered = await withRetry("completed listing research draft recovery", () => findRecentCompletedListingResearchJob(job.input), 2, 500).catch(() => null);
      if (recovered?.result) return NextResponse.json({ ok: true, job: recovered, draft: recovered.result, recoveredFromJobId: recovered.id });
    }
    return NextResponse.json({ ok: true, job, draft: job.status === "completed" ? job.result : null });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load listing research job" }, { status: 503 });
  }
}
