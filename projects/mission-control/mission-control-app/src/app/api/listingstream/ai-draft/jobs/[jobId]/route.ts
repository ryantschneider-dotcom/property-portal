import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { getListingResearchJob } from "@/lib/listing-research-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    await requirePierManagerAuth();
    const { jobId } = await context.params;
    if (!jobId) return NextResponse.json({ error: "Missing listing research job id" }, { status: 400 });
    const job = await getListingResearchJob(jobId);
    return NextResponse.json({ ok: true, job, draft: job.status === "completed" ? job.result : null });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load listing research job" }, { status: 503 });
  }
}
