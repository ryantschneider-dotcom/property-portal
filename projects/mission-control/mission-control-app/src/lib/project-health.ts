import { ProjectRecord } from "@/lib/projects-data";

export function isProjectOverdue(project: Pick<ProjectRecord, "dueDate" | "status">) {
  if (!project.dueDate || project.status === "done") return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(`${project.dueDate}T00:00:00`);
  return due < today;
}

export function getMissingListingFields(project: ProjectRecord): string[] {
  if (project.type !== "listing") return [];

  const missing: string[] = [];
  if (!project.propertyType) missing.push("Property Type");
  if (!project.address) missing.push("Address");
  if (!project.city) missing.push("City");
  if (!project.state) missing.push("State");
  if (!project.zip) missing.push("Zip");
  if (!project.priceWithheld && !project.price) missing.push("Price or Withheld Toggle");
  if (!project.size) missing.push("Building SF");
  if (!project.listingAgent) missing.push("Listing Agent");
  if (!project.description) missing.push("Description");
  if (!project.marketingBlurb) missing.push("Marketing Blurb");

  return missing;
}
