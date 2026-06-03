import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPierPulseSocialDraftPrompt,
  buildSourcePack,
  buildWordPressDraftPayload,
  getCorridorForRun,
  normalizeSocialDraftSet,
  normalizeSourceCandidate,
  type PierPulseSocialDraftSet,
} from "../src/lib/pier-pulse";
import { buildPierPulseRunArtifact } from "../src/lib/pier-pulse-runner";

test("PIER Pulse social draft prompt requests branded LinkedIn, Facebook, and Instagram shot blips", () => {
  const prompt = buildPierPulseSocialDraftPrompt({
    title: "Savannah Market Intel: Port Logistics Drive Industrial Surge",
    excerpt: "Industrial demand is outpacing supply near Savannah's port corridor.",
    corridorName: "Savannah / Chatham",
    editorialAngle: "Current industrial signals in Savannah / Chatham, interpreted for CRE stakeholders.",
    articleUrl: "https://www.piercommercial.com/?p=12345",
  });

  assert.match(prompt, /JSON only/i);
  assert.match(prompt, /linkedin/i);
  assert.match(prompt, /facebook/i);
  assert.match(prompt, /instagram/i);
  assert.match(prompt, /shot blip/i);
  assert.match(prompt, /piercommercial\.com/i);
  assert.match(prompt, /read the full story/i);
  assert.match(prompt, /1[,.]?500/);
  assert.match(prompt, /500/);
  assert.match(prompt, /400/);
  assert.match(prompt, /hashtags/i);
  assert.match(prompt, /draft/i);
  assert.doesNotMatch(prompt, /publish now|go live|post immediately/i);
});

test("PIER Pulse normalizeSocialDraftSet enforces platform limits, hashtags, and live story URL", () => {
  const sourcePack = buildSourcePack({
    corridor: getCorridorForRun(0),
    generatedAt: "2026-06-02T14:00:00.000Z",
    candidates: [
      normalizeSourceCandidate({
        title: "Savannah industrial site permit advances",
        url: "https://example.com/permit",
        sourceName: "City Agenda",
        summary: "A warehouse permit moved through local review near Savannah's logistics corridor.",
        topics: ["industrial", "permit", "logistics"],
        facts: ["Permit approved", "Site is logistics-corridor-adjacent"],
        corridorHint: "Savannah / Chatham",
      }),
    ],
  });

  const result = normalizeSocialDraftSet(
    {
      linkedin: { copy: "LinkedIn professional shot blip. Read the full story: https://www.piercommercial.com/?p=123", hashtags: ["#CRE", "#Savannah"] },
      facebook: { copy: "Facebook shot blip. Read the full story: https://www.piercommercial.com/?p=123", hashtags: ["#SavannahCRE"] },
      instagram: { copy: "Instagram hook. Read the full story: https://www.piercommercial.com/?p=123", hashtags: ["#piercommercial", "#CRE"] },
    },
    sourcePack,
    "https://www.piercommercial.com/?p=123",
  );

  assert.equal(result.linkedin.platform, "linkedin");
  assert.ok(result.linkedin.copy.length <= 1500);
  assert.match(result.linkedin.copy, /https:\/\/www\.piercommercial\.com\/\?p=123/);
  assert.equal(result.linkedin.characterCount, result.linkedin.copy.length);
  assert.ok(Array.isArray(result.linkedin.hashtags));

  assert.equal(result.facebook.platform, "facebook");
  assert.ok(result.facebook.copy.length <= 500);
  assert.match(result.facebook.copy, /read the full story/i);

  assert.equal(result.instagram.platform, "instagram");
  assert.ok(result.instagram.copy.length <= 400);
  assert.ok(result.instagram.hashtags.includes("#piercommercial"));
});

test("PIER Pulse normalizeSocialDraftSet falls back to corridor-aware safe drafts for missing platforms", () => {
  const sourcePack = buildSourcePack({
    corridor: getCorridorForRun(2),
    generatedAt: "2026-06-02T14:00:00.000Z",
    candidates: [
      normalizeSourceCandidate({
        title: "Brunswick retail corridor tightens",
        url: "https://example.com/brunswick-retail",
        sourceName: "Development Feed",
        summary: "Retail vacancy is narrowing across Brunswick's core commercial corridors.",
        topics: ["retail", "leasing"],
        facts: ["Retail vacancy narrows", "Tenant inquiries increase"],
        corridorHint: "Brunswick / St. Simons / Camden / Glynn / McIntosh",
      }),
    ],
  });

  const result = normalizeSocialDraftSet({ facebook: { copy: "FB only.", hashtags: null }, instagram: { copy: "IG only.", hashtags: [] } }, sourcePack, "https://www.piercommercial.com/story");

  assert.equal(result.linkedin.platform, "linkedin");
  assert.match(result.linkedin.copy, /Brunswick/i);
  assert.match(result.linkedin.copy, /https:\/\/www\.piercommercial\.com\/story/);
  assert.doesNotMatch(result.linkedin.copy, /publish|go live/i);
  assert.ok(Array.isArray(result.facebook.hashtags));
  assert.equal(result.instagram.platform, "instagram");
});

test("PIER Pulse social draft prompt and fallback copy include lead-capture advisory CTAs", () => {
  const sourcePack = buildSourcePack({
    corridor: getCorridorForRun(0),
    generatedAt: "2026-06-02T15:00:00.000Z",
    candidates: [
      normalizeSourceCandidate({
        title: "Savannah sublease rent signal",
        url: "https://example.com/sublease-rent",
        sourceName: "Market Feed",
        summary: "Sublease availability and rent movement signal.",
        topics: ["sublease", "rent", "office", "leasing"],
        facts: ["Asking rent is moving lower"],
        corridorHint: "Savannah / Chatham",
      }),
    ],
  });
  const articleUrl = "https://www.piercommercial.com/pier-pulse/sublease-rent";
  const prompt = buildPierPulseSocialDraftPrompt({
    title: "Savannah Sublease Rent Signal",
    excerpt: "Sublease and rent movement signal.",
    corridorName: "Savannah / Chatham",
    editorialAngle: sourcePack.editorialAngle,
    articleUrl,
  });
  const normalized = normalizeSocialDraftSet({}, sourcePack, articleUrl);

  assert.match(prompt, /off-market opportunities/i);
  assert.match(prompt, /market analytics/i);
  assert.match(prompt, /site selection/i);
  assert.match(normalized.linkedin.copy, /PIER Commercial Real Estate/i);
  assert.match(normalized.linkedin.copy, /market analytics/i);
  assert.match(normalized.facebook.copy, /off-market opportunities/i);
  assert.match(normalized.instagram.copy, /site selection/i);
});

test("PIER Pulse WordPress payload embeds social drafts in hidden comment and meta field only", () => {
  const sourcePack = buildSourcePack({
    corridor: getCorridorForRun(0),
    generatedAt: "2026-06-02T14:00:00.000Z",
    candidates: [
      normalizeSourceCandidate({
        title: "Savannah retail vacancy narrows near core corridor",
        url: "https://example.com/retail-vacancy",
        sourceName: "Market Feed",
        summary: "Retail conditions are improving in a Savannah corridor.",
        topics: ["retail", "leasing"],
        facts: ["Vacancy narrows", "Leasing momentum improves"],
      }),
    ],
  });

  const socialDrafts: PierPulseSocialDraftSet = {
    linkedin: { platform: "linkedin", copy: "LinkedIn ready copy. Read the full story: https://www.piercommercial.com/story", hashtags: ["#CRE"], characterCount: 78 },
    facebook: { platform: "facebook", copy: "Facebook ready copy. Read the full story: https://www.piercommercial.com/story", hashtags: ["#Savannah"], characterCount: 78 },
    instagram: { platform: "instagram", copy: "Instagram ready copy. Read the full story: https://www.piercommercial.com/story", hashtags: ["#piercommercial"], characterCount: 79 },
  };

  const payload = buildWordPressDraftPayload({
    title: "Savannah Market Intel: Retail Momentum Builds",
    html: "<h2>The Signal</h2><p>Retail is tightening.</p>",
    excerpt: "Retail momentum is building in Savannah.",
    sourcePack,
    socialDrafts,
  });

  assert.equal(payload.status, "draft");
  assert.match(payload.content, /<!-- PIER Pulse Social Drafts/);
  assert.doesNotMatch(payload.content, /<h2>Social Drafts<\/h2>/);
  assert.ok("pier_pulse_social_drafts" in payload.meta);
  const parsedMeta = JSON.parse(payload.meta.pier_pulse_social_drafts ?? "null") as PierPulseSocialDraftSet;
  assert.equal(parsedMeta.linkedin.platform, "linkedin");
  assert.equal(parsedMeta.instagram.platform, "instagram");
});

test("PIER Pulse run artifact carries socialDrafts field as null or populated draft-only metadata", () => {
  const base = {
    generatedAt: "2026-06-02T14:00:00.000Z",
    sourcePack: {
      id: "pier-pulse-test",
      generatedAt: "2026-06-02T14:00:00.000Z",
      corridor: { id: "savannah-chatham", name: "Savannah / Chatham", keywords: ["savannah"] },
      sources: [],
      editorialAngle: "Current market activity in Savannah.",
      sourceCountReviewed: 0,
    },
    writerOutput: { title: "Draft", html: "<p>Draft</p>", excerpt: "Draft" },
    wordpressPayload: {
      title: "Draft",
      content: "<p>Draft</p>",
      excerpt: "Draft",
      status: "draft" as const,
      categories: [99],
      tags: [126],
      featured_media: 20240,
      meta: { pier_pulse_corridor: "Savannah / Chatham", pier_pulse_source_count: 0, pier_pulse_generated_at: "2026-06-02T14:00:00.000Z" },
    },
    providerModes: { extractor: "fallback" as const, writer: "fallback" as const },
  };

  const artifactNoSocial = buildPierPulseRunArtifact(base);
  assert.equal(artifactNoSocial.socialDrafts, null);
  assert.equal(artifactNoSocial.published, false);

  const socialDrafts: PierPulseSocialDraftSet = {
    linkedin: { platform: "linkedin", copy: "LI copy.", hashtags: ["#CRE"], characterCount: 8 },
    facebook: { platform: "facebook", copy: "FB copy.", hashtags: ["#PIER"], characterCount: 8 },
    instagram: { platform: "instagram", copy: "IG copy.", hashtags: ["#piercommercial"], characterCount: 8 },
  };
  const artifactWithSocial = buildPierPulseRunArtifact({ ...base, socialDrafts });
  assert.deepEqual(artifactWithSocial.socialDrafts, socialDrafts);
  assert.equal(artifactWithSocial.published, false);
});
