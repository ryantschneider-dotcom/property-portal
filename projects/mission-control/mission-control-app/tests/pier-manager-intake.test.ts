import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildBrokerHubIntakePayload,
  buildBrokerHubPortalFormData,
  getBrokerHubIntakeMissingFields,
  type BrokerHubIntakeInput,
} from "../src/lib/pier-manager-intake";

const baseInput: BrokerHubIntakeInput = {
  addressStreet: "2812 Williams Street",
  city: "Savannah",
  state: "GA",
  county: "Chatham",
  parcelId: "20000 01001",
  propertyType: "Industrial",
  leadBroker: "Ryan T. Schneider",
  transactionType: "Sale",
  salePrice: "1250000",
  saleUnpriced: false,
  heroPhotoCount: 1,
  listingTitle: "2812 Williams Street",
  propertyDescription: "Flexible contractor office/warehouse.",
  neighborhoodDescription: "East Savannah trade area.",
  areaBusinesses: "Nearby industrial users and service businesses.",
  roadwaysTransportation: "Immediate access to major Savannah corridors.",
  bulletPoints: "Updated roof\nFlexible loading\nStrong owner-user fit",
  notes: "Broker says position for owner-user or investor.",
  suites: [],
};

test("Broker Hub sale intake requires Mack primary fields and hero photo", () => {
  assert.deepEqual(getBrokerHubIntakeMissingFields(baseInput), []);
  assert.deepEqual(getBrokerHubIntakeMissingFields({ ...baseInput, addressStreet: "" }), ["addressStreet"]);
  assert.deepEqual(getBrokerHubIntakeMissingFields({ ...baseInput, city: "" }), ["city"]);
  assert.deepEqual(getBrokerHubIntakeMissingFields({ ...baseInput, county: "" }), ["county"]);
  assert.deepEqual(getBrokerHubIntakeMissingFields({ ...baseInput, parcelId: "" }), ["parcelId"]);
  assert.deepEqual(getBrokerHubIntakeMissingFields({ ...baseInput, heroPhotoCount: 0 }), ["heroPhoto"]);
});

test("Broker Hub sale intake requires sale price unless unpriced/inquire is selected", () => {
  assert.deepEqual(getBrokerHubIntakeMissingFields({ ...baseInput, salePrice: "", saleUnpriced: true }), []);
  assert.deepEqual(getBrokerHubIntakeMissingFields({ ...baseInput, salePrice: "", saleUnpriced: false }), ["salePrice"]);
});

test("Broker Hub lease intake requires one complete suite row instead of sale price", () => {
  const leaseInput: BrokerHubIntakeInput = {
    ...baseInput,
    transactionType: "Lease",
    salePrice: "",
    saleUnpriced: false,
    suites: [{ suiteNumber: "100", availableSqFt: "2400", baseRent: "22", rentType: "NNN", unpriced: false }],
  };

  assert.deepEqual(getBrokerHubIntakeMissingFields(leaseInput), []);
  assert.deepEqual(getBrokerHubIntakeMissingFields({ ...leaseInput, suites: [] }), ["suites"]);
  assert.deepEqual(getBrokerHubIntakeMissingFields({ ...leaseInput, suites: [{ ...leaseInput.suites[0], baseRent: "", unpriced: true }] }), []);
  assert.deepEqual(getBrokerHubIntakeMissingFields({ ...leaseInput, suites: [{ ...leaseInput.suites[0], baseRent: "", unpriced: false }] }), ["suites"]);
});

test("Broker Hub payload preserves narrative seeds but keeps them optional", () => {
  const payload = buildBrokerHubIntakePayload({
    ...baseInput,
    propertyDescription: "",
    neighborhoodDescription: "",
    areaBusinesses: "",
    roadwaysTransportation: "",
    bulletPoints: "Visibility\nAccess",
  });

  assert.equal(payload.mode, "broker-hub-intake");
  assert.equal(payload.reviewOnly, true);
  assert.equal(payload.publishLive, false);
  assert.equal(payload.requestedWorkflow, "listingstream-draft-enrich-review");
  assert.equal(payload.transactionType, "Sale");
  assert.equal(payload.salePrice, "1250000");
  assert.deepEqual(payload.narrativeSeeds.bulletPoints, ["Visibility", "Access"]);
  assert.equal(payload.narrativeSeeds.propertyDescription, "");
});

test("Broker Hub FormData forwards rich payload and hero/media assets without WordPress", () => {
  const formData = buildBrokerHubPortalFormData({
    payload: buildBrokerHubIntakePayload(baseInput),
    heroPhoto: new File(["hero"], "hero.jpg", { type: "image/jpeg" }),
    assets: [new File(["flyer"], "flyer.pdf", { type: "application/pdf" })],
  });

  const payload = JSON.parse(String(formData.get("payload")));
  assert.equal(payload.mode, "broker-hub-intake");
  assert.equal(payload.addressStreet, "2812 Williams Street");
  assert.equal(payload.narrativeSeeds.areaBusinesses, "Nearby industrial users and service businesses.");
  assert.equal(formData.getAll("heroPhoto").length, 1);
  assert.equal(formData.getAll("assets").length, 1);
  assert.doesNotMatch(JSON.stringify(payload), /wordpress|wp-json|wp-admin/i);
});


test("PIER Manager active listing picker is scrollable and OM generation has loading/error UX", () => {
  const source = readFileSync(new URL("../src/components/pier-manager-listing-console.tsx", import.meta.url), "utf8");
  assert.match(source, /data-testid=\"active-listing-scrollbox\"/);
  assert.match(source, /max-h-64 overflow-y-auto/);
  assert.match(source, /Generating OM…/);
  assert.match(source, /setOmError/);
  assert.match(source, /AbortController/);
});

test("PIER Manager active listing picker separates search from a scrollable list and collapses after selection", () => {
  const source = readFileSync(new URL("../src/components/pier-manager-listing-console.tsx", import.meta.url), "utf8");
  assert.match(source, /const \[listingPickerOpen, setListingPickerOpen\] = useState\(true\)/);
  assert.match(source, /data-testid=\"listing-picker-panel\"/);
  assert.match(source, /data-testid=\"listing-filter-input\"/);
  assert.match(source, /data-testid=\"active-listing-scrollbox\"[\s\S]*max-h-64 overflow-y-auto overscroll-contain/);
  assert.match(source, /function selectActiveListing[\s\S]*setListingPickerOpen\(false\)/);
  assert.match(source, /Change Selection/);
  assert.match(source, /setListingPickerOpen\(true\)/);
  assert.doesNotMatch(source, /<datalist/);
  assert.doesNotMatch(source, /slice\(0, 8\)/);
});

test("PIER Manager AI draft requests have browser timeout cleanup and visible errors", () => {
  const source = readFileSync(new URL("../src/components/pier-manager-listing-console.tsx", import.meta.url), "utf8");
  assert.match(source, /fetchJsonWithTimeout\("\/api\/listingstream\/ai-draft"/);
  assert.match(source, /window\.clearTimeout\(timeout\)/);
  assert.match(source, /setModificationSubmitting\(false\)/);
  assert.match(source, /getAbortableErrorMessage\(error, isOmRevision \? "Could not generate OM revision draft\." : "Could not generate listing modification draft\."\)/);
  assert.match(source, /AI draft generation timed out in the browser/);
});

test("PIER Manager OM financial controls are manual and only visible for sale non-land listings", () => {
  const source = readFileSync(new URL("../src/components/pier-manager-listing-console.tsx", import.meta.url), "utf8");
  assert.match(source, /const \[includeRentRoll, setIncludeRentRoll\] = useState\(false\)/);
  assert.match(source, /const \[includeProforma, setIncludeProforma\] = useState\(false\)/);
  assert.match(source, /const showFinancialToggles = Boolean\(selectedListing && isForSaleListing\(selectedListing\) && !isLandListing\(selectedListing\)\)/);
  assert.match(source, /showFinancialToggles \? \(/);
  assert.match(source, /Include Rent Roll/);
  assert.match(source, /Include Proforma/);
  assert.match(source, /setIncludeRentRoll\(false\)/);
  assert.match(source, /setIncludeProforma\(false\)/);
});

test("PIER Manager OM actions include a mobile-first AI revision loop and publish approval lane", () => {
  const source = readFileSync(new URL("../src/components/pier-manager-listing-console.tsx", import.meta.url), "utf8");
  assert.match(source, /data-testid=\"om-revision-request\"/);
  assert.match(source, /data-testid=\"om-vibe-code-textarea\"/);
  assert.match(source, /data-testid=\"om-draft-preview-frame\"/);
  assert.match(source, /data-testid=\"om-approve-publish\"/);
  assert.match(source, /omRevisionInstructions/);
  assert.match(source, /omDraftId/);
  assert.match(source, /omDraftPreviewHtml/);
  assert.match(source, /requestOfferingMemorandumRevision/);
  assert.match(source, /approveOfferingMemorandumDraft/);
  assert.match(source, /\/api\/listingstream\/offering-memorandums\/\$\{slug\}\/drafts/);
  assert.match(source, /\/approve/);
  assert.match(source, /w-full min-h-\[65vh\]/);
  assert.match(source, /Generate AI OM Preview/);
  assert.match(source, /Approve \+ Publish OM/);
  assert.match(source, /const \[omRevisionAction, setOmRevisionAction\] = useState<\"idle\" \| \"rendering\" \| \"approving\">\(\"idle\"\)/);
  assert.match(source, /data-testid=\"om-revision-idle-state\"/);
  assert.match(source, /No preview rendering starts automatically/);
  assert.match(source, /disabled=\{omRevisionBusy \|\| !selectedPropertyId \|\| !omRevisionInstructions\.trim\(\)\}/);
  assert.match(source, /disabled=\{omRevisionBusy \|\| !omDraftId \|\| !omDraftPreviewHtml\}/);
  assert.doesNotMatch(source, /omGenerating \|\| omApproving/);
  assert.doesNotMatch(source, /setOmGenerating\(true\);[\s\S]{0,400}offering-memorandums\/\$\{slug\}\/drafts/);
});

test("Mission Control OM draft proxy routes forward broker-authenticated revision and approval requests", () => {
  const draftsRoute = readFileSync(new URL("../src/app/api/listingstream/offering-memorandums/[slug]/drafts/route.ts", import.meta.url), "utf8");
  const approveRoute = readFileSync(new URL("../src/app/api/listingstream/offering-memorandums/[slug]/drafts/[draftId]/approve/route.ts", import.meta.url), "utf8");
  assert.match(draftsRoute, /getAuthSession/);
  assert.match(draftsRoute, /getBrokerProfileForSession/);
  assert.match(draftsRoute, /\/api\/admin\/offering-memorandums\/\$\{encodeURIComponent\(slug\)\}\/drafts/);
  assert.match(draftsRoute, /withPropertyPortalTimeout/);
  assert.match(approveRoute, /getAuthSession/);
  assert.match(approveRoute, /\/approve/);
  assert.match(approveRoute, /getPropertyPortalInternalHeaders/);
});

test("PIER Manager Email Blast controls are refreshable and mobile-safe", () => {
  const source = readFileSync(new URL("../src/components/pier-manager-listing-console.tsx", import.meta.url), "utf8");
  assert.match(source, /function loadMailchimpAudiences/);
  assert.match(source, /Refresh Audiences/);
  assert.match(source, /data-testid=\"mailchimp-audience-select\"/);
  assert.match(source, /data-testid=\"mailchimp-action-buttons\"[\s\S]*flex flex-col gap-2 sm:flex-row/);
  assert.match(source, /data-testid=\"mailchimp-email-blast\"[\s\S]*min-w-0 overflow-hidden/);
  assert.match(source, /mailchimpGenerating \|\| mailchimpLoading/);
  assert.match(source, /w-full rounded-xl bg-\[#CB521E\]/);
});

test("PIER Manager OM generation forwards manual financial page flags to the proxy route", () => {
  const source = readFileSync(new URL("../src/components/pier-manager-listing-console.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(showFinancialToggles && includeRentRoll\) params\.set\("includeRentRoll", "1"\)/);
  assert.match(source, /if \(showFinancialToggles && includeProforma\) params\.set\("includeProforma", "1"\)/);

  const routeSource = readFileSync(new URL("../src/app/api/listingstream/offering-memorandums/[slug]/pdf/route.ts", import.meta.url), "utf8");
  assert.match(routeSource, /const includeRentRoll = request\.nextUrl\.searchParams\.get\("includeRentRoll"\) === "1"/);
  assert.match(routeSource, /const includeProforma = request\.nextUrl\.searchParams\.get\("includeProforma"\) === "1"/);
  assert.match(routeSource, /includeRentRoll,/);
  assert.match(routeSource, /includeProforma,/);
});

test("Mission Control OM proxy route uses max Vercel duration and graceful timeout handling", () => {
  const source = readFileSync(new URL("../src/app/api/listingstream/offering-memorandums/[slug]/pdf/route.ts", import.meta.url), "utf8");
  assert.match(source, /export const maxDuration = 300/);
  assert.match(source, /OM_PROXY_TIMEOUT_MS = 280_000/);
  assert.match(source, /withPropertyPortalTimeout/);
  assert.match(source, /Offering Memorandum generation timed out/);
});
