export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { listAdminProperties } from "@/lib/admin";
import { getPortalSession } from "@/lib/portal-session";

export async function GET() {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = (await listAdminProperties(session))
    .filter((item) => item.workflowStatus !== "archived")
    .filter((item) => item.transactionLabel)
    .map((item) => ({
      id: item.id,
      slug: item.slug,
      title: item.title,
      address: item.address,
      transactionLabel: item.transactionLabel,
      ownerEmail: item.ownerEmail,
    }));

  return NextResponse.json({ items });
}
