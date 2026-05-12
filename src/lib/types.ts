export type TransactionType = "sale" | "lease";

export type PropertyAssetSource = "buildout_import" | "broker_upload" | "internal_upload" | "generated";

export type PropertyImageKind = "photo" | "hero" | "site_plan_image" | "floorplan_image" | "other";

export type PropertyDocumentKind =
  | "offering_memorandum"
  | "floor_plan"
  | "site_plan"
  | "survey"
  | "brochure"
  | "financials"
  | "rent_roll"
  | "presentation"
  | "environmental"
  | "title_document"
  | "other";

export type PropertyDocumentStatus = "draft" | "published" | "archived";

export type PropertyOmStatus =
  | "queued"
  | "assembling"
  | "drafting"
  | "rendering_html"
  | "rendering_pdf"
  | "draft_ready"
  | "approved"
  | "published"
  | "failed";

export type PropertyEnrichmentJobStatus = "pending" | "complete" | "failed";

export type PropertyImageAsset = {
  id: string | number | null;
  kind: PropertyImageKind;
  title: string | null;
  caption: string | null;
  isPrimary: boolean;
  sortOrder: number | null;
  storagePath: string | null;
  urls: {
    original: string | null;
    full: string | null;
    xlarge: string | null;
    large: string | null;
    medium: string | null;
    thumb: string | null;
  };
  contentType: string | null;
  filename: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  isPublic: boolean;
  source: PropertyAssetSource | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PropertyDocumentAsset = {
  id: string | number | null;
  title: string | null;
  description: string | null;
  documentType: string | null;
  kind: PropertyDocumentKind;
  subcategory: string | null;
  storagePath: string | null;
  gsUrl: string | null;
  url: string | null;
  previewImageUrl: string | null;
  filename: string | null;
  contentType: string | null;
  extension: string | null;
  sizeBytes: number | null;
  source: PropertyAssetSource | null;
  sourceRef: string | null;
  isPublic: boolean;
  status: PropertyDocumentStatus;
  version: number;
  sortOrder: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PropertyDemographicRing = {
  total_population: number | null;
  total_households: number | null;
  average_household_income: number | null;
  [key: string]: string | number | null;
};

export type PropertyDemographics = {
  provider: "esri" | null;
  providerVersion: string | null;
  fetchedAt: string | null;
  location: {
    lat: number | null;
    lng: number | null;
  };
  oneMile: PropertyDemographicRing | null;
  threeMile: PropertyDemographicRing | null;
  fiveMile: PropertyDemographicRing | null;
};

export type PropertyEnrichmentStatus = {
  demographics: {
    status: PropertyEnrichmentJobStatus;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    error: string | null;
  };
  omInput: {
    status: PropertyEnrichmentJobStatus;
    lastBuiltAt: string | null;
    error: string | null;
  };
};

export type PropertyOMState = {
  status: PropertyOmStatus;
  template: string | null;
  currentDraftDocumentId: string | null;
  currentPublishedDocumentId: string | null;
  lastGeneratedAt: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  error: string | null;
  warnings: string[];
  narrativeSnapshotPath: string | null;
  inputSnapshotPath: string | null;
};

export type PropertyCard = {
  id: string;
  slug: string;
  title: string;
  transactionTypes: TransactionType[];
  propertyCategory: string | null;
  address: {
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    full: string | null;
  };
  heroImageUrl: string | null;
  thumbnailUrl: string | null;
  stats: {
    buildingSizeSf: number | null;
    lotSizeAcres: number | null;
    yearBuilt: number | null;
  };
  pricing: {
    hideSalePrice: boolean;
    hiddenPriceLabel: string | null;
    salePriceDollars: number | null;
    teaserText: string | null;
  };
  badges: string[];
  updatedAt: string | null;
};

export type PropertyMapMarker = {
  id: string;
  slug: string;
  title: string;
  transactionTypes: TransactionType[];
  propertyCategory: string | null;
  coordinates: {
    lat: number;
    lng: number;
  };
  address: {
    full: string | null;
    city: string | null;
    state: string | null;
  };
  pricing: {
    teaserText: string | null;
  };
  heroImageUrl: string | null;
};

export type PropertyDetail = {
  id: string;
  slug: string;
  title: string;
  transactionTypes: TransactionType[];
  address: {
    full: string | null;
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    county: string | null;
    market: string | null;
    submarket: string | null;
    crossStreets: string | null;
    hideAddress: boolean;
  };
  location: {
    lat: number | null;
    lng: number | null;
  };
  property: {
    category: string | null;
    typeId: number | null;
    subtypeId: number | null;
    buildingSizeSf: number | null;
    grossLeasableArea: number | null;
    lotSizeAcres: number | null;
    yearBuilt: number | null;
    numberOfUnits: number | null;
    numberOfFloors: number | null;
    zoning?: string | null;
    parcelId?: string | null;
  };
  pricing: {
    hideSalePrice: boolean;
    hiddenPriceLabel: string | null;
    salePriceDollars: number | null;
    salePricePerUnit: number | null;
    salePriceUnits: string | null;
    availableSqFt?: number | null;
    askingPriceRatePerSf?: number | null;
    leaseType?: string | null;
    listingPriceVisibility?: string | null;
  };
  content: {
    locationDescription: string | null;
    siteDescription: string | null;
    exteriorDescription: string | null;
    saleTitle: string | null;
    saleDescription: string | null;
    saleBullets: string[];
    leaseTitle: string | null;
    leaseDescription: string | null;
    leaseBullets: string[];
  };
  media: {
    heroImageUrl: string | null;
    images: PropertyImageAsset[];
    documents: PropertyDocumentAsset[];
  };
  spaces?: Array<{
    id: string | number | null;
    name: string | null;
    suite: string | null;
    sizeSf: number | null;
    ratePerSf: number | null;
    monthlyRate: number | null;
    rawRateLabel: string | null;
  }>;
  links: {
    saleListingUrl: string | null;
    leaseListingUrl: string | null;
    virtualTourUrl: string | null;
    matterportUrl: string | null;
    youTubeUrl: string | null;
    websiteUrl?: string | null;
  };
  demographics?: PropertyDemographics | null;
  enrichment?: PropertyEnrichmentStatus | null;
  om?: PropertyOMState | null;
};
