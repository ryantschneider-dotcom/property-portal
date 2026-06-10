import test from "node:test";
import assert from "node:assert/strict";

import type { AuthSession } from "../src/lib/auth";
import type { ProjectRecord } from "../src/lib/projects-data";
import {
  buildDemographicsTablesFromCensusResponse,
  buildOfferingSummaryPdfModel,
  buildRetailAerialMapPlan,
  getBrokerProfileForSession,
  renderOfferingSummaryHtml,
} from "../src/lib/offering-summary-pdf";

const listing: ProjectRecord = {
  id: "listing-2812",
  name: "2812 Williams Street",
  summary: "Immediate occupancy office/showroom opportunity.",
  status: "active",
  createdAt: "2026-06-03T12:00:00.000Z",
  linkedRunIds: [],
  type: "listing",
  listingStatus: "Active",
  propertyType: "Office Building For Lease",
  address: "2812 Williams Street",
  city: "Savannah",
  state: "GA",
  zip: "31404",
  parcelId: "2-0000-01-001",
  acreage: 1.04,
  size: 6542,
  leaseRate: "Negotiable",
  marketingBlurb: "The building is immediately available for lease with showroom, office, and loading functionality.",
  listingAgent: "Ryan",
};

const censusResponse = {
  sourceYear: 2024,
  radii: [1, 3, 5],
  rows: [
    { label: "Population", values: [{ radiusMiles: 1, value: "13,951" }, { radiusMiles: 3, value: "83,318" }, { radiusMiles: 5, value: "129,522" }] },
    { label: "Average Age", values: [{ radiusMiles: 1, value: "41" }, { radiusMiles: 3, value: "39" }, { radiusMiles: 5, value: "39" }] },
    { label: "Households", values: [{ radiusMiles: 1, value: "6,117" }, { radiusMiles: 3, value: "34,499" }, { radiusMiles: 5, value: "53,536" }] },
    { label: "Median Household Income", values: [{ radiusMiles: 1, value: "$73,059" }, { radiusMiles: 3, value: "$79,217" }, { radiusMiles: 5, value: "$82,037" }] },
  ],
};

test("offering summary PDFs inject the broker profile from the active session", () => {
  const session: AuthSession = { role: "broker", brokerId: "anthony" };
  const broker = getBrokerProfileForSession(session);
  const model = buildOfferingSummaryPdfModel({ listing, broker });
  const html = renderOfferingSummaryHtml(model);

  assert.equal(model.broker.name, "Anthony Wagner");
  assert.match(model.broker.headshotUrl, /anthony/i);
  assert.match(html, /Anthony Wagner/);
  assert.match(html, /<img[^>]+class="broker-headshot"/);
  assert.doesNotMatch(html, /Ryan T\. Schneider, CCIM/);
});

test("offering summary PDF model mirrors the PIER memo sections", () => {
  const broker = getBrokerProfileForSession({ role: "master", brokerId: "ryan" });
  const model = buildOfferingSummaryPdfModel({ listing, broker, heroImageUrl: "https://cdn.example.com/hero.jpg" });

  assert.deepEqual(model.pageOrder, ["cover", "summary", "aerial-map", "location-map", "demographics"]);
  assert.equal(model.heroImageUrl, "https://cdn.example.com/hero.jpg");
  assert.ok(model.offeringSummaryFacts.some((fact) => fact.label === "Available SF" && fact.value === "+- 6,542 SF"));
  assert.ok(model.offeringSummaryFacts.some((fact) => fact.label === "Lot Size" && fact.value === "+- 1.04 AC"));
  assert.ok(model.highlights.length >= 3);
});

test("Census demographics are grouped for PIER Population and Households & Income tables", () => {
  const tables = buildDemographicsTablesFromCensusResponse(censusResponse);

  assert.equal(tables[0].title, "Population");
  assert.deepEqual(tables[0].columns, ["1 MILE", "3 MILES", "5 MILES"]);
  assert.equal(tables[0].rows.find((row) => row.label === "Average Age")?.values[0], "41");
  assert.equal(tables[1].title, "Households & Income");
  assert.equal(tables[1].rows.find((row) => row.label === "Total Households")?.values[2], "53,536");
  assert.equal(tables[1].rows.find((row) => row.label === "Average HH Income")?.values[1], "$79,217");
});

test("retail aerial map pipeline plans static map, nearby retailers, logo fetches, and geo overlays", () => {
  const plan = buildRetailAerialMapPlan({
    center: { lat: 32.029, lng: -81.090 },
    zoom: 16,
    size: { width: 1600, height: 1000 },
    retailers: [
      { name: "Starbucks", lat: 32.03, lng: -81.091, placeId: "place-1" },
      { name: "Target", lat: 32.028, lng: -81.087, placeId: "place-2" },
    ],
  });

  assert.match(plan.staticMapUrl, /static/);
  assert.equal(plan.logoRequests[0].url, "https://logo.clearbit.com/starbucks.com");
  assert.equal(plan.overlays.length, 2);
  assert.ok(plan.overlays.every((overlay) => Number.isFinite(overlay.x) && Number.isFinite(overlay.y)));
});
