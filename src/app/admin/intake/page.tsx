import { BrokerIntakeForm } from "@/components/broker-intake-form";

export default function BrokerIntakePage() {
  return (
    <main className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Broker Workflow</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">New Listing Intake</h1>
        <p className="mt-3 max-w-2xl text-zinc-600">
          Submit the minimum listing facts and photos. The system will create a draft listing for review and enrichment.
        </p>
      </div>

      <BrokerIntakeForm />
    </main>
  );
}
