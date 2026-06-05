import { MissionShell } from "@/components/mission-shell";
import { PierManagerListingConsole } from "@/components/pier-manager-listing-console";
import { cookies } from "next/headers";
import { AUTH_COOKIE, getAuthSession } from "@/lib/auth";

export default async function PierManagerPage() {
  const cookieStore = await cookies();
  const session = await getAuthSession(cookieStore.get(AUTH_COOKIE)?.value);

  return (
    <MissionShell
      title="PIER Manager"
      subtitle="Broker-facing listing uptake and AI-driven listing modification wired directly to the property-portal backend. WordPress is bypassed for listing workflows."
      currentPath="/pier-manager"
      actions={[{ href: "/projects", label: "Local listings" }, { href: "/daily-control", label: "Task board" }]}
    >
      <PierManagerListingConsole userRole={session?.role ?? "broker"} />
    </MissionShell>
  );
}
