import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBrokerageListingStreamCandidate,
  extractBrokerageListingStreamCandidate,
} from "../src/lib/brokerage-listingstream-content";

test("Brokerage ListingStream extraction converts verified property payload into brokerage content candidate", () => {
  const candidate = buildBrokerageListingStreamCandidate({
    propertyIdOrSlug: "1539-pooler-parkway",
    eventType: "property-email",
    generatedAt: "2026-06-02T00:00:00.000Z",
    payload: {
      title: "1539 Pooler Parkway",
      address: "1539 Pooler Parkway, Pooler, GA 31322",
      propertyType: "Retail",
      transactionLabel: "For Lease",
      publicUrl: "https://listingstream-portal.vercel.app/properties/1539-pooler-parkway",
      pricing: { leaseRate: "$12/SF/YR" },
      details: { squareFeet: "6,542", acreage: "1.19" },
      highlights: ["Pooler Parkway frontage", "C-2 Heavy Commercial zoning"],
      location: { city: "Pooler" },
    },
  });

  assert.equal(candidate.sourceName, "ListingStream verified brokerage payload");
  assert.match(candidate.title, /^Property Email Source:/);
  assert.match(candidate.summary ?? "", /PIER's active ListingStream database/);
  assert.ok(candidate.facts?.some((fact) => /6,542 SF/.test(fact)));
  assert.ok(candidate.facts?.some((fact) => /1.19 acres/.test(fact)));
});

test("Brokerage extractor can pull a ListingStream property through the live-property endpoint boundary", async () => {
  const fetchImpl = async (url: string | URL | Request) => {
    assert.match(String(url), /\/api\/properties\/1539-pooler-parkway/);
    return new Response(
      JSON.stringify({
        title: "1539 Pooler Parkway",
        address: "1539 Pooler Parkway, Pooler, GA 31322",
        propertyType: "Retail",
        transactionLabel: "For Lease",
        details: { squareFeet: "6,542" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const candidate = await extractBrokerageListingStreamCandidate({
    propertyIdOrSlug: "1539-pooler-parkway",
    fetchImpl: fetchImpl as typeof fetch,
    now: () => new Date("2026-06-02T00:00:00.000Z"),
  });

  assert.match(candidate.title, /1539 Pooler Parkway/);
  assert.ok(candidate.facts?.some((fact) => /6,542 SF/.test(fact)));
});
