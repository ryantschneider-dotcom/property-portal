import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync("src/components/pier-manager-listing-console.tsx", "utf8");
const route = readFileSync("src/app/api/listingstream/offering-sites/route.ts", "utf8");

test("Gate 4 exposes mobile offering-site launch command center in PIER Manager", () => {
  assert.match(component, /data-testid="offering-site-command-center"/);
  assert.match(component, /Offering Site Command Center/);
  assert.match(component, /Launch Golden Isles Site Build/);
  assert.match(component, /activeListings\.map/);
  assert.match(component, /offeringSiteSelectedListingId/);
  assert.match(component, /\/api\/listingstream\/offering-sites/);
  assert.match(component, /gate:\s*"5"/);
  assert.match(component, /data-testid="offering-site-live-url"/);
  assert.match(component, /Open \/ copy live offering site/);
});

test("Gate 4 renders mobile step timeline for Gates 1, 2, 3, and future Gate 5", () => {
  for (const label of [
    "Source Pulled & Scrubbed",
    "Market Context & Copy Enriched",
    "Responsive Layout Compiled",
    "Site Live & Routed",
  ]) {
    assert.match(component, new RegExp(label.replace(/[&]/g, "\\&")));
  }
  assert.match(component, /offeringSiteTimelineSteps/);
  assert.match(component, /rounded-3xl/);
  assert.match(component, /sm:grid-cols/);
});

test("Gate 4 surfaces blocked and failed states with retry controls", () => {
  assert.match(component, /blocked/i);
  assert.match(component, /failed/i);
  assert.match(component, /Retry Build/);
  assert.match(component, /retryOfferingSiteBuild/);
  assert.match(component, /baseline\.validation\.missingFields/);
  assert.match(component, /offeringSiteError/);
});

test("Gate 4 Mission Control proxy protects and forwards ListingStream offering-site jobs", () => {
  assert.match(route, /requirePierManagerAuth/);
  assert.match(route, /buildPropertyPortalUrl\("\/api\/admin\/offering-sites"\)/);
  assert.match(route, /getPropertyPortalInternalHeaders/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function GET/);
  assert.match(route, /offering site/);
});


test("Gate 5 dashboard finalizes live routed URL for mobile sharing", () => {
  assert.match(component, /deployment\?\.publicUrl/);
  assert.match(component, /deployment\?\.customDomain/);
  assert.match(component, /Offering site is live and routed/);
  assert.match(component, /Copy the public URL below and send it from your phone/);
  assert.match(component, /Site Live & Routed/);
});
