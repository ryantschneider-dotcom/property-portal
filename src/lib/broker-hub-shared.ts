export const BROKER_HUB_COUNTIES = [
  "Beaufort",
  "Jasper",
  "Chatham",
  "Effingham",
  "Bryan",
  "Bulloch",
  "Liberty",
  "Long",
  "McIntosh",
  "Wayne",
  "Glynn",
  "Camden",
  "Evans",
  "Tattnall",
  "Toombs",
  "Montgomery",
  "Appling",
  "Screven",
  "Jenkins",
] as const;

export const BROKER_HUB_PROPERTY_TYPES = ["Office", "Industrial", "Retail", "Land", "Multi-Family"] as const;
export const BROKER_HUB_TRANSACTION_TYPES = ["Sale", "Lease", "Both"] as const;
export const BROKER_HUB_LEASE_TYPES = ["NNN", "Modified Net", "Modified Gross", "Gross"] as const;
export const BROKER_HUB_BROKERS = ["Ryan", "Anthony", "Joel"] as const;

export type BrokerHubCounty = (typeof BROKER_HUB_COUNTIES)[number];

type ParcelFormatRule = "digits-only" | "compact-alnum" | "triple-dash-digits" | "triple-dash-alnum";
type CountyRoutingStatus = "ready" | "partial" | "pending-mapper";

type CountyConfig = {
  countyKey: string;
  parcelFormat: ParcelFormatRule;
  assessorSource: "qpublic" | "publicaccessnow" | "manual-placeholder" | "unmapped";
  status: CountyRoutingStatus;
  canScrapeTaxCard: boolean;
  notes: string;
};

const COUNTY_CONFIG: Record<string, CountyConfig> = {
  chatham: {
    countyKey: "chatham",
    parcelFormat: "digits-only",
    assessorSource: "qpublic",
    status: "ready",
    canScrapeTaxCard: true,
    notes: "Normalize to digits only for tax-card lookup.",
  },
  effingham: {
    countyKey: "effingham",
    parcelFormat: "digits-only",
    assessorSource: "qpublic",
    status: "ready",
    canScrapeTaxCard: true,
    notes: "Normalize to digits only for tax-card lookup.",
  },
  liberty: {
    countyKey: "liberty",
    parcelFormat: "digits-only",
    assessorSource: "qpublic",
    status: "ready",
    canScrapeTaxCard: true,
    notes: "Normalize to digits only for tax-card lookup.",
  },
  glynn: {
    countyKey: "glynn",
    parcelFormat: "digits-only",
    assessorSource: "qpublic",
    status: "ready",
    canScrapeTaxCard: true,
    notes: "Normalize to digits only for tax-card lookup.",
  },
  camden: {
    countyKey: "camden",
    parcelFormat: "digits-only",
    assessorSource: "qpublic",
    status: "ready",
    canScrapeTaxCard: true,
    notes: "Normalize to digits only for tax-card lookup.",
  },
  wayne: {
    countyKey: "wayne",
    parcelFormat: "digits-only",
    assessorSource: "unmapped",
    status: "pending-mapper",
    canScrapeTaxCard: false,
    notes: "Digits-only parcel normalization ready; assessor routing still needs implementation.",
  },
  bryan: {
    countyKey: "bryan",
    parcelFormat: "triple-dash-alnum",
    assessorSource: "qpublic",
    status: "ready",
    canScrapeTaxCard: true,
    notes: "Use compact alphanumeric parcel ID, formatted as XXX-XXX-rest when long enough.",
  },
  bulloch: {
    countyKey: "bulloch",
    parcelFormat: "triple-dash-alnum",
    assessorSource: "qpublic",
    status: "ready",
    canScrapeTaxCard: true,
    notes: "Use compact alphanumeric parcel ID, formatted as XXX-XXX-rest when long enough.",
  },
  jasper: {
    countyKey: "jasper",
    parcelFormat: "triple-dash-alnum",
    assessorSource: "qpublic",
    status: "ready",
    canScrapeTaxCard: true,
    notes: "Live Jasper County qPublic routing is enabled.",
  },
  beaufort: {
    countyKey: "beaufort",
    parcelFormat: "triple-dash-alnum",
    assessorSource: "publicaccessnow",
    status: "ready",
    canScrapeTaxCard: true,
    notes: "Live Beaufort County Public Access routing is enabled.",
  },
  mcintosh: {
    countyKey: "mcintosh",
    parcelFormat: "triple-dash-digits",
    assessorSource: "qpublic",
    status: "ready",
    canScrapeTaxCard: true,
    notes: "Normalize to digits and format as XXX-XXX-rest when long enough.",
  },
  long: {
    countyKey: "long",
    parcelFormat: "triple-dash-digits",
    assessorSource: "unmapped",
    status: "pending-mapper",
    canScrapeTaxCard: false,
    notes: "Parcel formatting is mapped; assessor routing still needs implementation.",
  },
  tattnall: {
    countyKey: "tattnall",
    parcelFormat: "triple-dash-digits",
    assessorSource: "unmapped",
    status: "pending-mapper",
    canScrapeTaxCard: false,
    notes: "Parcel formatting is mapped; assessor routing still needs implementation.",
  },
  toombs: {
    countyKey: "toombs",
    parcelFormat: "triple-dash-digits",
    assessorSource: "unmapped",
    status: "pending-mapper",
    canScrapeTaxCard: false,
    notes: "Parcel formatting is mapped; assessor routing still needs implementation.",
  },
  appling: {
    countyKey: "appling",
    parcelFormat: "triple-dash-digits",
    assessorSource: "unmapped",
    status: "pending-mapper",
    canScrapeTaxCard: false,
    notes: "Parcel formatting is mapped; assessor routing still needs implementation.",
  },
  screven: {
    countyKey: "screven",
    parcelFormat: "triple-dash-digits",
    assessorSource: "unmapped",
    status: "pending-mapper",
    canScrapeTaxCard: false,
    notes: "Parcel formatting is mapped; assessor routing still needs implementation.",
  },
  jenkins: {
    countyKey: "jenkins",
    parcelFormat: "triple-dash-digits",
    assessorSource: "unmapped",
    status: "pending-mapper",
    canScrapeTaxCard: false,
    notes: "Parcel formatting is mapped; assessor routing still needs implementation.",
  },
  evans: {
    countyKey: "evans",
    parcelFormat: "triple-dash-digits",
    assessorSource: "unmapped",
    status: "pending-mapper",
    canScrapeTaxCard: false,
    notes: "Parcel formatting is mapped; assessor routing still needs implementation.",
  },
  montgomery: {
    countyKey: "montgomery",
    parcelFormat: "triple-dash-digits",
    assessorSource: "unmapped",
    status: "pending-mapper",
    canScrapeTaxCard: false,
    notes: "Parcel formatting is mapped; assessor routing still needs implementation.",
  },
};

const DEFAULT_COUNTY_CONFIG: CountyConfig = {
  countyKey: "",
  parcelFormat: "compact-alnum",
  assessorSource: "unmapped",
  status: "pending-mapper",
  canScrapeTaxCard: false,
  notes: "No county-specific parcel mapper is configured yet.",
};

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildListingSlug(addressStreet: string, city: string, propertyType: string) {
  return slugify([addressStreet, city, propertyType].filter(Boolean).join(" ")) || `listing-${Date.now()}`;
}

export function normalizeCountyName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function formatTripleDash(value: string) {
  if (value.length <= 6) return value;
  return `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6)}`;
}

export function normalizeParcelId(rawValue: string, county: string) {
  const raw = rawValue.trim();
  if (!raw) return "";

  const countyConfig = getCountyEnrichmentPlan(county);
  const compact = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const digitsOnly = compact.replace(/[^0-9]/g, "");

  switch (countyConfig.parcelFormat) {
    case "digits-only":
      return digitsOnly || compact;
    case "triple-dash-digits":
      return digitsOnly.length >= 9 ? formatTripleDash(digitsOnly) : digitsOnly || compact;
    case "triple-dash-alnum":
      return compact.length >= 9 ? formatTripleDash(compact) : compact;
    case "compact-alnum":
    default:
      return raw.replace(/\s+/g, " ").toUpperCase();
  }
}

export function parseOptionalNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const trimmed = String(value ?? "").trim().replace(/[$,%]/g, "").replace(/,/g, "");
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

export function getCountyEnrichmentPlan(county: string) {
  const key = normalizeCountyName(county).toLowerCase();
  const config = COUNTY_CONFIG[key] ?? DEFAULT_COUNTY_CONFIG;
  return {
    countyKey: config.countyKey || key,
    parcelFormat: config.parcelFormat,
    assessorSource: config.assessorSource,
    status: config.status,
    canScrapeTaxCard: config.canScrapeTaxCard,
    notes: config.notes,
  } as const;
}
