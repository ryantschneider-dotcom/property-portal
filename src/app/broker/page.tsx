import { BrokerHubHome } from "@/components/broker-hub-home";
import { getBrokerCountyHealthSnapshot, listAdminProperties } from "@/lib/admin";
import { getPortalSession } from "@/lib/portal-session";

export default async function BrokerHubPage() {
  const session = await getPortalSession();
  const [countyHealth, listings] = await Promise.all([
    getBrokerCountyHealthSnapshot(),
    listAdminProperties(session),
  ]);
  return <BrokerHubHome countyHealth={countyHealth} listings={listings} />;
}
