import test from "node:test";
import assert from "node:assert/strict";
import { buildOfferingSummaryDraft } from "../src/lib/offering-summary";
import { ProjectRecord } from "../src/lib/projects-data";

const listing: ProjectRecord = {
  id: "listing-1",
  name: "2812 Williams Street",
  summary: "Existing medical office opportunity.",
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
  listingAgent: "Ryan",
  owner: "Owner LLC",
  ownerContact: "Private owner contact",
  marketingBlurb: "A well-positioned medical office asset near Savannah demand drivers.",
};

test("buildOfferingSummaryDraft produces a PIER-ready property narrative from listing data", () => {
  const draft = buildOfferingSummaryDraft(listing);

  assert.match(draft.title, /2812 Williams Street/);
  assert.match(draft.executiveSummary, /well-positioned medical office/i);
  assert.equal(draft.facts.find((fact) => fact.label === "Size")?.value, "+- 15,000 SF");
  assert.equal(draft.facts.find((fact) => fact.label === "Acreage")?.value, "+- 1.25 AC");
  assert.equal(draft.facts.find((fact) => fact.label === "Offering Price")?.value, "$1,750,000");
  assert.ok(draft.brokerNotes.some((note) => note.includes("Ryan")));
  assert.ok(!draft.publicCopy.includes("Private owner contact"));
});
