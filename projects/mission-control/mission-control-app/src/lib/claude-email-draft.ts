type ListingRecord = Record<string, unknown>;

type BrokerContext = {
  name?: string;
  email?: string;
  phone?: string;
  title?: string;
};

export const PIER_EMAIL_LOGO_URL =
  process.env.PIER_EMAIL_LOGO_URL || "https://www.piercommercial.com/wp-content/uploads/Brokeragetransp.png";

export type ClaudeEmailSourcePacket = {
  generatedAt: string;
  campaign: {
    audience: string;
    goal: string;
    campaignType: string;
    userNotes: string;
  };
  listing: {
    publicFacts: Record<string, unknown>;
    descriptions: string[];
    highlights: string[];
    photos: string[];
    publicUrl: string;
  };
  broker: Required<BrokerContext>;
  brandRules: {
    publicVoice: string;
    primaryColor: string;
    darkColor: string;
    accentColor: string;
    logoUrl: string;
    logoAssetName: string;
    logoRequired: boolean;
    noLogoRecreation: boolean;
    noLogoCssFilters: boolean;
    noEmoji: boolean;
    noRawFieldLabels: boolean;
    draftFirst: boolean;
  };
  forbiddenContent: string[];
};

export type ClaudeEmailDraft = {
  subjectLines: string[];
  previewText: string;
  campaignStrategy: string;
  emailHtml: string;
  plainText: string;
  ctaText: string;
  designNotes: string;
  complianceChecklist: {
    noPrivateContent: boolean;
    noRawFieldLabels: boolean;
    listingUrlIncluded: boolean;
    brokerContactIncluded: boolean;
  };
};

type BuildPacketInput = {
  listing: ListingRecord;
  audience?: string;
  campaignGoal?: string;
  campaignType?: string;
  userNotes?: string;
  broker?: BrokerContext;
};

function asRecord(value: unknown): ListingRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ListingRecord : {};
}

function asText(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return String(value ?? "").trim();
}

function nested(source: ListingRecord, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (Array.isArray(current) && /^\d+$/.test(key)) return current[Number(key)];
    return asRecord(current)[key];
  }, source);
}

function firstText(source: ListingRecord, paths: string[]) {
  for (const path of paths) {
    const value = nested(source, path);
    const clean = asText(value);
    if (clean) return clean;
  }
  return "";
}

function addressText(listing: ListingRecord) {
  const address = listing.address;
  if (typeof address === "string") return address.trim();
  const record = asRecord(address);
  return asText(record.full) || [record.street, record.city, record.state, record.zip].map(asText).filter(Boolean).join(", ");
}

function money(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return `$${value.toLocaleString()}`;
  return asText(value);
}

function sf(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return `±${value.toLocaleString()} SF`;
  const raw = asText(value);
  return raw && !/sf/i.test(raw) ? `±${raw} SF` : raw;
}

function collectPhotos(listing: ListingRecord) {
  const photos = new Set<string>();
  const directPaths = [
    "publicUrl",
    "media.heroImageUrl",
    "media.heroPhoto",
    "heroImageUrl",
    "heroPhoto",
    "primaryPhotoUrl",
    "featuredImageUrl",
  ];
  for (const path of directPaths.slice(1)) {
    const value = firstText(listing, [path]);
    if (/^https?:\/\//i.test(value)) photos.add(value);
  }
  const images = Array.isArray(asRecord(listing.media).images) ? asRecord(listing.media).images as unknown[] : [];
  for (const image of images) {
    const item = asRecord(image);
    const urls = asRecord(item.urls);
    const value = asText(item.url) || asText(urls.xlarge) || asText(urls.large) || asText(urls.full) || asText(urls.original);
    if (/^https?:\/\//i.test(value)) photos.add(value);
  }
  return [...photos].slice(0, 8);
}

function cleanPublicLine(value: unknown) {
  const clean = asText(value).replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (/verified highlight|verified property data|verified market|internal|commission|broker protection|private|sticky note/i.test(clean)) return "";
  return clean;
}

function arrayStrings(value: unknown) {
  return Array.isArray(value) ? value.map(cleanPublicLine).filter(Boolean) : [];
}

function collectDescriptions(listing: ListingRecord) {
  const content = asRecord(listing.content);
  return [
    content.propertyDescription,
    content.leaseDescription,
    content.saleDescription,
    content.locationDescription,
    content.siteDescription,
    content.marketingDescription,
    content.marketingBlurb,
    listing.description,
    listing.summary,
  ].map(cleanPublicLine).filter((item, index, all) => item && all.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index).slice(0, 5);
}

function collectHighlights(listing: ListingRecord) {
  const content = asRecord(listing.content);
  const pricing = asRecord(listing.pricing);
  const property = asRecord(listing.property);
  const facts = [
    pricing.leaseRate || pricing.askingRent ? `Lease rate: ${asText(pricing.leaseRate || pricing.askingRent)}` : "",
    pricing.salePrice || pricing.salePriceDollars ? `Pricing: ${money(pricing.salePrice || pricing.salePriceDollars)}` : "",
    pricing.availableSqFt || property.availableSqFt ? `Available space: ${sf(pricing.availableSqFt || property.availableSqFt)}` : "",
    property.buildingSizeSf || property.totalSf ? `Building size: ${sf(property.buildingSizeSf || property.totalSf)}` : "",
    property.lotSizeAcres || property.acreage ? `Site size: ${asText(property.lotSizeAcres || property.acreage)} AC` : "",
    property.zoning ? `Zoning: ${asText(property.zoning)}` : "",
  ].map(cleanPublicLine).filter(Boolean);
  const brokerHighlights = [
    ...arrayStrings(content.highlights),
    ...arrayStrings(content.saleBullets),
    ...arrayStrings(content.leaseBullets),
    ...arrayStrings(listing.highlights),
  ];
  return [...facts, ...brokerHighlights]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, 9);
}

function publicUrl(listing: ListingRecord) {
  const url = firstText(listing, ["publicUrl", "pierPublicUrl", "websiteUrl", "previewUrl"]);
  if (url) return url;
  const slug = asText(listing.slug || listing.id);
  return slug ? `https://listingportal.piercommercial.com/property/${encodeURIComponent(slug)}` : "https://www.piercommercial.com/";
}

export function buildEmailDraftSourcePacket(input: BuildPacketInput): ClaudeEmailSourcePacket {
  const listing = input.listing || {};
  const pricing = asRecord(listing.pricing);
  const property = asRecord(listing.property);
  const broker = input.broker || asRecord(listing.brokerProfile || listing.broker || {});
  const publicFacts: Record<string, unknown> = {
    title: asText(listing.title) || addressText(listing) || "PIER Commercial Listing",
    address: addressText(listing),
    listingType: asText(listing.transactionLabel || listing.listingType || listing.propertyType || listing.visibility && asRecord(listing.visibility).transactionLabel),
    leaseRate: asText(pricing.leaseRate || pricing.askingRent || pricing.rate),
    salePrice: pricing.salePrice || pricing.salePriceDollars ? money(pricing.salePrice || pricing.salePriceDollars) : "",
    availableSqFt: pricing.availableSqFt || property.availableSqFt ? sf(pricing.availableSqFt || property.availableSqFt) : "",
    buildingSize: property.buildingSizeSf || property.totalSf ? sf(property.buildingSizeSf || property.totalSf) : "",
    acreage: asText(property.lotSizeAcres || property.acreage),
    zoning: asText(property.zoning),
  };
  Object.keys(publicFacts).forEach((key) => {
    if (!asText(publicFacts[key])) delete publicFacts[key];
  });

  return {
    generatedAt: new Date().toISOString(),
    campaign: {
      audience: asText(input.audience) || "commercial real estate prospects, brokers, tenants, investors, and owner-users",
      goal: asText(input.campaignGoal) || "create a polished draft email campaign for broker review",
      campaignType: asText(input.campaignType) || "listing announcement",
      userNotes: asText(input.userNotes),
    },
    listing: {
      publicFacts,
      descriptions: collectDescriptions(listing),
      highlights: collectHighlights(listing),
      photos: collectPhotos(listing),
      publicUrl: publicUrl(listing),
    },
    broker: {
      name: asText(broker.name) || "Ryan T. Schneider, CCIM",
      title: asText(broker.title) || "President",
      email: asText(broker.email) || "ryan@piercommercial.com",
      phone: asText(broker.phone) || "912.239.6298",
    },
    brandRules: {
      publicVoice: "Ryan T. Schneider, CCIM",
      primaryColor: "#CB521E",
      darkColor: "#1A1A1A",
      accentColor: "#E5E7EB",
      logoUrl: PIER_EMAIL_LOGO_URL,
      logoAssetName: "Brokeragetransp.png",
      logoRequired: true,
      noLogoRecreation: true,
      noLogoCssFilters: true,
      noEmoji: true,
      noRawFieldLabels: true,
      draftFirst: true,
    },
    forbiddenContent: [
      "internal notes",
      "commission terms",
      "broker protection periods",
      "buyer target lists",
      "BOV analysis",
      "raw ListingStream field labels",
      "Verified Highlight labels",
      "private strategy notes",
    ],
  };
}

export function buildClaudeEmailDraftPrompt(packet: ClaudeEmailSourcePacket) {
  return `Claude is the email strategist, designer, writer, and HTML builder for PIER Commercial Real Estate.

Write as Ryan T. Schneider, CCIM: specific, local, understated, senior commercial brokerage voice. Create a premium Mailchimp-compatible listing email draft from the clean source packet below.

Hard rules:
- Return JSON only. No markdown fences.
- Do not use raw ListingStream labels, database labels, schema names, or internal-field language.
- Do not include private content: internal notes, commission, BOV, broker protection, buyer targeting, or strategy notes.
- Do not invent property facts. If a fact is not in the packet, omit it.
- Every feature should explain a business reason.
- Email HTML must be Mailchimp-compatible table/inline-style HTML with a dark/white/orange PIER visual hierarchy, mobile-safe width, broker footer, and a clear CTA.
- The PIER logo is mandatory. Use this exact image in the email header and footer: ${packet.brandRules.logoUrl}
- Do not recreate the PIER logo as typed text, orange square-letter blocks, SVG/CSS shapes, or any approximation. Use only an <img> tag pointed at Brokeragetransp.png.
- Never apply CSS filters to the PIER logo image. No invert, brightness, saturate, hue-rotate, grayscale, opacity washout, or filter declarations.
- Text on orange backgrounds must be white.
- Use orange bullets or simple typography; no emoji or icon/checkmark list markers.
- Include subjectLines, previewText, campaignStrategy, emailHtml, plainText, ctaText, designNotes, and complianceChecklist.
- complianceChecklist must include booleans: noPrivateContent, noRawFieldLabels, listingUrlIncluded, brokerContactIncluded.

Source packet:
${JSON.stringify(packet, null, 2)}

Expected JSON shape:
{
  "subjectLines": ["...", "...", "..."],
  "previewText": "...",
  "campaignStrategy": "...",
  "emailHtml": "<!doctype html>...",
  "plainText": "...",
  "ctaText": "View Property Website",
  "designNotes": "...",
  "complianceChecklist": {
    "noPrivateContent": true,
    "noRawFieldLabels": true,
    "listingUrlIncluded": true,
    "brokerContactIncluded": true
  }
}`;
}

function parseJsonText(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Claude email draft returned invalid JSON.");
  }
}

export function normalizeClaudeEmailDraft(value: unknown): ClaudeEmailDraft {
  const record = asRecord(value);
  const subjectLines = arrayStrings(record.subjectLines).slice(0, 5);
  const previewText = asText(record.previewText);
  const campaignStrategy = asText(record.campaignStrategy);
  const emailHtml = asText(record.emailHtml);
  const plainText = asText(record.plainText);
  const ctaText = asText(record.ctaText) || "View Property Website";
  const designNotes = asText(record.designNotes);
  const checklist = asRecord(record.complianceChecklist);
  if (!subjectLines.length) throw new Error("Claude email draft must include at least one subject line.");
  if (!previewText) throw new Error("Claude email draft must include preview text.");
  if (!campaignStrategy) throw new Error("Claude email draft must include a campaign strategy note.");
  if (!/<html|<!doctype|<body|<table|<h1/i.test(emailHtml)) throw new Error("Claude email draft must include complete email HTML.");
  if (!plainText) throw new Error("Claude email draft must include plain-text fallback copy.");
  if (/Verified Highlight|Verified Property Data|ListingStream field|internal note|commission/i.test(`${emailHtml}\n${plainText}\n${previewText}`)) {
    throw new Error("Claude email draft contains forbidden raw/internal language.");
  }
  if (!/Brokeragetransp\.png/i.test(emailHtml)) {
    throw new Error("Claude email draft must use the official Brokeragetransp.png PIER logo image.");
  }
  if (/pier-logo-square|>\s*P\s*<[^>]*>\s*I\s*<[^>]*>\s*E\s*<[^>]*>\s*R\s*<|filter\s*:/i.test(emailHtml)) {
    throw new Error("Claude email draft must not recreate or CSS-filter the PIER logo.");
  }
  return {
    subjectLines,
    previewText,
    campaignStrategy,
    emailHtml,
    plainText,
    ctaText,
    designNotes,
    complianceChecklist: {
      noPrivateContent: checklist.noPrivateContent === true,
      noRawFieldLabels: checklist.noRawFieldLabels === true,
      listingUrlIncluded: checklist.listingUrlIncluded === true,
      brokerContactIncluded: checklist.brokerContactIncluded === true,
    },
  };
}

function extractAnthropicText(payload: Record<string, unknown>) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  return content.map((item) => asText(asRecord(item).text)).filter(Boolean).join("\n").trim();
}

function extractOpenAiText(payload: Record<string, unknown>) {
  const direct = asText(payload.output_text);
  if (direct) return direct;
  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    const content = Array.isArray(asRecord(item).content) ? asRecord(item).content as unknown[] : [];
    for (const part of content) {
      const record = asRecord(part);
      const text = asText(record.text) || asText(record.output_text);
      if (text) chunks.push(text);
    }
  }
  return chunks.join("\n").trim();
}

async function runOpenAiEmailDraft(input: { packet: ClaudeEmailSourcePacket; apiKey: string; model?: string; fetchImpl: typeof fetch }) {
  const model = asText(input.model || process.env.PIER_EMAIL_OPENAI_MODEL || process.env.OPENAI_MODEL) || "gpt-4.1";
  const prompt = buildClaudeEmailDraftPrompt(input.packet);
  const response = await input.fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.55,
      input: prompt,
      text: { format: { type: "json_object" } },
    }),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = asText(asRecord(payload.error).message) || asText(payload.message) || `OpenAI email draft failed with ${response.status}.`;
    throw new Error(error);
  }
  const text = extractOpenAiText(payload);
  if (!text) throw new Error("OpenAI email draft returned no text content.");
  return normalizeClaudeEmailDraft(parseJsonText(text));
}

async function runAnthropicEmailDraft(input: { packet: ClaudeEmailSourcePacket; apiKey: string; model?: string; fetchImpl: typeof fetch }) {
  const model = asText(input.model || process.env.PIER_EMAIL_CLAUDE_MODEL || process.env.ANTHROPIC_MODEL) || "claude-sonnet-5";
  const prompt = buildClaudeEmailDraftPrompt(input.packet);
  const response = await input.fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 6000,
      temperature: 0.55,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = asText(asRecord(payload.error).message) || asText(payload.message) || `Claude email draft failed with ${response.status}.`;
    throw new Error(error);
  }
  const text = extractAnthropicText(payload);
  if (!text) throw new Error("Claude email draft returned no text content.");
  return normalizeClaudeEmailDraft(parseJsonText(text));
}

export async function runClaudeEmailDraft(input: {
  packet: ClaudeEmailSourcePacket;
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl || fetch;
  const anthropicKey = asText(input.apiKey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY);
  const openAiKey = asText(process.env.PIER_EMAIL_OPENAI_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_PRODUCTION || process.env.OPENAI_KEY);
  if (anthropicKey) {
    try {
      return await runAnthropicEmailDraft({ packet: input.packet, apiKey: anthropicKey, model: input.model, fetchImpl });
    } catch (error) {
      if (!openAiKey) throw error;
    }
  }
  if (openAiKey) return runOpenAiEmailDraft({ packet: input.packet, apiKey: openAiKey, model: undefined, fetchImpl });
  throw new Error("ANTHROPIC_API_KEY or OPENAI_API_KEY is required for AI email draft generation.");
}
