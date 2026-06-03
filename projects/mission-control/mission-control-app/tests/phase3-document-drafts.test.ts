import test from "node:test";
import assert from "node:assert/strict";
import {
  buildListingAgreementDraft,
  buildOfferingWebsitePlan,
  buildSalesContractDraft,
} from "../src/lib/phase3-document-drafts";
import { ProjectRecord } from "../src/lib/projects-data";

const listing: ProjectRecord = {
  id: "listing-1",
  name: "2812 Williams Street",
  summary: "Existing medical office opportunity near Savannah demand drivers.",
  status: "active",
  createdAt: "2026-05-31T12:00:00.000Z",
  linkedRunIds: [],
  type: "listing",
  listingStatus: "Active",
  propertyType: "Medical Office",
  address: "2812 Williams Street",
  city: "Savannah",
  state: "GA",
  zip: "31404",
  parcelId: "2-0000-01-001",
  acreage: 1.25,
  size: 15000,
  frontageFeet: 220,
  zoningDistrict: "P-B-C",
  price: 1750000,
  leaseRate: "$24.00/SF NNN",
  expenses: "NNN expenses TBD",
  capRate: "7.25%",
  buildoutPropertyId: "bo-123",
  customListingUrl: "https://piercommercial.com/listings/2812-williams",
  listingAgent: "Ryan",
  owner: "Owner LLC",
  ownerContact: "Private owner contact",
  marketingBlurb: "A well-positioned medical office asset near Savannah demand drivers.",
};

test("buildListingAgreementDraft labels legal output as draft-only and includes source listing terms", () => {
  const draft = buildListingAgreementDraft(listing);

  assert.match(draft.title, /2812 Williams Street/);
  assert.equal(draft.reviewLabel, "DRAFT ONLY — Ryan/legal review required");
  assert.ok(draft.terms.some((term) => term.label === "Seller / owner" && term.value === "Owner LLC"));
  assert.ok(draft.terms.some((term) => term.label === "Property" && term.value.includes("2812 Williams Street")));
  assert.ok(draft.missingTerms.includes("Commission percentage"));
  assert.ok(draft.riskNotes.some((note) => /do not send/i.test(note)));
  assert.ok(!draft.draftText.includes("Private owner contact"));
});

test("buildSalesContractDraft creates a purchase deal checklist without leaking private owner contact details", () => {
  const draft = buildSalesContractDraft(listing);

  assert.match(draft.title, /Sales Contract/i);
  assert.equal(draft.reviewLabel, "DRAFT ONLY — not a binding contract");
  assert.ok(draft.dealPoints.some((point) => point.label === "Purchase price" && point.value === "$1,750,000"));
  assert.ok(draft.dealPoints.some((point) => point.label === "Property" && point.value.includes("2812 Williams Street")));
  assert.ok(draft.missingDealPoints.includes("Buyer legal name / entity"));
  assert.ok(draft.milestones.some((milestone) => milestone.includes("Due diligence")));
  assert.ok(!draft.draftText.includes("Private owner contact"));
});

test("buildOfferingWebsitePlan produces public-safe page sections and strict exclusions", () => {
  const plan = buildOfferingWebsitePlan(listing);

  assert.match(plan.title, /Offering Website/i);
  assert.equal(plan.publicUrl, "https://piercommercial.com/listings/2812-williams");
  assert.ok(plan.heroStats.some((stat) => stat.label === "Size" && stat.value === "+- 15,000 SF"));
  assert.ok(plan.sections.some((section) => section.heading === "Overview"));
  assert.ok(plan.strictExclusions.includes("Owner contact details"));
  assert.ok(plan.callToAction.includes("PIER Commercial"));
  assert.ok(!plan.publicCopy.includes("Private owner contact"));
});
