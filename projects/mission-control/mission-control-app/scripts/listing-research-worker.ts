import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  claimNextListingResearchJob,
  completeListingResearchJob,
  failListingResearchJob,
  type ListingResearchJob,
} from "../src/lib/listing-research-jobs";
import { runListingResearchAndDraft } from "../src/lib/listing-research-orchestrator";

const APP_ROOT = process.env.MISSION_CONTROL_APP_ROOT || process.cwd();
const WORKER_ID = process.env.LISTING_RESEARCH_WORKER_ID || `${os.hostname()}-${process.pid}`;
const POLL_MS = Number(process.env.LISTING_RESEARCH_WORKER_POLL_MS || 10_000);
const STALE_RUNNING_MS = Number(process.env.LISTING_RESEARCH_WORKER_STALE_MS || 30 * 60_000);

function loadDotEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2] ?? "";
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function bootstrapEnvironment() {
  loadDotEnvFile(path.join(APP_ROOT, ".env.worker.local"));
  loadDotEnvFile(path.join(APP_ROOT, ".env.local"));
  loadDotEnvFile(path.join(APP_ROOT, ".env"));
  // The whole point of this worker is to run the real research chain outside Vercel.
  delete process.env.PIER_MANAGER_SERVERLESS_FAST_DRAFT;
  delete process.env.VERCEL;
  process.env.MISSION_CONTROL_APP_ROOT = APP_ROOT;
}

async function processJob(job: ListingResearchJob) {
  console.log(`[listing-research-worker] running ${job.id} (${job.input?.addressStreet || job.input?.address || job.input?.listingTitle || "untitled"})`);
  try {
    const draft = await runListingResearchAndDraft({ input: job.input, mirrorToFirebase: true });
    await completeListingResearchJob(job, draft);
    console.log(`[listing-research-worker] completed ${job.id}`);
  } catch (error) {
    await failListingResearchJob(job, error);
    console.error(`[listing-research-worker] failed ${job.id}`, error);
  }
}

async function tick() {
  const job = await claimNextListingResearchJob({ workerId: WORKER_ID, staleRunningMs: STALE_RUNNING_MS });
  if (job) await processJob(job);
}

async function main() {
  bootstrapEnvironment();
  console.log(`[listing-research-worker] started worker=${WORKER_ID} appRoot=${APP_ROOT} pollMs=${POLL_MS}`);
  while (true) {
    try {
      await tick();
    } catch (error) {
      console.error("[listing-research-worker] tick failed", error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

main().catch((error) => {
  console.error("[listing-research-worker] fatal", error);
  process.exit(1);
});
