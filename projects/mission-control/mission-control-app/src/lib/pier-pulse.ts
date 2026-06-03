export type PierPulseCorridor = {
  id: string;
  name: string;
  keywords: string[];
};

export type PierPulseSourceCandidateInput = {
  title: string;
  url: string;
  sourceName: string;
  publishedAt?: string;
  summary?: string;
  topics?: string[];
  facts?: string[];
  corridorHint?: string;
};

export type PierPulseSourceCandidate = Required<PierPulseSourceCandidateInput> & {
  relevanceScore: number;
};

export type PierPulseSourcePack = {
  id: string;
  generatedAt: string;
  corridor: PierPulseCorridor;
  sources: PierPulseSourceCandidate[];
  editorialAngle: string;
  sourceCountReviewed: number;
};

export type PierPulseSocialPlatform = "linkedin" | "facebook" | "instagram";

export type PierPulseSocialDraft = {
  platform: PierPulseSocialPlatform;
  copy: string;
  hashtags: string[];
  characterCount: number;
};

export type PierPulseSocialDraftSet = {
  linkedin: PierPulseSocialDraft;
  facebook: PierPulseSocialDraft;
  instagram: PierPulseSocialDraft;
};

export type PierPulseDraftPayloadInput = {
  title: string;
  html: string;
  excerpt: string;
  sourcePack: PierPulseSourcePack;
  featuredMediaId?: number;
  tagIds?: number[];
  heroImagePrompt?: string;
  middleImagePrompts?: [string, string, string] | string[];
  socialDrafts?: PierPulseSocialDraftSet;
};

export type PierPulseWordPressDraftPayload = {
  title: string;
  content: string;
  excerpt: string;
  status: "draft";
  categories: number[];
  tags: number[];
  featured_media: number;
  meta: {
    pier_pulse_corridor: string;
    pier_pulse_source_count: number;
    pier_pulse_generated_at: string;
    pier_pulse_social_drafts?: string;
  };
};

export const pierPulseCorridors: PierPulseCorridor[] = [
  {
    id: "savannah-chatham",
    name: "Savannah / Chatham",
    keywords: ["savannah", "chatham", "downtown", "garden city", "port", "pooler parkway"],
  },
  {
    id: "pooler-bloomingdale-port-wentworth-garden-city",
    name: "Pooler / Bloomingdale / Port Wentworth / Garden City",
    keywords: ["pooler", "bloomingdale", "port wentworth", "garden city", "i-16", "i-95"],
  },
  {
    id: "brunswick-st-simons-camden-glynn-mcintosh",
    name: "Brunswick / St. Simons / Camden / Glynn / McIntosh",
    keywords: ["brunswick", "st. simons", "saint simons", "camden", "glynn", "mcintosh", "golden isles"],
  },
  {
    id: "hinesville-liberty",
    name: "Hinesville / Liberty County",
    keywords: ["hinesville", "liberty county", "fort stewart", "midway"],
  },
  {
    id: "statesboro-bulloch",
    name: "Statesboro / Bulloch County",
    keywords: ["statesboro", "bulloch", "georgia southern", "i-16"],
  },
  {
    id: "rincon-effingham-pembroke",
    name: "Rincon / Effingham / Pembroke",
    keywords: ["rincon", "effingham", "pembroke", "springfield", "bryan county"],
  },
  {
    id: "bluffton-hilton-head-hardeeville-jasper-beaufort",
    name: "Bluffton / Hilton Head / Hardeeville / Jasper / Beaufort",
    keywords: ["bluffton", "hilton head", "hardeeville", "jasper", "beaufort", "lowcountry"],
  },
];

export const PIER_PULSE_WORDPRESS_DEFAULTS = {
  categoryId: 99,
  fallbackFeaturedMediaId: 20240,
  defaultTagIds: [126, 127, 128, 129, 130],
} as const;

const creSignalTerms = [
  "commercial",
  "real estate",
  "sublease",
  "sublet",
  "space available",
  "available space",
  "availability",
  "asking rent",
  "lease rate",
  "rent tracking",
  "development",
  "industrial",
  "retail",
  "office",
  "medical",
  "lease",
  "leasing",
  "tenant",
  "vacancy",
  "rent",
  "infrastructure",
  "zoning",
  "rezoning",
  "agenda",
  "planning commission",
  "planning",
  "permit",
  "site plan",
  "project announcement",
  "project",
  "groundbreaking",
  "ribbon cutting",
  "event",
  "port",
  "logistics",
  "multifamily",
  "site",
  "corridor",
];

export function getCorridorForRun(runIndex: number) {
  const normalizedIndex = ((runIndex % pierPulseCorridors.length) + pierPulseCorridors.length) % pierPulseCorridors.length;
  return pierPulseCorridors[normalizedIndex];
}

export function normalizeSourceCandidate(input: PierPulseSourceCandidateInput): PierPulseSourceCandidate {
  const topics = dedupeStrings(input.topics ?? []);
  const facts = dedupeStrings(input.facts ?? []);
  const summary = input.summary?.trim() ?? "";
  const candidateWithoutScore = {
    title: input.title.trim(),
    url: input.url.trim(),
    sourceName: input.sourceName.trim(),
    publishedAt: input.publishedAt?.trim() ?? "",
    summary,
    topics,
    facts,
    corridorHint: input.corridorHint?.trim() ?? "",
    relevanceScore: 0,
  };

  return {
    ...candidateWithoutScore,
    relevanceScore: scoreCandidate(candidateWithoutScore),
  };
}

export function buildSourcePack(input: {
  corridor: PierPulseCorridor;
  candidates: PierPulseSourceCandidate[];
  generatedAt?: string;
  maxSources?: number;
}): PierPulseSourcePack {
  const maxSources = input.maxSources ?? 6;
  const sources = input.candidates
    .filter((candidate) => candidate.relevanceScore >= 6)
    .filter((candidate) => candidate.facts.length > 0 || candidate.summary.length > 80)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || topicPriority(b) - topicPriority(a) || a.title.localeCompare(b.title))
    .slice(0, maxSources);
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  return {
    id: `pier-pulse-${input.corridor.id}-${generatedAt.slice(0, 10)}`,
    generatedAt,
    corridor: input.corridor,
    sources,
    sourceCountReviewed: input.candidates.length,
    editorialAngle: buildEditorialAngle(input.corridor, sources),
  };
}

export function buildPierPulseWriterPrompt(sourcePack: PierPulseSourcePack) {
  const sourcePackJson = JSON.stringify(sourcePack, null, 2);

  return `You are writing a draft-first PIER Pulse Drop / Market Intel post for PIER Commercial Real Estate.

Strategic context:
- PIER is leveraging proprietary AI and disciplined brokerage/operator workflows to scale transactional volume and move faster, with more accuracy, than traditional commercial real estate firms.
- Write with CCIM-level judgment: practical, data-aware, concise, and useful to owners, tenants, investors, and local decision-makers.
- Use subtle sales positioning. Do not hype. Demonstrate expertise through interpretation and clarity.
- Phase 5 intelligence lens: surface sublease availability, asking rent/lease-rate movement, commercial permits, site plan/project announcements, business/ribbon-cutting events, public agendas, zoning/rezoning, and infrastructure approvals when the Source Pack supports them.
- Deep sourcing mandate: prioritize under-the-radar CRE intelligence from city council, county commission, planning commission, zoning board, development authority, port/airport authority, utility authority, and transportation/infrastructure agendas. Look for zoning change requests, site plan reviews, proposed developments, annexations, variances, special-use permits, development agreements, impact fees, SPLOST/TSPLOST/CIP work, water/sewer capacity, utility upgrades, road access, rail/port/airport/logistics improvements, incentives, and projects entering the pipeline.
- Story variety mandate: prefer signals owners, tenants, investors, and brokers have not interpreted yet. If a story is already public, add insider CRE context such as site-selection implications, entitlement risk, timing, infrastructure capacity, tenant/ownership strategy, submarket spillover, or off-market opportunity angles.
- Broker-forward lead capture: tie the Bottom Line to PIER Commercial Real Estate market analytics, off-market opportunities, and site selection consulting without sounding salesy.

Market corridor focus: ${sourcePack.corridor.name}
Editorial angle: ${sourcePack.editorialAngle}

Output rules:
- DRAFT-FIRST: prepare review-ready copy only. Do not imply the article is already published.
- Use the locked PIER Pulse house style: richer, consistent, succinct, well-spaced, scannable, and broker-forward.
- Return JSON only with keys: title, html, excerpt, heroImagePrompt, middleImagePrompts.
- heroImagePrompt: one high-end image prompt for premium commercial real estate visual storytelling. It should feel striking, specific to the corridor/topic, and suitable for PIER brand use. You may use realistic architectural/commercial photography, high-end stylized, conceptual, cinematic, 3D architectural, abstract, and premium editorial CRE imagery when it is tied to the story theme and corridor.
- middleImagePrompts: exactly 3 supporting image prompts for in-body visuals. They may request high-end realistic commercial real estate photography, stylized/conceptual CRE visuals, cinematic 3D architectural compositions, or premium abstract/infographic-style visuals that reinforce the article sections without looking cheap/canned.
- Expanded creative freedom: visuals do not need to be photorealistic depictions of exact real-world locations. Acceptable example when infrastructure/power facts support it: "A dramatic, hyper-stylized 3D architectural outline of an industrial electrical substation glowing blue at night with a lightning strike in the background." The goal is premium, striking visual interest tied to the story's theme.
- Contextual and geographic image grounding: never generate generic prompts such as "industrial pipes", "interior building", "airport terminal", "courtroom", "city council chamber", random lobbies, or unsourced stock-photo scenes. Every image prompt must tie directly to ${sourcePack.corridor.name} and facts/themes in the Source Pack and include local/regional visual language such as "Coastal Georgia landscape", "Savannah River maritime shipping logistics", "Port-adjacent warehouse environment", or the specific corridor name.
- Visual-topic match: if the story covers port expansion, logistics, infrastructure, utility capacity, power, roads, sewers, or industrial growth, prompts may depict active container terminals, gantry cranes, heavy transport logistics on regional highways, port-adjacent warehouses, Coastal Georgia industrial sites, or stylized/conceptual CRE infrastructure scenes. If the story covers retail, office, medical office, permits, zoning, site plans, or development, prompts should depict the matching commercial property type, site-work context, conceptual entitlement/planning visuals, or a text-free site-plan abstraction supported by the Source Pack.
- Premium abstract fallback: if no concrete local CRE visual angle is supported, use text-free alternatives such as "A clean, minimalist, text-free architectural site plan blueprint", "An abstract vector layout representing regional logistics network paths", or "A modern, text-free commercial real estate growth chart graphic". Keep them premium, minimal, and locally grounded.
- STRICT IMAGE RULE: every image prompt MUST explicitly include this phrase: "no alphabetic characters, no numbers, no text, no words, no labels, no captions, no typography, no logos." Never request readable signage, route names, legends, captions, labels, letters, numerals, typography, logos, or any generated text.
- HTML structure must follow this order: short opening of 2-3 sentences; H2 "The Signal"; a set-aside blockquote with a punchy quote and attribution; short scannable sections such as "What's Happening", "Why It Matters", "How To Play It", "What To Watch"; and exact H2 "THE BOTTOM LINE".
- Every Pulse Drop must close with the locked Bottom Line CTA format after H2 "THE BOTTOM LINE". Use this exact closing skeleton in the html value:
  <div class="pier-pulse-bottom-line" style="background:#f9f9f9; border:1px solid #e5e5e5; padding:25px; margin-top:30px; border-radius:6px;">
  <h2>THE BOTTOM LINE</h2>
  <p>[Story-specific strategy line 1 relating directly to the article content]</p>
  <p>[Story-specific strategy line 2 relating directly to the article content and PIER market analytics]</p>
  <p>[Story-specific strategy line 3 relating directly to off-market opportunities or site selection consulting]</p>
  <p>Contact PIER Commercial Real Estate today.</p>
  <p>Phone: <strong>912.353.7707</strong> | Website: <strong>piercommercial.com</strong> | Instagram: <strong>@piercommercial</strong></p>
  <p><a href="https://www.piercommercial.com/contact-us/">Click here to contact us</a></p>
  </div>
- The three strategy lines before "Contact PIER Commercial Real Estate today." are the only variables in this close. They are exactly three short story-specific lines; they must change for each story and relate directly to the corridor/topic/source signal. Do not reuse generic boilerplate for those three lines.
- The Signal quote attribution should default to "PIER Staff". Where useful, include an edit-friendly author placeholder list in the body or note text: Ryan Schneider <ryan@piercommercial.com>, Anthony <anthony@piercommercial.com>, Joel <joel@piercommercial.com>, Senior Research Associate Jonathan Caparelli <jonathan@piercommercial.com>.
- Use selective bold labels or bold market signal phrases where they improve scanability.
- Bullets and numbered points are acceptable when they improve spacing, scannability, and rhythm. Use them intentionally, not as filler.
- Include a premium but understated PIER CTA tied to market intelligence, market analytics, off-market opportunities, site selection, leasing, acquisition, disposition, or property strategy.
- Use only the provided Source Pack. If the sources do not prove a claim, frame it as a signal, not a fact.
- Do not include a Credits section.
- Do not include a References section.
- Do not include a visible Source Pack, source-links section, backend notes, editor notes, or "Editor review" text in the html value. Source/source-pack details are for backend reference only and must never render in the visible article body.

Source Pack:
${sourcePackJson}`;
}

export function buildWordPressDraftPayload(input: PierPulseDraftPayloadInput): PierPulseWordPressDraftPayload {
  const sourceList = input.sourcePack.sources
    .map((source) => `- ${source.title} (${source.sourceName}): ${source.url}`)
    .join("\n");
  const sourceBlock = buildBackendReferenceBlock("PIER Pulse Source Pack", [
    `Corridor: ${input.sourcePack.corridor.name}`,
    `Generated: ${input.sourcePack.generatedAt}`,
    `Sources reviewed: ${input.sourcePack.sourceCountReviewed}`,
    `Sources used: ${input.sourcePack.sources.length}`,
    sourceList,
  ]);
  const imagePromptBlock = buildImagePromptBlock(input);
  const socialDraftBlock = buildSocialDraftBlock(input.socialDrafts);

  return {
    title: input.title.trim(),
    content: `${input.html.trim()}\n${imagePromptBlock}${socialDraftBlock}${sourceBlock}`,
    excerpt: input.excerpt.trim(),
    status: "draft",
    categories: [PIER_PULSE_WORDPRESS_DEFAULTS.categoryId],
    tags: input.tagIds ?? [...PIER_PULSE_WORDPRESS_DEFAULTS.defaultTagIds],
    featured_media: input.featuredMediaId ?? PIER_PULSE_WORDPRESS_DEFAULTS.fallbackFeaturedMediaId,
    meta: {
      pier_pulse_corridor: input.sourcePack.corridor.name,
      pier_pulse_source_count: input.sourcePack.sources.length,
      pier_pulse_generated_at: input.sourcePack.generatedAt,
      ...(input.socialDrafts ? { pier_pulse_social_drafts: JSON.stringify(input.socialDrafts) } : {}),
    },
  };
}

export function buildPierPulseSocialDraftPrompt(input: {
  title: string;
  excerpt: string;
  corridorName: string;
  editorialAngle: string;
  articleUrl?: string;
}) {
  const articleUrl = input.articleUrl ?? "https://www.piercommercial.com/";
  return `Create draft-only branded social media shot blips for a PIER Pulse article.

Return JSON only with keys: linkedin, facebook, instagram.
Each platform object must contain: copy and hashtags.

Article title: ${input.title}
Excerpt: ${input.excerpt}
Corridor: ${input.corridorName}
Editorial angle: ${input.editorialAngle}
Live story URL to include explicitly in every copy field: ${articleUrl}

Rules:
- Draft-only: these are review drafts, not live posts. Avoid any language implying immediate social publishing.
- Each copy field must be a punchy branded "shot blip" that hooks the reader and explicitly drives them to piercommercial.com to read the full story.
- LinkedIn: professional CRE/operator tone, no more than 1,500 characters.
- Facebook: conversational local-market tone, no more than 500 characters.
- Instagram: hook-first, crisp, no more than 400 characters; keep hashtags in the hashtags array.
- Use PIER Commercial Real Estate voice: useful, strategic, broker-forward, understated.
- Include a non-salesy lead-capture line in each platform's copy tying the story to PIER Commercial Real Estate market analytics, off-market opportunities, or site selection guidance.
- Include platform-appropriate hashtags arrays.`;
}

export function normalizeSocialDraftSet(raw: unknown, sourcePack: PierPulseSourcePack, articleUrl = "https://www.piercommercial.com/"): PierPulseSocialDraftSet {
  const value = isRecord(raw) ? raw : {};
  return {
    linkedin: normalizeSocialDraft("linkedin", value.linkedin, sourcePack, articleUrl),
    facebook: normalizeSocialDraft("facebook", value.facebook, sourcePack, articleUrl),
    instagram: normalizeSocialDraft("instagram", value.instagram, sourcePack, articleUrl),
  };
}

function normalizeSocialDraft(platform: PierPulseSocialPlatform, raw: unknown, sourcePack: PierPulseSourcePack, articleUrl: string): PierPulseSocialDraft {
  const limit = platform === "linkedin" ? 1500 : platform === "facebook" ? 500 : 400;
  const value = isRecord(raw) ? raw : {};
  const rawCopy = typeof value.copy === "string" ? value.copy.trim() : "";
  const fallback = buildFallbackSocialCopy(platform, sourcePack, articleUrl);
  const copyWithUrl = ensureArticleUrl(ensureLeadCapture(rawCopy || fallback, platform), articleUrl);
  const copy = copyWithUrl.length > limit ? copyWithUrl.slice(0, Math.max(0, limit - articleUrl.length - 6)).trimEnd() + `… ${articleUrl}` : copyWithUrl;
  const rawHashtags = Array.isArray(value.hashtags) ? value.hashtags : [];
  const hashtags = dedupeStrings(rawHashtags.filter((tag): tag is string => typeof tag === "string").map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))).slice(0, 8);
  const withFallbackTags = hashtags.length ? hashtags : defaultSocialHashtags(sourcePack);
  return { platform, copy, hashtags: withFallbackTags, characterCount: copy.length };
}

function buildFallbackSocialCopy(platform: PierPulseSocialPlatform, sourcePack: PierPulseSourcePack, articleUrl: string) {
  const topic = sourcePack.sources[0]?.topics[0] ?? "market signals";
  const corridor = sourcePack.corridor.name;
  const lead = platform === "instagram" ? `${corridor}: the signal is moving.` : `PIER Pulse is tracking ${topic} across ${corridor}.`;
  const cta =
    platform === "linkedin"
      ? "PIER Commercial Real Estate pairs market analytics with brokerage judgment for owners, tenants, and investors."
      : platform === "facebook"
        ? "Contact PIER Commercial Real Estate for market analytics and off-market opportunities."
        : "PIER Commercial Real Estate: market analytics, off-market opportunities, and site selection guidance.";
  return `${lead} ${cta} Read the full story: ${articleUrl}`;
}

function ensureLeadCapture(copy: string, platform: PierPulseSocialPlatform) {
  if (/market analytics|off-market opportunities|site selection/i.test(copy)) return copy;
  const cta =
    platform === "linkedin"
      ? "PIER Commercial Real Estate can help translate this into market analytics and site selection guidance."
      : platform === "facebook"
        ? "Contact PIER Commercial Real Estate for market analytics and off-market opportunities."
        : "PIER Commercial Real Estate: market analytics, off-market opportunities, and site selection guidance.";
  return `${copy.trim()} ${cta}`.trim();
}

function ensureArticleUrl(copy: string, articleUrl: string) {
  if (copy.includes(articleUrl)) return copy;
  return `${copy.replace(/\s+$/g, "")} Read the full story: ${articleUrl}`.trim();
}

function defaultSocialHashtags(sourcePack: PierPulseSourcePack) {
  const corridorTag = `#${sourcePack.corridor.name.split("/")[0].replace(/[^A-Za-z0-9]/g, "")}`;
  return dedupeStrings(["#piercommercial", "#CRE", corridorTag]);
}

function buildSocialDraftBlock(socialDrafts?: PierPulseSocialDraftSet) {
  if (!socialDrafts) return "";
  return buildBackendReferenceBlock("PIER Pulse Social Drafts", [
    `LinkedIn: ${socialDrafts.linkedin.copy}`,
    `LinkedIn hashtags: ${socialDrafts.linkedin.hashtags.join(" ")}`,
    `Facebook: ${socialDrafts.facebook.copy}`,
    `Facebook hashtags: ${socialDrafts.facebook.hashtags.join(" ")}`,
    `Instagram: ${socialDrafts.instagram.copy}`,
    `Instagram hashtags: ${socialDrafts.instagram.hashtags.join(" ")}`,
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function buildImagePromptBlock(input: PierPulseDraftPayloadInput) {
  if (!input.heroImagePrompt && !input.middleImagePrompts?.length) return "";
  const middlePrompts = (input.middleImagePrompts ?? []).slice(0, 3);
  return buildBackendReferenceBlock("PIER Pulse Image Prompts", [
    input.heroImagePrompt ? `Hero: ${input.heroImagePrompt.trim()}` : "",
    ...middlePrompts.map((prompt, index) => `Middle ${index + 1}: ${prompt.trim()}`),
  ]);
}

function buildBackendReferenceBlock(label: string, lines: string[]) {
  const body = lines.map((line) => line.trim()).filter(Boolean).join("\n");
  return `<!-- ${label}\n${sanitizeHtmlComment(body)}\n-->\n`;
}

function sanitizeHtmlComment(value: string) {
  return value.replaceAll("-->", "--&gt;");
}

function topicPriority(candidate: PierPulseSourceCandidate) {
  const priorities = new Map([
    ["sublease", 8],
    ["rent", 7],
    ["permit", 6],
    ["project", 5],
    ["event", 4],
    ["zoning", 3],
    ["agenda", 2],
    ["infrastructure", 1],
  ]);
  return candidate.topics.reduce((score, topic) => Math.max(score, priorities.get(topic) ?? 0), 0);
}

function scoreCandidate(candidate: Omit<PierPulseSourceCandidate, "relevanceScore">) {
  const haystack = `${candidate.title} ${candidate.summary} ${candidate.topics.join(" ")} ${candidate.facts.join(" ")}`.toLowerCase();
  let score = 0;

  for (const term of creSignalTerms) {
    if (haystack.includes(term)) score += 1;
  }

  if (candidate.facts.length > 0) score += 2;
  if (candidate.facts.length >= 2) score += 1;
  if (candidate.summary.length >= 80) score += 1;
  if (candidate.corridorHint) score += 1;
  if (/\.gov|county|city|authority|chamber|business|journal|notice/i.test(candidate.sourceName + " " + candidate.url)) score += 1;

  return Math.min(10, score);
}

function buildEditorialAngle(corridor: PierPulseCorridor, sources: PierPulseSourceCandidate[]) {
  const topicCounts = new Map<string, number>();
  for (const source of sources) {
    for (const topic of source.topics) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }
  const primaryTopic = [...topicCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "market activity";
  return `Current ${primaryTopic} signals in ${corridor.name}, interpreted through a commercial real estate lens for owners, tenants, investors, and operators.`;
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
