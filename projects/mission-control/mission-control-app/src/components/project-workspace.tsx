"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, Pill } from "@/components/ui";
import { createProject, fetchProjects } from "@/lib/projects-client";
import { formatLocalTime } from "@/lib/mission-data";
import { isProjectOverdue } from "@/lib/project-health";
import { ProjectSummary } from "@/lib/project-summaries";
import { ListingAgent, ListingStatus } from "@/lib/projects-data";
import {
  displayOfferingPrice,
  formatAcreage,
  formatSquareFeet,
  getListingWebsiteUrl,
  listingFullAddress,
} from "@/lib/listing-utils";

const inputClass = "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-[#CB521E]/50 focus:ring-2 focus:ring-[#CB521E]/10";
const textareaClass = "min-h-[110px] w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-[#CB521E]/50 focus:ring-2 focus:ring-[#CB521E]/10";

function numberOrUndefined(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function ProjectWorkspace() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [name, setName] = useState("");
  const [listingStatus, setListingStatus] = useState<ListingStatus>("Pipeline");
  const [propertyType, setPropertyType] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("GA");
  const [zip, setZip] = useState("");
  const [parcelId, setParcelId] = useState("");
  const [acreage, setAcreage] = useState("");
  const [size, setSize] = useState("");
  const [frontageFeet, setFrontageFeet] = useState("");
  const [zoningDistrict, setZoningDistrict] = useState("");
  const [price, setPrice] = useState("");
  const [priceWithheld, setPriceWithheld] = useState(false);
  const [leaseRate, setLeaseRate] = useState("");
  const [expenses, setExpenses] = useState("");
  const [capRate, setCapRate] = useState("");
  const [buildoutPropertyId, setBuildoutPropertyId] = useState("");
  const [customListingUrl, setCustomListingUrl] = useState("");
  const [listingAgent, setListingAgent] = useState<ListingAgent>("Ryan");
  const [owner, setOwner] = useState("");
  const [ownerContact, setOwnerContact] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [mediaAssetNotes, setMediaAssetNotes] = useState("");
  const [description, setDescription] = useState("");
  const [marketingBlurb, setMarketingBlurb] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ListingStatus>("all");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  const listings = useMemo(() => projects.filter((project) => project.type === "listing"), [projects]);

  const filteredListings = useMemo(() => {
    return [...listings]
      .filter((project) => {
        const matchesSearch =
          !search.trim() ||
          `${project.name} ${project.summary} ${project.address ?? ""} ${project.city ?? ""} ${project.owner ?? ""}`
            .toLowerCase()
            .includes(search.trim().toLowerCase());
        const matchesStatus = statusFilter === "all" || project.listingStatus === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [listings, search, statusFilter]);

  async function handleCreateListing() {
    if (!name.trim()) return;

    setSaving(true);
    try {
      const result = await createProject({
        name: name.trim(),
        summary: description.trim(),
        status: listingStatus === "Closed" ? "done" : listingStatus === "Pending" ? "waiting" : "active",
        owner: owner.trim() || undefined,
        dueDate: dueDate || undefined,
        type: "listing",
        listingStatus,
        propertyType: propertyType.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        zip: zip.trim() || undefined,
        parcelId: parcelId.trim() || undefined,
        acreage: numberOrUndefined(acreage),
        size: numberOrUndefined(size),
        frontageFeet: numberOrUndefined(frontageFeet),
        zoningDistrict: zoningDistrict.trim() || undefined,
        price: priceWithheld ? undefined : numberOrUndefined(price),
        priceWithheld,
        leaseRate: leaseRate.trim() || undefined,
        expenses: expenses.trim() || undefined,
        capRate: capRate.trim() || undefined,
        buildoutPropertyId: buildoutPropertyId.trim() || undefined,
        customListingUrl: customListingUrl.trim() || undefined,
        listingAgent,
        ownerContact: ownerContact.trim() || undefined,
        mediaAssetNotes: mediaAssetNotes.trim() || undefined,
        description: description.trim() || undefined,
        marketingBlurb: marketingBlurb.trim() || undefined,
      });
      setProjects(result.projects);
      resetForm();
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setName("");
    setListingStatus("Pipeline");
    setPropertyType("");
    setAddress("");
    setCity("");
    setState("GA");
    setZip("");
    setParcelId("");
    setAcreage("");
    setSize("");
    setFrontageFeet("");
    setZoningDistrict("");
    setPrice("");
    setPriceWithheld(false);
    setLeaseRate("");
    setExpenses("");
    setCapRate("");
    setBuildoutPropertyId("");
    setCustomListingUrl("");
    setListingAgent("Ryan");
    setOwner("");
    setOwnerContact("");
    setDueDate("");
    setMediaAssetNotes("");
    setDescription("");
    setMarketingBlurb("");
  }

  return (
    <div className="grid gap-6 2xl:grid-cols-[0.88fr_1.12fr]">
      <Card
        title="Listing intake"
        description="This is Ryan’s private listing upload path. Data entered here becomes the internal listing record used by downstream Mission Control tools."
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[1.3fr_0.7fr]">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Property name / listing title" className={inputClass} />
            <select value={listingStatus} onChange={(event) => setListingStatus(event.target.value as ListingStatus)} className={inputClass}>
              <option value="Pipeline">Pipeline</option>
              <option value="Active">Active</option>
              <option value="Pending">Pending</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <input value={propertyType} onChange={(event) => setPropertyType(event.target.value)} placeholder="Property type: retail, office, industrial, land…" className={inputClass} />
            <select value={listingAgent} onChange={(event) => setListingAgent(event.target.value as ListingAgent)} className={inputClass}>
              <option value="Ryan">Ryan</option>
              <option value="Anthony">Anthony</option>
              <option value="Joel">Joel</option>
            </select>
          </div>

          <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Street address" className={inputClass} />
          <div className="grid gap-4 md:grid-cols-3">
            <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" className={inputClass} />
            <input value={state} onChange={(event) => setState(event.target.value)} placeholder="State" className={inputClass} />
            <input value={zip} onChange={(event) => setZip(event.target.value)} placeholder="Zip" className={inputClass} />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <input value={parcelId} onChange={(event) => setParcelId(event.target.value)} placeholder="Parcel ID / APN" className={inputClass} />
            <input value={acreage} onChange={(event) => setAcreage(event.target.value)} placeholder="Acreage" inputMode="decimal" className={inputClass} />
            <input value={size} onChange={(event) => setSize(event.target.value)} placeholder="Building SF" inputMode="numeric" className={inputClass} />
            <input value={frontageFeet} onChange={(event) => setFrontageFeet(event.target.value)} placeholder="Frontage feet" inputMode="numeric" className={inputClass} />
          </div>

          <input value={zoningDistrict} onChange={(event) => setZoningDistrict(event.target.value)} placeholder="Zoning district / zoning notes" className={inputClass} />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <input value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Offering price" inputMode="numeric" disabled={priceWithheld} className={inputClass} />
            <input value={leaseRate} onChange={(event) => setLeaseRate(event.target.value)} placeholder="Lease rate" className={inputClass} />
            <input value={expenses} onChange={(event) => setExpenses(event.target.value)} placeholder="Expenses / NNN" className={inputClass} />
            <input value={capRate} onChange={(event) => setCapRate(event.target.value)} placeholder="Cap rate" className={inputClass} />
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            <input type="checkbox" checked={priceWithheld} onChange={(event) => setPriceWithheld(event.target.checked)} className="h-4 w-4 accent-[#CB521E]" />
            Price withheld — show broker-contact language instead of pricing.
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <input value={buildoutPropertyId} onChange={(event) => setBuildoutPropertyId(event.target.value)} placeholder="Buildout property ID" className={inputClass} />
            <input value={customListingUrl} onChange={(event) => setCustomListingUrl(event.target.value)} placeholder="Custom listing website URL, if any" className={inputClass} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="Owner / seller name" className={inputClass} />
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={inputClass} />
          </div>
          <textarea value={ownerContact} onChange={(event) => setOwnerContact(event.target.value)} placeholder="Owner contact info / decision path — private/internal only" className={textareaClass} />
          <textarea value={mediaAssetNotes} onChange={(event) => setMediaAssetNotes(event.target.value)} placeholder="Media and asset notes: aerials, photos, maps, file locations, source docs" className={textareaClass} />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Internal description / source notes" className={textareaClass} />
          <textarea value={marketingBlurb} onChange={(event) => setMarketingBlurb(event.target.value)} placeholder="Short market-facing blurb for offering summaries" className={textareaClass} />

          <button
            onClick={handleCreateListing}
            disabled={!name.trim() || saving}
            className="rounded-xl bg-[#CB521E] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#a94318] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving listing…" : "Save listing record"}
          </button>
        </div>
      </Card>

      <Card
        title="Private listing records"
        description="Listings entered here feed documents, offering summaries, website scaffolds, uploads, and daily task control."
      >
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search listings" className={inputClass} />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | ListingStatus)} className={inputClass}>
              <option value="all">All listing statuses</option>
              <option value="Pipeline">Pipeline</option>
              <option value="Active">Active</option>
              <option value="Pending">Pending</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Pill tone="orange">showing {filteredListings.length} of {listings.length}</Pill>
            <Pill>private/internal only</Pill>
            <Pill>source intake path</Pill>
          </div>

          {filteredListings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-500">
              No listing records yet. Save a listing on the left to start feeding Mission Control.
            </div>
          ) : (
            filteredListings.map((project) => {
              const websiteUrl = getListingWebsiteUrl(project);
              return (
                <div key={project.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xl font-semibold text-zinc-950">{project.name}</p>
                        <Pill tone={project.listingStatus === "Active" ? "green" : project.listingStatus === "Pending" ? "amber" : project.listingStatus === "Closed" ? "neutral" : "orange"}>
                          {project.listingStatus ?? "Pipeline"}
                        </Pill>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-zinc-600">
                        {listingFullAddress(project) || "Address not entered."}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-zinc-600">
                        {project.marketingBlurb || project.summary || "No marketing blurb yet."}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[#CB521E]/20 bg-white px-4 py-3 text-right shadow-sm">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Price</p>
                      <p className="mt-1 font-semibold text-[#CB521E]">{displayOfferingPrice(project)}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    <Metric label="Type" value={project.propertyType ?? "TBD"} />
                    <Metric label="Size" value={formatSquareFeet(project.size)} />
                    <Metric label="Acreage" value={formatAcreage(project.acreage)} />
                    <Metric label="Zoning" value={project.zoningDistrict ?? "TBD"} />
                    <Metric label="Frontage" value={project.frontageFeet ? `${project.frontageFeet.toLocaleString()} ft` : "TBD"} />
                    <Metric label="Parcel" value={project.parcelId ?? "TBD"} />
                    <Metric label="Agent" value={project.listingAgent ?? "Ryan"} />
                    <Metric label="Created" value={formatLocalTime(new Date(project.createdAt))} />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link href={`/projects/${project.id}`} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 transition hover:border-[#CB521E]/30 hover:bg-[#CB521E]/5">
                      Open record
                    </Link>
                    <Link href={`/uploads?project=${project.id}`} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 transition hover:border-[#CB521E]/30 hover:bg-[#CB521E]/5">
                      Upload files
                    </Link>
                    <Link href={`/offering-summaries?project=${project.id}`} className="rounded-xl border border-[#CB521E]/20 bg-[#CB521E]/10 px-4 py-2 text-sm text-[#CB521E] transition hover:bg-[#CB521E]/15">
                      Generate summary
                    </Link>
                    {websiteUrl ? (
                      <a href={websiteUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 transition hover:border-[#CB521E]/30 hover:bg-[#CB521E]/5">
                        Listing website
                      </a>
                    ) : null}
                    {project.dueDate ? (
                      <span className={`rounded-xl border px-4 py-2 text-sm ${isProjectOverdue(project) ? "border-rose-500/20 bg-rose-50 text-rose-700" : "border-amber-500/20 bg-amber-50 text-amber-700"}`}>
                        Due {project.dueDate}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-zinc-900">{value}</p>
    </div>
  );
}
