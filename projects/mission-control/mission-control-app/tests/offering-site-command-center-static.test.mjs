import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync("src/components/pier-manager-listing-console.tsx", "utf8");
const route = readFileSync("src/app/api/listingstream/offering-sites/route.ts", "utf8");
const revisionRoute = readFileSync("src/app/api/listingstream/offering-site-revisions/route.ts", "utf8");
const activeListingsRoute = readFileSync("src/app/api/listingstream/active-listings/route.ts", "utf8");
const autoEnrichRoute = readFileSync("src/app/api/listingstream/auto-enrich/route.ts", "utf8");

test("Offering Site Command Center exposes a clean single-click launch interface", () => {
  assert.match(component, /data-testid="offering-site-command-center"/);
  assert.match(component, /Offering Site Command Center/);
  assert.match(component, /Launch PIER Offering Site Build/);
  assert.match(component, /activeListings\.map/);
  assert.match(component, /offeringSiteSelectedListingId/);
  assert.match(component, /\/api\/listingstream\/offering-sites/);
  assert.match(component, /data-testid="offering-site-live-url"/);
  assert.match(component, /Open site/);
  assert.match(component, /data-testid="offering-site-simple-status"/);
});

test("Offering Site Command Center separates website-only revisions from listing-data modifications", () => {
  assert.match(component, /data-testid="offering-site-no-website-state"/);
  assert.match(component, /No offering website has been created for this listing yet/);
  assert.match(component, /data-testid="offering-site-revision-form"/);
  assert.match(component, /Request Website Changes/);
  assert.match(component, /Plain-English website instructions/);
  assert.match(component, /Optional photos \/ PDFs \/ maps \/ floor plans/);
  assert.match(component, /Send Website Change Request/);
  assert.match(component, /Website changes are in progress\. This can take up to 10 minutes/);
  assert.match(component, /Modify Listing changes listing data\. Request Website Changes changes the standalone offering website only/);
  assert.match(component, /\/api\/listingstream\/offering-site-revisions/);
  assert.match(revisionRoute, /buildPropertyPortalUrl\(`\/api\/offering-sites\/\$\{encodeURIComponent\(listingId\)\}\/revise`\)/);
  assert.match(revisionRoute, /uploadMissionControlFirebaseFile/);
  assert.match(revisionRoute, /brokerInstructions/);
});

test("PIER Manager OM Revision loop surfaces backend/no-change failures instead of returning to Idle", () => {
  assert.match(component, /AI failed to apply changes\. Try rephrasing/);
  assert.match(component, /data-testid="om-revision-error"/);
  assert.match(component, /role="alert"/);
  assert.match(component, /!omDraftPreviewHtml && !omRevisionBusy && !omError/);
  assert.match(component, /if \(!data\.draftId \|\| !data\.previewHtml\)/);
});

test("Offering Site Command Center keeps broker controls simple while exposing root-cause logs", () => {
  assert.doesNotMatch(component, /offeringSiteTimelineSteps/);
  assert.doesNotMatch(component, />\{step\.gate\}<|Gate 1|Gate 2|Gate 3|Gate 5/);
  assert.doesNotMatch(component, /Source Pulled & Scrubbed|Market Context & Copy Enriched|Responsive Layout Compiled|Site Live & Routed/);
  assert.match(component, /Transparent Build Logs/);
});

test("Offering Site Command Center surfaces transparent root-cause logs with retry controls", () => {
  assert.match(component, /blocked/i);
  assert.match(component, /failed/i);
  assert.match(component, /Retry Build/);
  assert.match(component, /Auto-Enrich Data/);
  assert.match(component, /autoEnrichOfferingSiteData/);
  assert.match(component, /retryOfferingSiteBuild/);
  assert.match(component, /missingFields/);
  assert.match(component, /offeringSiteRootCause/);
  assert.match(component, /data-testid="offering-site-build-logs"/);
  assert.match(component, /Transparent Build Logs/);
  assert.match(component, /Actionable pipeline output/);
});

test("Mission Control proxy protects and forwards ListingStream offering-site jobs", () => {
  assert.match(route, /requirePierManagerAuth/);
  assert.match(route, /buildPropertyPortalUrl\(`\/api\/offering-sites\/\$\{encodeURIComponent\(listingId\)\}`\)/);
  assert.match(route, /getPropertyPortalInternalHeaders/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function GET/);
  assert.match(route, /offering site/);
});

test("Choose your workflow requests the complete active portfolio and exposes Auto-Enrich Data", () => {
  assert.match(component, /portfolio=all/);
  assert.match(activeListingsRoute, /showCompletePortfolio/);
  assert.match(activeListingsRoute, /portfolio/);
  assert.doesNotMatch(activeListingsRoute, /limit:\s*4|take:\s*4|slice\(0,\s*4/);
  assert.match(autoEnrichRoute, /\/api\/admin\/properties\/auto-enrich/);
  assert.match(autoEnrichRoute, /Auto-Enrich Data/);
});

test("Offering Site dashboard finalizes live routed URL for sharing without device assumptions", () => {
  assert.match(component, /deployment\?\.publicUrl/);
  assert.match(component, /deployment\?\.customDomain/);
  assert.match(component, /Offering site is live\./);
  assert.match(component, /Published Website Address/);
  assert.doesNotMatch(component, /retry from your phone|send it from your phone|on mobile/i);
});

test("PIER Manager publish flow keeps desktop work unblocked while global Auto-Enrich runs", () => {
  assert.match(component, /Global Auto-Enrich is running asynchronously in the background/);
  assert.match(component, /you can keep working from this desktop console/);
  assert.match(component, /SAGIS\/municipal data backfills the table/);
});
