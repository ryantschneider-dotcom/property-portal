export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";

import { ExportPropertyCard } from "@/components/export-property-card";
import { listExportConsoleItems } from "@/lib/admin";
import type { ExportConsoleBucket, ExportConsoleItem } from "@/lib/export-console";
import { getPortalSession } from "@/lib/portal-session";
import { isAdminPortalRole } from "@/lib/users";

function BucketSummaryCard({
  label,
  count,
  className,
  description,
  href,
}: {
  label: string;
  count: number;
  className: string;
  description: string;
  href: string;
}) {
  return (
    <Link href={href} className={`rounded-3xl border p-5 transition hover:shadow-sm ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em]">{label}</p>
      <p className="mt-2 text-3xl font-bold">{count}</p>
      <p className="mt-2 text-sm opacity-90">{description}</p>
    </Link>
  );
}

function ExportBucketSection({
  bucket,
  title,
  description,
  items,
}: {
  bucket: ExportConsoleBucket;
  title: string;
  description: string;
  items: ExportConsoleItem[];
}) {
  const styles = {
    ready: "border-emerald-200 bg-emerald-50",
    queued: "border-blue-200 bg-blue-50",
    warning: "border-amber-200 bg-amber-50",
    failed: "border-red-200 bg-red-50",
    completed: "border-zinc-300 bg-zinc-50",
  } as const;

  return (
    <section id={`bucket-${bucket}`} className={`scroll-mt-24 rounded-3xl border p-5 shadow-sm ${styles[bucket]}`}>
      <div className="flex flex-col gap-3 border-b border-white/70 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-700">{title}</p>
          <p className="mt-2 max-w-3xl text-sm text-zinc-700">{description}</p>
        </div>
        <div className="rounded-full bg-white/80 px-3 py-1 text-sm font-semibold text-zinc-800">{items.length} item{items.length === 1 ? "" : "s"}</div>
      </div>

      <div className="mt-5 space-y-4">
        {items.length ? items.map((item) => <ExportPropertyCard key={item.documentId} item={item} />) : (
          <div className="rounded-2xl border border-dashed border-white/80 bg-white/70 p-5 text-sm text-zinc-600">
            Nothing in this bucket right now.
          </div>
        )}
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
  const warning = items.filter((item) => item.bucket === "warning");
  const failed = items.filter((item) => item.bucket === "failed");
  const completed = items.filter((item) => item.bucket === "completed");

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 lg:px-10 lg:py-12">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Phase 5.2</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">Export Console</h1>
          <p className="mt-3 max-w-3xl text-zinc-600">
            Operational launch dashboard for approved listings. Buckets are separated cleanly so execution work, warnings, and failures stay visible instead of getting buried inside editorial review.
          </p>
        </div>
        <Link href="/admin/properties" className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:border-zinc-900 hover:text-zinc-950">
          Back to Inventory
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 rounded-3xl border border-zinc-200 bg-white p-3 shadow-sm">
        <Link href="#bucket-ready" className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100">Ready</Link>
        <Link href="#bucket-queued" className="rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100">Queued</Link>
        <Link href="#bucket-warning" className="rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100">Warning</Link>
        <Link href="#bucket-failed" className="rounded-full bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100">Failed</Link>
        <Link href="#bucket-completed" className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-200">Completed</Link>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <BucketSummaryCard label="Ready" count={ready.length} description="Clean approved listings ready to hand into execution." href="#bucket-ready" className="border-emerald-200 bg-emerald-50 text-emerald-950" />
        <BucketSummaryCard label="Queued" count={queued.length} description="Listings already staged for export execution." href="#bucket-queued" className="border-blue-200 bg-blue-50 text-blue-950" />
        <BucketSummaryCard label="Warning" count={warning.length} description="Exportable listings carrying soft issues worth checking." href="#bucket-warning" className="border-amber-200 bg-amber-50 text-amber-950" />
        <BucketSummaryCard label="Failed" count={failed.length} description="Listings blocked by export failures or hard errors." href="#bucket-failed" className="border-red-200 bg-red-50 text-red-950" />
        <BucketSummaryCard label="Completed" count={completed.length} description="Exported listings kept visible for audit trail confidence." href="#bucket-completed" className="border-zinc-300 bg-zinc-50 text-zinc-950" />
      </div>

      <div className="space-y-6">
        <ExportBucketSection bucket="ready" title="Ready to Export" description="Approved listings with a clean enough package state to push directly into downstream execution." items={ready} />
        <ExportBucketSection bucket="queued" title="Queued Exports" description="Listings intentionally staged for execution and waiting on downstream processing." items={queued} />
        <ExportBucketSection bucket="warning" title="Warning Review" description="Approved listings with no hard blockers, but still carrying warnings or soft concerns that deserve attention." items={warning} />
        <ExportBucketSection bucket="failed" title="Failed Exports" description="Listings that need retry or intervention before launch work can continue." items={failed} />
        <ExportBucketSection bucket="completed" title="Completed Exports" description="Listings that have already been exported or marked complete, kept visible for operational audit trail." items={completed} />
      </div>
    </main>
  );
}
