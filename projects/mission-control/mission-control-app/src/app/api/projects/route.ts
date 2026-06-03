import { NextRequest, NextResponse } from "next/server";
import { pushActivityEvent } from "@/lib/activity-log";
import { ListingAgent, ListingStatus, ProjectRecord } from "@/lib/projects-data";
import { listProjectSummaries } from "@/lib/project-summaries";
import { readStore, writeStore } from "@/lib/storage";

type ProjectMutationBody = {
  id?: string;
  name?: string;
  summary?: string;
  status?: ProjectRecord["status"];
  owner?: string;
  dueDate?: string;
  type?: "listing";
  listingStatus?: ListingStatus;
  propertyType?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  parcelId?: string;
  acreage?: number;
  size?: number;
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
  listingAgent?: ListingAgent;
  ownerContact?: string;
  mediaAssetNotes?: string;
  description?: string;
  marketingBlurb?: string;
};

const listingStatuses = new Set<ListingStatus>(["Active", "Pending", "Closed", "Pipeline"]);
const listingAgents = new Set<ListingAgent>(["Ryan", "Anthony", "Joel"]);

const clean = (value?: string) => value?.trim() || undefined;
const cleanNumber = (value?: number) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const cleanListingStatus = (value?: ListingStatus) => (value && listingStatuses.has(value) ? value : undefined);
const cleanListingAgent = (value?: ListingAgent) => (value && listingAgents.has(value) ? value : undefined);

export async function GET() {
  const store = await readStore();
  return NextResponse.json({ projects: listProjectSummaries(store) });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ProjectMutationBody;

  if (!clean(body.name)) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const store = await readStore();

  const project: ProjectRecord = {
    id: crypto.randomUUID(),
    name: clean(body.name)!,
    summary: clean(body.summary) ?? "",
    status: body.status ?? "active",
    owner: clean(body.owner),
    dueDate: body.dueDate || undefined,
    createdAt: new Date().toISOString(),
    linkedRunIds: [],
    type: body.type,
    listingStatus: cleanListingStatus(body.listingStatus),
    propertyType: clean(body.propertyType),
    address: clean(body.address),
    city: clean(body.city),
    state: clean(body.state),
    zip: clean(body.zip),
    parcelId: clean(body.parcelId),
    acreage: cleanNumber(body.acreage),
    size: cleanNumber(body.size),
    frontageFeet: cleanNumber(body.frontageFeet),
    zoningDistrict: clean(body.zoningDistrict),
    price: cleanNumber(body.price),
    priceWithheld: Boolean(body.priceWithheld),
    leaseRate: clean(body.leaseRate),
    expenses: clean(body.expenses),
    capRate: clean(body.capRate),
    units: cleanNumber(body.units),
    yearBuilt: cleanNumber(body.yearBuilt),
    buildoutPropertyId: clean(body.buildoutPropertyId),
    customListingUrl: clean(body.customListingUrl),
    listingAgent: cleanListingAgent(body.listingAgent),
    ownerContact: clean(body.ownerContact),
    mediaAssetNotes: clean(body.mediaAssetNotes),
    description: clean(body.description),
    marketingBlurb: clean(body.marketingBlurb),
  };

  store.projects = [project, ...store.projects];
  pushActivityEvent(store, {
    type: "project",
    title: `${project.type === "listing" ? "Listing" : "Project"} created: ${project.name}`,
    detail: project.summary || "Project created",
    projectId: project.id,
    projectName: project.name,
    createdAt: project.createdAt,
  });
  await writeStore(store);

  return NextResponse.json({ ok: true, projects: listProjectSummaries(store) });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as ProjectMutationBody;

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const store = await readStore();
  const existing = store.projects.find((project) => project.id === body.id);

  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  store.projects = store.projects.map((project) =>
    project.id === body.id
      ? {
          ...project,
          name: clean(body.name) ?? project.name,
          summary: clean(body.summary) ?? project.summary,
          status: body.status ?? project.status,
          owner: body.owner === undefined ? project.owner : clean(body.owner),
          dueDate: body.dueDate === undefined ? project.dueDate : body.dueDate || undefined,
          type: body.type ?? project.type,
          listingStatus: cleanListingStatus(body.listingStatus) ?? project.listingStatus,
          propertyType: clean(body.propertyType) ?? project.propertyType,
          address: clean(body.address) ?? project.address,
          city: clean(body.city) ?? project.city,
          state: clean(body.state) ?? project.state,
          zip: clean(body.zip) ?? project.zip,
          parcelId: clean(body.parcelId) ?? project.parcelId,
          acreage: cleanNumber(body.acreage) ?? project.acreage,
          size: cleanNumber(body.size) ?? project.size,
          frontageFeet: cleanNumber(body.frontageFeet) ?? project.frontageFeet,
          zoningDistrict: clean(body.zoningDistrict) ?? project.zoningDistrict,
          price: cleanNumber(body.price) ?? project.price,
          priceWithheld: body.priceWithheld ?? project.priceWithheld,
          leaseRate: clean(body.leaseRate) ?? project.leaseRate,
          expenses: clean(body.expenses) ?? project.expenses,
          capRate: clean(body.capRate) ?? project.capRate,
          units: cleanNumber(body.units) ?? project.units,
          yearBuilt: cleanNumber(body.yearBuilt) ?? project.yearBuilt,
          buildoutPropertyId: clean(body.buildoutPropertyId) ?? project.buildoutPropertyId,
          customListingUrl: clean(body.customListingUrl) ?? project.customListingUrl,
          listingAgent: cleanListingAgent(body.listingAgent) ?? project.listingAgent,
          ownerContact: clean(body.ownerContact) ?? project.ownerContact,
          mediaAssetNotes: clean(body.mediaAssetNotes) ?? project.mediaAssetNotes,
          description: clean(body.description) ?? project.description,
          marketingBlurb: clean(body.marketingBlurb) ?? project.marketingBlurb,
        }
      : project,
  );

  const updatedProject = store.projects.find((project) => project.id === body.id)!;
  pushActivityEvent(store, {
    type: "project",
    title: `Project updated: ${updatedProject.name}`,
    detail: `Status: ${updatedProject.status}${updatedProject.owner ? ` • Owner: ${updatedProject.owner}` : ""}${updatedProject.dueDate ? ` • Due: ${updatedProject.dueDate}` : ""}`,
    projectId: updatedProject.id,
    projectName: updatedProject.name,
  });

  await writeStore(store);

  return NextResponse.json({
    ok: true,
    project: store.projects.find((project) => project.id === body.id),
    projects: listProjectSummaries(store),
  });
}
