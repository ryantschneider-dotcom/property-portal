type UnknownRecord = Record<string, unknown>;

type SuiteRecord = {
  [key: string]: unknown;
  suiteNumber: string;
  availableSqFt: string;
  baseRent: string;
  rentType: string;
  spaceType?: string;
  suiteNotes?: string;
  unpriced?: boolean;
  suitePhotos?: unknown[];
  suiteFloorPlans?: unknown[];
};

type ListingArrayName = "documents" | "attachments" | "links";

export type BrokerEditInterpreterResult = {
  summary: string[];
  flags: string[];
  confidence: "high" | "medium" | "low";
  updatePayload: Record<string, unknown>;
  lifecycleAction?: "archive" | "delete";
};

type BrokerEditInterpreterFetch = typeof fetch;

export type BrokerEditInterpreterOptions = {
  fetchImpl?: BrokerEditInterpreterFetch;
  provider?: "anthropic" | "openai" | "gemini";
  model?: string;
  timeoutMs?: number;
};

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeTextForMatching(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTokens(value: string) {
  const stopWords = new Set(["the", "a", "an", "and", "or", "to", "from", "of", "for", "with", "public", "listing", "file", "files", "document", "documents", "attachment", "attachments", "link", "links", "url", "urls", "report", "pdf"]);
  return normalizeTextForMatching(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

function objectSearchText(value: unknown) {
  const record = asRecord(value);
  return [
    record.id,
    record.title,
    record.name,
    record.label,
    record.description,
    record.documentType,
    record.source,
    record.fileName,
    record.filename,
    record.url,
    record.href,
    record.downloadUrl,
  ].map(asString).filter(Boolean).join(" | ");
}

function humanizeKey(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
}

function linkFieldSearchText(key: string, value: unknown) {
  return `${humanizeKey(key)} | ${asString(value)}`;
}

function parseNumericToken(value: string | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const normalized = text.replace(/[$,]/g, "").replace(/\.$/, "").toLowerCase();
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)([mk])?$/i);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;
  const suffix = match[2]?.toLowerCase();
  if (suffix === "m") return base * 1_000_000;
  if (suffix === "k") return base * 1_000;
  return base;
}

function parseIntegerToken(value: string | undefined) {
  const parsed = parseNumericToken(value);
  return parsed == null ? null : Math.round(parsed);
}

function normalizeSuiteRows(value: unknown): SuiteRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      const suite = asRecord(row);
      const normalized: SuiteRecord = {
        ...suite,
        suiteNumber: asString(suite.suiteNumber),
        availableSqFt: asString(suite.availableSqFt),
        baseRent: asString(suite.baseRent),
        rentType: asString(suite.rentType),
        unpriced: suite.unpriced === true,
      };
      if (asString(suite.spaceType)) normalized.spaceType = asString(suite.spaceType);
      if (asString(suite.suiteNotes) || asString(suite.notes) || asString(suite.description)) normalized.suiteNotes = asString(suite.suiteNotes) || asString(suite.notes) || asString(suite.description);
      if (Array.isArray(suite.suitePhotos)) normalized.suitePhotos = suite.suitePhotos;
      if (Array.isArray(suite.suiteFloorPlans)) normalized.suiteFloorPlans = suite.suiteFloorPlans;
      return normalized;
    })
    .filter((suite) => suite.suiteNumber || suite.availableSqFt || suite.baseRent || suite.rentType || suite.suiteNotes);
}

function totalSuiteSqFt(suites: SuiteRecord[]) {
  const values = suites
    .map((suite) => parseNumericToken(suite.availableSqFt))
    .filter((value): value is number => value != null && Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function extractQuotedOrPlain(instructions: string, pattern: RegExp) {
  const match = instructions.match(pattern);
  return match?.[1]?.trim() || null;
}

function extractTitle(instructions: string) {
  const quoted = extractQuotedOrPlain(instructions, /(?:listing\s+title|title)\s*(?:to|as|=|:)?\s*["“]([^"”\n]{4,140})["”]/i);
  if (quoted) return quoted;
  return extractQuotedOrPlain(instructions, /(?:listing\s+title|title)\s*(?:to|as|=|:)\s*([^\n.]{4,140})/i);
}

function extractCurrency(instructions: string) {
  const match = instructions.match(/(?:sale\s+price|asking\s+price|price\s+reduction|price)\s*(?:to|at|=|of)?\s*\$?\s*([\d,.]+(?:\.\d+)?\s*[mk]?)/i);
  return parseNumericToken(match?.[1]);
}

function extractLeaseRate(instructions: string) {
  const match = instructions.match(/(?:asking\s+rate|lease\s+rate|rent\s+rate|base\s+rent|rent)\s*(?:to|at|=|of|is|:)?\s*\$?\s*([\d,.]+(?:\.\d+)?)\s*(?:(?:\/|per\s*)(?:sf|sq\.?\s*ft\.?)|(?:\/|per\s*)?mo(?:nth)?|per\s+month)?/i);
  return parseNumericToken(match?.[1]);
}

function extractZoning(instructions: string) {
  const match = instructions.match(/zoning\s*(?:to|as|=|is)?\s*([A-Za-z0-9\-/ ]{2,40})/i);
  return match?.[1]?.trim().replace(/[.。]$/, "") || null;
}

function extractAvailableSqFt(instructions: string) {
  const match = instructions.match(/(?:available\s*(?:square\s*footage|sq\.?\s*ft\.?|sf)|available\s+space)\s*(?:to|at|=|is)?\s*([\d,.]+(?:\.\d+)?\s*[mk]?)/i);
  return parseIntegerToken(match?.[1]);
}

function extractBuildingSize(instructions: string) {
  const match = instructions.match(/(?:building\s+size|building\s+sf|building\s+square\s+feet)\s*(?:to|at|=|is)?\s*([\d,.]+(?:\.\d+)?\s*[mk]?)/i);
  return parseIntegerToken(match?.[1]);
}

function extractLotAcres(instructions: string) {
  const match = instructions.match(/(?:lot\s+size|acres?|gross\s+acres?)\s*(?:to|at|=|is)?\s*([\d,.]+(?:\.\d+)?)/i);
  const value = parseNumericToken(match?.[1]);
  return value == null ? null : Number(value.toFixed(4));
}

function extractYearBuilt(instructions: string) {
  const match = instructions.match(/year\s+built\s*(?:to|at|=|is)?\s*(19\d{2}|20\d{2})/i);
  return parseIntegerToken(match?.[1]);
}

function extractLeasedSuite(instructions: string) {
  const match = instructions.match(/suite\s+([A-Za-z0-9-]+)\s+(?:is\s+)?leased/i);
  return match?.[1]?.trim() || null;
}

function extractSuiteNumber(instructions: string) {
  const addMatch = instructions.match(/(?:add|create|include|insert|new)\s+(?:suite|space)\s+([A-Za-z0-9-]+)/i);
  if (addMatch?.[1]) return addMatch[1].trim();
  const match = instructions.match(/(?:suite|space)\s+([A-Za-z0-9-]+)/i);
  return match?.[1]?.trim() || null;
}

function shouldAddSuite(instructions: string) {
  return /\b(?:add|create|include|insert|new)\s+(?:suite|space)\s+[A-Za-z0-9-]+/i.test(instructions);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSuiteSize(instructions: string, suiteNumber: string) {
  const escapedSuite = escapeRegExp(suiteNumber);
  const afterSuite = instructions.match(new RegExp(`suite\\s+${escapedSuite}[\\s\\S]{0,120}?([\\d,.]+(?:\\.\\d+)?\\s*[mk]?)\\s*(?:sf|sq\\.?\\s*ft\\.?|square\\s*feet)`, "i"));
  const suiteSize = parseIntegerToken(afterSuite?.[1]);
  if (suiteSize != null) return suiteSize;
  const labeled = instructions.match(/(?:available\s*(?:sq\.?\s*ft\.?|square\s*footage|sf)|available\s+space)\s*(?:to|at|=|is|:)?\s*([\d,.]+(?:\.\d+)?\s*[mk]?)/i);
  return parseIntegerToken(labeled?.[1]);
}

function extractSuiteRate(instructions: string, suiteNumber: string) {
  const escapedSuite = escapeRegExp(suiteNumber);
  const afterSuite = instructions.match(new RegExp(`suite\\s+${escapedSuite}[\\s\\S]{0,160}?\\$\\s*([\\d,.]+(?:\\.\\d+)?)\\s*(?:/|per\\s*)?(?:sf|sq\\.?\\s*ft\\.?)?`, "i"));
  const suiteRate = parseNumericToken(afterSuite?.[1]);
  if (suiteRate != null) return suiteRate;
  const labeled = instructions.match(/(?:rent\s+rate|lease\s+rate|asking\s+rate|base\s+rent|rent)\s*(?:to|at|=|of|is|:)?\s*\$?\s*([\d,.]+(?:\.\d+)?)/i);
  return parseNumericToken(labeled?.[1]);
}

function extractRentType(instructions: string) {
  const match = instructions.match(/\b(rent\s*\+\s*utilities|rent\s+plus\s+utilities|plus\s+utilities|NNN|NN|modified\s+gross|full\s+service|gross)\b/i);
  if (!match) return null;
  const value = match[1].replace(/\s+/g, " ").trim();
  const lower = value.toLowerCase();
  if (lower === "nnn" || lower === "nn") return value.toUpperCase();
  if (/^plus\s+utilities$/i.test(value)) return "Plus Utilities";
  if (/^(rent\s*\+\s*utilities|rent\s+plus\s+utilities)$/i.test(value)) return "Rent + Utilities";
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function extractSuiteSpaceType(instructions: string, suiteNumber?: string) {
  const typePattern = "medical\\s+office|office\\s*/\\s*retail|office-retail|office|retail|industrial|warehouse|storage|flex|showroom|restaurant";
  const explicit = instructions.match(new RegExp(`(?:space\\s+type|suite\\s+type|use\\s+type|architectural\\s+type)\\s*(?:to|as|=|is|:)?\\s*(${typePattern})`, "i"));
  const candidate = explicit?.[1] || (suiteNumber ? instructions.match(new RegExp(`suite\\s+${escapeRegExp(suiteNumber)}[\\s\\S]{0,180}?\\b(${typePattern})\\b`, "i"))?.[1] : instructions.match(new RegExp(`\\b(${typePattern})\\b\\s+(?:suite|space|unit)`, "i"))?.[1]);
  if (!candidate) return null;
  return candidate
    .replace(/\s*\/\s*/g, "/")
    .replace(/-/g, "/")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isExplicitVerbatimInstruction(instructions: string) {
  return /\b(?:put|write|use|copy|transcribe)\s+(?:this|the following|it)?\s*(?:in\s+)?exactly\b/i.test(instructions);
}

function polishPublicNarrativeCopy(value: string) {
  let text = asString(value).trim();
  if (!text) return text;

  text = text
    .replace(/\bthe space is\s+100%\s+storage\s+with\s+overhead\s+drive[- ]in\s+roll\s*up\s+door\s+and\s+pedestrian\s+door\b/i, "The space is 100% storage and features an overhead drive-in rollup door alongside a single pedestrian access door")
    .replace(/\bwith\s+overhead\s+drive[- ]in\s+roll\s*up\s+door\s+and\s+pedestrian\s+door\b/i, "and features an overhead drive-in rollup door alongside a single pedestrian access door")
    .replace(/\boverhead\s+drive[- ]in\s+roll\s*up\s+door\b/i, "overhead drive-in rollup door")
    .replace(/\bpedestrian\s+door\b/i, "single pedestrian access door")
    .replace(/\s+/g, " ")
    .trim();

  text = text.charAt(0).toUpperCase() + text.slice(1);
  if (!/[.!?]$/.test(text)) text += ".";
  return text;
}

function cleanNarrativeCopy(value: string | undefined, options: { verbatim?: boolean } = {}) {
  let text = asString(value)
    .replace(/^[\s"“”'`]+|[\s"“”'`]+$/g, "")
    .replace(/\s+(?:and|,)\s+(?:add|update|change|set|replace|remove|delete|drop|mark)\s+(?:the\s+)?(?:rent|rate|price|suite|space|photo|image|media|document|attachment|link|zoning|status|description|title|square\s*footage|sf)\b[\s\S]*$/i, "")
    .replace(/^(?:please\s+)?(?:add|update|change|set|replace|write|put|include)\s+(?:a\s+|the\s+)?(?:new\s+)?/i, "")
    .replace(/^(?:a\s+|the\s+)?(?:property\s+description|lease\s+description|sale\s+description|location\s+description|neighborhood\s+description|area\s+description|suite\s+notes?|notes?|description|comments?)\s*(?:to|as|=|is|:)?\s*/i, "")
    .replace(/^(?:under|for|to|on)\s+(?:(?:suite|space)\s+)?[A-Za-z0-9-]+\s+(?:that\s+)?(?:says?|reads?|should\s+say|should\s+read)\s*:?[\s"“”]*/i, "")
    .replace(/^(?:that\s+)?(?:says?|reads?|should\s+say|should\s+read|says?|reads?)\s*:?[\s"“”]*/i, "")
    .replace(/[.。]$/, "")
    .trim();

  text = text.replace(/^["“”'`]+|["“”'`]+$/g, "").trim();
  return options.verbatim ? text : polishPublicNarrativeCopy(text);
}

function cleanExtractedNote(value: string | undefined, options: { verbatim?: boolean } = {}) {
  return cleanNarrativeCopy(value, options)
    .replace(/^(?:suite\s+[A-Za-z0-9-]+\s*)?(?:suite\s*)?(?:notes?|description|comments?)\s*(?:to|as|=|is|:)?\s*/i, "")
    .trim();
}

function extractSuiteNotes(instructions: string, suiteNumber: string) {
  const escapedSuite = escapeRegExp(suiteNumber);
  const verbatim = isExplicitVerbatimInstruction(instructions);
  const exact = instructions.match(new RegExp(`(?:for\\s+)?(?:suite|space)\\s+${escapedSuite}[\\s,;:-]{0,20}(?:put|write|use|copy|transcribe)\\s+(?:this|the following|it)?\\s*(?:in\\s+)?exactly\\s*:?\\s*["“]?([^"”\\n]{3,360})`, "i"));
  if (exact?.[1]) return cleanExtractedNote(exact[1], { verbatim: true }) || null;

  const scoped = instructions.match(new RegExp(`(?:suite|space)\\s+${escapedSuite}[\\s\\S]{0,120}?(?:(?:suite|space)\\s*)?(?:notes?|description|comments?)\\s*(?:to|as|=|is|:)?\\s*["“]?([^"”\\n.]{8,360})`, "i"));
  const saysScoped = instructions.match(new RegExp(`(?:suite|space)\\s+${escapedSuite}[\\s\\S]{0,140}?(?:that\\s+)?(?:says?|reads?|should\\s+say|should\\s+read)\\s*:?\\s*["“]?([^"”\\n.]{8,360})`, "i"));
  const labeled = instructions.match(/(?:suite\s*)?(?:notes?|description|comments?)\s*(?:to|as|=|is|:)?\s*["“]?([^"”\n.]{8,360})/i);
  const note = cleanExtractedNote(scoped?.[1] || saysScoped?.[1] || labeled?.[1], { verbatim });
  return note || null;
}


function getSuiteMediaIntent(instructions: string): "floorPlan" | "photo" | "attachment" | null {
  const mentionsFile = /\b(?:upload(?:ed)?|attach(?:ed|ment)?|files?|pdf|images?|photos?|pictures?|plans?|documents?|details?)\b/i.test(instructions);
  if (!mentionsFile) return null;
  if (/\b(?:floor\s*plans?|site\s*plans?|plan\s*(?:pdf|file|image|photo)?|pdf\s*floor\s*plan)\b/i.test(instructions)) return "floorPlan";
  if (/\b(?:suite\s*)?(?:photos?|images?|pictures?)\b/i.test(instructions)) return "photo";
  if (/\b(?:attach(?:ed|ment)?|upload(?:ed)?|files?|documents?|details?)\b/i.test(instructions)) return "attachment";
  return null;
}

function shouldMarkUnpriced(instructions: string) {
  return /(?:mark\s+)?(?:sale\s+price\s+)?(?:as\s+)?(?:unpriced|call\s+for\s+price|inquire)/i.test(instructions);
}

function getRequestedLifecycleAction(instructions: string): "archive" | "delete" | null {
  const text = instructions.toLowerCase();
  if (/\b(?:archive|delist|deactivate)\s+(?:it|this|this\s+listing|this\s+property|the\s+listing|the\s+property|listing|property)(?:\s+from\s+(?:the\s+)?(?:live\s+)?(?:site|website|public\s+listings|market))?\b/.test(text)) return "archive";
  if (/\barchive\s+it\b/.test(text)) return "archive";
  if (/\btake\s+(?:it|this|the\s+listing|the\s+property|listing|property)\s*down\b/.test(text)) return "archive";
  if (/\bremove\s+(?:it|this|the\s+listing|the\s+property|listing|property)\s*(?:from\s+(?:the\s+)?(?:live\s+)?(?:site|website|public\s+listings|market))?\b/.test(text)) return "archive";
  if (/\bpull\s+(?:it|this|this\s+listing|this\s+property|the\s+listing|the\s+property|listing|property)\s+from\s+(?:the\s+)?(?:live\s+)?(?:site|website|public\s+listings|market)\b/.test(text)) return "archive";
  if (/\b(?:delete|permanently\s+delete)\s+(?:it|this|the\s+)?(?:listing|property)\b/.test(text)) return "delete";
  return null;
}

function instructionRequestsArrayRemoval(instructions: string, arrayName?: ListingArrayName) {
  const text = normalizeTextForMatching(instructions);
  if (!/\b(remove|delete|drop|clear|hide|unpublish|take off|take down)\b/i.test(instructions)) return false;
  if (!arrayName) return /\b(documents?|attachments?|links?|urls?|files?)\b/.test(text);
  const singular = arrayName === "documents" ? "document" : arrayName === "attachments" ? "attachment" : "link";
  return new RegExp(`\\b${singular}s?\\b|\\b${arrayName}\\b|\\bfiles?\\b|\\burls?\\b`).test(text);
}

function instructionRequestsAllArrayRemoval(instructions: string, arrayName: ListingArrayName) {
  const singular = arrayName === "documents" ? "document" : arrayName === "attachments" ? "attachment" : "link";
  return new RegExp(`\\b(?:remove|delete|drop|clear)\\s+(?:all|every)\\s+(?:public\\s+)?(?:${singular}s?|${arrayName}|files?|urls?)\\b`, "i").test(instructions);
}

function arrayItemMatchesRemovalInstruction(item: unknown, instructions: string) {
  const itemText = objectSearchText(item);
  return textMatchesRemovalInstruction(itemText, instructions);
}

function textMatchesRemovalInstruction(itemText: string, instructions: string) {
  const normalizedInstruction = normalizeTextForMatching(instructions);
  const normalizedItem = normalizeTextForMatching(itemText);
  if (!normalizedItem) return false;

  const phraseFields = itemText
    .split(/\s{2,}|\|/g)
    .map(normalizeTextForMatching)
    .filter((value) => value.length >= 3);
  if (phraseFields.some((field) => normalizedInstruction.includes(field))) return true;

  const tokens = meaningfulTokens(itemText);
  if (!tokens.length) return false;
  const hitCount = tokens.filter((token) => normalizedInstruction.includes(token)).length;
  return tokens.length === 1 ? hitCount === 1 && tokens[0].length >= 5 : hitCount >= Math.min(2, tokens.length);
}

function removeMatchingLinkObjectFields(currentLinks: Record<string, unknown>, instructions: string) {
  const nextLinks: Record<string, unknown> = { ...currentLinks };
  const removedKeys: string[] = [];
  for (const [key, value] of Object.entries(currentLinks)) {
    if (!asString(value)) continue;
    if (textMatchesRemovalInstruction(linkFieldSearchText(key, value), instructions)) {
      nextLinks[key] = null;
      removedKeys.push(key);
    }
  }
  return { nextLinks, removedKeys };
}

function applyListingArrayRemovals(rawProperty: Record<string, unknown>, instructions: string) {
  const updatePayload: Partial<Record<ListingArrayName, unknown[] | Record<string, unknown>>> = {};
  const messages: string[] = [];
  const flags: string[] = [];

  for (const arrayName of ["documents", "attachments", "links"] as ListingArrayName[]) {
    const current = Array.isArray(rawProperty[arrayName]) ? rawProperty[arrayName] as unknown[] : [];
    if (!current.length || !instructionRequestsArrayRemoval(instructions, arrayName)) continue;

    let next: unknown[];
    if (instructionRequestsAllArrayRemoval(instructions, arrayName)) {
      next = [];
    } else {
      next = current.filter((item) => !arrayItemMatchesRemovalInstruction(item, instructions));
    }

    if (next.length < current.length) {
      updatePayload[arrayName] = next;
      messages.push(`Removed ${current.length - next.length} ${arrayName.slice(0, -1)}${current.length - next.length === 1 ? "" : "s"} from the listing ${arrayName} array.`);
    } else {
      flags.push(`Removal requested for ${arrayName}, but no matching object could be safely identified; no success flag should be returned for that array.`);
    }
  }

  const currentLinks = asRecord(rawProperty.links);
  if (Object.keys(currentLinks).length && instructionRequestsArrayRemoval(instructions, "links")) {
    const { nextLinks, removedKeys } = removeMatchingLinkObjectFields(currentLinks, instructions);
    if (removedKeys.length) {
      updatePayload.links = nextLinks;
      messages.push(`Removed ${removedKeys.join(", ")} from the listing links object.`);
    } else if (!Array.isArray(rawProperty.links)) {
      flags.push("Removal requested for links, but no matching link object field could be safely identified; no success flag should be returned for links.");
    }
  }

  return { updatePayload, messages, flags };
}

function getRequestedListingStatus(instructions: string): "leased" | "sold" | "under_contract" | null {
  if (/\b(?:mark|change|set|move|update)?\s*(?:this\s+)?(?:property|listing)?\s*(?:as|to|status\s*(?:as|to|=|is)?)?\s*(?:leased|fully\s+leased|lease\s+executed)\b/i.test(instructions)) return "leased";
  if (/\b(?:mark|change|set|move|update)?\s*(?:this\s+)?(?:property|listing)?\s*(?:as|to|status\s*(?:as|to|=|is)?)?\s*(?:sold|closed|sale\s+closed)\b/i.test(instructions)) return "sold";
  if (/\b(?:mark|change|set|move|update)?\s*(?:this\s+)?(?:property|listing)?\s*(?:as|to|status\s*(?:as|to|=|is)?)?\s*(?:under\s+contract|pending\s+contract|contract\s+pending)\b/i.test(instructions)) return "under_contract";
  return null;
}

function buildListingStatusPayload(status: "leased" | "sold" | "under_contract") {
  const label = status === "under_contract" ? "Under Contract" : status === "leased" ? "Leased" : "Sold";
  return {
    status,
    listingStatus: status,
    availabilityStatus: status,
    transactionStatus: status,
    dealStatus: status,
    statusBadgeLabel: label,
    statusLabel: label,
    leased: status === "leased",
    sold: status === "sold",
    underContract: status === "under_contract",
    visibility: {
      status,
      listingStatus: status,
      availabilityStatus: status,
      transactionStatus: status,
      dealStatus: status,
      statusBadgeLabel: label,
      statusLabel: label,
      leased: status === "leased",
      sold: status === "sold",
      underContract: status === "under_contract",
    },
  };
}

function splitBulletLines(value: string) {
  return value
    .split(/\r?\n|;/)
    .map((line) => line.replace(/^[-•\s]+/, "").trim())
    .filter(Boolean);
}

const BROKER_TEXT_FIELD_LABELS = [
  "property description",
  "sale description",
  "lease description",
  "location description",
  "neighborhood description",
  "area description",
  "bullet points",
  "bullets",
  "highlights",
];

function extractLabeledFieldBlock(instructions: string, alias: string) {
  const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundaryLabels = BROKER_TEXT_FIELD_LABELS
    .filter((label) => label.toLowerCase() !== alias.toLowerCase())
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const labeledBlock = instructions.match(new RegExp(
    `(?:^|\\n)\\s*${escapedAlias}\\s*(?:[:=]|(?:as\\s+)?(?:follows?|below))?\\s*\\n+([\\s\\S]*?)(?=\\n\\s*(?:${boundaryLabels})\\s*(?:[:=]|(?:as\\s+)?(?:follows?|below))?\\s*(?:\\n|$)|$)`,
    "i",
  ));
  return labeledBlock?.[1] ? cleanNarrativeCopy(labeledBlock[1]) : null;
}

function extractFieldText(instructions: string, aliases: string[]) {
  const verbatim = isExplicitVerbatimInstruction(instructions);
  for (const alias of aliases) {
    const exact = extractQuotedOrPlain(instructions, new RegExp(`(?:put|write|use|copy|transcribe)\\s+(?:this|the following|it)?\\s*(?:${alias})\\s+(?:in\\s+)?exactly\\s*:?\\s*["“]?([^"”\\n]{8,800})`, "i"));
    if (exact) return cleanNarrativeCopy(exact, { verbatim: true });
    const block = extractLabeledFieldBlock(instructions, alias);
    if (block) return block;
    const quoted = extractQuotedOrPlain(instructions, new RegExp(`${alias}\\s*(?:to|as|=|:)\\s*(?:say(?:s)?|read(?:s)?|that\\s+says?|that\\s+reads?)?\\s*["“]([^"”]+)["”]`, "i"));
    if (quoted) return cleanNarrativeCopy(quoted, { verbatim });
    const plain = extractQuotedOrPlain(instructions, new RegExp(`${alias}\\s*(?:to|as|=|:)\\s*(?:say(?:s)?|read(?:s)?|that\\s+says?|that\\s+reads?)?\\s*([^\\n]{8,400})`, "i"));
    if (plain) return cleanNarrativeCopy(plain, { verbatim });
  }
  return null;
}

function extractBulletPoints(instructions: string) {
  const block = extractFieldText(instructions, ["bullet points", "bullets", "highlights"]);
  return block ? splitBulletLines(block) : [];
}

function extractDescription(instructions: string) {
  return extractFieldText(instructions, ["property description", "sale description", "lease description", "description"]);
}

function extractLocationDescription(instructions: string) {
  return extractFieldText(instructions, ["location description", "neighborhood description", "area description"]);
}

function suiteMatches(suite: SuiteRecord, suiteNumber: string) {
  return suite.suiteNumber.toLowerCase() === suiteNumber.toLowerCase();
}

function hasMeaningfulSuiteData(suite: SuiteRecord) {
  return Boolean(
    asString(suite.availableSqFt)
      || asString(suite.baseRent)
      || asString(suite.rentType)
      || asString(suite.spaceType)
      || asString(suite.suiteNotes)
      || (Array.isArray(suite.suitePhotos) && suite.suitePhotos.length)
      || (Array.isArray(suite.suiteFloorPlans) && suite.suiteFloorPlans.length),
  );
}

function extractSuiteRenameIntent(instructions: string) {
  const match = instructions.match(/\b(?:change|rename|update|correct|capitalize)\s+(?:the\s+)?(?:suite|space|unit)\s+([A-Za-z0-9-]+)\s+(?:to|as|into)\s+([A-Za-z0-9-]+)\b/i);
  if (!match?.[1] || !match?.[2]) return null;
  return { from: match[1].trim(), to: match[2].trim() };
}

function instructionTargetsEmptySuite(instructions: string) {
  return /\b(?:remove|delete|drop|clear)\b/i.test(instructions)
    && /\b(?:no\s+data|empty|blank|mistake|accidental|put\s+in\s+by\s+mistake|one\s+with\s+no\s+data)\b/i.test(instructions)
    && /\b(?:suite|space|unit|row|one)\b/i.test(instructions);
}

function instructionRemovesNamedSuite(instructions: string) {
  const match = instructions.match(/\b(?:remove|delete|drop|clear)\s+(?:the\s+)?(?:suite|space|unit)\s+(?:named\s+|called\s+)?([A-Za-z0-9-]+)\b/i)
    || instructions.match(/\b(?:remove|delete|drop|clear)\s+(?:the\s+)?(?:one|row)\s+(?:named\s+|called\s+)([A-Za-z0-9-]+)\b/i);
  return match?.[1]?.trim() || null;
}

function applySemanticSuiteMapping(suites: SuiteRecord[], instructions: string) {
  const messages: string[] = [];
  const flags: string[] = [];
  let changed = false;
  let nextSuites = suites.map((suite) => ({ ...suite }));

  const rename = extractSuiteRenameIntent(instructions);
  if (rename) {
    const index = nextSuites.findIndex((suite) => suiteMatches(suite, rename.from));
    if (index >= 0) {
      const previous = nextSuites[index].suiteNumber;
      nextSuites[index] = { ...nextSuites[index], suiteNumber: rename.to };
      changed = true;
      messages.push(`Renamed Suite ${previous} to ${rename.to} using semantic instruction mapping.`);
    } else {
      flags.push(`Semantic instruction asked to rename Suite ${rename.from}, but no matching suite row was found.`);
    }
  }

  const namedRemoval = instructionRemovesNamedSuite(instructions);
  const removeEmpty = instructionTargetsEmptySuite(instructions);
  if (namedRemoval || removeEmpty) {
    const removeIndexes = new Set<number>();
    if (namedRemoval) {
      nextSuites.forEach((suite, index) => {
        if (suiteMatches(suite, namedRemoval)) removeIndexes.add(index);
      });
    }
    if (removeEmpty) {
      nextSuites.forEach((suite, index) => {
        if (!hasMeaningfulSuiteData(suite)) removeIndexes.add(index);
      });
    }
    if (removeIndexes.size) {
      const removedNames = nextSuites.filter((_, index) => removeIndexes.has(index)).map((suite) => suite.suiteNumber || "unnamed");
      nextSuites = nextSuites.filter((_, index) => !removeIndexes.has(index));
      changed = true;
      messages.push(`Semantically removed Suite ${removedNames.join(", ")} from the active suite stack.`);
    } else if (namedRemoval || removeEmpty) {
      flags.push("Semantic removal instruction was understood, but no matching named or no-data suite row was found.");
    }
  }

  return { suites: nextSuites, changed, messages, flags };
}

function updateSuiteRecord(suites: SuiteRecord[], suiteNumber: string, instructions: string) {
  const suiteIndex = suites.findIndex((suite) => suiteMatches(suite, suiteNumber));
  if (suiteIndex === -1) {
    const size = extractSuiteSize(instructions, suiteNumber);
    const rate = extractSuiteRate(instructions, suiteNumber);
    const rentType = extractRentType(instructions) || "";
    const spaceType = extractSuiteSpaceType(instructions, suiteNumber);
    const suiteNotes = extractSuiteNotes(instructions, suiteNumber);
    const hasExplicitSuiteFacts = size != null || rate != null || Boolean(extractRentType(instructions)) || Boolean(spaceType) || Boolean(suiteNotes);
    if (shouldAddSuite(instructions) || hasExplicitSuiteFacts) {
      const suite: SuiteRecord = {
        suiteNumber,
        availableSqFt: size == null ? "" : String(size),
        baseRent: rate == null ? "" : String(rate),
        rentType,
        unpriced: rate == null && shouldMarkUnpriced(instructions),
        suitePhotos: [],
        suiteFloorPlans: [],
      };
      if (spaceType) suite.spaceType = spaceType;
      if (suiteNotes) suite.suiteNotes = suiteNotes;
      const actionVerb = shouldAddSuite(instructions) ? "Added" : "Updated";
      return { suites: [...suites.filter((suite) => !suiteMatches(suite, suiteNumber)), suite], changed: true, messages: [`${actionVerb} Suite ${suiteNumber} to the active suite stack.`] };
    }
    return { suites, changed: false, messages: [`Instruction referenced Suite ${suiteNumber}, but no exact suite match was found.`] };
  }

  const nextSuites = [...suites];
  const current = { ...nextSuites[suiteIndex] };
  const messages: string[] = [];
  let changed = false;

  const size = extractSuiteSize(instructions, suiteNumber);
  if (size != null) {
    current.availableSqFt = String(size);
    changed = true;
    messages.push(`Updated Suite ${suiteNumber} size to ${size.toLocaleString()} SF.`);
  }

  const rate = extractSuiteRate(instructions, suiteNumber);
  if (rate != null) {
    current.baseRent = String(rate);
    current.unpriced = false;
    changed = true;
    messages.push(`Updated Suite ${suiteNumber} base rent to ${rate}.`);
  }

  const rentType = extractRentType(instructions);
  if (rentType) {
    current.rentType = rentType;
    changed = true;
    messages.push(`Updated Suite ${suiteNumber} rent type to ${rentType}.`);
  }

  const spaceType = extractSuiteSpaceType(instructions, suiteNumber);
  if (spaceType) {
    current.spaceType = spaceType;
    changed = true;
    messages.push(`Updated Suite ${suiteNumber} space type to ${spaceType}.`);
  }

  const suiteNotes = extractSuiteNotes(instructions, suiteNumber);
  if (suiteNotes) {
    current.suiteNotes = suiteNotes;
    changed = true;
    messages.push(`Updated Suite ${suiteNumber} notes.`);
  }

  if (/suite\s+[A-Za-z0-9-]+.*?(?:unpriced|call\s+for\s+price|inquire)/i.test(instructions)) {
    current.baseRent = "";
    current.unpriced = true;
    changed = true;
    messages.push(`Marked Suite ${suiteNumber} as unpriced.`);
  }

  const mediaIntent = getSuiteMediaIntent(instructions);
  if (mediaIntent === "floorPlan") {
    current.suiteFloorPlans = Array.isArray(current.suiteFloorPlans) ? current.suiteFloorPlans : [];
    changed = true;
    messages.push(`Prepared Suite ${suiteNumber} floor plan upload mapping.`);
  } else if (mediaIntent === "photo") {
    current.suitePhotos = Array.isArray(current.suitePhotos) ? current.suitePhotos : [];
    changed = true;
    messages.push(`Prepared Suite ${suiteNumber} photo upload mapping.`);
  } else if (mediaIntent === "attachment") {
    current.suitePhotos = Array.isArray(current.suitePhotos) ? current.suitePhotos : [];
    current.suiteFloorPlans = Array.isArray(current.suiteFloorPlans) ? current.suiteFloorPlans : [];
    changed = true;
    messages.push(`Prepared Suite ${suiteNumber} attachment upload mapping.`);
  }

  if (!changed) {
    return { suites, changed: false, messages: [`Suite ${suiteNumber} was detected, but no safe structured mutation was parsed yet.`] };
  }

  nextSuites[suiteIndex] = current;
  return { suites: nextSuites, changed: true, messages };
}

function interpretBrokerEditRequestDeterministic(rawProperty: Record<string, unknown>, instructions: string): BrokerEditInterpreterResult {
  const pricing = asRecord(rawProperty.pricing);
  const content = asRecord(rawProperty.content);
  const admin = asRecord(rawProperty.admin);
  const visibility = asRecord(rawProperty.visibility);
  const summary: string[] = [];
  const flags: string[] = [];
  const updatePayload: Record<string, unknown> = {};
  let lifecycleAction: BrokerEditInterpreterResult["lifecycleAction"];
  const nextPricing: Record<string, unknown> = {};
  const nextProperty: Record<string, unknown> = {};
  const nextContent: Record<string, unknown> = {};
  const nextAdmin: Record<string, unknown> = {};
  const transactionLabel = asString(visibility.transactionLabel).toLowerCase();
  const isLease = transactionLabel.includes("lease");

  const requestedLifecycleAction = getRequestedLifecycleAction(instructions);
  if (requestedLifecycleAction) {
    lifecycleAction = requestedLifecycleAction;
    updatePayload.lifecycle = { action: requestedLifecycleAction, requestedByPlainEnglish: true };
    summary.push(`${requestedLifecycleAction === "archive" ? "Archive" : "Delete"} listing requested from broker instructions.`);
  }

  const arrayRemovals = applyListingArrayRemovals(rawProperty, instructions);
  Object.assign(updatePayload, arrayRemovals.updatePayload);
  summary.push(...arrayRemovals.messages);
  flags.push(...arrayRemovals.flags);

  const requestedListingStatus = getRequestedListingStatus(instructions);
  if (requestedListingStatus) {
    Object.assign(updatePayload, buildListingStatusPayload(requestedListingStatus));
    const label = requestedListingStatus === "under_contract" ? "Under Contract" : requestedListingStatus === "leased" ? "Leased" : "Sold";
    summary.push(`Prepared ListingStream status update to ${label}.`);
  }

  const title = extractTitle(instructions);
  if (title) {
    nextContent.saleTitle = title;
    summary.push(`Updated listing title to "${title}".`);
  }

  if (shouldMarkUnpriced(instructions)) {
    nextPricing.salePriceDollars = null;
    nextPricing.hideSalePrice = true;
    nextPricing.hiddenPriceLabel = "Call for price";
    summary.push("Marked sale pricing as unpriced / call for price.");
  } else {
    const salePrice = extractCurrency(instructions);
    if (salePrice != null) {
      nextPricing.salePriceDollars = salePrice;
      nextPricing.hideSalePrice = false;
      if (pricing.hiddenPriceLabel) nextPricing.hiddenPriceLabel = null;
      summary.push(`Updated sale price to $${salePrice.toLocaleString()}.`);
    }
  }

  const leaseRate = extractLeaseRate(instructions);
  if (leaseRate != null) {
    nextPricing.askingPriceRatePerSf = leaseRate;
    nextPricing.listingPriceVisibility = "per_sf";
    summary.push(`Updated asking rate to $${leaseRate}/SF.`);
  }

  const globalRentType = extractRentType(instructions);
  if (globalRentType) {
    const effectiveLeaseRate = leaseRate ?? parseNumericToken(asString(pricing.askingPriceRatePerSf) || asString(pricing.leaseRatePerSf) || asString(pricing.ratePerSf) || asString(pricing.leaseRate));
    nextPricing.rateType = globalRentType;
    nextPricing.leaseType = globalRentType;
    if (effectiveLeaseRate != null) {
      nextPricing.askingPriceRatePerSf = effectiveLeaseRate;
      nextPricing.leaseRate = `$${effectiveLeaseRate}/SF ${globalRentType}`;
    }
    summary.push(`Updated lease expense structure to ${globalRentType}.`);
  }

  const zoning = extractZoning(instructions);
  if (zoning) {
    nextProperty.zoning = zoning;
    summary.push(`Updated zoning to ${zoning}.`);
  }

  const availableSqFt = extractAvailableSqFt(instructions);
  if (availableSqFt != null) {
    nextPricing.availableSqFt = availableSqFt;
    summary.push(`Updated available square footage to ${availableSqFt.toLocaleString()} SF.`);
  }

  const buildingSize = extractBuildingSize(instructions);
  if (buildingSize != null) {
    nextProperty.buildingSizeSf = buildingSize;
    summary.push(`Updated building size to ${buildingSize.toLocaleString()} SF.`);
  }

  const lotAcres = extractLotAcres(instructions);
  if (lotAcres != null) {
    nextProperty.lotSizeAcres = lotAcres;
    summary.push(`Updated lot size to ${lotAcres} acres.`);
  }

  const yearBuilt = extractYearBuilt(instructions);
  if (yearBuilt != null) {
    nextProperty.yearBuilt = yearBuilt;
    summary.push(`Updated year built to ${yearBuilt}.`);
  }

  const description = extractDescription(instructions);
  if (description) {
    if (isLease) {
      nextContent.leaseDescription = description;
      summary.push("Updated lease description from broker instructions.");
    } else {
      nextContent.saleDescription = description;
      summary.push("Updated property description from broker instructions.");
    }
  }

  const locationDescription = extractLocationDescription(instructions);
  if (locationDescription) {
    nextContent.locationDescription = locationDescription;
    summary.push("Updated location / neighborhood description from broker instructions.");
  }

  const bulletPoints = extractBulletPoints(instructions);
  if (bulletPoints.length) {
    if (isLease) {
      nextContent.leaseBullets = bulletPoints;
      summary.push(`Replaced lease bullet points with ${bulletPoints.length} broker-provided bullet${bulletPoints.length === 1 ? "" : "s"}.`);
    } else {
      nextContent.saleBullets = bulletPoints;
      summary.push(`Replaced sale bullet points with ${bulletPoints.length} broker-provided bullet${bulletPoints.length === 1 ? "" : "s"}.`);
    }
  }

  const suites = normalizeSuiteRows(admin.suites);
  const semanticSuiteMapping = suites.length ? applySemanticSuiteMapping(suites, instructions) : { suites, changed: false, messages: [], flags: [] };
  if (semanticSuiteMapping.changed) {
    nextAdmin.suites = semanticSuiteMapping.suites;
    nextPricing.availableSqFt = totalSuiteSqFt(semanticSuiteMapping.suites);
    nextPricing.suiteNumbers = semanticSuiteMapping.suites.map((suite) => suite.suiteNumber).filter(Boolean).join(", ");
    summary.push(...semanticSuiteMapping.messages);
  }
  const globalRentTypeAppliesToAllSuites = Boolean(globalRentType && (!/\bsuite\s+[A-Za-z0-9-]+\b/i.test(instructions) || /\b(?:all|every)\s+(?:active\s+)?suites?\b/i.test(instructions)));
  if (globalRentTypeAppliesToAllSuites && suites.length && !nextAdmin.suites) {
    nextAdmin.suites = suites.map((suite) => ({ ...suite, rentType: globalRentType }));
    nextPricing.availableSqFt = totalSuiteSqFt(nextAdmin.suites as SuiteRecord[]);
    nextPricing.suiteNumbers = (nextAdmin.suites as SuiteRecord[]).map((suite) => suite.suiteNumber).filter(Boolean).join(", ");
    summary.push(`Applied ${globalRentType} to all active suite rows.`);
  } else if (globalRentTypeAppliesToAllSuites && Array.isArray(nextAdmin.suites)) {
    nextAdmin.suites = (nextAdmin.suites as SuiteRecord[]).map((suite) => ({ ...suite, rentType: globalRentType }));
  }
  if (semanticSuiteMapping.flags.length) flags.push(...semanticSuiteMapping.flags);

  const leasedSuite = extractLeasedSuite(instructions);
  if (leasedSuite) {
    if (!suites.length) {
      flags.push(`Instruction referenced leased Suite ${leasedSuite}, but no suite rows were found to mutate automatically.`);
    } else {
      const remainingSuites = suites.filter((suite) => !suiteMatches(suite, leasedSuite));
      if (remainingSuites.length === suites.length) {
        flags.push(`Instruction referenced leased Suite ${leasedSuite}, but no exact suite match was found.`);
      } else {
        nextAdmin.suites = remainingSuites;
        nextPricing.availableSqFt = totalSuiteSqFt(remainingSuites);
        nextPricing.suiteNumbers = remainingSuites.map((suite) => suite.suiteNumber).filter(Boolean).join(", ");
        summary.push(`Removed Suite ${leasedSuite} from the active suite stack and recalculated available square footage.`);
      }
    }
  }

  const suiteNumber = extractSuiteNumber(instructions.replace(/suite\s+[A-Za-z0-9-]+\s+(?:is\s+)?leased/gi, ""));
  if (suiteNumber && (!semanticSuiteMapping.changed || shouldAddSuite(instructions)) && (suites.length || shouldAddSuite(instructions))) {
    const baseSuites = Array.isArray(nextAdmin.suites) ? (nextAdmin.suites as SuiteRecord[]) : suites;
    const suiteUpdate = updateSuiteRecord(baseSuites, suiteNumber, instructions);
    if (suiteUpdate.changed) {
      nextAdmin.suites = suiteUpdate.suites;
      nextPricing.availableSqFt = totalSuiteSqFt(suiteUpdate.suites);
      nextPricing.suiteNumbers = suiteUpdate.suites.map((suite) => suite.suiteNumber).filter(Boolean).join(", ");
      summary.push(...suiteUpdate.messages);
    } else {
      flags.push(...suiteUpdate.messages);
    }
  }

  if (Object.keys(nextPricing).length) updatePayload.pricing = nextPricing;
  if (Object.keys(nextProperty).length) updatePayload.property = nextProperty;
  if (Object.keys(nextContent).length) updatePayload.content = { ...content, ...nextContent };
  if (Object.keys(nextAdmin).length) updatePayload.admin = { ...admin, ...nextAdmin };

  const hasSuiteMediaMapping = summary.some((item) => /Prepared Suite .* upload mapping/i.test(item));
  const confidence: BrokerEditInterpreterResult["confidence"] = lifecycleAction && flags.length === 0 ? "high" : hasSuiteMediaMapping && flags.length === 0 ? "high" : summary.length >= 3 && flags.length === 0 ? "high" : summary.length >= 1 ? "medium" : "low";

  return { summary, flags, confidence, updatePayload, ...(lifecycleAction ? { lifecycleAction } : {}) };
}


function safeJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parseBrokerEditInterpreterJson(content: string): BrokerEditInterpreterResult {
  const text = asString(content);
  if (!text) throw new Error("Frontier broker-edit-interpreter returned an empty response.");
  const candidates = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fenced) candidates.push(fenced);
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(text.slice(objectStart, objectEnd + 1));

  for (const candidate of candidates) {
    try {
      const parsed = asRecord(JSON.parse(candidate));
      return normalizeInterpreterResult(parsed);
    } catch {
      // Try the next JSON extraction strategy.
    }
  }
  throw new Error("Frontier broker-edit-interpreter returned invalid JSON.");
}

function normalizeInterpreterResult(value: UnknownRecord): BrokerEditInterpreterResult {
  const confidence = value.confidence === "high" || value.confidence === "medium" || value.confidence === "low" ? value.confidence : "low";
  const lifecycle = value.lifecycleAction === "archive" || value.lifecycleAction === "delete" ? value.lifecycleAction : undefined;
  return {
    summary: Array.isArray(value.summary) ? value.summary.map(asString).filter(Boolean) : [],
    flags: Array.isArray(value.flags) ? value.flags.map(asString).filter(Boolean) : [],
    confidence,
    updatePayload: asRecord(value.updatePayload),
    ...(lifecycle ? { lifecycleAction: lifecycle } : {}),
  };
}

function buildFrontierBrokerEditPrompt(rawProperty: Record<string, unknown>, instructions: string) {
  return `You are the frontier reasoning engine for PIER Manager ListingStream revision drafts. Return STRICT JSON only in this exact TypeScript-compatible shape:
{
  "summary": ["broker-safe summary strings"],
  "flags": [],
  "confidence": "high" | "medium" | "low",
  "updatePayload": { "pricing": {}, "property": {}, "content": { "saleDescription": "exact requested public description text", "leaseDescription": "exact requested public description text" }, "saleDescription": "exact requested public description text", "leaseDescription": "exact requested public description text", "admin": { "suites": [] }, "documents": [], "attachments": [], "links": { "saleListingUrl": null, "websiteUrl": null, "leaseListingUrl": null, "virtualTourUrl": null, "matterportUrl": null, "youTubeUrl": null } },
  "lifecycleAction": "archive" | "delete" // omit unless explicitly requested for the whole listing
}

Critical rules:
- Use high-reasoning semantic matching over brittle regex. Map fuzzy broker language to the exact current listing objects.
- Documents/attachments are mutable arrays; links is a mutable object on live ListingStream records. Pooler Parkway stores the public external Sale Listing URL in BOTH top-level documents[] (documentType "External Link", title "Sale Listing") and links.saleListingUrl. If the broker asks to remove/delete/hide the Pooler/Sale Listing link, return documents as the complete resulting array with that External Link object removed AND return links with saleListingUrl set to null while preserving unrelated link fields.
- If the broker asks to remove, delete, hide, unpublish, drop, or take down a document, attachment, file, URL, or link, identify the object/field inside the current documents, attachments, or links payload by semantic evidence from id, title, name, label, description, documentType, source, filename, url, href, downloadUrl, or link object key (saleListingUrl, websiteUrl, leaseListingUrl, virtualTourUrl, matterportUrl, youTubeUrl).
- For documents/attachments removals, return the COMPLETE resulting array for every mutated array with only the requested objects removed and every unrelated object preserved. For links removals, return the COMPLETE resulting links object with the requested URL field set to null. Do not return a partial array/object and do not leave the matched object/URL in place.
- Verification gate: when a removal is requested for documents or attachments, the corresponding output array length must be strictly less than the input array length before you return a success/high-confidence summary. When a removal is requested for links, the matching links.* URL value must be null or absent and must not equal the input URL before you return success/high-confidence. If this is not true, set confidence "low", add a flag explaining no matching object/field was safely removed, and do not claim success.
- If the broker requests multiple changes in one sentence, every requested variable must appear in updatePayload. Never put a requested value only in summary. Summary is non-authoritative; updatePayload is the database mutation.
- If the broker says to update/change/set the description, property description, lease description, or sale description — including phrasing like "description to say ..." — return the actual requested string under updatePayload.content.saleDescription and updatePayload.content.leaseDescription, and also mirror it to root updatePayload.saleDescription and updatePayload.leaseDescription for downstream ListingStream compatibility. Do this even when the same command also changes rent/pricing, suites, or media.
- Self-check before returning: for every summary sentence that says a field was updated, the corresponding concrete value must exist in updatePayload at the correct field path. If it does not, fix updatePayload before responding.
- If the broker says to capitalize, rename, correct, or change suite h to H, update admin.suites so the resulting suiteNumber is exactly "H" (uppercase H), never "a" and never lowercase "h".
- If the broker says to delete/remove the null-data/no-data/blank suite literally named "space", remove the suite row whose suiteNumber is exactly "space" even though "space" is also a generic real-estate noun.
- Preserve every suite not explicitly removed. When updating admin.suites, return the full resulting suites array, not a partial array.
- Recalculate pricing.availableSqFt as the sum of remaining numeric suite availableSqFt values and pricing.suiteNumbers as a comma-separated list of remaining suiteNumber values when suites change.
- Whole-listing archive/delete is only for explicit listing/property removal, not suite row removal.
- Do not invent facts. If the instruction cannot be safely mapped, return confidence "low" with flags and no unsafe mutation.

Current ListingStream payload:
${safeJson(rawProperty)}

Broker instruction:
${instructions}`;
}

function withInterpreterTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("Frontier broker-edit-interpreter timed out while mapping the ListingStream revision.")), timeoutMs);
  });
  return Promise.race([promise, timer]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function getOpenAiKey() {
  return asString(process.env.PIER_MANAGER_INTERPRETER_OPENAI_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_PRODUCTION || process.env.OPENAI_KEY);
}

function getAnthropicKey() {
  return asString(process.env.PIER_MANAGER_INTERPRETER_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY);
}

function getGeminiKey() {
  return asString(process.env.PIER_MANAGER_INTERPRETER_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

function pickInterpreterProvider(options: BrokerEditInterpreterOptions) {
  if (options.provider) return options.provider;
  if (getAnthropicKey()) return "anthropic";
  if (getOpenAiKey()) return "openai";
  if (getGeminiKey()) return "gemini";
  return "openai";
}

async function callAnthropicInterpreter(prompt: string, options: BrokerEditInterpreterOptions) {
  const apiKey = getAnthropicKey();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for the Claude broker-edit-interpreter.");
  const model = asString(options.model || process.env.PIER_MANAGER_INTERPRETER_ANTHROPIC_MODEL || process.env.ANTHROPIC_MODEL || process.env.ANTHROPIC_LISTING_MODEL || process.env.PIER_MANAGER_INTERPRETER_MODEL) || "claude-sonnet-5";
  const normalizedModel = model.startsWith("anthropic/") ? model.slice("anthropic/".length) : model;
  const fetchImpl = options.fetchImpl ?? fetch;
  const system = "You are Claude, the senior semantic parser for PIER Commercial Real Estate ListingStream JSON revisions. Return strict JSON only. Prioritize exact broker intent, exact object identity, suite row preservation, documents/attachments array mutation, links object field deletion, and self-verification before output. Every requested value in a batch command must be present in updatePayload, not merely summarized; when description text is requested, include the actual string in content.saleDescription/content.leaseDescription and root saleDescription/leaseDescription. For requested document/link/attachment removals, never report success unless the mutated output documents/attachments array is strictly shorter or the matched links.* URL field is null/absent.";
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: normalizedModel,
      temperature: 0,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Claude broker-edit-interpreter failed (${response.status}): ${text.slice(0, 600)}`);
  const payload = JSON.parse(text) as Record<string, unknown>;
  const candidate = ((payload.content as Array<{ type?: string; text?: string }> | undefined) ?? [])
    .map((part) => asString(part.text))
    .filter(Boolean)
    .join("\n");
  return parseBrokerEditInterpreterJson(candidate);
}

async function callOpenAiInterpreter(prompt: string, options: BrokerEditInterpreterOptions) {
  const apiKey = getOpenAiKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for the frontier broker-edit-interpreter.");
  const model = asString(options.model || process.env.PIER_MANAGER_INTERPRETER_OPENAI_FALLBACK_MODEL || process.env.OPENAI_MODEL) || "gpt-4.1";
  const normalizedModel = model.startsWith("openai/") ? model.slice("openai/".length) : model;
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: normalizedModel,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a frontier reasoning model for commercial real estate ListingStream JSON revisions. Return strict JSON only. Prioritize exact object identity, exact casing, suite row preservation, documents/attachments array mutation, links object field deletion, and self-verification before output. Every requested value in a batch command must be present in updatePayload, not merely summarized; when description text is requested, include the actual string in content.saleDescription/content.leaseDescription and root saleDescription/leaseDescription. For requested document/link/attachment removals, never report success unless the mutated output documents/attachments array is strictly shorter or the matched links.* URL field is null/absent." },
        { role: "user", content: prompt },
      ],
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Frontier broker-edit-interpreter failed (${response.status}): ${text.slice(0, 600)}`);
  const payload = JSON.parse(text) as Record<string, unknown>;
  return parseBrokerEditInterpreterJson(asString((payload.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content));
}

async function callGeminiInterpreter(prompt: string, options: BrokerEditInterpreterOptions) {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for the frontier broker-edit-interpreter.");
  const model = asString(options.model || process.env.PIER_MANAGER_INTERPRETER_MODEL || process.env.GEMINI_MODEL) || "gemini-2.5-pro";
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
      contents: [{ role: "user", parts: [{ text: `Return strict JSON only. ${prompt}` }] }],
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Frontier broker-edit-interpreter failed (${response.status}): ${text.slice(0, 600)}`);
  const payload = JSON.parse(text) as Record<string, unknown>;
  const candidate = (((payload.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined)?.[0]?.content?.parts) ?? [])
    .map((part) => asString(part.text))
    .join("\n");
  return parseBrokerEditInterpreterJson(candidate);
}

function deepMergeForVerification(...records: Record<string, unknown>[]) {
  const output: Record<string, unknown> = {};
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      const existing = output[key];
      if (asRecord(existing) === existing && asRecord(value) === value) output[key] = deepMergeForVerification(existing as Record<string, unknown>, value as Record<string, unknown>);
      else output[key] = value;
    }
  }
  return output;
}

function combineInterpreterResults(frontier: BrokerEditInterpreterResult, deterministic: BrokerEditInterpreterResult): BrokerEditInterpreterResult {
  const mergedPayload = deepMergeForVerification(deterministic.updatePayload, frontier.updatePayload);
  const summary = [...deterministic.summary, ...frontier.summary].filter((item, index, array) => array.indexOf(item) === index);
  const flags = [...deterministic.flags, ...frontier.flags].filter((item, index, array) => array.indexOf(item) === index);
  const deterministicHasPayload = Object.keys(deterministic.updatePayload).length > 0;
  return {
    summary,
    flags,
    confidence: frontier.confidence === "low" && deterministicHasPayload && !flags.length ? "medium" : frontier.confidence,
    updatePayload: mergedPayload,
    ...(frontier.lifecycleAction || deterministic.lifecycleAction ? { lifecycleAction: frontier.lifecycleAction || deterministic.lifecycleAction } : {}),
  };
}

function suiteRowsForVerification(value: Record<string, unknown>) {
  const admin = asRecord(value.admin);
  return Array.isArray(admin.suites) ? admin.suites.map((suite) => asRecord(suite)) : [];
}

function suiteLabelForVerification(value: unknown) {
  return asString(asRecord(value).suiteNumber || asRecord(value).suite || asRecord(value).name);
}

function suiteHasDataForVerification(value: UnknownRecord) {
  return Boolean(
    asString(value.availableSqFt)
      || asString(value.baseRent)
      || asString(value.rentType)
      || asString(value.spaceType)
      || asString(value.suiteNotes || value.notes || value.description)
      || (Array.isArray(value.suitePhotos) && value.suitePhotos.length)
      || (Array.isArray(value.suiteFloorPlans) && value.suiteFloorPlans.length),
  );
}

function listingArrayForVerification(value: Record<string, unknown>, arrayName: ListingArrayName) {
  return Array.isArray(value[arrayName]) ? value[arrayName] as unknown[] : [];
}

function verifyLinksObjectRemoval(rawProperty: Record<string, unknown>, after: Record<string, unknown>, instructions: string, failures: string[]) {
  if (!instructionRequestsArrayRemoval(instructions, "links")) return;
  const beforeLinks = asRecord(rawProperty.links);
  if (!Object.keys(beforeLinks).length) return;
  const afterLinks = asRecord(after.links);
  const beforeMatches = Object.entries(beforeLinks).filter(([, value]) => asString(value) && textMatchesRemovalInstruction(linkFieldSearchText("saleListingUrl", value), instructions));
  const explicitlyMatched = Object.entries(beforeLinks).filter(([key, value]) => asString(value) && textMatchesRemovalInstruction(linkFieldSearchText(key, value), instructions));
  const matches = explicitlyMatched.length ? explicitlyMatched : beforeMatches;
  for (const [key, value] of matches) {
    if (asString(afterLinks[key]) === asString(value)) {
      failures.push(`Frontier cross-check failed: requested links removal still leaves links.${key} unchanged.`);
    }
  }
}

function verifyListingArrayRemoval(rawProperty: Record<string, unknown>, after: Record<string, unknown>, instructions: string, failures: string[]) {
  for (const arrayName of ["documents", "attachments"] as ListingArrayName[]) {
    if (!instructionRequestsArrayRemoval(instructions, arrayName)) continue;
    const beforeArray = listingArrayForVerification(rawProperty, arrayName);
    if (!beforeArray.length) continue;
    const afterArray = listingArrayForVerification(after, arrayName);
    if (afterArray.length >= beforeArray.length) {
      failures.push(`Frontier cross-check failed: removal was requested for ${arrayName}, but output ${arrayName} length (${afterArray.length}) was not strictly less than input length (${beforeArray.length}).`);
      continue;
    }
    const stillMatched = afterArray.filter((item) => arrayItemMatchesRemovalInstruction(item, instructions));
    if (stillMatched.length) failures.push(`Frontier cross-check failed: requested ${arrayName} removal still leaves a semantically matching object in the output array.`);
  }
}

function verifyFrontierInterpreterResult(rawProperty: Record<string, unknown>, instructions: string, result: BrokerEditInterpreterResult) {
  const after = deepMergeForVerification(rawProperty, result.updatePayload);
  const afterSuites = suiteRowsForVerification(after);
  const failures: string[] = [];

  const rename = instructions.match(/\b(?:change|rename|update|correct|capitalize)\s+(?:the\s+)?(?:suite|space|unit)\s+([A-Za-z0-9-]+)\s+(?:to|as|into)\s+([A-Za-z0-9-]+)\b/i);
  if (rename?.[1] && rename?.[2]) {
    const from = rename[1].trim();
    const to = rename[2].trim();
    const hasExactTarget = afterSuites.some((suite) => suiteLabelForVerification(suite) === to);
    const hasExactSource = from !== to && afterSuites.some((suite) => suiteLabelForVerification(suite) === from);
    if (!hasExactTarget || hasExactSource) failures.push(`Frontier cross-check failed: expected Suite ${from} to become exact suiteNumber "${to}".`);
  }

  const namedRemoval = instructions.match(/\b(?:remove|delete|drop|clear)\s+(?:the\s+)?(?:null-data|no-data|empty|blank)?\s*(?:suite|space|unit|row|one)\s+(?:literally\s+)?(?:named\s+|called\s+)?["“']?([A-Za-z0-9-]+)["”']?\b/i)
    || instructions.match(/\b(?:remove|delete|drop|clear)[\s\S]{0,120}?\b(?:named|called)\s+["“']?([A-Za-z0-9-]+)["”']?/i);
  if (namedRemoval?.[1]) {
    const target = namedRemoval[1].trim();
    if (afterSuites.some((suite) => suiteLabelForVerification(suite).toLowerCase() === target.toLowerCase())) failures.push(`Frontier cross-check failed: expected suite row named "${target}" to be removed.`);
  }

  const removesEmptySuite = /\b(?:remove|delete|drop|clear)\b/i.test(instructions)
    && /\b(?:null-data|no\s+data|empty|blank|mistake|accidental|one\s+with\s+no\s+data)\b/i.test(instructions)
    && /\b(?:suite|space|unit|row|one)\b/i.test(instructions);
  if (removesEmptySuite) {
    const remainingEmpty = afterSuites.filter((suite) => !suiteHasDataForVerification(suite));
    if (remainingEmpty.length) failures.push(`Frontier cross-check failed: expected no-data suite rows to be removed, but ${remainingEmpty.map(suiteLabelForVerification).filter(Boolean).join(", ") || "an unnamed suite"} remains.`);
  }

  const requestedDescription = extractDescription(instructions);
  if (requestedDescription) {
    const afterContent = asRecord(after.content);
    const descriptionValues = [afterContent.saleDescription, afterContent.leaseDescription, afterContent.descriptionHtml, afterContent.description, after.saleDescription, after.leaseDescription, after.descriptionHtml, after.description]
      .map(asString)
      .filter(Boolean);
    const expected = normalizeTextForMatching(requestedDescription);
    const exactRequired = isExplicitVerbatimInstruction(instructions);
    const hasRequestedDescription = descriptionValues.some((value) => {
      const normalizedValue = normalizeTextForMatching(value);
      if (normalizedValue.includes(expected) || expected.includes(normalizedValue)) return true;
      if (exactRequired) return false;
      const expectedTokens = meaningfulTokens(requestedDescription);
      if (!expectedTokens.length) return false;
      const matchedTokens = expectedTokens.filter((token) => normalizedValue.includes(token));
      return matchedTokens.length >= Math.min(expectedTokens.length, Math.max(3, Math.ceil(expectedTokens.length * 0.4)));
    });
    if (!hasRequestedDescription) {
      failures.push(`Frontier cross-check failed: requested description text was summarized but missing from updatePayload.content or root description fields.`);
    }
  }

  verifyListingArrayRemoval(rawProperty, after, instructions, failures);
  verifyLinksObjectRemoval(rawProperty, after, instructions, failures);

  if (failures.length) throw new Error(failures.join(" "));
}

export async function interpretBrokerEditRequest(rawProperty: Record<string, unknown>, instructions: string, options: BrokerEditInterpreterOptions = {}): Promise<BrokerEditInterpreterResult> {
  const prompt = buildFrontierBrokerEditPrompt(rawProperty, instructions);
  const timeoutMs = options.timeoutMs ?? Number(process.env.PIER_MANAGER_INTERPRETER_TIMEOUT_MS ?? 45_000);
  const deterministic = interpretBrokerEditRequestDeterministic(rawProperty, instructions);
  const preferredProvider = pickInterpreterProvider(options);
  const providerSequence: BrokerEditInterpreterOptions["provider"][] = options.provider
    ? [options.provider]
    : [preferredProvider, "openai", "gemini"].filter((provider, index, list): provider is NonNullable<BrokerEditInterpreterOptions["provider"]> => Boolean(provider) && list.indexOf(provider) === index);
  const errors: string[] = [];

  for (const provider of providerSequence) {
    try {
      const frontier = await withInterpreterTimeout(
        provider === "anthropic" ? callAnthropicInterpreter(prompt, { ...options, provider }) : provider === "gemini" ? callGeminiInterpreter(prompt, { ...options, provider }) : callOpenAiInterpreter(prompt, { ...options, provider }),
        timeoutMs,
      );
      const result = combineInterpreterResults(frontier, deterministic);
      verifyFrontierInterpreterResult(rawProperty, instructions, result);
      return result;
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (errors.length) throw new Error(errors.join(" | "));
  const result = combineInterpreterResults(deterministic, deterministic);
  verifyFrontierInterpreterResult(rawProperty, instructions, result);
  return result;
}

export { interpretBrokerEditRequestDeterministic };
