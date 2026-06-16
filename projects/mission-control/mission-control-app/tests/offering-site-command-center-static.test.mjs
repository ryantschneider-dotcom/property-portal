import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync("src/components/pier-manager-listing-console.tsx", "utf8");
const route = readFileSync("src/app/api/listingstream/offering-sites/route.ts", "utf8");

test("Offering Site Command Center exposes a clean single-click launch interface", () => {
  assert.match(component, /data-testid="offering-site-command-center"/);
  assert.match(component, /Offering Site Command Center/);
  assert.match(component, /Launch PIER Offering Site Build/);
  assert.match(component, /activeListings\.map/);
  assert.match(component, /offeringSiteSelectedListingId/);
  assert.match(component, /\/api\/listingstream\/offering-sites/);
  assert.match(component, /data-testid="offering-site-live-url"/);
  assert.match(component, /Open live offering site/);
  assert.match(component, /data-testid="offering-site-simple-status"/);
});

test("Offering Site Command Center hides internal Gate pipeline cards from brokers", () => {
  assert.doesNotMatch(component, /offeringSiteTimelineSteps/);
  assert.doesNotMatch(component, />\{step\.gate\}<|Gate 1|Gate 2|Gate 3|Gate 5/);
  assert.doesNotMatch(component, /Source Pulled & Scrubbed|Market Context & Copy Enriched|Responsive Layout Compiled|Site Live & Routed/);
  assert.match(component, /Internal build stages stay behind the scenes/);
});

test("Offering Site Command Center surfaces simple blocked and failed states with retry controls", () => {
  assert.match(component, /blocked/i);
  assert.match(component, /failed/i);
  assert.match(component, /Retry Build/);
  assert.match(component, /retryOfferingSiteBuild/);
  assert.match(component, /baseline\.validation\.missingFields/);
  assert.match(component, /offeringSiteError/);
});

test("Mission Control proxy protects and forwards ListingStream offering-site jobs", () => {
  assert.match(route, /requirePierManagerAuth/);
  assert.match(route, /buildPropertyPortalUrl\("\/api\/admin\/offering-sites"\)/);
  assert.match(route, /getPropertyPortalInternalHeaders/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function GET/);
  assert.match(route, /offering site/);
});

test("Offering Site dashboard finalizes live routed URL for sharing", () => {
  assert.match(component, /deployment\?\.publicUrl/);
  assert.match(component, /deployment\?\.customDomain/);
  assert.match(component, /Offering site is live and routed/);
  assert.match(component, /Copy the public URL below and send it from your phone/);
});
