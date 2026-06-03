import { ProjectRecord } from "@/lib/projects-data";
import {
  displayOfferingPrice,
  formatAcreage,
  formatSquareFeet,
  getListingWebsiteUrl,
  listingFullAddress,
} from "@/lib/listing-utils";

export type DraftField = {
  label: string;
  value: string;
};

export type ListingAgreementDraft = {
  title: string;
  reviewLabel: string;
  terms: DraftField[];
  missingTerms: string[];
  riskNotes: string[];
  draftText: string;
};

export type SalesContractDraft = {
  title: string;
  reviewLabel: string;
  dealPoints: DraftField[];
  missingDealPoints: string[];
  milestones: string[];
  riskNotes: string[];
  draftText: string;
};

export type OfferingWebsitePlan = {
  title: string;
  publicUrl: string;
  heroStats: DraftField[];
  sections: Array<{ heading: string; copy: string }>;
  strictExclusions: string[];
  callToAction: string;
  publicCopy: string;
};

function safe(value?: string | number | null, fallback = "TBD") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function sentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function publicDescription(project: ProjectRecord) {
  return sentence(project.marketingBlurb || project.summary || `${project.name} is a PIER Commercial listing opportunity.`);
}

function sourcePropertyValue(project: ProjectRecord) {
  const address = listingFullAddress(project);
  return [project.name, address].filter(Boolean).join(" — ");
}

export function buildListingAgreementDraft(project: ProjectRecord): ListingAgreementDraft {
  const property = sourcePropertyValue(project);
  const terms: DraftField[] = [
    { label: "Seller / owner", value: safe(project.owner) },
    { label: "Property", value: property || project.name },
    { label: "Listing agent", value: safe(project.listingAgent, "Ryan") },
    { label: "Listing status", value: safe(project.listingStatus || project.status) },
    { label: "Property type", value: safe(project.propertyType) },
    { label: "Listing price", value: displayOfferingPrice(project) },
    { label: "Lease rate", value: safe(project.leaseRate) },
  ];

  const missingTerms = [
    "Commission percentage",
    "Agreement start date",
    "Agreement expiration date",
    "Exclusivity type",
    "Protection period",
    "Seller legal entity confirmation",
  ];

  const riskNotes = [
    "Draft only: do not send or present as final without Ryan's explicit approval.",
    "Commission, term, protection period, and exclusivity language require broker/legal review.",
    "Private owner contact details are intentionally excluded from the draft text.",
  ];

  const draftText = [
    `${project.name} Listing Agreement Draft`,
    "DRAFT ONLY — Ryan/legal review required",
    "",
    `Property: ${property || project.name}`,
    `Seller / owner: ${safe(project.owner)}`,
    `Listing broker: PIER Commercial Real Estate — ${safe(project.listingAgent, "Ryan")}`,
    `Offering guidance: ${displayOfferingPrice(project)}${project.leaseRate ? `; lease rate ${project.leaseRate}` : ""}`,
    "",
    "Open required terms:",
    ...missingTerms.map((term) => `- ${term}`),
    "",
    "Review note: This is an internal drafting aid only and is not ready for signature, delivery, or client reliance.",
  ].join("\n");

  return {
    title: `${project.name} Listing Agreement Draft`,
    reviewLabel: "DRAFT ONLY — Ryan/legal review required",
    terms,
    missingTerms,
    riskNotes,
    draftText,
  };
}

export function buildSalesContractDraft(project: ProjectRecord): SalesContractDraft {
  const property = sourcePropertyValue(project);
  const dealPoints: DraftField[] = [
    { label: "Property", value: property || project.name },
    { label: "Seller", value: safe(project.owner) },
    { label: "Buyer", value: "TBD" },
    { label: "Purchase price", value: displayOfferingPrice(project) },
    { label: "Parcel ID", value: safe(project.parcelId) },
    { label: "Zoning", value: safe(project.zoningDistrict) },
    { label: "Listing agent", value: safe(project.listingAgent, "Ryan") },
  ];

  const missingDealPoints = [
    "Buyer legal name / entity",
    "Earnest money amount",
    "Escrow agent",
    "Due diligence period",
    "Closing date",
    "Financing contingency",
    "Special stipulations",
  ];

  const milestones = [
    "Due diligence period: TBD after buyer and offer structure are confirmed.",
    "Earnest money delivery deadline: TBD.",
    "Closing date: TBD.",
  ];

  const riskNotes = [
    "Draft only: not a binding contract and not legal advice.",
    "Ryan and appropriate counsel must review before any external use.",
    "Confidential owner contact information is excluded from the draft text.",
  ];

  const draftText = [
    `${project.name} Sales Contract Drafting Sheet`,
    "DRAFT ONLY — not a binding contract",
    "",
    `Property: ${property || project.name}`,
    `Purchase price: ${displayOfferingPrice(project)}`,
    `Seller: ${safe(project.owner)}`,
    "Buyer: TBD",
    "",
    "Open deal points:",
    ...missingDealPoints.map((point) => `- ${point}`),
    "",
    "Milestones:",
    ...milestones.map((milestone) => `- ${milestone}`),
  ].join("\n");

  return {
    title: `${project.name} Sales Contract Draft`,
    reviewLabel: "DRAFT ONLY — not a binding contract",
    dealPoints,
    missingDealPoints,
    milestones,
    riskNotes,
    draftText,
  };
}

export function buildOfferingWebsitePlan(project: ProjectRecord): OfferingWebsitePlan {
  const address = listingFullAddress(project) || "Address to be confirmed";
  const publicUrl = getListingWebsiteUrl(project) || "Public URL TBD";
  const description = publicDescription(project);
  const heroStats: DraftField[] = [
    { label: "Price", value: displayOfferingPrice(project) },
    { label: "Size", value: formatSquareFeet(project.size) },
    { label: "Acreage", value: formatAcreage(project.acreage) },
    { label: "Zoning", value: safe(project.zoningDistrict) },
  ];

  const sections = [
    { heading: "Overview", copy: description },
    { heading: "Property", copy: `${safe(project.propertyType, "Commercial property")} at ${address}. ${formatSquareFeet(project.size)}; ${formatAcreage(project.acreage)}.` },
    { heading: "Location", copy: `Located in ${safe(project.city, "the Savannah market")}${project.frontageFeet ? ` with approximately ${project.frontageFeet.toLocaleString()} feet of frontage` : ""}.` },
    { heading: "Zoning", copy: `Zoning: ${safe(project.zoningDistrict)}. Parcel ID: ${safe(project.parcelId)}.` },
    { heading: "Contact", copy: "Contact PIER Commercial Real Estate for additional information and next steps." },
  ];

  const strictExclusions = [
    "Owner contact details",
    "Commission structures",
    "Listing agreement terms",
    "BOV pricing ranges",
    "Internal due diligence notes",
    "Unapproved confidential documents",
  ];

  const callToAction = "Contact PIER Commercial Real Estate to request additional information.";
  const publicCopy = [
    `${project.name} Offering Website Plan`,
    address,
    publicUrl,
    "",
    description,
    "",
    "Hero stats:",
    ...heroStats.map((stat) => `- ${stat.label}: ${stat.value}`),
    "",
    callToAction,
  ].join("\n");

  return {
    title: `${project.name} Offering Website Plan`,
    publicUrl,
    heroStats,
    sections,
    strictExclusions,
    callToAction,
    publicCopy,
  };
}
