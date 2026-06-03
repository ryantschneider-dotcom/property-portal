import test from "node:test";
import assert from "node:assert/strict";

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
