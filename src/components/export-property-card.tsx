import Link from "next/link";

import { ExportConsoleActions } from "@/components/export-console-actions";
import type { ExportConsoleItem } from "@/lib/export-console";

function formatLabel(value: string | null | undefined, fallback = "—") {
  if (!value) return fallback;
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function ReasonPanel({
  title,
  reasons,
  tone,
  itemKey,
}: {
  title: string;
  reasons: string[];
  tone: "warning" | "failed";
  itemKey: string;
}) {
  const classes = tone === "failed"
    ? "border-red-200 bg-red-50 text-red-900"
    : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <div className={`mt-3 rounded-2xl border p-3 text-sm ${classes}`}>
      <p className="font-semibold">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {reasons.map((reason) => <li key={`${itemKey}-${title}-${reason}`}>{reason}</li>)}
      </ul>
    </div>
  );
}

export function ExportPropertyCard({ item }: { item: ExportConsoleItem }) {
  const canPublish = item.bucket === "ready";
  const canRetry = item.bucket === "failed";

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-zinc-950">{item.title}</h3>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-700">
              {formatLabel(item.bucket)}
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-700">
              Workflow: {formatLabel(item.exportWorkflowStatus, "Not Ready")}
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-700">
              Package: {formatLabel(item.launchPackageStatus, "Not Built")}
            </span>
          </div>

          <p className="mt-2 text-sm text-zinc-600">{item.address || item.slug}</p>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
            <span className="rounded-full bg-zinc-100 px-2.5 py-1">{item.transactionLabel || "Transaction unknown"}</span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1">Destination: {item.exportDestination || "ListingStream"}</span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1">Publishes: {item.exportCount}</span>
            <span className={`rounded-full px-2.5 py-1 ${item.buildoutReady ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-700"}`}>
              {item.buildoutReady ? "Geolocation Ready" : "Geolocation Missing"}
            </span>
            {item.ownerEmail ? <span className="rounded-full bg-zinc-100 px-2.5 py-1">{item.ownerEmail}</span> : null}
          </div>

          {item.bucket === "failed" && item.blockingReasons.length ? (
            <ReasonPanel title="Blocking reasons" reasons={item.blockingReasons} tone="failed" itemKey={item.documentId} />
          ) : null}

          {item.bucket === "warning" && item.warningReasons.length ? (
            <ReasonPanel title="Warning reasons" reasons={item.warningReasons} tone="warning" itemKey={item.documentId} />
          ) : null}

          {item.bucket !== "failed" && item.bucket !== "warning" && item.warningReasons.length ? (
            <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800">
              <p className="font-semibold">Warnings</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {item.warningReasons.map((reason) => <li key={`${item.documentId}-warn-${reason}`}>{reason}</li>)}
              </ul>
            </div>
          ) : null}

          {item.lastExportErrorMessage ? (
            <p className="mt-3 text-sm text-red-700">Last error: {item.lastExportErrorMessage}</p>
          ) : null}
        </div>

        <div className="w-full max-w-sm space-y-3 xl:w-80">
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/properties/${item.documentId}/edit`} className="rounded-full border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:border-zinc-900 hover:text-zinc-950">
              Open Listing
            </Link>
          </div>

          <ExportConsoleActions propertyId={item.documentId} canPublish={canPublish} canRetry={canRetry} />
        </div>
      </div>
    </article>
  );
}
