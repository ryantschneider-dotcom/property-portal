export const dynamic = "force-dynamic";

import Link from "next/link";

import { listAdminProperties } from "@/lib/admin";
import { getPortalSession } from "@/lib/portal-session";
import { isAdminPortalRole } from "@/lib/users";

function displayValue(value: string | null | undefined, fallback = "—") {
  if (value == null || value === "") return fallback;
  return value;
}

function formatWorkflowStatus(value: string | null | undefined) {
  if (!value) return "Draft";
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function PropertiesDashboard() {
  const session = await getPortalSession();
  const properties = await listAdminProperties(session);
  const isBroker = session ? !isAdminPortalRole(session.role) : false;
  const archivedProperties = properties.filter((property) => property.workflowStatus === "archived");
  const activeProperties = properties.filter((property) => property.workflowStatus !== "archived");
  const readyForApproval = activeProperties.filter((property) => property.workflowStatus === "ready_for_approval");
  const inReview = activeProperties.filter((property) => property.workflowStatus === "review");
  const approved = activeProperties.filter((property) => property.workflowStatus === "approved");
  const changesRequested = activeProperties.filter((property) => property.workflowStatus === "needs_input" || property.approvalStatus === "rejected");
  const manualFollowUp = activeProperties.filter((property) => property.reviewState === "needs_manual_followup");
  const blocked = activeProperties.filter((property) => property.reviewState === "blocked");

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{isBroker ? "My Listings" : "Manage Inventory"}</h1>
          <p className="text-gray-500 mt-1">
            {isBroker ? "Your draft listings, review queue, and intake workspace." : "PIER Commercial internal listing control center."}
          </p>
        </div>

        <div className="w-full md:w-auto flex gap-2">
          {!isBroker ? (
            <Link
              href="/admin/exports"
              className="border border-zinc-300 bg-white text-zinc-900 px-4 py-2 rounded-lg hover:border-zinc-500 transition-colors font-medium whitespace-nowrap"
            >
              Export Console
            </Link>
          ) : null}
          <Link
            href="/admin/intake"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium whitespace-nowrap"
          >
            + New Listing
          </Link>
        </div>
      </div>

      {!isBroker && (readyForApproval.length || inReview.length || approved.length || manualFollowUp.length || blocked.length) ? (
        <div className="mb-8 grid gap-4 md:grid-cols-5">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Ready for approval</p>
            <p className="mt-2 text-3xl font-bold text-emerald-900">{readyForApproval.length}</p>
            <p className="mt-2 text-sm text-emerald-800">Drafts brokers have submitted for admin review.</p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">In review</p>
            <p className="mt-2 text-3xl font-bold text-blue-900">{inReview.length}</p>
            <p className="mt-2 text-sm text-blue-800">Drafts enriched and waiting on broker cleanup or final push.</p>
          </div>
          <div className="rounded-2xl border border-zinc-300 bg-zinc-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-700">Approved</p>
            <p className="mt-2 text-3xl font-bold text-zinc-900">{approved.length}</p>
            <p className="mt-2 text-sm text-zinc-800">Listings approved internally and ready for structured export/publish handoff.</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Manual follow-up</p>
            <p className="mt-2 text-3xl font-bold text-amber-900">{manualFollowUp.length}</p>
            <p className="mt-2 text-sm text-amber-800">Thin extractions that still need human cleanup before approval.</p>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">Blocked scrapes</p>
            <p className="mt-2 text-3xl font-bold text-red-900">{blocked.length}</p>
            <p className="mt-2 text-sm text-red-800">Drafts with blocked/error sources that need explicit intervention.</p>
          </div>
        </div>
      ) : null}

      {isBroker && changesRequested.length ? (
        <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Changes requested</p>
          <p className="mt-2 text-3xl font-bold text-amber-900">{changesRequested.length}</p>
          <p className="mt-2 text-sm text-amber-800">Admin sent draft{changesRequested.length === 1 ? "" : "s"} back for updates. Open the draft to read the note and make revisions.</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {activeProperties.map((property) => (
          <div
            key={property.id}
            className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
          >
            <div className="h-48 bg-gray-100 relative border-b border-gray-200 flex items-center justify-center overflow-hidden">
              {property.imageUrl ? (
                <img
                  src={property.imageUrl}
                  alt={displayValue(property.title, "Property image")}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-gray-400 text-sm">No Image</div>
              )}
              <div className="absolute top-2 right-2 bg-black/80 text-white text-xs font-bold px-2 py-1 rounded">
                {displayValue(property.transactionLabel, "N/A")}
              </div>
            </div>

            <div className="p-4 flex-grow flex flex-col">
              <h3 className="font-bold text-gray-900 line-clamp-2 min-h-[3rem]">
                {displayValue(property.title, "Untitled Property")}
              </h3>
              <p className="text-sm text-gray-500 mt-1 truncate">
                {displayValue(property.address, "No address listed")}
              </p>

              <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                <span className={`rounded-full px-2.5 py-1 ${property.workflowStatus === "needs_input" || property.approvalStatus === "rejected" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
                  {property.workflowStatus === "needs_input" || property.approvalStatus === "rejected" ? "Changes Requested" : formatWorkflowStatus(property.workflowStatus)}
                </span>
                {property.enrichmentStatus ? (
                  <span className={`rounded-full px-2.5 py-1 ${property.enrichmentStatus === "completed" ? "bg-emerald-50 text-emerald-700" : property.enrichmentStatus === "partial" ? "bg-amber-50 text-amber-700" : "bg-zinc-100 text-zinc-700"}`}>
                    Enrichment: {formatWorkflowStatus(property.enrichmentStatus)}
                  </span>
                ) : null}
                {property.countyRoutingSource ? (
                  <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-cyan-700">
                    {property.countyRoutingSource}{property.countyRoutingStatus ? ` · ${formatWorkflowStatus(property.countyRoutingStatus)}` : ""}
                  </span>
                ) : null}
                <span className={`rounded-full px-2.5 py-1 ${property.reviewState === "blocked" ? "bg-red-50 text-red-700" : property.reviewState === "needs_manual_followup" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {property.reviewState === "blocked" ? "Blocked scrape" : property.reviewState === "needs_manual_followup" ? "Needs manual follow-up" : "Review layer healthy"}
                </span>
                {property.missingFieldCount ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                    {property.missingFieldCount} missing field{property.missingFieldCount === 1 ? "" : "s"}
                  </span>
                ) : null}
                {property.blockedIssueCount ? (
                  <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">
                    {property.blockedIssueCount} blocked issue{property.blockedIssueCount === 1 ? "" : "s"}
                  </span>
                ) : null}
                <span className={`rounded-full px-2.5 py-1 ${property.buildoutReady ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-700"}`}>
                  {property.buildoutReady ? "Buildout-ready" : "Buildout pending"}
                </span>
                {!isBroker && property.ownerEmail && (
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">
                    {property.ownerEmail}
                  </span>
                )}
              </div>

              {(property.rejectionReason || property.decisionNote) && isBroker ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Admin note</p>
                  <p className="mt-2 line-clamp-4">{property.rejectionReason || property.decisionNote}</p>
                </div>
              ) : null}

              <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="block text-gray-400 text-xs uppercase tracking-wider">Zoning</span>
                  <span className="font-medium text-gray-900">{displayValue(property.zoning)}</span>
                </div>
                <div>
                  <span className="block text-gray-400 text-xs uppercase tracking-wider">Parcel</span>
                  <span className="font-medium text-gray-900">{displayValue(property.parcelId)}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100">
              <Link
                href={`/admin/properties/${property.id}/edit`}
                className={`block w-full rounded-lg border px-4 py-2 text-center text-sm font-semibold tracking-wide shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${property.workflowStatus === "ready_for_approval" ? "border-emerald-700 bg-emerald-600 !text-white hover:bg-emerald-700 focus:ring-emerald-700" : property.workflowStatus === "needs_input" || property.approvalStatus === "rejected" ? "border-amber-700 bg-amber-600 !text-white hover:bg-amber-700 focus:ring-amber-700" : "border-gray-900 bg-gray-900 !text-white hover:bg-black hover:!text-white focus:ring-gray-900"}`}
              >
                {property.workflowStatus === "ready_for_approval" ? "Review Submission" : property.workflowStatus === "needs_input" || property.approvalStatus === "rejected" ? "Review Changes" : "Edit Details"}
              </Link>
            </div>
          </div>
        ))}

        {activeProperties.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
            {isBroker ? "No listings yet. Start a new intake to create your first draft." : "No properties found."}
          </div>
        )}
      </div>

      {!isBroker && archivedProperties.length ? (
        <div className="mt-10 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Archived listings</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {archivedProperties.map((property) => (
              <Link key={`archived-${property.id}`} href={`/admin/properties/${property.id}/edit`} className="rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-400 hover:shadow-sm">
                <p className="font-semibold text-zinc-900">{displayValue(property.title, "Untitled Property")}</p>
                <p className="mt-1 text-sm text-zinc-500">{displayValue(property.address, "No address listed")}</p>
                <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-amber-700">Archived</p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
