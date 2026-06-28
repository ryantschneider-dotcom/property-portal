import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  buildListingResearchJob,
  getListingResearchJobCollectionPath,
  isListingResearchJobReadyForWorker,
  normalizeListingResearchJob,
} from "../src/lib/listing-research-jobs";

test("listing research jobs are created as queued Firestore queue records", () => {
  const job = buildListingResearchJob({
    mode: "new-listing",
    input: { address: "1539 Pooler Parkway, Pooler, GA", rawNotes: "minimal intake" },
    requestedBy: "test-broker",
    now: new Date("2026-06-28T12:00:00.000Z"),
  });

  assert.equal(getListingResearchJobCollectionPath(), "listingResearchJobs");
  assert.equal(job.status, "queued");
  assert.equal(job.mode, "new-listing");
  assert.deepEqual(job.input, { address: "1539 Pooler Parkway, Pooler, GA", rawNotes: "minimal intake" });
  assert.equal(job.attempts, 0);
  assert.equal(job.result, null);
  assert.equal(job.error, null);
  assert.equal(job.createdAt, "2026-06-28T12:00:00.000Z");
  assert.equal(job.updatedAt, "2026-06-28T12:00:00.000Z");
});

test("worker can reclaim queued or stale running listing research jobs after reboot", () => {
  const now = new Date("2026-06-28T12:30:00.000Z");
  const queued = normalizeListingResearchJob("queued-job", { status: "queued", updatedAt: "2026-06-28T12:29:00.000Z" });
  const freshRunning = normalizeListingResearchJob("fresh-running", { status: "running", updatedAt: "2026-06-28T12:25:00.000Z" });
  const staleRunning = normalizeListingResearchJob("stale-running", { status: "running", updatedAt: "2026-06-28T11:55:00.000Z" });
  const completed = normalizeListingResearchJob("completed", { status: "completed", updatedAt: "2026-06-28T11:55:00.000Z" });

  assert.equal(isListingResearchJobReadyForWorker(queued, now, 20 * 60_000), true);
  assert.equal(isListingResearchJobReadyForWorker(freshRunning, now, 20 * 60_000), false);
  assert.equal(isListingResearchJobReadyForWorker(staleRunning, now, 20 * 60_000), true);
  assert.equal(isListingResearchJobReadyForWorker(completed, now, 20 * 60_000), false);
});

test("ai-draft route enqueues new-listing drafts instead of running Vercel research synchronously", async () => {
  const source = await readFile("src/app/api/listingstream/ai-draft/route.ts", "utf8");
  assert.match(source, /createListingResearchJob/);
  assert.match(source, /status:\s*202/);
  assert.doesNotMatch(source, /runListingResearchAndDraft\(\{ input: body\.input \}\)/);
});

test("Broker Hub polls listing research jobs and shows honest queued and fallback states", async () => {
  const source = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  assert.match(source, /listingResearchJobId/);
  assert.match(source, /\/api\/listingstream\/ai-draft\/jobs\/\$\{encodeURIComponent\(jobId\)\}/);
  assert.match(source, /Research not yet run — do not publish/i);
  assert.match(source, /queued|researching|ready/i);
});

test("Mac mini worker script disables serverless fast draft and runs the real orchestrator", async () => {
  const source = await readFile("scripts/listing-research-worker.ts", "utf8");
  assert.match(source, /PIER_MANAGER_SERVERLESS_FAST_DRAFT/);
  assert.match(source, /delete process\.env\.PIER_MANAGER_SERVERLESS_FAST_DRAFT/);
  assert.match(source, /claimNextListingResearchJob/);
  assert.match(source, /runListingResearchAndDraft/);
  assert.match(source, /completeListingResearchJob/);
});
