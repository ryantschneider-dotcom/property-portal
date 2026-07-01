import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Mission Control active plain-text revise loop renders Force Manus Re-Enrichment control", () => {
  const source = readFileSync(new URL("../src/components/pier-manager-listing-console.tsx", import.meta.url), "utf8");
  assert.match(source, /data-testid="broker-revise-loop"/);
  assert.match(source, /Plain-text revise loop/i);
  assert.match(source, /data-testid="force-manus-reenrichment-panel"/);
  const reviseIndex = source.indexOf("Revise Draft");
  const forceIndex = source.indexOf("Force Manus Re-Enrichment");
  assert.ok(reviseIndex > -1, "standard Revise Draft button must remain in the active revise loop");
  assert.ok(forceIndex > -1, "Force Manus Re-Enrichment button must render in the active revise loop");
  assert.ok(reviseIndex < forceIndex, "standard Revise Draft control should render before the Manus force panel so the original loop is never displaced");
  assert.match(source, /placeholder="Revise: type broker feedback/);
  assert.match(source, /Neighborhood Context and every other field are blocked/);
  assert.match(source, /w-full rounded-xl bg-\[#CB521E\]/);
  assert.match(source, /\/api\/listingstream\/force-manus-reenrichment/);
});

test("Mission Control initial live database editor exposes one-click Manus enrichment without notes validation", () => {
  const source = readFileSync("src/components/pier-manager-listing-console.tsx", "utf8");
  assert.match(source, /Generate Live Database Revision Draft/);
  assert.match(source, /Enrich via Manus \(Property Description, Location Description, Highlights\)/);
  assert.match(source, /onClick=\{generateManusEnrichmentDraft\}/);
  assert.match(source, /No notes required\. Creates the review draft and immediately starts Manus/);
  assert.match(source, /autoStartManus: true/);
  assert.match(source, /startForceManusReEnrichmentForListing\(getForceReEnrichmentListingId\(draft\)\)/);
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
