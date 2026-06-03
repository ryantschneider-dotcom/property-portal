import test from "node:test";
import assert from "node:assert/strict";
import {
  PIER_PULSE_WORDPRESS_DEFAULTS,
  buildPierPulseWriterPrompt,
  buildSourcePack,
  buildWordPressDraftPayload,
  getCorridorForRun,
  normalizeSourceCandidate,
  pierPulseCorridors,
} from "../src/lib/pier-pulse";

test("PIER Pulse corridor rotation covers Coastal Georgia markets in order", () => {
  assert.equal(pierPulseCorridors.length, 7);
  assert.equal(getCorridorForRun(0).name, "Savannah / Chatham");
  assert.equal(getCorridorForRun(1).name, "Pooler / Bloomingdale / Port Wentworth / Garden City");
  assert.equal(getCorridorForRun(6).name, "Bluffton / Hilton Head / Hardeeville / Jasper / Beaufort");
  assert.equal(getCorridorForRun(7).name, "Savannah / Chatham");
});

test("PIER Pulse source pack keeps high-relevance current CRE stories with facts", () => {
  const corridor = getCorridorForRun(0);
  const candidates = [
    normalizeSourceCandidate({
      title: "Savannah port-adjacent industrial project advances",
      url: "https://example.com/industrial",
      sourceName: "Example Business Journal",
      publishedAt: "2026-06-01T10:00:00.000Z",
      summary: "A logistics-related industrial project is moving forward near Savannah.",
      topics: ["development", "industrial", "port"],
      facts: ["Project advances near Savannah", "Industrial demand remains tied to port activity"],
      corridorHint: "Savannah / Chatham",
    }),
    normalizeSourceCandidate({
      title: "Restaurant announces summer menu",
      url: "https://example.com/menu",
      sourceName: "Lifestyle Feed",
      publishedAt: "2026-06-01T10:00:00.000Z",
      summary: "A restaurant changed its menu.",
      topics: ["food"],
      facts: [],
      corridorHint: "Savannah / Chatham",
    }),
  ];

  const pack = buildSourcePack({ corridor, candidates, generatedAt: "2026-06-01T12:00:00.000Z" });

  assert.equal(pack.corridor.name, "Savannah / Chatham");
  assert.equal(pack.sources.length, 1);
  assert.equal(pack.sources[0].title, "Savannah port-adjacent industrial project advances");
  assert.ok(pack.sources[0].relevanceScore >= 7);
  assert.match(pack.editorialAngle, /commercial real estate/i);
});

test("PIER Pulse source pack prioritizes deeper CRE intelligence categories", () => {
  const corridor = getCorridorForRun(0);
  const candidates = [
    normalizeSourceCandidate({
      title: "Savannah office sublease availability lists lower asking rent",
      url: "https://example.com/sublease-rent",
      sourceName: "Savannah Business Journal",
      summary: "Office sublease availability lists 12,000 square feet with asking rent moving lower, creating a rent tracking signal for occupiers and landlords.",
      topics: ["sublease", "rent", "office", "leasing"],
      facts: ["12,000 square feet is available for sublease", "Asking rent is moving lower"],
      corridorHint: "Savannah / Chatham",
    }),
    normalizeSourceCandidate({
      title: "Planning commission agenda advances rezoning and infrastructure approval",
      url: "https://example.com/agenda-infrastructure",
      sourceName: "County Agenda Center",
      summary: "County agenda item includes zoning changes, road infrastructure approval, and utility extension for a commercial site.",
      topics: ["zoning", "agenda", "infrastructure"],
      facts: ["Agenda includes zoning changes", "Road infrastructure approval is under review"],
      corridorHint: "Savannah / Chatham",
    }),
  ];

  const pack = buildSourcePack({ corridor, candidates, generatedAt: "2026-06-02T12:00:00.000Z" });

  assert.equal(pack.sources.length, 2);
  assert.ok(pack.sources[0].relevanceScore >= 9);
  assert.deepEqual(pack.sources[0].topics, ["sublease", "rent", "office", "leasing"]);
  assert.match(pack.editorialAngle, /sublease|rent|agenda|zoning|infrastructure/i);
});

test("PIER Pulse writer prompt requires CCIM-level PIER tone and draft-first scannability", () => {
  const pack = buildSourcePack({
    corridor: getCorridorForRun(2),
    generatedAt: "2026-06-01T12:00:00.000Z",
    candidates: [
      normalizeSourceCandidate({
        title: "Glynn County infrastructure grant supports commercial corridor",
        url: "https://example.com/glynn-grant",
        sourceName: "County Notice",
        publishedAt: "2026-06-01T09:00:00.000Z",
        summary: "Infrastructure funding is targeted near a commercial corridor.",
        topics: ["infrastructure", "development"],
        facts: ["Funding supports corridor infrastructure", "Project may improve site access"],
        corridorHint: "Brunswick / St. Simons / Camden / Glynn / McIntosh",
      }),
    ],
  });

  const prompt = buildPierPulseWriterPrompt(pack);

  assert.match(prompt, /PIER Commercial Real Estate/i);
  assert.match(prompt, /CCIM-level/i);
  assert.match(prompt, /proprietary AI/i);
  assert.match(prompt, /draft-first/i);
  assert.match(prompt, /Brunswick \/ St\. Simons/i);
  assert.match(prompt, /bold/i);
  assert.doesNotMatch(prompt, /publish immediately/i);
});

test("PIER Pulse writer prompt requires enriched Phase 2/3 editorial and image structure", () => {
  const pack = buildSourcePack({
    corridor: getCorridorForRun(0),
    generatedAt: "2026-06-01T12:00:00.000Z",
    candidates: [
      normalizeSourceCandidate({
        title: "Savannah industrial supply peaks as operators focus on performance",
        url: "https://example.com/industrial-performance",
        sourceName: "Market Feed",
        publishedAt: "2026-06-01T09:00:00.000Z",
        summary: "Industrial supply has peaked while operators shift attention toward building performance and occupancy costs.",
        topics: ["industrial", "leasing", "vacancy"],
        facts: ["Industrial supply has peaked", "Operators are focused on performance and efficiency"],
        corridorHint: "Savannah / Chatham",
      }),
    ],
  });

  const prompt = buildPierPulseWriterPrompt(pack);

  assert.match(prompt, /heroImagePrompt/i);
  assert.match(prompt, /middleImagePrompts/i);
  assert.match(prompt, /exactly 3/i);
  assert.match(prompt, /The Signal/i);
  assert.match(prompt, /PIER Staff/i);
  assert.match(prompt, /Ryan Schneider/i);
  assert.match(prompt, /Senior Research Associate Jonathan Caparelli/i);
  assert.match(prompt, /THE BOTTOM LINE/);
  assert.match(prompt, /Use this exact closing skeleton/);
  assert.match(prompt, /\[Story-specific strategy line 1/);
  assert.match(prompt, /\[Story-specific strategy line 2/);
  assert.match(prompt, /\[Story-specific strategy line 3/);
  assert.match(prompt, /exactly three short story-specific lines/);
  assert.match(prompt, /Contact PIER Commercial Real Estate today\./);
  assert.match(prompt, /Phone: <strong>912\.353\.7707<\/strong> \| Website: <strong>piercommercial\.com<\/strong> \| Instagram: <strong>@piercommercial<\/strong>/);
  assert.match(prompt, /<a href="https:\/\/www\.piercommercial\.com\/contact-us\/">Click here to contact us<\/a>/);
  assert.match(prompt, /Credits/i);
  assert.match(prompt, /References/i);
  assert.match(prompt, /Do not include.*Credits/i);
  assert.match(prompt, /Do not include.*References/i);
  assert.match(prompt, /Do not include a visible Source Pack/i);
  assert.match(prompt, /editor notes/i);
  assert.match(prompt, /never render in the visible article body/i);
  assert.match(prompt, /Contextual and geographic image grounding/i);
  assert.match(prompt, /Coastal Georgia landscape/i);
  assert.match(prompt, /Savannah River maritime shipping logistics/i);
  assert.match(prompt, /Port-adjacent warehouse environment/i);
  assert.match(prompt, /active container terminals, gantry cranes/i);
  assert.match(prompt, /text-free architectural site plan blueprint/i);
  assert.match(prompt, /abstract vector layout representing regional logistics network paths/i);
  assert.match(prompt, /commercial real estate growth chart graphic/i);
  assert.match(prompt, /no alphabetic characters, no numbers, no text, no words, no labels, no captions, no typography, no logos/i);
  assert.match(prompt, /high-end stylized, conceptual, cinematic, 3D architectural, abstract, and premium editorial CRE imagery/i);
  assert.doesNotMatch(prompt, /high-quality infographic-style market visual prompt/i);
  assert.match(prompt, /looking cheap\/canned/i);
});

test("PIER Pulse writer prompt requires enriched Phase 5 intelligence and broker-forward lead capture", () => {
  const pack = buildSourcePack({
    corridor: getCorridorForRun(0),
    generatedAt: "2026-06-02T12:00:00.000Z",
    candidates: [
      normalizeSourceCandidate({
        title: "Savannah office sublease availability lists lower asking rent",
        url: "https://example.com/sublease-rent",
        sourceName: "Market Feed",
        summary: "Office sublease availability lists 12,000 square feet with asking rent moving lower.",
        topics: ["sublease", "rent", "office", "leasing"],
        facts: ["12,000 square feet is available for sublease", "Asking rent is moving lower"],
        corridorHint: "Savannah / Chatham",
      }),
    ],
  });

  const prompt = buildPierPulseWriterPrompt(pack);

  assert.match(prompt, /sublease/i);
  assert.match(prompt, /asking rent|rent tracking/i);
  assert.match(prompt, /permits|site plan|project/i);
  assert.match(prompt, /agenda|zoning|infrastructure/i);
  assert.match(prompt, /off-market opportunities/i);
  assert.match(prompt, /market analytics/i);
  assert.match(prompt, /site selection/i);
  assert.match(prompt, /THE BOTTOM LINE/);
});

test("PIER Pulse writer prompt carries expanded creative freedom and deep sourcing mandates", () => {
  const pack = buildSourcePack({
    corridor: getCorridorForRun(0),
    generatedAt: "2026-06-02T12:00:00.000Z",
    candidates: [
      normalizeSourceCandidate({
        title: "Utility authority agenda reviews substation capacity for industrial park",
        url: "https://example.com/substation-agenda",
        sourceName: "Utility Authority Agenda",
        summary: "Agenda item discusses power capacity, site plan review, and industrial development timing near the corridor.",
        topics: ["agenda", "infrastructure", "industrial"],
        facts: ["Utility authority agenda reviews industrial power capacity", "Site plan review is tied to development timing"],
        corridorHint: "Savannah / Chatham",
      }),
    ],
  });

  const prompt = buildPierPulseWriterPrompt(pack);

  assert.match(prompt, /high-end stylized, conceptual, cinematic, 3D architectural, abstract, and premium editorial CRE imagery/i);
  assert.match(prompt, /hyper-stylized 3D architectural outline/i);
  assert.match(prompt, /industrial electrical substation/i);
  assert.match(prompt, /under-the-radar/i);
  assert.match(prompt, /city council, county commission, planning commission, zoning board/i);
  assert.match(prompt, /development authority, port\/airport authority, utility authority/i);
  assert.match(prompt, /annexations, variances, special-use permits, development agreements/i);
  assert.match(prompt, /SPLOST|TSPLOST|CIP/i);
  assert.match(prompt, /insider CRE context/i);
});

test("PIER Pulse WordPress payload is draft-only with locked category tags and fallback media", () => {
  const pack = buildSourcePack({
    corridor: getCorridorForRun(0),
    generatedAt: "2026-06-01T12:00:00.000Z",
    candidates: [
      normalizeSourceCandidate({
        title: "Savannah retail vacancy narrows near core corridor",
        url: "https://example.com/retail",
        sourceName: "Market Feed",
        publishedAt: "2026-06-01T08:00:00.000Z",
        summary: "Retail conditions are improving in a Savannah corridor.",
        topics: ["retail", "leasing"],
        facts: ["Vacancy narrows", "Leasing momentum improves"],
      }),
    ],
  });

  const payload = buildWordPressDraftPayload({
    title: "Savannah Market Intel: Retail Momentum Builds",
    html: "<h2>Market Signal</h2><p><strong>Retail momentum</strong> is building.</p>",
    excerpt: "Retail momentum is building in Savannah.",
    sourcePack: pack,
    heroImagePrompt: "Premium Savannah retail corridor hero image prompt.",
    middleImagePrompts: ["Vacancy trend image prompt.", "Tenant mix image prompt.", "Owner strategy image prompt."],
  });

  assert.equal(payload.status, "draft");
  assert.deepEqual(payload.categories, [PIER_PULSE_WORDPRESS_DEFAULTS.categoryId]);
  assert.deepEqual(payload.tags, PIER_PULSE_WORDPRESS_DEFAULTS.defaultTagIds);
  assert.equal(payload.featured_media, PIER_PULSE_WORDPRESS_DEFAULTS.fallbackFeaturedMediaId);
  assert.doesNotMatch(payload.content, /<h2>Source Pack<\/h2>/);
  assert.doesNotMatch(payload.content, /<ul>\s*<li><a href="https:\/\/example\.com\/retail"/);
  assert.match(payload.content, /<!-- PIER Pulse Source Pack/);
  assert.match(payload.content, /https:\/\/example\.com\/retail/);
  assert.match(payload.content, /<!-- PIER Pulse Image Prompts/);
  assert.match(payload.content, /Hero: Premium Savannah retail corridor hero image prompt\./);
  assert.match(payload.content, /Middle 3: Owner strategy image prompt\./);
});
