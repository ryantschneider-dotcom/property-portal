import { BrokerHubIntakeForm } from "@/components/broker-hub-intake-form";
import { BrokerHubShell } from "@/components/broker-hub-shell";

export default function BrokerIntakePage() {
  return (
    <BrokerHubShell title="New Listing Entry">
      <BrokerHubIntakeForm />
    </BrokerHubShell>
  );
}
