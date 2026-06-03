import Link from "next/link";
import { MissionShell } from "@/components/mission-shell";
import { Card } from "@/components/ui";
import { buildSalesContractDraft } from "@/lib/phase3-document-drafts";
import { readStore } from "@/lib/storage";

export default async function SalesContractsPage() {
  const store = await readStore();
  const listings = store.projects.filter((project) => project.type === "listing");
  const drafts = listings.map((listing) => ({ listing, draft: buildSalesContractDraft(listing) }));

  return (
    <MissionShell
      title="Sales Contract Draftsman"
      subtitle="Private purchase agreement drafting workspace for deal points, milestones, contingencies, and review notes."
      currentPath="/sales-contracts"
      actions={[{ href: "/projects", label: "Select listing", tone: "primary" }]}
    >
      <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
        <Card title="Phase 3 contract guardrails" description="The module now turns Listing Manager records into a structured purchase-contract drafting sheet.">
          <div className="space-y-3 text-sm leading-6 text-zinc-700">
            <p><span className="font-semibold text-[#CB521E]">•</span> Pre-fills property, seller, parcel, zoning, broker, and price context</p>
            <p><span className="font-semibold text-[#CB521E]">•</span> Flags buyer, escrow, diligence, closing, and contingency blanks</p>
            <p><span className="font-semibold text-[#CB521E]">•</span> Adds milestone placeholders Ryan can tighten before drafting</p>
            <p><span className="font-semibold text-[#CB521E]">•</span> Labels every output as non-binding draft material</p>
          </div>
        </Card>

        <Card title="Generated sales contract drafting sheets" description="Use these as internal intake sheets before preparing any formal purchase agreement.">
          <div className="space-y-5">
            {drafts.length === 0 ? <Empty text="No listing records yet. Add one in Listing Manager first." /> : drafts.map(({ listing, draft }) => (
              <article key={listing.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-zinc-950">{draft.title}</h3>
                    <p className="mt-1 text-sm font-semibold text-amber-700">{draft.reviewLabel}</p>
                  </div>
                  <Link href={`/projects/${listing.id}`} className="rounded-xl border border-[#CB521E]/20 bg-[#CB521E]/10 px-4 py-2 text-sm text-[#CB521E] transition hover:bg-[#CB521E]/15">
                    Edit source record
                  </Link>
                </div>

                <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {draft.dealPoints.map((point) => <Metric key={point.label} label={point.label} value={point.value} />)}
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <section className="rounded-2xl border border-amber-500/20 bg-amber-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-amber-700">Open deal points</p>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-900">
                      {draft.missingDealPoints.map((point) => <li key={point}>• {point}</li>)}
                    </ul>
                  </section>
                  <section className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[#CB521E]">Milestones</p>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-700">
                      {draft.milestones.map((milestone) => <li key={milestone}>• {milestone}</li>)}
                    </ul>
                  </section>
                </div>

                <section className="mt-5 rounded-2xl border border-rose-500/20 bg-rose-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-rose-700">Risk notes</p>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-rose-900">
                    {draft.riskNotes.map((note) => <li key={note}>• {note}</li>)}
                  </ul>
                </section>

                <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Draft sheet text</p>
                  <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{draft.draftText}</pre>
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
