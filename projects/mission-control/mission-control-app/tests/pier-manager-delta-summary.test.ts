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

test("summarizeDeltaChanges makes newly-added suites visible instead of no-change fallback", () => {
  const rows = summarizeDeltaChanges({
    before: { admin: { suites: [{ suiteNumber: "Back Building Suite", availableSqFt: "1900", baseRent: "Call", rentType: "Annual" }] } },
    after: {
      admin: {
        suites: [
          { suiteNumber: "Back Building Suite", availableSqFt: "1900", baseRent: "Call", rentType: "Annual" },
          { suiteNumber: "M", availableSqFt: "1900", baseRent: "1900", rentType: "Monthly" },
        ],
      },
    },
  });

  assert.ok(rows.length > 0, "suite addition must produce visible delta rows");
  assert.deepEqual(rows[0], {
    label: "Suite M",
    before: "Not present",
    after: "Added: 1,900 SF • $1,900 • Monthly",
  });
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
  assert.match(source, /extractDraftPreviewUrl/);
  assert.match(source, /result\.save\?\.slug/);
});
