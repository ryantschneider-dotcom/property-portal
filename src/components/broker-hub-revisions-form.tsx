"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ListingOption = {
  id: string;
  slug: string;
  title: string;
  address: string | null;
  transactionLabel: string | null;
  ownerEmail: string | null;
  reviewState: "ready" | "needs_manual_followup" | "blocked";
  missingFieldCount: number;
  blockedIssueCount: number;
  buildoutReady: boolean;
  enrichmentStatus: string | null;
  revisionWorkflow?: {
    currentRequest: {
      id: string | null;
      status: string | null;
      summary: string | null;
      createdAt: string | null;
      categories: Array<{
        code: string;
        title: string;
        severity: "warning" | "blocker";
        items: string[];
      }>;
    } | null;
    historyCount: number;
  };
};

function inputClassName() {
  return "w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-950";
}

function severityBadge(severity: "warning" | "blocker") {
  return severity === "blocker"
    ? "bg-rose-50 text-rose-700 border border-rose-200"
    : "bg-amber-50 text-amber-700 border border-amber-200";
}

export function BrokerHubRevisionsForm() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [listings, setListings] = useState<ListingOption[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "done">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadListings(preferredId?: string) {
    const response = await fetch("/api/broker/active-listings", { cache: "no-store" });
    const payload = await response.json();
    const nextListings = payload.items ?? [];
    setListings(nextListings);
    if (preferredId) {
      setSelectedId(preferredId);
    } else if (!selectedId && nextListings.find((item: ListingOption) => item.revisionWorkflow?.currentRequest)) {
      setSelectedId(nextListings.find((item: ListingOption) => item.revisionWorkflow?.currentRequest)?.id ?? "");
    }
  }

  useEffect(() => {
    void loadListings();
  }, []);

  const filteredListings = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const prioritized = [...listings].sort((a, b) => Number(Boolean(b.revisionWorkflow?.currentRequest)) - Number(Boolean(a.revisionWorkflow?.currentRequest)));
    if (!needle) return prioritized;
    return prioritized.filter((item) => `${item.title} ${item.address ?? ""} ${item.slug}`.toLowerCase().includes(needle));
  }, [listings, query]);

  const selectedListing = listings.find((item) => item.id === selectedId) ?? null;
  const currentRequest = selectedListing?.revisionWorkflow?.currentRequest ?? null;
  const blockerCategories = currentRequest?.categories.filter((category) => category.severity === "blocker") ?? [];
  const warningCategories = currentRequest?.categories.filter((category) => category.severity === "warning") ?? [];

  function addFiles(nextFiles: File[]) {
    setFiles((current) => {
      const existing = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      return [...current, ...nextFiles.filter((file) => !existing.has(`${file.name}-${file.size}-${file.lastModified}`))];
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setErrorMessage(null);

    try {
      const body = new FormData();
      body.set("propertyId", selectedId);
      body.set("instructions", instructions);
      files.forEach((file) => body.append("assets", file));

      const response = await fetch("/api/broker/revisions", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) {
        setStatus("error");
        setErrorMessage(payload.error ?? "Failed to save revision request.");
        return;
      }

      setStatus("done");
      setInstructions("");
      setFiles([]);
      await loadListings(selectedId);
    } catch (error) {
      console.error(error);
      setStatus("error");
      setErrorMessage("Failed to save revision request.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-700">Select Property</span>
              <input className={inputClassName()} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search active listings by title, address, or slug" />
            </label>
            <div className="max-h-80 overflow-y-auto rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-2">
              {filteredListings.map((listing) => {
                const active = listing.id === selectedId;
                const hasOpenRequest = Boolean(listing.revisionWorkflow?.currentRequest);
                return (
                  <button
                    key={listing.id}
                    type="button"
                    onClick={() => setSelectedId(listing.id)}
                    className={`mb-2 flex w-full flex-col rounded-2xl px-4 py-3 text-left transition last:mb-0 ${active ? "bg-zinc-950 text-white" : "bg-white text-zinc-900 hover:bg-zinc-100"}`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span>{listing.title}</span>
                      {hasOpenRequest ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${active ? "bg-amber-400 text-zinc-950" : "bg-amber-100 text-amber-700"}`}>Revision Requested</span> : null}
                    </span>
                    <span className={`mt-1 text-xs ${active ? "text-zinc-300" : "text-zinc-500"}`}>{listing.address || listing.slug}</span>
                  </button>
                );
              })}
              {filteredListings.length === 0 ? <p className="px-3 py-4 text-sm text-zinc-500">No active listings matched that search.</p> : null}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">Selected Listing</p>
            {selectedListing ? (
              <div className="mt-3 space-y-3 text-sm text-zinc-700">
                <div>
                  <p className="text-lg font-semibold text-zinc-950">{selectedListing.title}</p>
                  <p>{selectedListing.address || "No address on file"}</p>
                  <p className="text-zinc-500">{selectedListing.transactionLabel || "No transaction label"}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className={`rounded-full px-2.5 py-1 ${selectedListing.reviewState === "blocked" ? "bg-rose-50 text-rose-700" : selectedListing.reviewState === "needs_manual_followup" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {selectedListing.reviewState === "blocked" ? "Blocked scrape" : selectedListing.reviewState === "needs_manual_followup" ? "Needs manual follow-up" : "Review layer healthy"}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">Missing fields: {selectedListing.missingFieldCount}</span>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">Blocked issues: {selectedListing.blockedIssueCount}</span>
                  <span className={`rounded-full px-2.5 py-1 ${selectedListing.buildoutReady ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-700"}`}>
                    Buildout {selectedListing.buildoutReady ? "ready" : "pending"}
                  </span>
                </div>
                {currentRequest ? (
                  <div className="rounded-2xl border border-zinc-200 bg-white p-3 text-xs text-zinc-700">
                    <p className="font-semibold uppercase tracking-[0.18em] text-zinc-500">Current revision request</p>
                    <p className="mt-2 text-sm font-semibold text-zinc-900">{currentRequest.summary || "Admin requested revisions before approval."}</p>
                    <p className="mt-1">Status: <span className="font-semibold">{currentRequest.status || "open"}</span></p>
                    {currentRequest.createdAt ? <p className="mt-1">Requested: {currentRequest.createdAt}</p> : null}
                  </div>
                ) : (
                  <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-3 text-xs text-zinc-600">No active structured revision request on this draft right now.</p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">Choose a property from the search list.</p>
            )}
          </div>
        </div>
      </section>

      {currentRequest ? (
        <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">Admin send-back package</p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-zinc-950">Fix blockers first, then clear warnings</h3>
            <p className="mt-1 text-sm text-zinc-500">Blockers must be corrected before the draft can come back for approval. Warnings should still be addressed before you resubmit.</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-rose-900">Blockers</p>
                <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">Must fix</span>
              </div>
              <div className="mt-3 space-y-3">
                {blockerCategories.length ? blockerCategories.map((category) => (
                  <div key={`blocker-${category.code}`} className="rounded-2xl border border-white/70 bg-white/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-zinc-900">{category.title}</p>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${severityBadge(category.severity)}`}>{category.severity}</span>
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-700">
                      {category.items.map((item) => <li key={`${category.code}-${item}`}>{item}</li>)}
                    </ul>
                  </div>
                )) : <p className="text-sm text-rose-800">No blocker items listed.</p>}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-amber-900">Warnings</p>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Should fix</span>
              </div>
              <div className="mt-3 space-y-3">
                {warningCategories.length ? warningCategories.map((category) => (
                  <div key={`warning-${category.code}`} className="rounded-2xl border border-white/70 bg-white/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-zinc-900">{category.title}</p>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${severityBadge(category.severity)}`}>{category.severity}</span>
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-700">
                      {category.items.map((item) => <li key={`${category.code}-${item}`}>{item}</li>)}
                    </ul>
                  </div>
                )) : <p className="text-sm text-amber-800">No warning items listed.</p>}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-700">Revision response</span>
          <textarea className={`${inputClassName()} min-h-40`} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Explain what you corrected. Example: Updated sale price to $2,950,000, uploaded three current exterior photos, and confirmed zoning as B-C." required />
        </label>
      </section>

      <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold tracking-tight">Asset Upload</h3>
          <p className="text-sm text-zinc-500">Optional new photos or documents tied to the revision response.</p>
        </div>
        <div
          className={`mt-4 rounded-[2rem] border-2 border-dashed px-5 py-10 text-center transition ${dragActive ? "border-zinc-950 bg-zinc-100" : "border-zinc-300 bg-zinc-50"}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            addFiles(Array.from(event.dataTransfer.files ?? []));
          }}
        >
          <p className="text-sm font-medium text-zinc-700">Drop photos or PDFs here</p>
          <button type="button" onClick={() => inputRef.current?.click()} className="mt-5 inline-flex items-center rounded-2xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800">
            Choose Files
          </button>
          <input ref={inputRef} type="file" className="hidden" multiple accept="image/*,.pdf,application/pdf" onChange={(event) => addFiles(Array.from(event.target.files ?? []))} />
        </div>
        <div className="mt-4 space-y-2">
          {files.map((file) => (
            <div key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-zinc-900">{file.name}</p>
                <p className="text-xs text-zinc-500">{Math.max(1, Math.round(file.size / 1024))} KB</p>
              </div>
              <button type="button" onClick={() => setFiles((current) => current.filter((entry) => entry !== file))} className="text-sm font-semibold text-zinc-500 transition hover:text-red-600">
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-zinc-900 bg-zinc-950 p-5 text-white shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm text-zinc-200">
            {status === "idle" && "Submit revisions after the blocker items are fixed. This will mark the request as broker-updated and send it back for admin review."}
            {status === "saving" && "Submitting revisions…"}
            {status === "error" && (errorMessage ?? "Failed to save revision request.")}
            {status === "done" && "Revision response submitted and returned for admin review."}
          </p>
          <button type="submit" disabled={!selectedId || status === "saving" || !instructions.trim()} className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-zinc-950 transition enabled:hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60">
            Submit Revisions
          </button>
        </div>
      </section>
    </form>
  );
}
