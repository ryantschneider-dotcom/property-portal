type UnknownRecord = Record<string, unknown>;

type SuiteRecord = {
  suiteNumber: string;
  availableSqFt: string;
  baseRent: string;
  rentType: string;
  spaceType?: string;
  unpriced?: boolean;
  suitePhotos?: unknown[];
  suiteFloorPlans?: unknown[];
};

export type BrokerEditInterpreterResult = {
  summary: string[];
  flags: string[];
  confidence: "high" | "medium" | "low";
  updatePayload: Record<string, unknown>;
  lifecycleAction?: "archive" | "delete";
};

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function asString(value: unknown) {
  return String(value ?? "").trim();
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
        suiteNumber: asString(suite.suiteNumber),
        availableSqFt: asString(suite.availableSqFt),
        baseRent: asString(suite.baseRent),
        rentType: asString(suite.rentType),
        unpriced: suite.unpriced === true,
      };
      if (asString(suite.spaceType)) normalized.spaceType = asString(suite.spaceType);
      if (Array.isArray(suite.suitePhotos)) normalized.suitePhotos = suite.suitePhotos;
      if (Array.isArray(suite.suiteFloorPlans)) normalized.suiteFloorPlans = suite.suiteFloorPlans;
      return normalized;
    })
    .filter((suite) => suite.suiteNumber || suite.availableSqFt || suite.baseRent || suite.rentType);
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
  const addMatch = instructions.match(/(?:add|create|include|insert|new)\s+suite\s+([A-Za-z0-9-]+)/i);
  if (addMatch?.[1]) return addMatch[1].trim();
  const match = instructions.match(/suite\s+([A-Za-z0-9-]+)/i);
  return match?.[1]?.trim() || null;
}

function shouldAddSuite(instructions: string) {
  return /\b(?:add|create|include|insert|new)\s+suite\s+[A-Za-z0-9-]+/i.test(instructions);
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
  if (/\b(?:per\s+month|\/\s*mo(?:nth)?|monthly)\b/i.test(instructions)) return "Monthly";
  const match = instructions.match(/\b(NNN|modified\s+gross|full\s+service|gross)\b/i);
  if (!match) return null;
  const value = match[1].replace(/\s+/g, " ").trim();
  return value.toLowerCase() === "nnn" ? "NNN" : value.replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function extractFieldText(instructions: string, aliases: string[]) {
  for (const alias of aliases) {
    const quoted = extractQuotedOrPlain(instructions, new RegExp(`${alias}\\s*(?:to|as|=|:)\\s*["“]([^"”]+)["”]`, "i"));
    if (quoted) return quoted;
    const plain = extractQuotedOrPlain(instructions, new RegExp(`${alias}\\s*(?:to|as|=|:)\\s*([^\\n]{8,400})`, "i"));
    if (plain) return plain;
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

function updateSuiteRecord(suites: SuiteRecord[], suiteNumber: string, instructions: string) {
  const suiteIndex = suites.findIndex((suite) => suiteMatches(suite, suiteNumber));
  if (suiteIndex === -1) {
    const size = extractSuiteSize(instructions, suiteNumber);
    const rate = extractSuiteRate(instructions, suiteNumber);
    const rentType = extractRentType(instructions) || "NNN";
    const spaceType = extractSuiteSpaceType(instructions, suiteNumber);
    const hasExplicitSuiteFacts = size != null || rate != null || Boolean(extractRentType(instructions)) || Boolean(spaceType);
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

  if (/suite\s+[A-Za-z0-9-]+.*?(?:unpriced|call\s+for\s+price|inquire)/i.test(instructions)) {
    current.baseRent = "";
    current.unpriced = true;
    changed = true;
    messages.push(`Marked Suite ${suiteNumber} as unpriced.`);
  }

  if (!changed) {
    return { suites, changed: false, messages: [`Suite ${suiteNumber} was detected, but no safe structured mutation was parsed yet.`] };
  }

  nextSuites[suiteIndex] = current;
  return { suites: nextSuites, changed: true, messages };
}

export function interpretBrokerEditRequest(rawProperty: Record<string, unknown>, instructions: string): BrokerEditInterpreterResult {
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
  if (suiteNumber && (suites.length || shouldAddSuite(instructions))) {
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

  const confidence: BrokerEditInterpreterResult["confidence"] = lifecycleAction && flags.length === 0 ? "high" : summary.length >= 3 && flags.length === 0 ? "high" : summary.length >= 1 ? "medium" : "low";

  return { summary, flags, confidence, updatePayload, ...(lifecycleAction ? { lifecycleAction } : {}) };
}
