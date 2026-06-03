export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { listAdminProperties } from "@/lib/admin";
import { getPortalSession } from "@/lib/portal-session";

export async function GET(request: Request) {
  const internalToken = process.env.PROPERTY_PORTAL_INTERNAL_TOKEN?.trim();
  const providedInternalToken = request.headers.get("x-pier-manager-internal")?.trim();
  const session = await getPortalSession();
  if (!session && !(internalToken && providedInternalToken === internalToken)) {
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
      reviewState: item.reviewState,
      missingFieldCount: item.missingFieldCount,
      blockedIssueCount: item.blockedIssueCount,
      buildoutReady: item.buildoutReady,
      enrichmentStatus: item.enrichmentStatus,
      revisionWorkflow: item.revisionWorkflow,
      workflowStatus: item.workflowStatus,
      publishStatus: item.workflowStatus === "draft_preview" ? "draft" : item.workflowStatus === "approved" ? "published" : item.workflowStatus,
      previewUrl: item.slug ? `/preview/${item.slug}` : `/preview/${item.id}`,
    }));

  return NextResponse.json({ items });
}
