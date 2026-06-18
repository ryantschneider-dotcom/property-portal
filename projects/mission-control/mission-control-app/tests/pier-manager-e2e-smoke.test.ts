import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { normalizeIncomingBrokerReviewDraft } from "../src/lib/broker-review-draft-normalizer";
import { createModificationReviewDraft, type PropertyPortalCloudWriter } from "../src/lib/property-portal-ai";
import { summarizeDeltaChanges } from "../src/lib/pier-manager-delta-summary";

const liveListingPayload = {
  id: "e2e-live-listing-2812",
  slug: "e2e-live-listing-2812",
  title: "2812 Williams Street",
  address: "2812 Williams Street, Savannah, GA",
  visibility: { transactionLabel: "For Lease", status: "available", statusBadgeLabel: "Available" },
  pricing: { availableSqFt: 1900, suiteNumbers: "M" },
  admin: {
    suites: [
      { suiteNumber: "M", availableSqFt: "1,900", baseRent: "$1,900/month", rentType: "Modified Gross", suiteNotes: "Storage space" },
    ],
  },
  content: {
    propertyDescription: "Functional in-town storage opportunity.",
  },
};

test("PIER Manager E2E smoke: live listing payload submits to frontier draft cycle and Before / After Delta renders safely", async () => {
  const writer: PropertyPortalCloudWriter = async (prompt) => {
    assert.match(prompt, /Current property-portal listing payload/);
    assert.match(prompt, /Suite M/);
    return {
      title: "2812 Williams Street Revision Draft",
      descriptionHtml: "<p>Suite M is updated for broker review with the requested climate-controlled storage note.</p>",
      highlights: ["Suite M climate-controlled storage note added", "No publish occurs until approval"],
      structuredUpdates: {
        admin: {
          suites: [
            { suiteNumber: "M", suiteNotes: "Suite M offers climate-controlled storage with convenient in-town access." },
          ],
        },
        reviewFlags: { listingStreamReady: ["Suite M notes"] },
      },
      mediaNotes: [],
    };
  };

  const fetchImpl = async () => Response.json(liveListingPayload);
  const draft = await createModificationReviewDraft({
    propertyIdOrSlug: "e2e-live-listing-2812",
    instructions: "Update Suite M notes to say it offers climate-controlled storage with convenient in-town access.",
    fetchImpl: fetchImpl as typeof fetch,
    writer,
  });
  const normalized = normalizeIncomingBrokerReviewDraft(draft, {
    kind: "modification",
    title: "2812 Williams Street",
    sourceInput: { propertyIdOrSlug: "e2e-live-listing-2812" },
    currentListing: liveListingPayload,
  });
  const deltaRows = summarizeDeltaChanges(normalized.review.deltaPreview);

  assert.equal(normalized.kind, "modification");
  assert.match(normalized.descriptionHtml, /Suite M/);
  assert.ok(normalized.review.deltaPreview, "draft must include a parseable delta preview");
  assert.ok(deltaRows.some((row) => /admin\.suites|suite/i.test(row.label)), "Before / After Delta must include suite changes");
  assert.doesNotThrow(() => JSON.stringify(normalized.review.deltaPreview));

  const component = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");
  assert.match(component, /data-testid="review-draft-panel"/);
  assert.match(component, /Before \/ After Delta/);
  assert.match(component, /deltaSummaryRows\.map/);
});

test("PIER Manager frontend surfaces timeout, rejected, and malformed JSON failures as visible alerts", async () => {
  const component = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");

  assert.match(component, /Malformed ListingStream JSON response/);
  assert.match(component, /AI draft generation timed out in the browser/);
  assert.match(component, /data-testid="listing-revision-error"/);
  assert.match(component, /role="alert"/);
  assert.match(component, /setModificationError/);
  assert.match(component, /setReviewError/);
});

test("PIER Manager AI draft route and client timeout budgets are long enough for frontier model latency", async () => {
  const route = await readFile("src/app/api/listingstream/ai-draft/route.ts", "utf8");
  const component = await readFile("src/components/pier-manager-listing-console.tsx", "utf8");

  assert.match(route, /export const maxDuration = 300/);
  assert.match(route, /PIER_MANAGER_AI_DRAFT_ROUTE_TIMEOUT_MS[\s\S]*240_000/);
  assert.match(component, /PIER_MANAGER_FRONTIER_DRAFT_TIMEOUT_MS\s*=\s*300_000/);
  assert.match(component, /fetchJsonWithTimeout\("\/api\/listingstream\/ai-draft"[\s\S]*PIER_MANAGER_FRONTIER_DRAFT_TIMEOUT_MS/);
});

test("MissionShell applies global sticky-header clearance so no route content is hidden behind the header", async () => {
  const shell = await readFile("src/components/mission-shell.tsx", "utf8");
  const globals = await readFile("src/app/globals.css", "utf8");

  assert.match(shell, /MISSION_SHELL_HEADER_HEIGHT_CLASS/);
  assert.match(shell, /sticky top-0/);
  assert.match(shell, /scroll-pt-\[var\(--mission-shell-header-height\)\]/);
  assert.match(shell, /pt-\[calc\(var\(--mission-shell-header-height\)\+1\.5rem\)\]/);
  assert.match(shell, /data-testid="mission-shell-content"/);
  assert.match(shell, /flex min-h-screen min-w-0 flex-col bg-\[#f6f4f1\]/);
  assert.doesNotMatch(shell, /h-dvh|h-screen min-w-0 flex-col overflow-hidden|min-h-0 flex-1 overflow-auto/);
  assert.match(globals, /html \{[\s\S]*background: #f6f4f1/);
});
