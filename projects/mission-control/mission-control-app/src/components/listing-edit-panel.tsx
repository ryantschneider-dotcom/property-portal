"use client";

import { useState } from "react";
import { updateProject } from "@/lib/projects-client";
import { ListingAgent, ListingStatus, ProjectRecord } from "@/lib/projects-data";

const inputClass = "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#CB521E]/50 focus:ring-2 focus:ring-[#CB521E]/10";
const textareaClass = `${inputClass} min-h-[96px]`;

function numberValue(value?: number) {
  return value === undefined || Number.isNaN(value) ? "" : String(value);
}

function numberOrUndefined(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function ListingEditPanel({ project }: { project: ProjectRecord }) {
  const [name, setName] = useState(project.name);
  const [listingStatus, setListingStatus] = useState<ListingStatus>(project.listingStatus ?? "Pipeline");
  const [propertyType, setPropertyType] = useState(project.propertyType ?? "");
  const [address, setAddress] = useState(project.address ?? "");
  const [city, setCity] = useState(project.city ?? "");
  const [state, setState] = useState(project.state ?? "GA");
  const [zip, setZip] = useState(project.zip ?? "");
  const [parcelId, setParcelId] = useState(project.parcelId ?? "");
  const [acreage, setAcreage] = useState(numberValue(project.acreage));
  const [size, setSize] = useState(numberValue(project.size));
  const [frontageFeet, setFrontageFeet] = useState(numberValue(project.frontageFeet));
  const [zoningDistrict, setZoningDistrict] = useState(project.zoningDistrict ?? "");
  const [price, setPrice] = useState(numberValue(project.price));
  const [priceWithheld, setPriceWithheld] = useState(Boolean(project.priceWithheld));
  const [leaseRate, setLeaseRate] = useState(project.leaseRate ?? "");
  const [expenses, setExpenses] = useState(project.expenses ?? "");
  const [capRate, setCapRate] = useState(project.capRate ?? "");
  const [buildoutPropertyId, setBuildoutPropertyId] = useState(project.buildoutPropertyId ?? "");
  const [customListingUrl, setCustomListingUrl] = useState(project.customListingUrl ?? "");
  const [offeringWebsiteUrl, setOfferingWebsiteUrl] = useState(project.offeringWebsiteUrl ?? "");
  const [useManualCoordinates, setUseManualCoordinates] = useState(Boolean(project.useManualCoordinates));
  const [manualLatitude, setManualLatitude] = useState(numberValue(project.manualLatitude));
  const [manualLongitude, setManualLongitude] = useState(numberValue(project.manualLongitude));
  const [listingAgent, setListingAgent] = useState<ListingAgent>(project.listingAgent ?? "Ryan");
  const [owner, setOwner] = useState(project.owner ?? "");
  const [ownerContact, setOwnerContact] = useState(project.ownerContact ?? "");
  const [description, setDescription] = useState(project.description ?? project.summary ?? "");
  const [marketingBlurb, setMarketingBlurb] = useState(project.marketingBlurb ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSave() {
    setSaving(true);
    setMessage("");

    try {
      await updateProject({
        id: project.id,
        name,
        summary: description,
        status: listingStatus === "Closed" ? "done" : listingStatus === "Pending" ? "waiting" : "active",
        type: "listing",
        listingStatus,
        propertyType,
        address,
        city,
        state,
        zip,
        parcelId,
        acreage: numberOrUndefined(acreage),
        size: numberOrUndefined(size),
        frontageFeet: numberOrUndefined(frontageFeet),
        zoningDistrict,
        price: priceWithheld ? undefined : numberOrUndefined(price),
        priceWithheld,
        leaseRate,
        expenses,
        capRate,
        buildoutPropertyId,
        customListingUrl,
        offeringWebsiteUrl,
        useManualCoordinates,
        manualLatitude: numberOrUndefined(manualLatitude),
        manualLongitude: numberOrUndefined(manualLongitude),
        listingAgent,
        owner,
        ownerContact,
        description,
        marketingBlurb,
      });
      setMessage("Saved. Refreshing…");
      window.location.reload();
    } catch {
      setMessage("Could not save listing changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[1.3fr_0.7fr]">
        <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="Listing title" />
        <select value={listingStatus} onChange={(event) => setListingStatus(event.target.value as ListingStatus)} className={inputClass}>
          <option value="Pipeline">Pipeline</option>
          <option value="Active">Active</option>
          <option value="Pending">Pending</option>
          <option value="Closed">Closed</option>
        </select>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <input value={propertyType} onChange={(event) => setPropertyType(event.target.value)} className={inputClass} placeholder="Property type" />
        <select value={listingAgent} onChange={(event) => setListingAgent(event.target.value as ListingAgent)} className={inputClass}>
          <option value="Ryan">Ryan</option>
          <option value="Anthony">Anthony</option>
          <option value="Joel">Joel</option>
        </select>
      </div>
      <input value={address} onChange={(event) => setAddress(event.target.value)} className={inputClass} placeholder="Street address" />
      <div className="grid gap-4 md:grid-cols-3">
        <input value={city} onChange={(event) => setCity(event.target.value)} className={inputClass} placeholder="City" />
        <input value={state} onChange={(event) => setState(event.target.value)} className={inputClass} placeholder="State" />
        <input value={zip} onChange={(event) => setZip(event.target.value)} className={inputClass} placeholder="Zip" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <input value={parcelId} onChange={(event) => setParcelId(event.target.value)} className={inputClass} placeholder="Parcel ID / APN" />
        <input value={acreage} onChange={(event) => setAcreage(event.target.value)} className={inputClass} placeholder="Acreage" />
        <input value={size} onChange={(event) => setSize(event.target.value)} className={inputClass} placeholder="Building SF" />
        <input value={frontageFeet} onChange={(event) => setFrontageFeet(event.target.value)} className={inputClass} placeholder="Frontage feet" />
      </div>
      <input value={zoningDistrict} onChange={(event) => setZoningDistrict(event.target.value)} className={inputClass} placeholder="Zoning" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <input value={price} onChange={(event) => setPrice(event.target.value)} className={inputClass} placeholder="Offering price" disabled={priceWithheld} />
        <input value={leaseRate} onChange={(event) => setLeaseRate(event.target.value)} className={inputClass} placeholder="Lease rate" />
        <input value={expenses} onChange={(event) => setExpenses(event.target.value)} className={inputClass} placeholder="Expenses / NNN" />
        <input value={capRate} onChange={(event) => setCapRate(event.target.value)} className={inputClass} placeholder="Cap rate" />
      </div>
      <label className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        <input type="checkbox" checked={priceWithheld} onChange={(event) => setPriceWithheld(event.target.checked)} className="h-4 w-4 accent-[#CB521E]" />
        Price withheld
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <input value={buildoutPropertyId} onChange={(event) => setBuildoutPropertyId(event.target.value)} className={inputClass} placeholder="Buildout property ID" />
        <input value={customListingUrl} onChange={(event) => setCustomListingUrl(event.target.value)} className={inputClass} placeholder="Custom listing URL" />
      </div>
      <input value={offeringWebsiteUrl} onChange={(event) => setOfferingWebsiteUrl(event.target.value)} className={inputClass} placeholder="Offering Website URL" />
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <label className="flex items-center gap-3 text-sm font-semibold text-zinc-800">
          <input type="checkbox" checked={useManualCoordinates} onChange={(event) => setUseManualCoordinates(event.target.checked)} className="h-4 w-4 accent-[#CB521E]" />
          Use Manual Coordinates
        </label>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <input value={manualLatitude} onChange={(event) => setManualLatitude(event.target.value)} className={inputClass} placeholder="Latitude" inputMode="decimal" />
          <input value={manualLongitude} onChange={(event) => setManualLongitude(event.target.value)} className={inputClass} placeholder="Longitude" inputMode="decimal" />
        </div>
      </div>
      <input value={owner} onChange={(event) => setOwner(event.target.value)} className={inputClass} placeholder="Owner / seller" />
      <textarea value={ownerContact} onChange={(event) => setOwnerContact(event.target.value)} className={textareaClass} placeholder="Private owner contact" />
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} className={textareaClass} placeholder="Internal description" />
      <textarea value={marketingBlurb} onChange={(event) => setMarketingBlurb(event.target.value)} className={textareaClass} placeholder="Market-facing blurb" />
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={handleSave} disabled={saving || !name.trim()} className="rounded-xl bg-[#CB521E] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#a94318] disabled:opacity-50">
          {saving ? "Saving…" : "Save listing changes"}
        </button>
        {message ? <span className="text-sm text-zinc-600">{message}</span> : null}
      </div>
    </div>
  );
}
