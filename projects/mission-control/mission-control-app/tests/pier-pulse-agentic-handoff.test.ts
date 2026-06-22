import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAgenticExtractionPrompt,
  buildListingStreamPulseCandidate,
  parseAgenticExtractionJson,
  runPierPulseAgenticHandoff,
  extractListingStreamPulseCandidate,
} from "../src/lib/pier-pulse-agentic-handoff";

test("PIER Pulse agentic handoff prompt commands cloud agent to inspect municipal URLs and return JSON", () => {
  const prompt = buildAgenticExtractionPrompt({
    corridorName: "Savannah / Chatham",
    sources: [{ url: "https://example.gov/agenda.pdf", sourceType: "municipal_pdf", title: "Planning agenda" }],
  });

  assert.match(prompt, /web\/browser\/search capabilities/i);
  assert.match(prompt, /municipal URLs, agenda links, public PDFs/i);
  assert.match(prompt, /Return strict JSON only/i);
  assert.match(prompt, /https:\/\/example\.gov\/agenda\.pdf/);
});

test("PIER Pulse OpenAI handoff posts to Responses API with web-search tool and parses candidates", async () => {
  const calls: Array<{ url: string; body: any }> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(
      JSON.stringify({
        output_text: JSON.stringify({
          facts: ["Planning Commission agenda includes a site plan review"],
          limitations: [],
          candidates: [
            {
              title: "Planning Commission Site Plan Review",
              url: "https://example.gov/agenda.pdf",
              sourceName: "City Planning Commission",
              publishedAt: "2026-06-01T00:00:00.000Z",
              summary: "The public agenda includes a site plan review with commercial real estate implications.",
              topics: ["agenda", "development"],
              facts: ["Site plan review appears on the agenda"],
              corridorHint: "Savannah / Chatham",
            },
          ],
        }),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const result = await runPierPulseAgenticHandoff({
    provider: "openai",
    apiKey: "test-key",
    fetchImpl: fetchImpl as typeof fetch,
    now: () => new Date("2026-06-02T00:00:00.000Z"),
    corridorName: "Savannah / Chatham",
    sources: [{ url: "https://example.gov/agenda.pdf", sourceType: "municipal_pdf" }],
  });

  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.deepEqual(calls[0].body.tools, [{ type: "web_search_preview" }]);
  assert.equal(result.provider, "openai");
  assert.equal(result.candidates[0].sourceName, "City Planning Commission");
  assert.match(result.candidates[0].summary ?? "", /site plan review/i);
});

test("PIER Pulse ListingStream extraction converts verified property payload into Pulse candidate", () => {
  const candidate = buildListingStreamPulseCandidate({
    propertyIdOrSlug: "1539-pooler-parkway",
    eventType: "new-listing",
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

  assert.equal(candidate.sourceName, "ListingStream verified property payload");
  assert.match(candidate.title, /^New Listing:/);
  assert.match(candidate.summary ?? "", /PIER's active ListingStream database/);
  assert.ok(candidate.facts?.some((fact) => /6,542 SF/.test(fact)));
  assert.ok(candidate.facts?.some((fact) => /1.19 acres/.test(fact)));
});

test("PIER Pulse can pull a ListingStream property through the live-property endpoint boundary", async () => {
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

  const candidate = await extractListingStreamPulseCandidate({
    propertyIdOrSlug: "1539-pooler-parkway",
    fetchImpl: fetchImpl as typeof fetch,
    now: () => new Date("2026-06-02T00:00:00.000Z"),
  });

  assert.match(candidate.title, /1539 Pooler Parkway/);
  assert.ok(candidate.facts?.some((fact) => /6,542 SF/.test(fact)));
});

test("PIER Pulse agentic parser rejects non-JSON cloud output instead of fabricating facts", () => {
  assert.throws(
    () => parseAgenticExtractionJson("not json", { provider: "openai", model: "test", extractedAt: "2026-06-02T00:00:00.000Z" }),
    /Unexpected token|JSON/i,
  );
});
