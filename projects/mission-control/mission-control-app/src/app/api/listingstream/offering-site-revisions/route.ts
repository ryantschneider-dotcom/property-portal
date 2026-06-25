import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, getAuthSession, isValidAuthToken } from "@/lib/auth";
import { uploadMissionControlFirebaseFile } from "@/lib/mission-control-firebase-storage";
import { buildPropertyPortalUrl, createPropertyPortalProxyError, getPropertyPortalInternalHeaders, safePropertyPortalFetch } from "@/lib/property-portal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const MAX_WEBSITE_REVISION_FILE_BYTES = 25_000_000;
const MAX_WEBSITE_REVISION_FILES = 12;

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const ok = await isValidAuthToken(token);
  if (!ok) throw new Error("Unauthorized");
  return getAuthSession(token);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeClientFolderSegment(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "listing";
}

export async function POST(request: Request) {
  try {
    const session = await requirePierManagerAuth();
    const formData = await request.formData();
    const listingId = clean(formData.get("listingId"));
    const brokerInstructions = clean(formData.get("brokerInstructions"));
    if (!listingId) return NextResponse.json({ error: "listingId is required" }, { status: 400 });

    const files = formData.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    if (!brokerInstructions && files.length === 0) return NextResponse.json({ error: "Tell Manus what to change or attach files to add to the website." }, { status: 400 });
    if (files.length > MAX_WEBSITE_REVISION_FILES) return NextResponse.json({ error: `Upload ${MAX_WEBSITE_REVISION_FILES} files or fewer for each website revision request.` }, { status: 400 });

    const slug = safeClientFolderSegment(listingId);
    const attachments = [] as Array<{ url: string; name: string; contentType: string; size?: number; path?: string }>;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (file.size > MAX_WEBSITE_REVISION_FILE_BYTES) return NextResponse.json({ error: `${file.name || "Attachment"} is too large. Keep website revision files under 25 MB each.` }, { status: 413 });
      const upload = await uploadMissionControlFirebaseFile(file, {
        slug,
        index: index + 1,
        folder: ["property-intake", "website-revisions", slug],
        fallbackBaseName: "website-revision-file",
      });
      attachments.push({
        url: upload.url,
        name: upload.originalName,
        contentType: upload.contentType,
        size: upload.size,
        path: upload.path,
      });
    }

    const response = await safePropertyPortalFetch(fetch, buildPropertyPortalUrl(`/api/offering-sites/${encodeURIComponent(listingId)}/revise`), {
      method: "POST",
      cache: "no-store",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...getPropertyPortalInternalHeaders(),
      },
      body: JSON.stringify({
        brokerInstructions,
        attachments,
        requestedBy: session?.brokerId ? `${session.brokerId}@piercommercial.com` : "PIER Manager",
      }),
    }, "offering website revision request");

    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const normalized = createPropertyPortalProxyError(error, "offering website revision request");
    return NextResponse.json({ error: normalized.message }, { status: 503 });
  }
}
