export type BrokerHubTransactionType = "Sale" | "Lease";

export type BrokerHubSuiteInput = {
  suiteNumber: string;
  availableSqFt: string;
  baseRent: string;
  rentType: string;
  unpriced?: boolean;
};

export type BrokerHubIntakeInput = {
  addressStreet: string;
  city: string;
  state: "GA" | "SC" | string;
  county: string;
  parcelId: string;
  latitude?: string;
  longitude?: string;
  propertyType: string;
  leadBroker: string;
  transactionType: BrokerHubTransactionType;
  heroPhotoCount?: number;
  salePrice?: string;
  saleUnpriced?: boolean;
  suites: BrokerHubSuiteInput[];
  listingTitle?: string;
  propertyDescription?: string;
  neighborhoodDescription?: string;
  areaBusinesses?: string;
  roadwaysTransportation?: string;
  bulletPoints?: string;
  propertyNotesDueDiligence?: string;
  notes?: string; // legacy fallback alias only
};

export type BrokerHubIntakePayload = {
  mode: "broker-hub-intake";
  reviewOnly: true;
  publishLive: false;
  requestedWorkflow: "listingstream-draft-enrich-review";
  addressStreet: string;
  city: string;
  state: string;
  county: string;
  parcelId: string;
  latitude?: string;
  longitude?: string;
  propertyType: string;
  leadBroker: string;
  transactionType: BrokerHubTransactionType;
  salePrice: string;
  saleUnpriced: boolean;
  suites: BrokerHubSuiteInput[];
  narrativeSeeds: {
    listingTitle: string;
    propertyDescription: string;
    neighborhoodDescription: string;
    areaBusinesses: string;
    roadwaysTransportation: string;
    bulletPoints: string[];
    propertyNotesDueDiligence: string;
    notes?: string;
  };
  propertyNotesDueDiligence: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function cleanLines(value: unknown) {
  return clean(value)
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeSuite(suite: BrokerHubSuiteInput): BrokerHubSuiteInput {
  return {
    suiteNumber: clean(suite.suiteNumber),
    availableSqFt: clean(suite.availableSqFt),
    baseRent: suite.unpriced ? "Unpriced / Inquire" : clean(suite.baseRent),
    rentType: clean(suite.rentType),
    unpriced: Boolean(suite.unpriced),
  };
}

function isCompleteLeaseSuite(suite: BrokerHubSuiteInput) {
  const normalized = normalizeSuite(suite);
  return Boolean(
    normalized.suiteNumber
      && normalized.availableSqFt
      && normalized.rentType
      && (normalized.unpriced || clean(suite.baseRent)),
  );
}

export function getBrokerHubIntakeMissingFields(input: Partial<BrokerHubIntakeInput>) {
  const missing: string[] = [];
  if (!clean(input.addressStreet)) missing.push("addressStreet");
  if (!clean(input.city)) missing.push("city");
  if (!clean(input.state)) missing.push("state");
  if (!clean(input.county)) missing.push("county");
  if (!clean(input.parcelId)) missing.push("parcelId");
  if (!clean(input.propertyType)) missing.push("propertyType");
  if (!clean(input.leadBroker)) missing.push("leadBroker");
  if (input.transactionType !== "Sale" && input.transactionType !== "Lease") missing.push("transactionType");
  if (!input.heroPhotoCount || input.heroPhotoCount < 1) missing.push("heroPhoto");

  if (input.transactionType === "Sale") {
    if (!input.saleUnpriced && !clean(input.salePrice)) missing.push("salePrice");
  }

  if (input.transactionType === "Lease") {
    if (!(input.suites ?? []).some(isCompleteLeaseSuite)) missing.push("suites");
  }

  return missing;
}

export function buildBrokerHubIntakePayload(input: BrokerHubIntakeInput): BrokerHubIntakePayload {
  const missing = getBrokerHubIntakeMissingFields(input);
  if (missing.length) {
    throw new Error(`Missing required Broker Hub intake fields: ${missing.join(", ")}`);
  }

  const transactionType = input.transactionType;
  const saleUnpriced = transactionType === "Sale" && Boolean(input.saleUnpriced);
  return {
    mode: "broker-hub-intake",
    reviewOnly: true,
    publishLive: false,
    requestedWorkflow: "listingstream-draft-enrich-review",
    addressStreet: clean(input.addressStreet),
    city: clean(input.city),
    state: clean(input.state),
    county: clean(input.county),
    parcelId: clean(input.parcelId),
    latitude: clean(input.latitude) || undefined,
    longitude: clean(input.longitude) || undefined,
    propertyType: clean(input.propertyType),
    leadBroker: clean(input.leadBroker),
    transactionType,
    salePrice: saleUnpriced ? "Unpriced / Inquire" : clean(input.salePrice),
    saleUnpriced,
    suites: transactionType === "Lease" ? input.suites.filter(isCompleteLeaseSuite).map(normalizeSuite) : [],
    narrativeSeeds: {
      listingTitle: clean(input.listingTitle),
      propertyDescription: clean(input.propertyDescription),
      neighborhoodDescription: clean(input.neighborhoodDescription),
      areaBusinesses: clean(input.areaBusinesses),
      roadwaysTransportation: clean(input.roadwaysTransportation),
      bulletPoints: cleanLines(input.bulletPoints),
      propertyNotesDueDiligence: clean(input.propertyNotesDueDiligence ?? input.notes),
      notes: clean(input.propertyNotesDueDiligence ?? input.notes),
    },
    propertyNotesDueDiligence: clean(input.propertyNotesDueDiligence ?? input.notes),
  };
}

export function buildBrokerHubPortalFormData(input: { payload: BrokerHubIntakePayload; heroPhoto?: File | null; assets?: File[] }) {
  const formData = new FormData();
  formData.set("payload", JSON.stringify(input.payload));
  if (input.heroPhoto) {
    formData.append("heroPhoto", input.heroPhoto);
  }
  for (const asset of input.assets ?? []) {
    formData.append("assets", asset);
  }
  return formData;
}
