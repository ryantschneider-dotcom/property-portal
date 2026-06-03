import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildExtractionPrompt,
  buildFallbackWriterOutput,
  buildPierPulseRunArtifact,
  buildPierPulseRunSummary,
  ingestLiveCollectorResult,
  mergeLiveCollectorResults,
  normalizeWriterOutput,
  parseSourceFixture,
  runPierPulseDryRun,
  runPierPulseLiveCollectors,
  type PierPulseLiveCollectorResult,
  type PierPulseLlmProviders,
} from "../src/lib/pier-pulse-runner";

test("PIER Pulse runner parses source fixtures into candidate inputs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pier-pulse-fixture-"));
  try {
    const fixturePath = join(dir, "sources.json");
    await writeFile(
      fixturePath,
      JSON.stringify([
        {
          title: "Savannah zoning board reviews warehouse plan",
          url: "https://example.com/warehouse",
          sourceName: "City Agenda",
          summary: "A warehouse plan near a logistics corridor is under review.",
          topics: ["zoning", "industrial"],
          facts: ["Warehouse plan under review"],
        },
      ]),
      "utf8",
    );

    const parsed = await parseSourceFixture(fixturePath);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].title, "Savannah zoning board reviews warehouse plan");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("PIER Pulse extraction prompt is bounded for local Qwen source triage", () => {
  const prompt = buildExtractionPrompt({
    corridorName: "Savannah / Chatham",
    title: "Port area industrial project advances",
    url: "https://example.com/port-industrial",
    text: "Long article body about a port-adjacent industrial project and local infrastructure.",
  });

  assert.match(prompt, /bounded extraction/i);
  assert.match(prompt, /JSON only/i);
  assert.match(prompt, /relevance_score/i);
  assert.match(prompt, /Savannah \/ Chatham/);
  assert.ok(prompt.length < 4000);
});

test("PIER Pulse extraction prompt asks Qwen for Phase 5 CRE intelligence taxonomy", () => {
  const prompt = buildExtractionPrompt({
    corridorName: "Savannah / Chatham",
    title: "Downtown office sublease lists lower asking rent before planning commission agenda",
    url: "https://example.com/sublease-agenda",
    text: "Office sublease availability, asking rent movement, commercial permit activity, site plan review, rezoning, infrastructure approval, and ribbon cutting event signals.",
  });

  assert.match(prompt, /sublease/i);
  assert.match(prompt, /rent/i);
  assert.match(prompt, /permit/i);
  assert.match(prompt, /project/i);
  assert.match(prompt, /event/i);
  assert.match(prompt, /agenda/i);
  assert.match(prompt, /zoning/i);
  assert.match(prompt, /infrastructure/i);
  assert.match(prompt, /market intelligence signal/i);
});

test("PIER Pulse extraction prompt asks Qwen to elevate under-the-radar public-body signals", () => {
  const prompt = buildExtractionPrompt({
    corridorName: "Savannah / Chatham",
    title: "Planning commission hearing reviews annexation and utility extension",
    url: "https://example.com/planning-hearing",
    text: "County commission agenda includes annexation, development agreement, water and sewer capacity, road access, and a project entering the pipeline.",
  });

  assert.match(prompt, /under-the-radar CRE intelligence/i);
  assert.match(prompt, /city council, county commission, planning commission, zoning board/i);
  assert.match(prompt, /development authority, port\/airport authority, utility authority/i);
  assert.match(prompt, /zoning change requests, site plan reviews, proposed developments/i);
  assert.match(prompt, /annexations, variances, special-use permits, development agreements/i);
  assert.match(prompt, /water\/sewer capacity, utility upgrades, road access/i);
  assert.match(prompt, /Preserve specific hearing or agenda item titles, dates, public-body names, parcels, roads, project names/i);
});

test("PIER Pulse fallback writer uses locked bottom-line label and polished image prompt punctuation", () => {
  const sourcePack = {
    id: "pier-pulse-savannah-chatham-2026-06-01",
    generatedAt: "2026-06-01T15:00:00.000Z",
    corridor: { id: "savannah-chatham", name: "Savannah / Chatham", keywords: ["savannah"] },
    sources: [],
    sourceCountReviewed: 0,
    editorialAngle: "Current industrial signals in Savannah / Chatham.",
  };

  const output = buildFallbackWriterOutput(sourcePack);

  assert.match(output.html, /THE BOTTOM LINE/);
  assert.match(output.html, /Contact PIER Commercial Real Estate today\./);
  assert.match(output.html, /Phone: 912\.353\.7707 \| Website: piercommercial\.com \| Instagram: @piercommercial/);
  assert.match(output.html, /<a href="https:\/\/www\.piercommercial\.com\/contact-us\/">Contact Us<\/a>/);
  assert.doesNotMatch(output.html, /That’s the signal\./);
  assert.doesNotMatch(output.html, /— Ryan/);
  assert.doesNotMatch(output.html, /That's The Bottom Line/);
  assert.match(output.heroImagePrompt, /realistic commercial real estate photography/i);
  assert.match(output.heroImagePrompt, /no alphabetic characters, no numbers, no text, no words, no labels, no captions, no typography, no logos/i);
  assert.match(output.middleImagePrompts.join("\n"), /premium architectural detail photograph/i);
  assert.match(output.middleImagePrompts.join("\n"), /no alphabetic characters, no numbers, no text, no words, no labels, no captions, no typography, no logos/i);
  assert.match(`${output.heroImagePrompt}\n${output.middleImagePrompts.join("\n")}`, /Savannah River maritime shipping logistics|Port-adjacent warehouse environment|Coastal Georgia landscape/i);
  assert.doesNotMatch(output.heroImagePrompt, /\.,/);
  assert.doesNotMatch(output.middleImagePrompts.join("\n"), /\.,/);
});

test("PIER Pulse normalizes generic stock-photo prompts into grounded local CRE visuals", () => {
  const sourcePack = {
    id: "pier-pulse-savannah-chatham-2026-06-02",
    generatedAt: "2026-06-02T18:00:00.000Z",
    corridor: { id: "savannah-chatham", name: "Savannah / Chatham", keywords: ["savannah", "chatham"] },
    sources: [
      {
        title: "Port infrastructure expansion advances near Savannah River terminal",
        url: "https://example.com/port-expansion",
        sourceName: "Port Authority",
        publishedAt: "2026-06-02T16:00:00.000Z",
        summary: "Port expansion and infrastructure work supports logistics and industrial demand.",
        topics: ["infrastructure", "industrial", "logistics"],
        facts: ["Port expansion supports warehouse demand", "Regional highway access is improving"],
        corridorHint: "Savannah / Chatham",
        relevanceScore: 9,
      },
    ],
    sourceCountReviewed: 1,
    editorialAngle: "Port infrastructure is reinforcing Savannah / Chatham industrial demand.",
  };

  const output = normalizeWriterOutput(
    {
      title: "Savannah Port Infrastructure Signal",
      html: "<p>Signal.</p>",
      excerpt: "Port infrastructure signal.",
      heroImagePrompt: "Generic airport terminal interior with polished floors.",
      middleImagePrompts: [
        "Random city council courtroom interior.",
        "Industrial pipes close-up.",
        "Interior building lobby.",
      ],
    },
    sourcePack,
  );

  const prompts = [output.heroImagePrompt, ...output.middleImagePrompts].join("\n");
  assert.match(prompts, /Savannah \/ Chatham/i);
  assert.match(prompts, /Coastal Georgia landscape|Savannah River maritime shipping logistics|Port-adjacent warehouse environment/i);
  assert.match(prompts, /container terminals|gantry cranes|heavy transport logistics|regional highway access|port-adjacent warehouses/i);
  assert.match(prompts, /Port expansion supports warehouse demand|Regional highway access is improving/i);
  assert.match(prompts, /no alphabetic characters, no numbers, no text, no words, no labels, no captions, no typography, no logos/i);
  assert.doesNotMatch(prompts, /airport terminal|courtroom|industrial pipes|interior building|lobby/i);
});

test("PIER Pulse permits only strict text-free abstract image alternatives when no concrete photo angle exists", () => {
  const sourcePack = {
    id: "pier-pulse-savannah-chatham-2026-06-02",
    generatedAt: "2026-06-02T18:00:00.000Z",
    corridor: { id: "savannah-chatham", name: "Savannah / Chatham", keywords: ["savannah", "chatham"] },
    sources: [
      {
        title: "Savannah zoning agenda tracks site plan updates",
        url: "https://example.com/zoning-agenda",
        sourceName: "Planning Agenda",
        publishedAt: "2026-06-02T16:00:00.000Z",
        summary: "A planning agenda includes site plan and zoning updates but no specific building visual.",
        topics: ["agenda", "zoning"],
        facts: ["Site plan updates are on the agenda"],
        corridorHint: "Savannah / Chatham",
        relevanceScore: 7,
      },
    ],
    sourceCountReviewed: 1,
    editorialAngle: "Zoning and site plan review remain watch items.",
  };

  const output = normalizeWriterOutput(
    {
      title: "Savannah Site Plan Signal",
      html: "<p>Signal.</p>",
      excerpt: "Site plan signal.",
      heroImagePrompt: "A clean, minimalist, text-free architectural site plan blueprint for Savannah / Chatham commercial real estate, Coastal Georgia landscape context.",
      middleImagePrompts: [
        "An abstract vector layout representing regional logistics network paths for Savannah / Chatham commercial real estate.",
        "A modern, text-free commercial real estate growth chart graphic for Savannah / Chatham market analytics.",
        "A clean, minimalist, text-free architectural site plan blueprint for site plan updates.",
      ],
    },
    sourcePack,
  );

  const prompts = [output.heroImagePrompt, ...output.middleImagePrompts].join("\n");
  assert.match(prompts, /text-free architectural site plan blueprint/i);
  assert.match(prompts, /abstract vector layout representing regional logistics network paths/i);
  assert.match(prompts, /commercial real estate growth chart graphic/i);
  assert.match(prompts, /no alphabetic characters, no numbers, no text, no words, no labels, no captions, no typography, no logos/i);
  assert.doesNotMatch(prompts, /signage text|route names|legends/i);
});

test("PIER Pulse normalizer preserves grounded high-end stylized conceptual CRE image prompts", () => {
  const sourcePack = {
    id: "pier-pulse-savannah-chatham-2026-06-02",
    generatedAt: "2026-06-02T18:00:00.000Z",
    corridor: { id: "savannah-chatham", name: "Savannah / Chatham", keywords: ["savannah", "chatham"] },
    sources: [
      {
        title: "Utility authority agenda reviews industrial substation capacity",
        url: "https://example.com/substation-agenda",
        sourceName: "Utility Authority Agenda",
        publishedAt: "2026-06-02T16:00:00.000Z",
        summary: "Industrial power capacity and site plan timing are under review for a Savannah logistics corridor.",
        topics: ["agenda", "infrastructure", "industrial"],
        facts: ["Industrial substation capacity is under review", "Site plan timing affects logistics corridor development"],
        corridorHint: "Savannah / Chatham",
        relevanceScore: 9,
      },
    ],
    sourceCountReviewed: 1,
    editorialAngle: "Utility infrastructure is becoming a site-selection constraint in Savannah / Chatham.",
  };

  const prompt = "A dramatic, hyper-stylized 3D architectural outline of an industrial electrical substation glowing blue at night with a lightning strike in the background, Savannah / Chatham commercial real estate infrastructure theme.";
  const output = normalizeWriterOutput(
    {
      title: "Savannah Utility Infrastructure Signal",
      html: "<p>Signal.</p>",
      excerpt: "Utility infrastructure signal.",
      heroImagePrompt: prompt,
      middleImagePrompts: [prompt, prompt, prompt],
    },
    sourcePack,
  );

  const prompts = [output.heroImagePrompt, ...output.middleImagePrompts].join("\n");
  assert.match(prompts, /hyper-stylized 3D architectural outline/i);
  assert.match(prompts, /industrial electrical substation/i);
  assert.match(prompts, /Savannah \/ Chatham/i);
  assert.match(prompts, /no alphabetic characters, no numbers, no text, no words, no labels, no captions, no typography, no logos/i);
  assert.doesNotMatch(prompts, /text-free architectural site plan blueprint/i);
});

test("PIER Pulse dry-run writes a local artifact and does not call WordPress", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pier-pulse-run-"));
  try {
    const fixturePath = join(dir, "sources.json");
    const artifactsDir = join(dir, "artifacts");
    await writeFile(
      fixturePath,
      JSON.stringify([
        {
          title: "Pooler logistics corridor adds new infrastructure funding",
          url: "https://example.com/pooler-infra",
          sourceName: "County Development Authority",
          summary: "Infrastructure funding is expected to support logistics and industrial access near Pooler.",
          topics: ["infrastructure", "industrial", "logistics"],
          facts: ["Infrastructure funding approved", "Access improvements support industrial sites"],
          corridorHint: "Pooler / Bloomingdale / Port Wentworth / Garden City",
        },
      ]),
      "utf8",
    );

    const providers: PierPulseLlmProviders = {
      extract: async ({ candidate }) => ({
        ...candidate,
        facts: ["Infrastructure funding approved", "Access improvements support industrial sites"],
        topics: ["infrastructure", "industrial", "logistics"],
        summary: candidate.summary,
        corridorHint: "Pooler / Bloomingdale / Port Wentworth / Garden City",
      }),
      write: async ({ sourcePack }) => ({
        title: `${sourcePack.corridor.name} Market Intel: Logistics Access Improves`,
        html: "<h2>Market Signal</h2><p><strong>Infrastructure funding</strong> supports logistics access.</p>",
        excerpt: "Infrastructure funding supports logistics access near Pooler.",
      }),
    };

    const result = await runPierPulseDryRun({
      runIndex: 1,
      sourceFixturePath: fixturePath,
      artifactsDir,
      providers,
      generatedAt: "2026-06-01T15:00:00.000Z",
    });

    assert.equal(result.sourcePack.corridor.name, "Pooler / Bloomingdale / Port Wentworth / Garden City");
    assert.equal(result.wordpressPayload.status, "draft");
    assert.equal(result.published, false);
    assert.match(result.artifactPath, /pier-pulse/);

    const artifact = JSON.parse(await readFile(result.artifactPath, "utf8"));
    assert.equal(artifact.wordpressPayload.status, "draft");
    assert.equal(artifact.published, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("PIER Pulse dry-run artifact carries enriched image prompts from the writer", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pier-pulse-images-"));
  try {
    const fixturePath = join(dir, "sources.json");
    const artifactsDir = join(dir, "artifacts");
    await writeFile(
      fixturePath,
      JSON.stringify([
        {
          title: "Savannah industrial vacancy splits by building quality",
          url: "https://example.com/industrial-vacancy",
          sourceName: "Market Feed",
          summary: "Industrial vacancy is bifurcating by building quality and operational efficiency near Savannah.",
          topics: ["industrial", "vacancy", "leasing"],
          facts: ["Industrial vacancy is bifurcating", "Operational efficiency is driving tenant choice"],
        },
      ]),
      "utf8",
    );

    const result = await runPierPulseDryRun({
      runIndex: 0,
      sourceFixturePath: fixturePath,
      artifactsDir,
      providers: {
        write: async () => ({
          title: "Industrial Real Estate Update: Supply Peaked — Performance Matters Now",
          html: "<h2>The Signal</h2><blockquote>Industrial demand remains real.<br>But the market is no longer forgiving.<br><cite>PIER Staff</cite></blockquote><p>That’s the signal.</p><p>— Ryan</p>",
          excerpt: "Industrial has moved from expansion mode to execution mode.",
          heroImagePrompt: "Clean high-quality infographic-style hero image of Savannah industrial warehouse performance metrics, PIER orange accents, not cheap stock art.",
          middleImagePrompts: [
            "Realistic logistics corridor visual with warehouse and port context.",
            "High-quality infographic showing vacancy bifurcation by building quality.",
            "Clean market visual showing operating cost and efficiency levers.",
          ],
        }),
      },
      generatedAt: "2026-06-01T15:00:00.000Z",
    });

    assert.match(result.writerOutput.heroImagePrompt, /Savannah \/ Chatham/i);
    assert.match(result.writerOutput.heroImagePrompt, /Coastal Georgia landscape|Savannah River maritime shipping logistics|Port-adjacent warehouse environment/i);
    assert.match(result.writerOutput.heroImagePrompt, /no alphabetic characters, no numbers, no text, no words, no labels, no captions, no typography, no logos/i);
    assert.equal(result.writerOutput.middleImagePrompts.length, 3);

    const artifact = JSON.parse(await readFile(result.artifactPath, "utf8"));
    assert.match(artifact.writerOutput.heroImagePrompt, /Savannah \/ Chatham/i);
    assert.match(artifact.writerOutput.heroImagePrompt, /no alphabetic characters, no numbers, no text, no words, no labels, no captions, no typography, no logos/i);
    assert.equal(artifact.writerOutput.middleImagePrompts.length, 3);
  assert.doesNotMatch(artifact.writerOutput.heroImagePrompt, /\.,/);
  assert.doesNotMatch(artifact.writerOutput.middleImagePrompts.join("\n"), /\.,/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("PIER Pulse dry-run can generate/upload images, set featured media, and enrich article HTML", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pier-pulse-image-upload-"));
  try {
    const fixturePath = join(dir, "sources.json");
    const artifactsDir = join(dir, "artifacts");
    await writeFile(
      fixturePath,
      JSON.stringify([
        {
          title: "Savannah medical office leasing signal strengthens",
          url: "https://example.com/medical-office",
          sourceName: "Market Feed",
          summary: "Medical office leasing activity is strengthening near Savannah with tenant demand moving toward efficient buildings.",
          topics: ["office", "medical", "leasing"],
          facts: ["Medical office tenant demand is active", "Efficient buildings are preferred"],
          corridorHint: "Savannah / Chatham",
        },
      ]),
      "utf8",
    );

    const result = await runPierPulseDryRun({
      runIndex: 0,
      sourceFixturePath: fixturePath,
      artifactsDir,
      generatedAt: "2026-06-01T15:00:00.000Z",
      providers: {
        write: async () => ({
          title: "Savannah Medical Office Signal",
          html: "<p>Opening context.</p><h2>The Signal</h2><p>Signal.</p><h2>Why It Matters</h2><p>Matters.</p><h2>THE BOTTOM LINE</h2><p>Close one.</p><p>Close two.</p><p>Close three.</p><p>Contact PIER Commercial Real Estate today.</p><p>Phone: 912.353.7707 | Website: piercommercial.com | Instagram: @piercommercial</p><p><a href=\"https://www.piercommercial.com/contact-us/\">Contact Us</a></p>",
          excerpt: "Medical office signal.",
          heroImagePrompt: "Hero visual prompt.",
          middleImagePrompts: ["Body prompt 1.", "Body prompt 2.", "Body prompt 3."],
        }),
        generateImage: async (imageInput) => ({
          role: imageInput.role,
          prompt: imageInput.prompt,
          altText: `${imageInput.role} alt`,
          filename: `${imageInput.role}-${imageInput.index}.png`,
          mimeType: "image/png",
          data: new Uint8Array([1, 2, 3]),
        }),
        uploadImages: async (images) =>
          images.map((image, index) => ({
            role: image.role,
            prompt: image.prompt,
            altText: image.altText,
            mediaId: 900 + index,
            sourceUrl: `https://piercommercial.com/uploads/${image.filename}`,
            link: `https://piercommercial.com/media/${image.filename}`,
          })),
      },
    });

    assert.equal(result.generatedImages.length, 4);
    assert.equal(result.uploadedImages.length, 4);
    assert.equal(result.wordpressPayload.featured_media, 900);
    assert.match(result.wordpressPayload.content, /pier-pulse-report/);
    assert.match(result.wordpressPayload.content, /pier-pulse-bottom-line/);
    assert.match(result.wordpressPayload.content, /background:#f9f9f9; border:1px solid #e5e5e5; padding:25px; margin-top:30px; border-radius:6px;/);
    assert.match(result.wordpressPayload.content, /Phone: <strong>912\.353\.7707<\/strong> \| Website: <strong>piercommercial\.com<\/strong> \| Instagram: <strong>@piercommercial<\/strong>/);
    assert.match(result.wordpressPayload.content, /<a href="https:\/\/www\.piercommercial\.com\/contact-us\/">Click here to contact us<\/a>/);
    assert.match(result.wordpressPayload.content, /pier-pulse-image-gallery/);
    assert.match(result.wordpressPayload.content, /display: flex; flex-direction: row; gap: 15px; justify-content: center/);
    assert.match(result.wordpressPayload.content, /wp-image-901/);
    assert.match(result.wordpressPayload.content, /wp-image-902/);
    assert.match(result.wordpressPayload.content, /wp-image-903/);
    assert.doesNotMatch(result.wordpressPayload.content, /<h2>THE BOTTOM LINE<\/h2><div class="pier-pulse-image-gallery"/);
    assert.doesNotMatch(result.wordpressPayload.content, /pier-pulse-editor-note/);
    assert.doesNotMatch(result.wordpressPayload.content, /<h2>Source Pack<\/h2>/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("PIER Pulse run artifact captures provider modes and draft URL placeholder", () => {
  const artifact = buildPierPulseRunArtifact({
    generatedAt: "2026-06-01T15:00:00.000Z",
    sourcePack: {
      id: "pier-pulse-test",
      generatedAt: "2026-06-01T15:00:00.000Z",
      corridor: { id: "savannah-chatham", name: "Savannah / Chatham", keywords: ["savannah"] },
      sources: [],
      editorialAngle: "Current market activity signals in Savannah.",
      sourceCountReviewed: 0,
    },
    writerOutput: { title: "Draft", html: "<p>Draft</p>", excerpt: "Draft" },
    wordpressPayload: {
      title: "Draft",
      content: "<p>Draft</p>",
      excerpt: "Draft",
      status: "draft",
      categories: [99],
      tags: [126, 127, 128, 129, 130],
      featured_media: 20240,
      meta: {
        pier_pulse_corridor: "Savannah / Chatham",
        pier_pulse_source_count: 0,
        pier_pulse_generated_at: "2026-06-01T15:00:00.000Z",
      },
    },
    providerModes: { extractor: "mock", writer: "mock" },
  });

  assert.equal(artifact.published, false);
  assert.equal(artifact.wordpressDraftUrl, null);
  assert.deepEqual(artifact.providerModes, { extractor: "mock", writer: "mock" });

  const summary = buildPierPulseRunSummary({ ...artifact, artifactPath: "/tmp/pier-pulse-test.json" });
  assert.equal(summary.status, "draft");
  assert.equal(summary.published, false);
  assert.equal(summary.heroImagePrompt, artifact.writerOutput.heroImagePrompt);
  assert.equal(summary.middleImagePrompts.length, 3);
});


test("PIER Pulse live collector ingestion validates Python collector output and rejects malformed payloads", () => {
  const valid = {
    collectorId: "gdnonline-rss",
    corridor: "savannah-chatham",
    collectedAt: "2026-06-02T14:00:00.000Z",
    candidates: [{ title: "Port area warehouse breaks ground", url: "https://gdnonline.com/warehouse", sourceName: "GDN Online" }],
    errors: [],
  };

  const result = ingestLiveCollectorResult(valid);
  assert.equal(result.collectorId, "gdnonline-rss");
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(result.errors, []);
  assert.equal(result.candidates[0].sourceName, "GDN Online");

  assert.throws(() => ingestLiveCollectorResult({ corridor: "savannah-chatham", candidates: [], errors: [] }), /collectorId/i);
  assert.throws(
    () =>
      ingestLiveCollectorResult({
        collectorId: "test-collector",
        corridor: "savannah-chatham",
        collectedAt: "2026-06-02T14:00:00.000Z",
        candidates: [{ title: "No URL story", sourceName: "Feed" }],
        errors: [],
      }),
    /url/i,
  );
});

test("PIER Pulse mergeLiveCollectorResults deduplicates by URL with first-seen wins", () => {
  const run1: PierPulseLiveCollectorResult = {
    collectorId: "gdnonline-rss",
    corridor: "savannah-chatham",
    collectedAt: "2026-06-02T14:00:00.000Z",
    candidates: [
      { title: "Story A (GDN)", url: "https://gdnonline.com/story-a", sourceName: "GDN Online" },
      { title: "Story B", url: "https://gdnonline.com/story-b", sourceName: "GDN Online" },
    ],
    errors: [],
  };
  const run2: PierPulseLiveCollectorResult = {
    collectorId: "savannah-biz-journal",
    corridor: "savannah-chatham",
    collectedAt: "2026-06-02T14:05:00.000Z",
    candidates: [
      { title: "Story A duplicate", url: "https://gdnonline.com/story-a", sourceName: "Biz Journal" },
      { title: "Story C", url: "https://bizjournal.com/story-c", sourceName: "Biz Journal" },
    ],
    errors: [],
  };

  const merged = mergeLiveCollectorResults([run1, run2]);
  assert.equal(merged.length, 3);
  assert.equal(merged.find((candidate) => candidate.url === "https://gdnonline.com/story-a")?.sourceName, "GDN Online");
  assert.ok(merged.some((candidate) => candidate.url === "https://bizjournal.com/story-c"));
});

test("PIER Pulse dry-run accepts liveCollectorResults array as fixture replacement and remains draft-only", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pier-pulse-live-"));
  try {
    const liveCollectorResults: PierPulseLiveCollectorResult[] = [
      {
        collectorId: "chatham-county-permits",
        corridor: "savannah-chatham",
        collectedAt: "2026-06-02T14:00:00.000Z",
        candidates: [
          {
            title: "Chatham County approves commercial warehouse permit",
            url: "https://chatham-county.gov/permit/cw-2026-001",
            sourceName: "Chatham County Permit Portal",
            summary: "A commercial warehouse permit was approved near a Savannah logistics corridor.",
            topics: ["permit", "industrial", "logistics"],
            facts: ["Permit approved for commercial warehouse", "Site is logistics-corridor-adjacent"],
            corridorHint: "Savannah / Chatham",
          },
        ],
        errors: [],
      },
    ];

    const result = await runPierPulseDryRun({
      runIndex: 0,
      liveCollectorResults,
      artifactsDir: join(dir, "artifacts"),
      generatedAt: "2026-06-02T14:30:00.000Z",
    });

    assert.equal(result.wordpressPayload.status, "draft");
    assert.equal(result.published, false);
    assert.ok(result.sourcePack.sourceCountReviewed >= 1);

    const artifact = JSON.parse(await readFile(result.artifactPath, "utf8"));
    assert.equal(artifact.published, false);
    assert.equal(artifact.wordpressPayload.status, "draft");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


test("PIER Pulse live collector runner executes multi-collector config and ingests envelopes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pier-pulse-live-runner-"));
  try {
    const rssPath = join(dir, "feed.xml");
    const agendaPath = join(dir, "agenda.html");
    const configPath = join(dir, "live-sources.json");
    await writeFile(
      rssPath,
      `<?xml version="1.0"?><rss><channel><item><title>Savannah port warehouse permit advances</title><link>https://example.com/savannah-port-warehouse</link><description>Commercial warehouse permit activity near Savannah port logistics corridor.</description></item></channel></rss>`,
      "utf8",
    );
    await writeFile(
      agendaPath,
      `<html><body><a href="https://example.com/zoning">Planning agenda reviews retail outparcel and warehouse site</a></body></html>`,
      "utf8",
    );
    await writeFile(
      configPath,
      JSON.stringify({
        collectors: [
          {
            collectorId: "savannah-live-news",
            corridor: "savannah-chatham",
            corridorHint: "Savannah / Chatham",
            sources: [{ type: "rss", name: "Savannah Live RSS", url: `file://${rssPath}` }],
          },
          {
            collectorId: "savannah-agenda",
            corridor: "savannah-chatham",
            corridorHint: "Savannah / Chatham",
            sources: [{ type: "agenda_html", name: "Savannah Agenda", url: `file://${agendaPath}`, includeTerms: ["planning", "warehouse"] }],
          },
          {
            collectorId: "hinesville-agenda",
            corridor: "hinesville-liberty",
            corridorHint: "Hinesville / Liberty County",
            sources: [{ type: "agenda_html", name: "Hinesville Agenda", url: `file://${agendaPath}`, includeTerms: ["planning", "warehouse"] }],
          },
        ],
      }),
      "utf8",
    );

    const results = await runPierPulseLiveCollectors({ configPath, collectedAt: "2026-06-02T15:00:00.000Z" });
    const savannahResults = await runPierPulseLiveCollectors({
      configPath,
      corridorId: "savannah-chatham",
      collectedAt: "2026-06-02T15:00:00.000Z",
    });

    assert.equal(results.length, 3);
    assert.equal(savannahResults.length, 2);
    assert.equal(results[0].collectorId, "savannah-live-news");
    assert.equal(results[1].collectorId, "savannah-agenda");
    assert.equal(results[2].collectorId, "hinesville-agenda");
    assert.equal(mergeLiveCollectorResults(savannahResults).length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("PIER Pulse dry-run integrates social drafts into artifact and WordPress payload", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pier-pulse-social-runner-"));
  try {
    const liveCollectorResults: PierPulseLiveCollectorResult[] = [
      {
        collectorId: "savannah-live-news",
        corridor: "savannah-chatham",
        collectedAt: "2026-06-02T15:00:00.000Z",
        candidates: [
          {
            title: "Savannah port warehouse permit advances",
            url: "https://example.com/savannah-port-warehouse",
            sourceName: "Savannah Live RSS",
            summary: "Commercial warehouse permit activity near Savannah port logistics corridor indicates industrial demand remains active.",
            topics: ["industrial", "permit", "logistics"],
            facts: ["Commercial warehouse permit advances", "Site is near Savannah port logistics corridor"],
            corridorHint: "Savannah / Chatham",
          },
        ],
        errors: [],
      },
    ];
    const articleUrl = "https://www.piercommercial.com/pier-pulse/savannah-port-warehouse";
    const result = await runPierPulseDryRun({
      runIndex: 0,
      liveCollectorResults,
      socialArticleUrl: articleUrl,
      artifactsDir: join(dir, "artifacts"),
      generatedAt: "2026-06-02T15:00:00.000Z",
      providers: {
        writeSocial: async ({ prompt }) => {
          assert.match(prompt, /LinkedIn/i);
          assert.match(prompt, /Facebook/i);
          assert.match(prompt, /Instagram/i);
          assert.match(prompt, /savannah-port-warehouse/);
          return {
            linkedin: { copy: `Savannah industrial signal: port-side permit activity is worth watching. Read the full story: ${articleUrl}`, hashtags: ["#CRE", "#Savannah"] },
            facebook: { copy: `A Savannah logistics signal moved through the permit pipeline. Read the full story: ${articleUrl}`, hashtags: ["#SavannahCRE"] },
            instagram: { copy: `Savannah industrial signal. Read the full story: ${articleUrl}`, hashtags: ["#piercommercial"] },
          };
        },
      },
    });

    assert.ok(result.socialDrafts);
    assert.match(result.socialDrafts?.linkedin.copy ?? "", /savannah-port-warehouse/);
    assert.match(result.wordpressPayload.content, /<!-- PIER Pulse Social Drafts/);
    assert.ok(result.wordpressPayload.meta.pier_pulse_social_drafts);
    const artifact = JSON.parse(await readFile(result.artifactPath, "utf8"));
    assert.equal(artifact.socialDrafts.linkedin.platform, "linkedin");
    assert.match(artifact.wordpressPayload.meta.pier_pulse_social_drafts, /savannah-port-warehouse/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
