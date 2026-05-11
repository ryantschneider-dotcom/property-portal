export type TransactionType = "sale" | "lease";

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
    images: Array<{
      id: string | number | null;
      title: string | null;
      caption: string | null;
      isPrimary: boolean;
      sortOrder: number | null;
      urls: {
        original: string | null;
        full: string | null;
        xlarge: string | null;
        large: string | null;
        medium: string | null;
        thumb: string | null;
      };
    }>;
    documents: Array<{
      id: string | number | null;
      title: string | null;
      description: string | null;
      documentType: string | null;
      url: string | null;
      filename: string | null;
      contentType: string | null;
    }>;
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
};
