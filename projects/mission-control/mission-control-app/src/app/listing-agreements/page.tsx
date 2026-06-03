import Link from "next/link";
import { MissionShell } from "@/components/mission-shell";
import { Card } from "@/components/ui";
import { buildListingAgreementDraft } from "@/lib/phase3-document-drafts";
import { readStore } from "@/lib/storage";

export default async function ListingAgreementsPage() {
  const store = await readStore();
  const listings = store.projects.filter((project) => project.type === "listing");
  const drafts = listings.map((listing) => ({ listing, draft: buildListingAgreementDraft(listing) }));

  return (
    <MissionShell
      title="Instant Listing Agreement Creator"
      subtitle="Draft-only listing agreement workspace sourced from Listing Manager records. Legal terms remain placeholders until Ryan reviews them."
      currentPath="/listing-agreements"
      actions={[{ href: "/projects", label: "Listing Manager", tone: "primary" }, { href: "/uploads", label: "Upload source docs" }]}
    >
      <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
        <Card title="Phase 3 guardrails" description="This module now produces structured draft packets, not final agreements.">
          <div className="space-y-3 text-sm leading-6 text-zinc-700">
            <p><span className="font-semibold text-[#CB521E]">•</span> Pulls property, owner, price, lease, and broker fields from Listing Manager</p>
            <p><span className="font-semibold text-[#CB521E]">•</span> Flags commission, term, exclusivity, and protection-period blanks</p>
            <p><span className="font-semibold text-[#CB521E]">•</span> Keeps owner contact details out of generated text</p>
            <p><span className="font-semibold text-[#CB521E]">•</span> Labels every output as Ryan/legal-review draft only</p>
          </div>
        </Card>

        <Card title="Generated listing agreement packets" description="Use these as internal drafting checklists before preparing any actual agreement document.">
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
                  {draft.terms.map((term) => <Metric key={term.label} label={term.label} value={term.value} />)}
                </div>

                <section className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-700">Missing required terms</p>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-900">
                    {draft.missingTerms.map((term) => <li key={term}>• {term}</li>)}
                  </ul>
                </section>

                <section className="mt-5 rounded-2xl border border-rose-500/20 bg-rose-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-rose-700">Risk notes</p>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-rose-900">
                    {draft.riskNotes.map((note) => <li key={note}>• {note}</li>)}
                  </ul>
                </section>

                <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Draft packet text</p>
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
