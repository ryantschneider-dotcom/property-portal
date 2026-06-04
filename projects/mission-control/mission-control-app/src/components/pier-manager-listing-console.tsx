"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { buildBrokerHubIntakePayload, type BrokerHubIntakeInput, type BrokerHubSuiteInput, type BrokerHubTransactionType } from "@/lib/pier-manager-intake";
import { type PropertyPortalActiveListing } from "@/lib/property-portal-client";
import type { BrokerReviewDraft } from "@/lib/property-portal-ai";

const inputClass = "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#CB521E]/50 focus:ring-2 focus:ring-[#CB521E]/10";
const textareaClass = `${inputClass} min-h-[110px]`;
const cardClass = "rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm";
const requiredFields = ["Street Address", "City", "State", "County", "Parcel ID", "Property Type", "Lead Broker", "Hero Photo"];
const counties = ["Chatham", "Bryan", "Effingham", "Liberty", "Jasper", "Beaufort", "Charleston", "Other"];
const propertyTypes = ["Retail", "Industrial", "Office", "Flex", "Land", "Multifamily", "Mixed-Use", "Hospitality", "Special Purpose"];
const brokers = ["Ryan T. Schneider", "Anthony", "Joel", "Other PIER Broker"];
const rentTypes = ["NNN", "Modified Gross", "Full Service", "Gross", "Monthly", "Call for details"];

type IntakeFormState = Omit<BrokerHubIntakeInput, "heroPhotoCount" | "suites">;

function fileListToArray(files: FileList | null) {
  return files ? Array.from(files) : [];
}

function createSuite(): BrokerHubSuiteInput {
  return { suiteNumber: "", availableSqFt: "", baseRent: "", rentType: "NNN", unpriced: false };
}

function requiredLabel(label: string, required = true) {
  return (
    <span className="text-sm font-semibold text-zinc-800">
      {label} {required ? <span className="text-[#CB521E]">*</span> : <span className="text-xs font-normal text-zinc-400">optional</span>}
    </span>
  );
}

async function parseJsonResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data.error ?? "Property portal request failed."));
  return data;
}

function reviewChecklistItems(items: string[]) {
  return items.length ? items : ["No items flagged yet."];
}

function renderChecklistColumn(title: string, items: string[], tone: "good" | "warn" | "bad" | "ready") {
  const toneClass = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    bad: "border-rose-200 bg-rose-50 text-rose-900",
    ready: "border-sky-200 bg-sky-50 text-sky-900",
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <h5 className="text-sm font-semibold">{title}</h5>
      <ul className="mt-3 space-y-2 text-sm">
        {reviewChecklistItems(items).map((item) => <li key={`${title}-${item}`}>• {item}</li>)}
      </ul>
    </div>
  );
}

function compactJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
}

function defaultReviewChecklist() {
  return {
    autoFilled: [] as string[],
    needsManualInput: [] as string[],
    failedScrapes: [] as string[],
    listingStreamReady: [] as string[],
  };
}

function getDraftReviewChecklist(draft: BrokerReviewDraft) {
  const review: Record<string, unknown> = isRecord(draft.review) ? draft.review : {};
  const checklist: Record<string, unknown> = isRecord(review.checklist) ? review.checklist : {};
  return {
    autoFilled: normalizeStringList(checklist.autoFilled),
    needsManualInput: normalizeStringList(checklist.needsManualInput),
    failedScrapes: normalizeStringList(checklist.failedScrapes),
    listingStreamReady: normalizeStringList(checklist.listingStreamReady),
  };
}

function getDraftRevisionCount(draft: BrokerReviewDraft) {
  const review: Record<string, unknown> = isRecord(draft.review) ? draft.review : {};
  return typeof review.revisionCount === "number" ? review.revisionCount : 0;
}

type AssessorReviewField = {
  key: "yearBuilt" | "totalSqFt" | "lotSize" | "zoning";
  label: string;
  placeholder: string;
};

const assessorReviewFields: AssessorReviewField[] = [
  { key: "yearBuilt", label: "Year Built", placeholder: "Example: 1987" },
  { key: "totalSqFt", label: "Total Sq. Ft.", placeholder: "Example: 12,500 SF" },
  { key: "lotSize", label: "Lot Size", placeholder: "Example: 1.24 AC" },
  { key: "zoning", label: "Zoning", placeholder: "Example: B-C / commercial" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readPathValue(source: unknown, path: string[]) {
  let current = source;
  for (const key of path) {
    if (!isRecord(current)) return "";
    current = current[key];
  }
  return typeof current === "string" || typeof current === "number" ? String(current) : "";
}

function getAssessorFieldValue(draft: BrokerReviewDraft, key: AssessorReviewField["key"]) {
  const pathCandidates: Record<AssessorReviewField["key"], string[][]> = {
    yearBuilt: [["property", "yearBuilt"], ["property", "building", "yearBuilt"], ["yearBuilt"]],
    totalSqFt: [["property", "totalSqFt"], ["property", "totalSquareFeet"], ["property", "buildingSize"], ["property", "buildingSqFt"], ["totalSqFt"]],
    lotSize: [["property", "lotSize"], ["property", "lotSizeAcres"], ["property", "landSize"], ["lotSize"]],
    zoning: [["property", "zoning"], ["zoning"]],
  };

  for (const source of [draft.structuredUpdates, draft.sourceInput, draft.currentListing]) {
    for (const path of pathCandidates[key]) {
      const value = readPathValue(source, path);
      if (value) return value;
    }
  }
  return "";
}

function getListingSelectionValue(listing: PropertyPortalActiveListing) {
  return listing.slug || listing.id;
}

function getListingSearchLabel(listing: PropertyPortalActiveListing) {
  const primary = listing.address || listing.title || listing.slug || listing.id;
  const titleSuffix = listing.title && listing.title !== primary ? ` — ${listing.title}` : "";
  const transactionSuffix = listing.transactionLabel ? ` — ${listing.transactionLabel}` : "";
  return `${primary}${titleSuffix}${transactionSuffix}`;
}

function searchableListingText(listing: PropertyPortalActiveListing) {
  return [listing.address, listing.title, listing.slug, listing.id, listing.transactionLabel].filter(Boolean).join(" ").toLowerCase();
}

const initialIntakeState: IntakeFormState = {
  addressStreet: "",
  city: "Savannah",
  state: "GA",
  county: "Chatham",
  parcelId: "",
  propertyType: "Retail",
  leadBroker: "Ryan T. Schneider",
  transactionType: "Sale",
  salePrice: "",
  saleUnpriced: false,
  listingTitle: "",
  propertyDescription: "",
  neighborhoodDescription: "",
  areaBusinesses: "",
  roadwaysTransportation: "",
  bulletPoints: "",
  notes: "",
};

export function PierManagerListingConsole() {
  const [intakeForm, setIntakeForm] = useState<IntakeFormState>(initialIntakeState);
  const [suites, setSuites] = useState<BrokerHubSuiteInput[]>([createSuite()]);
  const [heroPhoto, setHeroPhoto] = useState<File | null>(null);
  const [intakeAssets, setIntakeAssets] = useState<File[]>([]);
  const [intakeStatus, setIntakeStatus] = useState("Ready for Broker Hub intake — launch a listing that already feels half-finished.");
  const [intakeSubmitting, setIntakeSubmitting] = useState(false);

  const [activeListings, setActiveListings] = useState<PropertyPortalActiveListing[]>([]);
  const [activeListingsStatus, setActiveListingsStatus] = useState("Loading active listings from property-portal…");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [listingSearchText, setListingSearchText] = useState("");
  const [modificationInstructions, setModificationInstructions] = useState("");
  const [modificationAssets, setModificationAssets] = useState<File[]>([]);
  const [modificationStatus, setModificationStatus] = useState("Select an active ListingStream property and describe the change in plain English.");
  const [modificationSubmitting, setModificationSubmitting] = useState(false);

  const [reviewDraft, setReviewDraft] = useState<BrokerReviewDraft | null>(null);
  const [revisionFeedback, setRevisionFeedback] = useState("");
  const [reviewStatus, setReviewStatus] = useState("No AI draft ready yet.");
  const [toastMessage, setToastMessage] = useState("");
  const [draftPreviewUrl, setDraftPreviewUrl] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/property-portal/active-listings", { cache: "no-store" })
      .then(parseJsonResponse)
      .then((data) => {
        if (cancelled) return;
        const items = Array.isArray(data.items) ? (data.items as PropertyPortalActiveListing[]) : [];
        setActiveListings(items);
        setActiveListingsStatus(items.length ? `${items.length} active ListingStream listings loaded from property-portal.` : "No active property-portal listings returned yet.");
      })
      .catch((error) => {
        if (!cancelled) setActiveListingsStatus(error instanceof Error ? error.message : "Could not load active listings.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isSale = intakeForm.transactionType === "Sale";
  const isLease = intakeForm.transactionType === "Lease";
  const selectedListing = useMemo(() => activeListings.find((item) => item.id === selectedPropertyId || item.slug === selectedPropertyId), [activeListings, selectedPropertyId]);
  const filteredAddressListings = useMemo(() => {
    const query = listingSearchText.trim().toLowerCase();
    const matches = query ? activeListings.filter((listing) => searchableListingText(listing).includes(query)) : activeListings;
    return matches.slice(0, 8);
  }, [activeListings, listingSearchText]);
  const intakeRequiredSummary = useMemo(() => [...requiredFields, isSale ? "Sale Price or Unpriced / Inquire" : "At least one complete suite row"].join(" · "), [isSale]);

  function selectActiveListing(value: string) {
    setSelectedPropertyId(value);
    const listing = activeListings.find((item) => item.id === value || item.slug === value);
    if (listing) setListingSearchText(getListingSearchLabel(listing));
  }

  function updateListingSearch(value: string) {
    setListingSearchText(value);
    const normalized = value.trim().toLowerCase();
    const exactMatch = activeListings.find((listing) => getListingSearchLabel(listing).toLowerCase() === normalized || listing.address?.toLowerCase() === normalized || listing.title?.toLowerCase() === normalized || listing.slug?.toLowerCase() === normalized);
    if (exactMatch) setSelectedPropertyId(getListingSelectionValue(exactMatch));
  }

  function updateIntake<K extends keyof IntakeFormState>(key: K, value: IntakeFormState[K]) {
    setIntakeForm((current) => ({ ...current, [key]: value }));
  }

  function updateSuite(index: number, patch: Partial<BrokerHubSuiteInput>) {
    setSuites((current) => current.map((suite, suiteIndex) => (suiteIndex === index ? { ...suite, ...patch } : suite)));
  }

  function updateDraftAssessorField(key: AssessorReviewField["key"], value: string) {
    setReviewDraft((current) => {
      if (!current) return current;
      const structuredUpdates = { ...current.structuredUpdates };
      const property = isRecord(structuredUpdates.property) ? { ...structuredUpdates.property } : {};
      property[key] = value;
      structuredUpdates.property = property;

      const checklist = getDraftReviewChecklist(current);
      const listingStreamReady = checklist.listingStreamReady.includes(key)
        ? checklist.listingStreamReady
        : [...checklist.listingStreamReady, key];

      return {
        ...current,
        structuredUpdates,
        review: {
          ...current.review,
          checklist: {
            ...checklist,
            listingStreamReady,
          },
        },
      };
    });
  }

  async function submitBrokerHubIntake(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIntakeSubmitting(true);
    setIntakeStatus("AI is analyzing property data... Drafting premium marketing copy, assessor/parcel gaps, and location intelligence...");
    try {
      const input = buildBrokerHubIntakePayload({ ...intakeForm, suites, heroPhotoCount: heroPhoto ? 1 : 0 });
      const response = await fetch("/api/property-portal/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "new-listing", input }),
      });
      const data = (await parseJsonResponse(response)) as { draft: BrokerReviewDraft };
      setReviewDraft(data.draft);
      setReviewStatus(`Review Draft ready for ${data.draft.title}. Hero photo and media stay staged until approval.`);
      setIntakeStatus(`AI enrichment draft ready for broker review. ${[heroPhoto, ...intakeAssets].filter(Boolean).length} media file(s) staged.`);
    } catch (error) {
      setIntakeStatus(error instanceof Error ? error.message : "Could not generate listing review draft.");
    } finally {
      setIntakeSubmitting(false);
    }
  }

  async function submitModification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModificationSubmitting(true);
    setModificationStatus("AI is analyzing property data... Fetching the current portal payload and drafting premium marketing copy from your delta...");
    try {
      const response = await fetch("/api/property-portal/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "modification", propertyIdOrSlug: selectedPropertyId, instructions: modificationInstructions.trim() }),
      });
      const data = (await parseJsonResponse(response)) as { draft: BrokerReviewDraft };
      setReviewDraft(data.draft);
      setReviewStatus(`Review Draft ready for modification. ${modificationAssets.length} media/document file(s) staged for the portal update.`);
      setModificationStatus("AI delta draft ready for broker review; nothing has been published yet.");
    } catch (error) {
      setModificationStatus(error instanceof Error ? error.message : "Could not generate listing modification draft.");
    } finally {
      setModificationSubmitting(false);
    }
  }

  async function reviseDraft() {
    if (!reviewDraft || !revisionFeedback.trim()) return;
    setReviewBusy(true);
    setReviewStatus("Hermes is revising the draft from broker feedback…");
    try {
      const response = await fetch("/api/property-portal/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "revise", draft: reviewDraft, feedback: revisionFeedback.trim() }),
      });
      const data = (await parseJsonResponse(response)) as { draft: BrokerReviewDraft };
      setReviewDraft(data.draft);
      setRevisionFeedback("");
      setReviewStatus(`Revised draft ready. Revision count: ${getDraftRevisionCount(data.draft)}.`);
    } catch (error) {
      setReviewStatus(error instanceof Error ? error.message : "Could not revise draft.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function publishDraft(mode: "draft-preview" | "publish-live") {
    if (!reviewDraft) return;
    setReviewBusy(true);
    setToastMessage("");
    setDraftPreviewUrl("");
    setReviewStatus(mode === "draft-preview"
      ? "Saving ListingStream draft preview... Ascendix will be bypassed for this safety test."
      : "Uploading staged photos, flyers, and documents... Publishing live and syncing Ascendix...");
    try {
      const formData = new FormData();
      formData.set("draft", JSON.stringify(reviewDraft));
      formData.set("mode", mode);
      const stagedAssets = reviewDraft.kind === "new-listing" ? [heroPhoto, ...intakeAssets].filter((asset): asset is File => Boolean(asset)) : modificationAssets;
      for (const asset of stagedAssets) formData.append("assets", asset);
      const response = await fetch("/api/property-portal/approve-draft", {
        method: "POST",
        body: formData,
      });
      const result = await parseJsonResponse(response) as { previewUrl?: string; launch?: { previewUrl?: string; result?: { previewUrl?: string } } };
      if (mode === "draft-preview") {
        const previewUrl = result.previewUrl || result.launch?.previewUrl || result.launch?.result?.previewUrl;
        setDraftPreviewUrl(previewUrl || "");
        const message = "Listing saved as draft preview. Ascendix was not touched.";
        setToastMessage(previewUrl ? `${message} Preview URL is ready below.` : `${message} Preview URL was not returned; check the dropdown for the saved draft.`);
        setReviewStatus(`${message} ${previewUrl ? `Open the Draft Preview link: ${previewUrl}` : "No preview URL came back from property-portal."} It is hidden from the public grid until Make Live / Approve & Publish Live.`);
      } else {
        const message = "Listing successfully approved and published to the property-portal live ListingStream path, then queued/synced to Ascendix.";
        setToastMessage(message);
        setReviewStatus(`${message} WordPress was not involved.`);
      }
      fetch("/api/property-portal/active-listings", { cache: "no-store" }).then(parseJsonResponse).then((data) => {
        const items = Array.isArray(data.items) ? (data.items as PropertyPortalActiveListing[]) : [];
        setActiveListings(items);
      }).catch(() => undefined);
    } catch (error) {
      setReviewStatus(error instanceof Error ? error.message : "Could not publish draft.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function runDraftLifecycle(action: "delete-draft" | "make-live") {
    if (!selectedPropertyId) return;
    setReviewBusy(true);
    setModificationStatus(action === "delete-draft" ? "Deleting draft from Firestore..." : "Making draft live and triggering Ascendix sync...");
    try {
      const response = await fetch("/api/property-portal/approve-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, propertyIdOrSlug: selectedPropertyId }),
      });
      await parseJsonResponse(response);
      const data = await parseJsonResponse(await fetch("/api/property-portal/active-listings", { cache: "no-store" }));
      const items = Array.isArray(data.items) ? (data.items as PropertyPortalActiveListing[]) : [];
      setActiveListings(items);
      setSelectedPropertyId(items[0]?.slug || items[0]?.id || "");
      setModificationStatus(action === "delete-draft" ? "Draft deleted from Firestore. Ascendix was not touched." : "Draft is now live. Ascendix sync has fired through the live path.");
    } catch (error) {
      setModificationStatus(error instanceof Error ? error.message : "Could not update draft lifecycle.");
    } finally {
      setReviewBusy(false);
    }
  }

  const reviewChecklist = reviewDraft ? getDraftReviewChecklist(reviewDraft) : defaultReviewChecklist();

  return (
    <div className="space-y-6">
      {toastMessage ? (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-800 shadow-sm">
          {toastMessage}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <div data-testid="broker-hub-premium-header" className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(203,82,30,0.22),transparent_34%),linear-gradient(135deg,#111827_0%,#172033_58%,#263245_100%)] p-5 text-white shadow-[0_22px_70px_rgba(15,23,42,0.22)] lg:col-span-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-zinc-400">PIER Broker Hub</p>
          <h3 className="mt-2 text-2xl font-extrabold tracking-[-0.04em] text-white">Launch a listing that already feels half-finished.</h3>
          <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-zinc-300">
            Brokers enter the deal facts they know, attach a hero photo, and leave the repetitive public-record, location intelligence, and premium copy work to The PIER Commercial Big Brain before review.
          </p>
        </div>
        <div className="rounded-[1.35rem] border border-zinc-950 bg-zinc-950 p-5 text-white shadow-[0_18px_60px_rgba(15,23,42,0.22)]">
          <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#f6a87f]">Minimum to submit</p>
          <p className="mt-3 text-sm leading-6 text-zinc-300">{intakeRequiredSummary}</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[1.2rem] border border-[color:rgba(217,119,6,0.16)] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#CB521E]">The PIER Big Brain is Working</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-zinc-950">Leave the repetitive parts to me.</h3>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-zinc-700">
            <li>• Public-record scrape for parcel, lot, building size, year built, and zoning</li>
            <li>• Property-portal payload lookup for active listing modifications</li>
            <li>• Draft title, descriptions, bullet points, and structured deltas where you leave blanks</li>
          </ul>
        </div>
        <div className="rounded-[1.2rem] border border-zinc-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-zinc-500">Broker Note</p>
          <p className="mt-2 text-sm leading-7 text-zinc-700">
            Use the left form to launch a brand-new listing. Use the right form when a listing is already active and you only need a broker delta — price changes, suite availability, fresh photos, or corrected property details.
          </p>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <form onSubmit={submitBrokerHubIntake} className={`${cardClass} space-y-6`}>
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#CB521E]">New Listing Intake</p>
            <h3 className="mt-2 text-xl font-semibold text-zinc-950">Broker Hub structure → AI enrichment review</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">Required fields keep the launch grounded. Optional narrative seeds let brokers add nuance without slowing down.</p>
          </div>

          <section className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">1. Property basics</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">{requiredLabel("Street Address")}<input value={intakeForm.addressStreet} onChange={(event) => updateIntake("addressStreet", event.target.value)} className={inputClass} required /></label>
              <label className="space-y-2">{requiredLabel("City")}<input value={intakeForm.city} onChange={(event) => updateIntake("city", event.target.value)} className={inputClass} required /></label>
              <label className="space-y-2">{requiredLabel("State")}<select value={intakeForm.state} onChange={(event) => updateIntake("state", event.target.value)} className={inputClass} required><option value="GA">GA</option><option value="SC">SC</option></select></label>
              <label className="space-y-2">{requiredLabel("County")}<select value={intakeForm.county} onChange={(event) => updateIntake("county", event.target.value)} className={inputClass} required>{counties.map((county) => <option key={county}>{county}</option>)}</select></label>
              <label className="space-y-2">{requiredLabel("Parcel ID")}<input value={intakeForm.parcelId} onChange={(event) => updateIntake("parcelId", event.target.value)} className={inputClass} required /></label>
              <label className="space-y-2">{requiredLabel("Property Type")}<select value={intakeForm.propertyType} onChange={(event) => updateIntake("propertyType", event.target.value)} className={inputClass} required>{propertyTypes.map((propertyType) => <option key={propertyType}>{propertyType}</option>)}</select></label>
              <label className="space-y-2">{requiredLabel("Lead Broker")}<select value={intakeForm.leadBroker} onChange={(event) => updateIntake("leadBroker", event.target.value)} className={inputClass} required>{brokers.map((broker) => <option key={broker}>{broker}</option>)}</select></label>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">2. Deal structure</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["Sale", "Lease"] as BrokerHubTransactionType[]).map((type) => (
                <button key={type} type="button" onClick={() => updateIntake("transactionType", type)} className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${intakeForm.transactionType === type ? "border-[#CB521E] bg-[#CB521E]/10 text-[#CB521E]" : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-[#CB521E]/40"}`}>
                  For {type}
                </button>
              ))}
            </div>

            {isSale ? (
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <label className="space-y-2">{requiredLabel("Sale Price", !intakeForm.saleUnpriced)}<input value={intakeForm.salePrice} onChange={(event) => updateIntake("salePrice", event.target.value)} className={inputClass} disabled={Boolean(intakeForm.saleUnpriced)} required={!intakeForm.saleUnpriced} placeholder="$ amount" /></label>
                <label className="mt-7 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700"><input type="checkbox" checked={Boolean(intakeForm.saleUnpriced)} onChange={(event) => updateIntake("saleUnpriced", event.target.checked)} className="h-4 w-4 accent-[#CB521E]" />Unpriced / Inquire</label>
              </div>
            ) : null}

            {isLease ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-zinc-600">Each lease listing needs at least one complete suite row.</p>
                  <button type="button" onClick={() => setSuites((current) => [...current, createSuite()])} className="rounded-xl border border-[#CB521E] px-4 py-2 text-sm font-semibold text-[#CB521E]">+ Add suite</button>
                </div>
                {suites.map((suite, index) => (
                  <div key={index} className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-5">
                    <label className="space-y-2">{requiredLabel("Suite #")}<input value={suite.suiteNumber} onChange={(event) => updateSuite(index, { suiteNumber: event.target.value })} className={inputClass} required={index === 0} /></label>
                    <label className="space-y-2">{requiredLabel("Suite size")}<input value={suite.availableSqFt} onChange={(event) => updateSuite(index, { availableSqFt: event.target.value })} className={inputClass} required={index === 0} placeholder="SF" /></label>
                    <label className="space-y-2">{requiredLabel("Base rent", !suite.unpriced)}<input value={suite.baseRent} onChange={(event) => updateSuite(index, { baseRent: event.target.value })} className={inputClass} disabled={Boolean(suite.unpriced)} required={index === 0 && !suite.unpriced} /></label>
                    <label className="space-y-2">{requiredLabel("Rent type")}<select value={suite.rentType} onChange={(event) => updateSuite(index, { rentType: event.target.value })} className={inputClass} required={index === 0}>{rentTypes.map((rentType) => <option key={rentType}>{rentType}</option>)}</select></label>
                    <label className="mt-7 flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-700"><input type="checkbox" checked={Boolean(suite.unpriced)} onChange={(event) => updateSuite(index, { unpriced: event.target.checked })} className="h-4 w-4 accent-[#CB521E]" />Unpriced</label>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">3. Optional narrative seeds</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">{requiredLabel("Listing Title", false)}<input value={intakeForm.listingTitle} onChange={(event) => updateIntake("listingTitle", event.target.value)} className={inputClass} placeholder="Optional custom title" /></label>
              <label className="space-y-2">{requiredLabel("Property description", false)}<textarea value={intakeForm.propertyDescription} onChange={(event) => updateIntake("propertyDescription", event.target.value)} className={textareaClass} /></label>
              <label className="space-y-2">{requiredLabel("Neighborhood", false)}<textarea value={intakeForm.neighborhoodDescription} onChange={(event) => updateIntake("neighborhoodDescription", event.target.value)} className={textareaClass} /></label>
              <label className="space-y-2">{requiredLabel("Area businesses / retail", false)}<textarea value={intakeForm.areaBusinesses} onChange={(event) => updateIntake("areaBusinesses", event.target.value)} className={textareaClass} /></label>
              <label className="space-y-2">{requiredLabel("Roadways / transportation", false)}<textarea value={intakeForm.roadwaysTransportation} onChange={(event) => updateIntake("roadwaysTransportation", event.target.value)} className={textareaClass} /></label>
              <label className="space-y-2">{requiredLabel("Bullet points", false)}<textarea value={intakeForm.bulletPoints} onChange={(event) => updateIntake("bulletPoints", event.target.value)} className={textareaClass} placeholder="One per line" /></label>
              <label className="space-y-2">{requiredLabel("General broker notes", false)}<textarea value={intakeForm.notes} onChange={(event) => updateIntake("notes", event.target.value)} className={textareaClass} /></label>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">4. Media</h4>
            <label className="space-y-2 block">{requiredLabel("Hero Photo")}<input type="file" accept="image/*" onChange={(event) => setHeroPhoto(fileListToArray(event.target.files)[0] ?? null)} className={inputClass} required /></label>
            <label className="space-y-2 block">{requiredLabel("Additional photos / flyers / documents", false)}<input type="file" multiple onChange={(event) => setIntakeAssets(fileListToArray(event.target.files))} className={inputClass} /></label>
          </section>

          <button disabled={intakeSubmitting} className="rounded-xl bg-[#CB521E] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#a94318] disabled:opacity-50">
            {intakeSubmitting ? "Drafting…" : "Generate Enriched Review Draft"}
          </button>
          <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">{intakeStatus}</p>
        </form>

        <form onSubmit={submitModification} className={`${cardClass} h-fit`}>
          <div className="mb-5">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#CB521E]">Existing Listing Modification</p>
            <h3 className="mt-2 text-xl font-semibold text-zinc-950">Active ListingStream property → plain-English edit</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">The PIER Commercial Big Brain fetches the current property-portal payload and applies only the broker delta.</p>
          </div>
          <div className="space-y-4">
            <label className="space-y-2 block">
              {requiredLabel("Find listing by address or name", false)}
              <input
                data-testid="listing-address-search"
                value={listingSearchText}
                onChange={(event) => updateListingSearch(event.target.value)}
                list="active-listing-address-options"
                className={inputClass}
                placeholder="Start entering address or property name"
                autoComplete="off"
              />
              <datalist id="active-listing-address-options">
                {filteredAddressListings.map((listing) => (
                  <option key={listing.id} value={getListingSearchLabel(listing)} />
                ))}
              </datalist>
            </label>
            <select value={selectedPropertyId} onChange={(event) => selectActiveListing(event.target.value)} className={inputClass} required>
              <option value="">Select active property-portal listing</option>
              {activeListings.map((listing) => (
                <option key={listing.id} value={getListingSelectionValue(listing)}>{listing.title || listing.address || listing.slug} {listing.transactionLabel ? `— ${listing.transactionLabel}` : ""}</option>
              ))}
            </select>
            {selectedListing ? <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">Selected: {selectedListing.address || selectedListing.slug}{selectedListing.publishStatus === "draft" ? " • Draft Preview" : ""}</p> : null}
            {selectedListing?.publishStatus === "draft" ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-950">Draft lifecycle controls</p>
                <p className="mt-1 text-sm text-amber-900">Draft listings are visible here and by direct preview URL, but hidden from the public website grid until made live.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedListing.previewUrl ? <a href={selectedListing.previewUrl} target="_blank" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900">Open Preview</a> : null}
                  <button type="button" onClick={() => runDraftLifecycle("delete-draft")} disabled={reviewBusy} className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">Delete Draft</button>
                  <button type="button" onClick={() => runDraftLifecycle("make-live")} disabled={reviewBusy} className="rounded-xl bg-[#CB521E] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Make Live</button>
                </div>
              </div>
            ) : null}
            <textarea value={modificationInstructions} onChange={(event) => setModificationInstructions(event.target.value)} className={textareaClass} placeholder={'Example: "Remove Suite 100 because it leased, add the new TPO roof, and drop the asking rate to $22/SF."'} required />
            <input type="file" multiple onChange={(event) => setModificationAssets(fileListToArray(event.target.files))} className={inputClass} />
            <button disabled={modificationSubmitting || !selectedPropertyId} className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50">
              {modificationSubmitting ? "Drafting…" : "Generate AI Delta Draft"}
            </button>
            <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">{activeListingsStatus}</p>
            <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">{modificationStatus}</p>
          </div>
        </form>
      </div>

      {reviewDraft ? (
        <section data-testid="review-draft-panel" className="rounded-3xl border border-[#CB521E]/30 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-[#CB521E]">Review Draft</p>
              <h3 className="mt-2 text-2xl font-semibold text-zinc-950">{reviewDraft.title}</h3>
              <p className="mt-2 text-sm text-zinc-500">{reviewDraft.kind === "new-listing" ? "New listing AI enrichment" : "Existing listing AI delta"} • {reviewDraft.status}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
              Review all assessor fields, checklist items, revision feedback, and payload preview before final approval.
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm leading-7 text-zinc-800" dangerouslySetInnerHTML={{ __html: reviewDraft.descriptionHtml }} />

          <div data-testid="broker-revise-loop" className="mt-6 rounded-3xl border border-[#CB521E]/25 bg-[#CB521E]/5 p-5">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#CB521E]">Plain-text revise loop</p>
            <h4 className="mt-2 text-lg font-semibold text-zinc-950">Send corrections back to Hermes before publishing</h4>
            <p className="mt-2 text-sm leading-6 text-zinc-700">Type broker feedback here to revise the draft copy or structured payload. This keeps review from becoming a forced publish screen.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <textarea value={revisionFeedback} onChange={(event) => setRevisionFeedback(event.target.value)} className={textareaClass} placeholder="Revise: type broker feedback for Hermes to process before approval" />
              <button type="button" onClick={reviseDraft} disabled={reviewBusy || !revisionFeedback.trim()} className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:border-[#CB521E]/40 hover:bg-[#CB521E]/5 disabled:opacity-50">Revise Draft</button>
            </div>
          </div>

          <div data-testid="assessor-data-fields" className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#CB521E]">Assessor Data Review</p>
            <h4 className="mt-2 text-lg font-semibold text-zinc-950">Editable public-record fields before publish</h4>
            <p className="mt-2 text-sm leading-6 text-amber-900">These fields always remain available for manual broker entry when assessor scrape or enrichment data is blank, partial, or wrong.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {assessorReviewFields.map((field) => (
                <label key={field.key} className="space-y-2">
                  {requiredLabel(field.label, false)}
                  <input
                    value={getAssessorFieldValue(reviewDraft, field.key)}
                    onChange={(event) => updateDraftAssessorField(field.key, event.target.value)}
                    className={inputClass}
                    placeholder={field.placeholder}
                  />
                </label>
              ))}
            </div>
          </div>

          {reviewDraft.highlights.length ? (
            <ul className="mt-5 grid gap-2 md:grid-cols-2">{reviewDraft.highlights.map((highlight) => <li key={highlight} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">{highlight}</li>)}</ul>
          ) : null}
          {reviewDraft.mediaNotes.length ? <p className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">Media notes: {reviewDraft.mediaNotes.join(" • ")}</p> : null}

          <div data-testid="review-checklist-panel" className="mt-6 rounded-3xl border border-zinc-200 bg-zinc-50 p-5">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#CB521E]">Review Checklist</p>
            <h4 className="mt-2 text-lg font-semibold text-zinc-950">Mack enrichment review</h4>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {renderChecklistColumn("Auto-filled", reviewChecklist.autoFilled, "good")}
              {renderChecklistColumn("Needs manual input", reviewChecklist.needsManualInput, "warn")}
              {renderChecklistColumn("Failed / blocked scrapes", reviewChecklist.failedScrapes, "bad")}
              {renderChecklistColumn("ListingStream-ready", reviewChecklist.listingStreamReady, "ready")}
            </div>
          </div>

          {reviewDraft.kind === "modification" && reviewDraft.review.deltaPreview ? (
            <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.28em] text-[#CB521E]">Before / After Delta</p>
                  <h4 className="mt-2 text-lg font-semibold text-zinc-950">Natural-language structured changes</h4>
                </div>
                {reviewDraft.review.interpreter ? <p className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">Interpreter Confidence: {reviewDraft.review.interpreter.confidence}</p> : null}
              </div>
              {reviewDraft.review.interpreter?.summary.length ? (
                <ul className="mt-4 grid gap-2 md:grid-cols-2">{reviewDraft.review.interpreter.summary.map((item) => <li key={item} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{item}</li>)}</ul>
              ) : null}
              {reviewDraft.review.interpreter?.flags.length ? (
                <ul className="mt-4 grid gap-2 md:grid-cols-2">{reviewDraft.review.interpreter.flags.map((item) => <li key={item} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{item}</li>)}</ul>
              ) : null}
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <h5 className="text-sm font-semibold text-zinc-900">Before</h5>
                  <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-zinc-700">{compactJson(reviewDraft.review.deltaPreview.before)}</pre>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <h5 className="text-sm font-semibold text-zinc-900">After</h5>
                  <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-zinc-700">{compactJson(reviewDraft.review.deltaPreview.after)}</pre>
                </div>
              </div>
            </div>
          ) : null}

          <details data-testid="payload-preview" className="mt-5 rounded-3xl border border-zinc-200 bg-zinc-950 p-5 text-white" open>
            <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.18em] text-[#f6a87f]">Full data payload preview</summary>
            <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl bg-black/30 p-4 text-xs leading-5 text-zinc-200">{compactJson(reviewDraft)}</pre>
          </details>

          <div data-testid="final-publish-actions" className="mt-5 rounded-3xl border border-[#CB521E]/30 bg-white p-5">
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#CB521E]">Final approval after payload review</p>
            <h4 className="mt-2 text-lg font-semibold text-zinc-950">Save a hidden preview or publish live</h4>
            <p className="mt-2 text-sm leading-6 text-zinc-600">Use Draft Preview for safe review without Ascendix. Use Approve & Publish Live only after the checklist, manual assessor data, and payload preview are correct.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => publishDraft("draft-preview")} disabled={reviewBusy} className="rounded-xl border border-[#CB521E] bg-white px-5 py-3 text-sm font-semibold text-[#CB521E] transition hover:bg-[#CB521E]/5 disabled:opacity-50">Save as Draft & Preview</button>
              <button type="button" onClick={() => publishDraft("publish-live")} disabled={reviewBusy} className="rounded-xl bg-[#CB521E] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#a94318] disabled:opacity-50">Approve & Publish Live</button>
            </div>
          </div>

          {draftPreviewUrl ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <p className="font-semibold">Draft preview saved successfully.</p>
              <a href={draftPreviewUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex rounded-xl bg-[#CB521E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a94318]">Open Draft Preview</a>
              <p className="mt-2 break-all text-xs">{draftPreviewUrl}</p>
            </div>
          ) : null}
          <p className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">{reviewStatus}</p>
        </section>
      ) : null}
    </div>
  );
}
