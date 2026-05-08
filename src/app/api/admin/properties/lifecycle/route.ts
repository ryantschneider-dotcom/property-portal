export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { archiveProperty, hardDeleteProperty, restoreProperty } from "@/lib/property-lifecycle";
import { parsePortalSession } from "@/lib/portal-session";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalSession(cookieStore.get("admin_session")?.value);
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { slug, action } = await request.json();
    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ error: "Slug is required" }, { status: 400 });
    }

    if (!["archive", "restore", "delete"].includes(action)) {
      return NextResponse.json({ error: "Unsupported lifecycle action" }, { status: 400 });
    }

    const result = action === "archive"
      ? await archiveProperty(slug, session.email)
      : action === "restore"
        ? await restoreProperty(slug, session.email)
        : await hardDeleteProperty(slug);

    revalidatePath("/admin/properties");
    revalidatePath("/broker");
    revalidatePath("/broker/new");
    revalidatePath("/broker/revisions");
    revalidatePath(`/admin/properties/${slug}/edit`);

    return NextResponse.json({ success: true, action, ...result });
  } catch (error) {
    console.error("Property lifecycle error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update listing lifecycle" },
      { status: 500 },
    );
  }
}
