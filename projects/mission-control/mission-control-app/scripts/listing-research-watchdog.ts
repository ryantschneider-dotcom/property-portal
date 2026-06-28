import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { listListingResearchJobs } from "../src/lib/listing-research-jobs";

const DEFAULT_WORKER_ENV_FILE = "/Users/macclaw/.hermes/secure-pier-credentials/mission-control-worker.env";
const WORKER_ENV_FILE = process.env.LISTING_RESEARCH_WORKER_ENV_FILE || DEFAULT_WORKER_ENV_FILE;
const WORKER_ERR_LOG = process.env.LISTING_RESEARCH_WORKER_ERR_LOG || "/Users/macclaw/Library/Logs/pier-listing-research-worker.err.log";
const STATE_FILE = process.env.LISTING_RESEARCH_WATCHDOG_STATE_FILE || "/Users/macclaw/.hermes/state/listing-research-watchdog-state.json";
const QUEUED_STALE_MS = Number(process.env.LISTING_RESEARCH_WATCHDOG_QUEUED_STALE_MS || 10 * 60_000);
const RUNNING_TIMEOUT_MS = Number(process.env.LISTING_RESEARCH_WATCHDOG_RUNNING_TIMEOUT_MS || 45 * 60_000);
const PROVIDER_FAILURE_LOOKBACK_MS = Number(process.env.LISTING_RESEARCH_WATCHDOG_PROVIDER_LOOKBACK_MS || 30 * 60_000);

type WatchdogState = { signature?: string; active?: boolean; firstSeen?: string; lastAlerted?: string };

function loadDotEnvFile(filePath: string, options: { override?: boolean } = {}) {
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
    if (options.override || !process.env[key]) process.env[key] = value;
  }
}

function readState(): WatchdogState {
  try { return JSON.parse(readFileSync(STATE_FILE, "utf8")) as WatchdogState; } catch { return {}; }
}

function writeState(state: WatchdogState) {
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function signatureFor(items: string[]) {
  return createHash("sha256").update(items.join("\n")).digest("hex");
}

function workerProcessIsRunning() {
  try {
    const output = execFileSync("pgrep", ["-fl", "listing-research-worker.ts"], { encoding: "utf8" });
    return output.split(/\r?\n/).some((line) => line.includes("listing-research-worker.ts") && !line.includes("listing-research-watchdog"));
  } catch {
    return false;
  }
}

function ageLabel(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 90) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

function classifyWorkerLogFailure(logText: string) {
  const lines = logText.split(/\r?\n/).filter(Boolean);
  const timedOut = lines.some((line) => /ETIMEDOUT|ConnectTimeout|fetch failed/i.test(line));
  if (!timedOut) return null;
  const tickFailed = lines.some((line) => /\[listing-research-worker\] tick failed/i.test(line));
  if (tickFailed) {
    return "Firestore queue connectivity: worker tick failed while reading/claiming listingResearchJobs before any provider call. Likely Google API network path, not Claude/Gemini/Manus auth.";
  }
  const provider = lines.find((line) => /Claude|Anthropic|OpenAI|Gemini|Manus/i.test(line));
  if (provider) return `Provider connectivity: ${provider.replace(/\s+/g, " ").slice(0, 180)}`;
  return "Unknown network connectivity failure in worker log: ETIMEDOUT/fetch failed without provider label.";
}

function recentLogSummary() {
  if (!existsSync(WORKER_ERR_LOG)) return null;
  const text = readFileSync(WORKER_ERR_LOG, "utf8");
  const recent = text.split(/\r?\n/).slice(-160).join("\n");
  return classifyWorkerLogFailure(recent);
}

async function main() {
  loadDotEnvFile(WORKER_ENV_FILE, { override: true });
  delete process.env.PIER_MANAGER_SERVERLESS_FAST_DRAFT;
  delete process.env.VERCEL;

  const now = new Date();
  const alerts: string[] = [];

  if (!workerProcessIsRunning()) alerts.push("Worker process is DOWN: no listing-research-worker.ts process is running.");

  let jobs: Awaited<ReturnType<typeof listListingResearchJobs>> = [];
  try {
    jobs = await listListingResearchJobs();
  } catch (error) {
    alerts.push(`Firestore queue read failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const providerFailures = new Map<string, { count: number; since: number; jobIds: string[] }>();
  for (const job of jobs) {
    const address = job.input?.addressStreet || job.input?.address || job.input?.listingTitle || job.id;
    if (job.status === "queued") {
      const created = Date.parse(job.createdAt || job.updatedAt || "");
      if (Number.isFinite(created) && now.getTime() - created > QUEUED_STALE_MS) alerts.push(`Queued job stale: ${job.id} has waited ${ageLabel(now.getTime() - created)} (${address}).`);
    }
    if (job.status === "running") {
      const started = Date.parse(job.startedAt || job.updatedAt || "");
      if (Number.isFinite(started) && now.getTime() - started > RUNNING_TIMEOUT_MS) alerts.push(`Running job stale: ${job.id} has run ${ageLabel(now.getTime() - started)} (${address}).`);
    }
    if (job.status === "failed" && job.error && Date.parse(job.updatedAt || "") > now.getTime() - PROVIDER_FAILURE_LOOKBACK_MS) alerts.push(`Recent failed job: ${job.id} — ${String(job.error).slice(0, 180)}.`);
    if (job.providerErrors && Object.keys(job.providerErrors).length) {
      const updated = Date.parse(job.updatedAt || job.completedAt || "");
      if (!Number.isFinite(updated) || now.getTime() - updated <= PROVIDER_FAILURE_LOOKBACK_MS) {
        for (const provider of Object.keys(job.providerErrors)) {
          const bucket = providerFailures.get(provider) || { count: 0, since: updated || now.getTime(), jobIds: [] };
          bucket.count += 1;
          bucket.since = Math.min(bucket.since, updated || now.getTime());
          if (bucket.jobIds.length < 5) bucket.jobIds.push(job.id);
          providerFailures.set(provider, bucket);
        }
      }
    }
  }

  for (const [provider, bucket] of [...providerFailures.entries()].sort()) {
    alerts.push(`Provider errors: ${provider} affected ${bucket.count} recent job(s) since ${new Date(bucket.since).toISOString()} — examples: ${bucket.jobIds.join(", ")}.`);
  }

  const logSummary = recentLogSummary();
  if (logSummary) alerts.push(`Worker log network failure: ${logSummary}`);

  const state = readState();
  if (!alerts.length) {
    if (state.active) console.log("PIER listing research watchdog recovered: no active worker/job/provider alerts.");
    writeState({ active: false, signature: "healthy" });
    return;
  }

  const signature = signatureFor(alerts);
  if (state.active && state.signature === signature) return;

  const firstSeen = state.signature === signature && state.firstSeen ? state.firstSeen : now.toISOString();
  writeState({ active: true, signature, firstSeen, lastAlerted: now.toISOString() });
  console.log(["PIER listing research watchdog alert", `First seen: ${firstSeen}`, ...alerts].join("\n"));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`PIER listing research watchdog crashed: ${message}`);
  process.exitCode = 1;
});
