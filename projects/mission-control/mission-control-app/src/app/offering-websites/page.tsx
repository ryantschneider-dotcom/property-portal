import Link from "next/link";
import { MissionShell } from "@/components/mission-shell";
import { Card } from "@/components/ui";
import { buildOfferingWebsitePlan } from "@/lib/phase3-document-drafts";
import { readStore } from "@/lib/storage";

export default async function OfferingWebsitesPage() {
  const store = await readStore();
  const listings = store.projects.filter((project) => project.type === "listing");
  const plans = listings.map((listing) => ({ listing, plan: buildOfferingWebsitePlan(listing) }));

  return (
    <MissionShell
      title="Offering Website Builder"
      subtitle="Private scaffolder for public single-property offering websites. Mission Control stays Ryan-only; generated websites are separate public outputs."
      currentPath="/offering-websites"
      actions={[{ href: "/projects", label: "Choose listing", tone: "primary" }, { href: "/uploads", label: "Upload images" }]}
    >
      <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
        <Card title="Phase 3 public-output rules" description="This module now creates public-safe website plans from the private listing source record.">
          <div className="space-y-3 text-sm leading-6 text-zinc-700">
            <p><span className="font-semibold text-[#CB521E]">•</span> Uses approved listing fields: overview, stats, property, location, zoning, contact</p>
            <p><span className="font-semibold text-[#CB521E]">•</span> Keeps internal deal data, agreements, BOV ranges, and owner contacts out</p>
            <p><span className="font-semibold text-[#CB521E]">•</span> Produces a page-section scaffold that can feed a later static-site export</p>
            <p><span className="font-semibold text-[#CB521E]">•</span> Treats Buildout/custom URL as a reference, not a publishing action</p>
          </div>
        </Card>

        <Card title="Generated offering website plans" description="Review each public-safe scaffold before building or publishing a property website.">
          <div className="space-y-5">
            {plans.length === 0 ? <Empty text="No listing records yet. Add one in Listing Manager first." /> : plans.map(({ listing, plan }) => (
              <article key={listing.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-zinc-950">{plan.title}</h3>
                    <p className="mt-1 text-sm text-zinc-600">Public URL/reference: {plan.publicUrl}</p>
                  </div>
                  <Link href={`/projects/${listing.id}`} className="rounded-xl border border-[#CB521E]/20 bg-[#CB521E]/10 px-4 py-2 text-sm text-[#CB521E] transition hover:bg-[#CB521E]/15">
                    Edit source record
                  </Link>
                </div>

                <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {plan.heroStats.map((stat) => <Metric key={stat.label} label={stat.label} value={stat.value} />)}
                </div>

                <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#CB521E]">Website sections</p>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {plan.sections.map((section) => (
                      <div key={section.heading} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                        <h4 className="font-semibold text-zinc-950">{section.heading}</h4>
                        <p className="mt-2 text-sm leading-6 text-zinc-700">{section.copy}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="mt-5 rounded-2xl border border-rose-500/20 bg-rose-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-rose-700">Strict exclusions</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {plan.strictExclusions.map((item) => <div key={item} className="rounded-xl border border-rose-500/20 bg-white/70 p-3 text-sm text-rose-900">Do not include: {item}</div>)}
                  </div>
                </section>

                <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Public copy block</p>
                  <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{plan.publicCopy}</pre>
                  <p className="mt-4 rounded-xl border border-[#CB521E]/20 bg-[#CB521E]/10 p-3 text-sm font-medium text-[#CB521E]">{plan.callToAction}</p>
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
