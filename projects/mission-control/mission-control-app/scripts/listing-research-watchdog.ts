import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { listListingResearchJobs } from "../src/lib/listing-research-jobs";

const DEFAULT_WORKER_ENV_FILE = "/Users/macclaw/.hermes/secure-pier-credentials/mission-control-worker.env";
const WORKER_ENV_FILE = process.env.LISTING_RESEARCH_WORKER_ENV_FILE || DEFAULT_WORKER_ENV_FILE;
const WORKER_ERR_LOG = process.env.LISTING_RESEARCH_WORKER_ERR_LOG || "/Users/macclaw/Library/Logs/pier-listing-research-worker.err.log";
const QUEUED_STALE_MS = Number(process.env.LISTING_RESEARCH_WATCHDOG_QUEUED_STALE_MS || 10 * 60_000);
const RUNNING_TIMEOUT_MS = Number(process.env.LISTING_RESEARCH_WATCHDOG_RUNNING_TIMEOUT_MS || 45 * 60_000);
const PROVIDER_FAILURE_LOOKBACK_MS = Number(process.env.LISTING_RESEARCH_WATCHDOG_PROVIDER_LOOKBACK_MS || 30 * 60_000);

const PROVIDER_FAILURE_PATTERNS = [
  /ANTHROPIC_API_KEY/i,
  /OPENAI_API_KEY/i,
  /GEMINI_API_KEY/i,
  /Claude/i,
  /Anthropic/i,
  /OpenAI/i,
  /Gemini/i,
  /provider/i,
  /rate limit/i,
  /401|403|429|5\d\d/,
  /ECONNRESET|ETIMEDOUT|timeout/i,
];

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

function workerProcessIsRunning() {
  try {
    const output = execFileSync("pgrep", ["-fl", "listing-research-worker.ts"], { encoding: "utf8" });
    return output.split(/\r?\n/).some((line) => line.includes("listing-research-worker.ts") && !line.includes("listing-research-watchdog"));
  } catch {
    return false;
  }
}

function ageLabel(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 90) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

function timestampFromLogLine(line: string) {
  const match = line.match(/(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)/);
  return match ? Date.parse(match[1]) : NaN;
}

function recentProviderFailures(now: Date) {
  if (!existsSync(WORKER_ERR_LOG)) return [] as string[];
  const lines = readFileSync(WORKER_ERR_LOG, "utf8").split(/\r?\n/).slice(-300);
  return lines.filter((line) => {
    if (!line.trim()) return false;
    const parsed = timestampFromLogLine(line);
    if (Number.isFinite(parsed) && now.getTime() - parsed > PROVIDER_FAILURE_LOOKBACK_MS) return false;
    return PROVIDER_FAILURE_PATTERNS.some((pattern) => pattern.test(line));
  }).slice(-8);
}

async function main() {
  loadDotEnvFile(WORKER_ENV_FILE, { override: true });
  delete process.env.PIER_MANAGER_SERVERLESS_FAST_DRAFT;
  delete process.env.VERCEL;

  const now = new Date();
  const alerts: string[] = [];

  if (!workerProcessIsRunning()) {
    alerts.push("PIER listing research worker process is DOWN: no listing-research-worker.ts process is running.");
  }

  let jobs;
  try {
    jobs = await listListingResearchJobs();
  } catch (error) {
    alerts.push(`PIER listing research watchdog could not read Firestore jobs: ${error instanceof Error ? error.message : String(error)}`);
    jobs = [];
  }

  for (const job of jobs) {
    const address = job.input?.addressStreet || job.input?.address || job.input?.listingTitle || job.id;
    if (job.status === "queued") {
      const created = Date.parse(job.createdAt || job.updatedAt || "");
      if (Number.isFinite(created) && now.getTime() - created > QUEUED_STALE_MS) {
        alerts.push(`PIER listing research job ${job.id} has been queued for ${ageLabel(now.getTime() - created)} without pickup: ${address}`);
      }
    }
    if (job.status === "running") {
      const started = Date.parse(job.startedAt || job.updatedAt || "");
      if (Number.isFinite(started) && now.getTime() - started > RUNNING_TIMEOUT_MS) {
        alerts.push(`PIER listing research job ${job.id} has been running for ${ageLabel(now.getTime() - started)}: ${address}`);
      }
    }
    if (job.status === "failed" && job.error && Date.parse(job.updatedAt || "") > now.getTime() - PROVIDER_FAILURE_LOOKBACK_MS) {
      alerts.push(`PIER listing research job ${job.id} failed recently: ${String(job.error).slice(0, 240)}`);
    }
    if (job.providerErrors && Object.keys(job.providerErrors).length) {
      const updated = Date.parse(job.updatedAt || job.completedAt || "");
      if (!Number.isFinite(updated) || now.getTime() - updated <= PROVIDER_FAILURE_LOOKBACK_MS) {
        alerts.push(`PIER listing research job ${job.id} recorded provider errors: ${Object.keys(job.providerErrors).join(", ")}`);
      }
    }
  }

  const providerFailures = recentProviderFailures(now);
  if (providerFailures.length) {
    alerts.push(`PIER listing research provider errors in worker log:\n${providerFailures.join("\n")}`);
  }

  if (alerts.length) console.log(alerts.join("\n\n"));
}

main().catch((error) => {
  console.log(`PIER listing research watchdog crashed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
