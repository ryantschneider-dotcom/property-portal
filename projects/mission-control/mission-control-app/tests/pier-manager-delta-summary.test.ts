import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { summarizeDeltaChanges } from "../src/lib/pier-manager-delta-summary";

test("summarizeDeltaChanges renders broker-readable changed fields without raw JSON", () => {
  const rows = summarizeDeltaChanges({
    before: { admin: { suites: [{ suiteNumber: "M", availableSqFt: "0", baseRent: "Call" }] } },
    after: { admin: { suites: [{ suiteNumber: "M", availableSqFt: "1900", baseRent: "1900", rentType: "Monthly" }] } },
  });

  assert.deepEqual(rows.map((row) => row.label), ["Suite M Available Sq. Ft.", "Suite M Rent Rate", "Suite M Rent Type"]);
  assert.deepEqual(rows.map((row) => `${row.before} -> ${row.after}`), ["0 -> 1900", "Call -> 1900", "— -> Monthly"]);
  const visibleText = rows.map((row) => `${row.label}: ${row.before} -> ${row.after}`).join("\n");
  assert.doesNotMatch(visibleText, /\{|\}|admin|suites|baseRent|availableSqFt/);
});

test("PIER Manager visible delta panel uses summary rows and no raw before-after JSON blocks", async () => {
  const source = await readFile(new URL("../src/components/pier-manager-listing-console.tsx", import.meta.url), "utf8");

  assert.match(source, /summarizeDeltaChanges/);
  assert.match(source, /data-testid="delta-summary-list"/);
  assert.doesNotMatch(source, /data-testid="delta-raw-json"/);
  assert.doesNotMatch(source, /<pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-zinc-700">\{compactJson\(visibleReviewDraft\.review\.deltaPreview\.(before|after)\)\}<\/pre>/);
});

test("PIER Manager success UI renders a highly visible View Draft Preview link", async () => {
  const source = await readFile(new URL("../src/components/pier-manager-listing-console.tsx", import.meta.url), "utf8");

  assert.match(source, /View Draft Preview/);
  assert.match(source, /data-testid="draft-preview-link"/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);
});
