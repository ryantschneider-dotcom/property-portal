import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Mission Control active plain-text revise loop renders Force Manus Re-Enrichment control", () => {
  const source = readFileSync(new URL("../src/components/pier-manager-listing-console.tsx", import.meta.url), "utf8");
  assert.match(source, /data-testid="broker-revise-loop"/);
  assert.match(source, /Plain-text revise loop/i);
  assert.match(source, /data-testid="force-manus-reenrichment-panel"/);
  assert.match(source, /Force Manus Re-Enrichment/);
  assert.match(source, /Neighborhood Context and every other field are blocked/);
  assert.match(source, /w-full rounded-xl bg-\[#CB521E\]/);
  assert.match(source, /\/api\/listingstream\/force-manus-reenrichment/);
});

test("Mission Control exposes proxy routes for async ListingStream Manus re-enrichment", () => {
  const postRoute = readFileSync(new URL("../src/app/api/listingstream/force-manus-reenrichment/route.ts", import.meta.url), "utf8");
  const statusRoute = readFileSync(new URL("../src/app/api/listingstream/force-manus-reenrichment/status/route.ts", import.meta.url), "utf8");
  assert.match(postRoute, /force-manus-reenrichment/);
  assert.match(postRoute, /getPropertyPortalInternalHeaders/);
  assert.match(postRoute, /no-store/);
  assert.match(statusRoute, /force-manus-reenrichment\/status/);
  assert.match(statusRoute, /listingId is required/);
});
