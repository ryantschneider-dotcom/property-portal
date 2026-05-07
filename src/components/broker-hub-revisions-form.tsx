"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ListingOption = {
  id: string;
  slug: string;
  title: string;
  address: string | null;
  transactionLabel: string | null;
  ownerEmail: string | null;
};

function inputClassName() {
  return "w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-950";
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

  useEffect(() => {
    async function loadListings() {
      const response = await fetch("/api/broker/active-listings", { cache: "no-store" });
      const payload = await response.json();
      setListings(payload.items ?? []);
    }
    void loadListings();
  }, []);

  const filteredListings = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return listings;
    return listings.filter((item) => `${item.title} ${item.address ?? ""} ${item.slug}`.toLowerCase().includes(needle));
  }, [listings, query]);

  const selectedListing = listings.find((item) => item.id === selectedId) ?? null;

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
                return (
                  <button
                    key={listing.id}
                    type="button"
                    onClick={() => setSelectedId(listing.id)}
                    className={`mb-2 flex w-full flex-col rounded-2xl px-4 py-3 text-left transition last:mb-0 ${active ? "bg-zinc-950 text-white" : "bg-white text-zinc-900 hover:bg-zinc-100"}`}
                  >
                    <span className="text-sm font-semibold">{listing.title}</span>
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
              <div className="mt-3 space-y-2 text-sm text-zinc-700">
                <p className="text-lg font-semibold text-zinc-950">{selectedListing.title}</p>
                <p>{selectedListing.address || "No address on file"}</p>
                <p className="text-zinc-500">{selectedListing.transactionLabel || "No transaction label"}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">Choose a property from the search list.</p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-700">Revision Instructions</span>
          <textarea className={`${inputClassName()} min-h-40`} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Examples: Drop the price to $20/SF. Owner replaced the roof. Add the new drone photos and mention the fresh striping." required />
        </label>
      </section>

      <section className="rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold tracking-tight">Asset Upload</h3>
          <p className="text-sm text-zinc-500">Optional new photos or documents tied to the revision request.</p>
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
            {status === "idle" && "This logs the revision request onto the property record, stores any new assets, and keeps the change queue ready for the next update pass."}
            {status === "saving" && "Saving revision request…"}
            {status === "error" && (errorMessage ?? "Failed to save revision request.")}
            {status === "done" && "Revision request saved."}
          </p>
          <button type="submit" disabled={!selectedId || status === "saving"} className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-zinc-950 transition enabled:hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60">
            Submit Revision
          </button>
        </div>
      </section>
    </form>
  );
}
