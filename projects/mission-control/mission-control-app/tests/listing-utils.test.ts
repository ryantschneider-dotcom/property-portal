import test from "node:test";
import assert from "node:assert/strict";
import { displayOfferingPrice, formatMoney, getListingWebsiteUrl } from "../src/lib/listing-utils";

test("formatMoney treats zero as a real value, not TBD", () => {
  assert.equal(formatMoney(0), "$0");
});

test("displayOfferingPrice respects withheld pricing language", () => {
  assert.equal(displayOfferingPrice({ price: 1250000, priceWithheld: true }), "Withheld — contact broker");
});

test("getListingWebsiteUrl prefers custom URL before Buildout fallback", () => {
  assert.equal(
    getListingWebsiteUrl({ customListingUrl: "https://piercommercial.com/listings/test", buildoutPropertyId: "123" }),
    "https://piercommercial.com/listings/test",
  );
  assert.equal(getListingWebsiteUrl({ buildoutPropertyId: "abc 123" }), "https://buildout.com/website/abc%20123");
});
