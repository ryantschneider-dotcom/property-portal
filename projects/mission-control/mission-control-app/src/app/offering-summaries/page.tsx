import Link from "next/link";
import { MissionShell } from "@/components/mission-shell";
import { Card } from "@/components/ui";
import { buildOfferingSummaryDraft } from "@/lib/offering-summary";
import { readStore } from "@/lib/storage";

export default async function OfferingSummariesPage() {
  const store = await readStore();
  const listings = store.projects.filter((project) => project.type === "listing");
  const drafts = listings.map((listing) => ({ listing, draft: buildOfferingSummaryDraft(listing) }));

  return (
    <MissionShell
      title="Offering Summary Generator"
      subtitle="Generate PIER-ready offering summary copy from the private Listing Manager source record."
      currentPath="/offering-summaries"
      actions={[{ href: "/projects", label: "Add listing", tone: "primary" }, { href: "/uploads", label: "Upload assets" }]}
    >
      <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
        <Card title="Draft rules" description="This module now produces a usable first-pass summary from listing data. It excludes private owner contact data from public copy.">
          <div className="space-y-3 text-sm leading-6 text-zinc-700">
            <p><span className="font-semibold text-[#CB521E]">•</span> Executive summary from market-facing blurb</p>
            <p><span className="font-semibold text-[#CB521E]">•</span> Key facts formatted with PIER conventions</p>
            <p><span className="font-semibold text-[#CB521E]">•</span> Broker notes remain internal</p>
            <p><span className="font-semibold text-[#CB521E]">•</span> Upload assets stay attached to the listing record</p>
          </div>
        </Card>

        <Card title="Generated summaries" description="Copy these drafts into a report, proposal, or next-stage PDF/export workflow.">
          <div className="space-y-5">
            {drafts.length === 0 ? <Empty text="No listing records yet. Add one in Listing Manager first." /> : drafts.map(({ listing, draft }) => (
              <article key={listing.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-zinc-950">{draft.title}</h3>
                    <p className="mt-1 text-sm text-zinc-600">{draft.subtitle}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/api/offering-summaries/${listing.id}/pdf?format=html`} className="rounded-xl border border-[#CB521E]/20 bg-white px-4 py-2 text-sm text-[#CB521E] transition hover:bg-[#CB521E]/10">
                      Preview PDF HTML
                    </Link>
                    <Link href={`/api/offering-summaries/${listing.id}/pdf`} className="rounded-xl border border-[#CB521E]/20 bg-[#CB521E]/10 px-4 py-2 text-sm text-[#CB521E] transition hover:bg-[#CB521E]/15">
                      Generate PDF
                    </Link>
                    <Link href={`/projects/${listing.id}`} className="rounded-xl border border-[#CB521E]/20 bg-[#CB521E]/10 px-4 py-2 text-sm text-[#CB521E] transition hover:bg-[#CB521E]/15">
                      Edit source record
                    </Link>
                  </div>
                </div>

                <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#CB521E]">Executive Summary</p>
                  <p className="mt-3 text-sm leading-6 text-zinc-700">{draft.executiveSummary}</p>
                </section>

                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {draft.facts.map((fact) => <Metric key={fact.label} label={fact.label} value={fact.value} />)}
                </div>

                <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#CB521E]">Highlights</p>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-700">
                    {draft.highlights.map((highlight) => <li key={highlight}>• {highlight}</li>)}
                  </ul>
                </section>

                <section className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-700">Internal Broker Notes</p>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-900">
                    {draft.brokerNotes.map((note) => <li key={note}>• {note}</li>)}
                  </ul>
                </section>

                <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Public copy block</p>
                  <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{draft.publicCopy}</pre>
                </section>
              </article>
            ))}
          </div>
        </Card>
      </div>
    </MissionShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-zinc-200 bg-white p-3"><p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</p><p className="mt-1 text-sm font-medium text-zinc-900">{value}</p></div>;
}
function Empty({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-500">{text}</div>; }
