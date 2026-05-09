export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";

import { ExportConsoleActions } from "@/components/export-console-actions";
import { listExportConsoleItems } from "@/lib/admin";
import { getPortalSession } from "@/lib/portal-session";
import { isAdminPortalRole } from "@/lib/users";

function formatLabel(value: string | null | undefined, fallback = "—") {
  if (!value) return fallback;
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function ExportBucket({
  title,
  description,
  tone,
  items,
}: {
  title: string;
  description: string;
  tone: "ready" | "queued" | "failed";
  items: Awaited<ReturnType<typeof listExportConsoleItems>>;
}) {
  const tones = {
    ready: "border-emerald-200 bg-emerald-50 text-emerald-950",
    queued: "border-blue-200 bg-blue-50 text-blue-950",
    failed: "border-red-200 bg-red-50 text-red-950",
  } as const;

  return (
    <section className={`rounded-3xl border p-5 shadow-sm ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em]">{title}</p>
          <p className="mt-2 text-sm opacity-80">{description}</p>
        </div>
        <div className="rounded-full bg-white/70 px-3 py-1 text-sm font-semibold">{items.length}</div>
      </div>

      <div className="mt-5 space-y-4">
        {items.length ? items.map((item) => {
          const canQueue = item.bucket === "ready";
          const canRetry = item.bucket === "failed";
          return (
            <article key={item.id} className="rounded-2xl border border-white/70 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-zinc-950">{item.title}</h3>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-700">
                      {formatLabel(item.exportWorkflowStatus, "Not Ready")}
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-700">
                      Package: {formatLabel(item.launchPackageStatus, "Not Built")}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-600">{item.address || item.slug}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1">{item.transactionLabel || "Transaction unknown"}</span>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1">Destination: {item.exportDestination || "Buildout"}</span>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1">Exports: {item.exportCount}</span>
                    {item.ownerEmail ? <span className="rounded-full bg-zinc-100 px-2.5 py-1">{item.ownerEmail}</span> : null}
                  </div>

                  {item.exportBlockingReasons.length ? (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-semibold">Blocking reasons</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {item.exportBlockingReasons.map((reason) => <li key={`${item.id}-block-${reason}`}>{reason}</li>)}
                      </ul>
                    </div>
                  ) : null}

                  {!item.exportBlockingReasons.length && item.exportWarningReasons.length ? (
                    <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800">
                      <p className="font-semibold">Warnings</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {item.exportWarningReasons.map((reason) => <li key={`${item.id}-warn-${reason}`}>{reason}</li>)}
                      </ul>
                    </div>
                  ) : null}

                  {item.lastExportErrorMessage ? (
                    <p className="mt-3 text-sm text-red-700">Last error: {item.lastExportErrorMessage}</p>
                  ) : null}
                </div>

                <div className="w-full max-w-sm space-y-3 lg:w-80">
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/admin/properties/${item.id}/edit`} className="rounded-full border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:border-zinc-900 hover:text-zinc-950">
                      Open listing
                    </Link>
                  </div>
                  <ExportConsoleActions propertyId={item.id} canQueue={canQueue} canRetry={canRetry} />
                </div>
              </div>
            </article>
          );
        }) : <p className="rounded-2xl border border-dashed border-white/70 bg-white/70 p-5 text-sm text-zinc-600">Nothing in this bucket right now.</p>}
      </div>
    </section>
  );
}

export default async function AdminExportsPage() {
  const session = await getPortalSession();
  if (!session || !isAdminPortalRole(session.role)) {
    notFound();
  }

  const items = await listExportConsoleItems(session);
  const ready = items.filter((item) => item.bucket === "ready");
  const queued = items.filter((item) => item.bucket === "queued");
  const failed = items.filter((item) => item.bucket === "failed");

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 lg:px-10 lg:py-12">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Phase 5.2</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">Export Console</h1>
          <p className="mt-3 max-w-3xl text-zinc-600">Execution layer skeleton for approved listings. This keeps ready, queued, and failed export work separate from editorial approval while the downstream launch hooks harden.</p>
        </div>
        <Link href="/admin/properties" className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:border-zinc-900 hover:text-zinc-950">
          Back to inventory
        </Link>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Ready</p>
          <p className="mt-2 text-3xl font-bold text-emerald-950">{ready.length}</p>
          <p className="mt-2 text-sm text-emerald-900">Approved listings with packaging complete enough to queue.</p>
        </div>
        <div className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Queued</p>
          <p className="mt-2 text-3xl font-bold text-blue-950">{queued.length}</p>
          <p className="mt-2 text-sm text-blue-900">Listings staged for export execution and awaiting downstream handling.</p>
        </div>
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-700">Failed</p>
          <p className="mt-2 text-3xl font-bold text-red-950">{failed.length}</p>
          <p className="mt-2 text-sm text-red-900">Listings that need a retry or explicit intervention before launch resumes.</p>
        </div>
      </div>

      <div className="space-y-6">
        <ExportBucket title="Ready to export" description="Approved assets with a clean enough package state to move into execution." tone="ready" items={ready} />
        <ExportBucket title="Queued exports" description="Execution work that has been intentionally queued but not yet marked complete." tone="queued" items={queued} />
        <ExportBucket title="Failed exports" description="Failures surfaced separately so they do not get buried inside the approval queue." tone="failed" items={failed} />
      </div>
    </main>
  );
}
