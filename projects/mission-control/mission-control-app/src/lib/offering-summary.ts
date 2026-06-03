import { ProjectRecord } from "@/lib/projects-data";
import {
  displayOfferingPrice,
  formatAcreage,
  formatSquareFeet,
  getListingWebsiteUrl,
  listingFullAddress,
} from "@/lib/listing-utils";

export type OfferingSummaryFact = {
  label: string;
  value: string;
};

export type OfferingSummaryDraft = {
  title: string;
  subtitle: string;
  executiveSummary: string;
  facts: OfferingSummaryFact[];
  highlights: string[];
  brokerNotes: string[];
  publicCopy: string;
};

function valueOrTbd(value?: string | number) {
  if (value === undefined || value === null || value === "") return "TBD";
  return String(value);
}

function sentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function buildOfferingSummaryDraft(project: ProjectRecord): OfferingSummaryDraft {
  const address = listingFullAddress(project) || "Address to be confirmed";
  const price = displayOfferingPrice(project);
  const websiteUrl = getListingWebsiteUrl(project);
  const propertyType = project.propertyType || "commercial real estate";
  const blurb = project.marketingBlurb || project.summary || `${project.name} is a PIER Commercial listing opportunity in ${project.city || "the Savannah market"}.`;

  const facts: OfferingSummaryFact[] = [
    { label: "Property", value: project.name },
    { label: "Address", value: address },
    { label: "Property Type", value: propertyType },
    { label: "Offering Price", value: price },
    { label: "Size", value: formatSquareFeet(project.size) },
    { label: "Acreage", value: formatAcreage(project.acreage) },
    { label: "Frontage", value: project.frontageFeet ? `${project.frontageFeet.toLocaleString()} ft` : "Frontage TBD" },
    { label: "Zoning", value: valueOrTbd(project.zoningDistrict) },
    { label: "Parcel ID", value: valueOrTbd(project.parcelId) },
    { label: "Lease Rate", value: valueOrTbd(project.leaseRate) },
    { label: "Expenses", value: valueOrTbd(project.expenses) },
    { label: "Cap Rate", value: valueOrTbd(project.capRate) },
  ];

  const highlights = [
    sentence(blurb),
    `${formatSquareFeet(project.size)} ${propertyType} opportunity with ${formatAcreage(project.acreage).toLowerCase()} and ${project.frontageFeet ? `${project.frontageFeet.toLocaleString()} ft of frontage` : "frontage to be confirmed"}.`,
    `Located at ${address}, with zoning identified as ${project.zoningDistrict || "TBD"}.`,
    project.leaseRate ? `Lease economics: ${project.leaseRate}${project.expenses ? `; expenses: ${project.expenses}` : ""}.` : `Pricing: ${price}.`,
  ];

  const brokerNotes = [
    `Listing agent: ${project.listingAgent || "Ryan"}.`,
    `Status: ${project.listingStatus || project.status}.`,
    websiteUrl ? `Listing website / Buildout reference: ${websiteUrl}.` : "No public listing URL entered yet.",
    project.owner ? `Internal owner/seller reference: ${project.owner}.` : "Owner/seller reference not entered.",
  ];

  const publicCopy = [
    `${project.name}`,
    address,
    "",
    sentence(blurb),
    "",
    "Key Facts:",
    ...facts
      .filter((fact) => !["Parcel ID"].includes(fact.label) || fact.value !== "TBD")
      .map((fact) => `- ${fact.label}: ${fact.value}`),
    "",
    "For additional information, contact PIER Commercial Real Estate.",
  ].join("\n");

  return {
    title: `${project.name} Offering Summary`,
    subtitle: `${propertyType} · ${address}`,
    executiveSummary: sentence(blurb),
    facts,
    highlights,
    brokerNotes,
    publicCopy,
  };
}
