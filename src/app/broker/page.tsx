import { BrokerHubHome } from "@/components/broker-hub-home";
import { getBrokerCountyHealthSnapshot } from "@/lib/admin";

export default async function BrokerHubPage() {
  const countyHealth = await getBrokerCountyHealthSnapshot();
  return <BrokerHubHome countyHealth={countyHealth} />;
}
