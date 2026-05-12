import type {
  PropertyDemographics,
  PropertyDocumentAsset,
  PropertyImageAsset,
  PropertyImageKind,
  PropertyDetail,
} from "@/lib/types";

export type NormalizedOmImage = {
  id: string;
  kind: PropertyImageKind;
  title: string | null;
  caption: string | null;
  storagePath: string | null;
  isPublic: boolean;
  sortOrder: number;
  url: string | null;
  thumbUrl: string | null;
  filename: string | null;
  contentType: string | null;
  source: PropertyImageAsset["source"];
};

export type NormalizedOmDocument = {
  id: string;
  title: string | null;
  description: string | null;
  kind: PropertyDocumentAsset["kind"];
  status: PropertyDocumentAsset["status"];
  isPublic: boolean;
  storagePath: string | null;
  url: string | null;
  previewImageUrl: string | null;
  filename: string | null;
  contentType: string | null;
  source: PropertyDocumentAsset["source"];
  version: number;
  sortOrder: number;
};

export type NormalizedOmInput = {
  propertyId: string;
  slug: string;
  title: string;
  status: string | null;
  transactionTypes: PropertyDetail["transactionTypes"];
  address: PropertyDetail["address"];
  location: PropertyDetail["location"];
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
    zoning: string | null;
    parcelId: string | null;
  };
  pricing: {
    hideSalePrice: boolean;
    hiddenPriceLabel: string | null;
    salePriceDollars: number | null;
    salePricePerUnit: number | null;
    salePriceUnits: string | null;
    availableSqFt: number | null;
    askingPriceRatePerSf: number | null;
    leaseType: string | null;
    listingPriceVisibility: string | null;
    display: string | null;
  };
  content: {
    saleTitle: string | null;
    leaseTitle: string | null;
    propertyDescription: string | null;
    locationDescription: string | null;
    siteDescription: string | null;
    exteriorDescription: string | null;
    saleDescription: string | null;
    leaseDescription: string | null;
    highlights: string[];
  };
  spaces: Array<NonNullable<PropertyDetail["spaces"]>[number]>;
  images: NormalizedOmImage[];
  documents: NormalizedOmDocument[];
  demographics: PropertyDemographics | null;
  links: PropertyDetail["links"];
  brokerProfile: {
    leadBroker: string | null;
    ownerEmail: string | null;
    companyName: string;
  };
  branding: {
    companyName: string;
    primaryColor: string;
  };
  warnings: string[];
};

export type OmInputValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};
