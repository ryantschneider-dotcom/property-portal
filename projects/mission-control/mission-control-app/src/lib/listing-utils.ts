import { ProjectRecord } from "@/lib/projects-data";

export function formatSquareFeet(size?: number) {
  if (!size || Number.isNaN(size)) return "Size TBD";
  return `+- ${new Intl.NumberFormat("en-US").format(size)} SF`;
}

export function formatAcreage(acreage?: number) {
  if (!acreage || Number.isNaN(acreage)) return "Acreage TBD";
  return `+- ${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(acreage)} AC`;
}

export function formatMoney(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) return "TBD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function getListingWebsiteUrl(project: Pick<ProjectRecord, "customListingUrl" | "buildoutPropertyId">) {
  const customUrl = project.customListingUrl?.trim();
  if (customUrl) return customUrl;

  const buildoutId = project.buildoutPropertyId?.trim();
  if (!buildoutId) return undefined;

  return `https://buildout.com/website/${encodeURIComponent(buildoutId)}`;
}

export function displayOfferingPrice(project: Pick<ProjectRecord, "price" | "priceWithheld">) {
  if (project.priceWithheld) return "Withheld — contact broker";
  return formatMoney(project.price);
}

export function listingFullAddress(project: Pick<ProjectRecord, "address" | "city" | "state" | "zip">) {
  return [project.address, [project.city, project.state].filter(Boolean).join(", "), project.zip]
    .filter(Boolean)
    .join(" ");
}
