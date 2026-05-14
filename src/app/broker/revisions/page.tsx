import { BrokerHubRevisionsForm } from "@/components/broker-hub-revisions-form";
import { BrokerHubShell } from "@/components/broker-hub-shell";

export default function BrokerHubRevisionsPage() {
  return (
    <BrokerHubShell title="Enrich / Edit">
      <BrokerHubRevisionsForm />
    </BrokerHubShell>
  );
}
