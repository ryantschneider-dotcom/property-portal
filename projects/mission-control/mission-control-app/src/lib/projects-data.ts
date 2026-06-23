export type ListingAgent = "Ryan" | "Anthony" | "Joel";

export type ListingStatus = "Active" | "Pending" | "Closed" | "Pipeline";

export type ProjectRecord = {
  id: string;
  name: string;
  summary: string;
  status: "active" | "paused" | "idea" | "waiting" | "done";
  owner?: string;
  dueDate?: string;
  createdAt: string;
  linkedRunIds: string[];

  // Listing-specific fields. Mission Control is private/internal, so these are
  // richer than public listing website fields and may include owner/contact data.
  type?: "listing";
  listingStatus?: ListingStatus;
  propertyType?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  parcelId?: string;
  acreage?: number;
  size?: number; // Square footage
  frontageFeet?: number;
  zoningDistrict?: string;
  price?: number;
  priceWithheld?: boolean;
  leaseRate?: string;
  expenses?: string;
  capRate?: string;
  units?: number;
  yearBuilt?: number;
  buildoutPropertyId?: string;
  customListingUrl?: string;
  offeringWebsiteUrl?: string;
  useManualCoordinates?: boolean;
  manualLatitude?: number;
  manualLongitude?: number;
  listingAgent?: ListingAgent;
  ownerContact?: string;
  mediaAssetNotes?: string;
  description?: string;
  marketingBlurb?: string;
};
