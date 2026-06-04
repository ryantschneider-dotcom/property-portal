import { BrokerHubIntakeForm } from "@/components/broker-hub-intake-form";

export default function BrokerHubNewListingPage() {
  return (
    <main className="-mx-4 -my-6 bg-zinc-100 px-4 py-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:-my-8 lg:px-8 lg:py-8">
      <section className="mx-auto max-w-[680px] overflow-hidden rounded-[1.35rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(203,82,30,0.22),transparent_34%),linear-gradient(135deg,#111827_0%,#172033_58%,#263245_100%)] p-5 text-white shadow-[0_22px_70px_rgba(15,23,42,0.22)] sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-zinc-400">PIER COMMERCIAL</p>
            <h2 className="mt-2 text-[1.55rem] font-extrabold leading-[1.02] tracking-[-0.04em] text-white sm:text-[1.8rem]">New Listing Entry</h2>
            <p className="mt-2 max-w-[430px] text-[11px] font-medium leading-5 text-zinc-300 sm:text-xs">
              A broker-first workflow designed to feel faster, sharper, and more premium than Buildout.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:w-[190px] sm:justify-end">
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold text-white shadow-sm">Dashboard</span>
            <span className="rounded-full bg-[#CB521E] px-3 py-1.5 text-[10px] font-bold text-white shadow-[0_10px_22px_rgba(203,82,30,0.34)]">New Listing Entry</span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold text-white shadow-sm">Revise Drafts</span>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-[2rem] bg-zinc-100">
        <BrokerHubIntakeForm />
      </section>
    </main>
  );
}
