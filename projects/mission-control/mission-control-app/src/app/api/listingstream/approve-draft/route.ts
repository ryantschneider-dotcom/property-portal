import { promises as fs } from "fs";
import path from "path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { approvePropertyPortalReviewDraft, changePropertyPortalDraftLifecycle, createPropertyPortalProxyError, type StagedListingImageUpload } from "@/lib/property-portal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uploadsDir = path.join(process.cwd(), "data", "uploads");

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

function safeStoredName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isPdfFile(file: File) {
  return /pdf/i.test(file.type || "") || /\.pdf$/i.test(file.name);
}

async function preservePdfUploadWithoutRasterizing(file: File) {
  // Vercel serverless functions do not reliably include native PDF rasterization
  // dependencies (Ghostscript/Poppler/ImageMagick), and sharp PDF rendering can
  // throw before the ListingStream publish call. Preserve the public PDF URL
  // instead so approve/publish never crashes on a floor-plan PDF.
  return {
    buffer: Buffer.from(await file.arrayBuffer()),
    storedSuffix: path.extname(file.name) || ".pdf",
    contentType: file.type || "application/pdf",
    originalName: file.name,
  };
}

function absoluteUploadUrl(request: Request, storedName: string) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const origin = request.headers.get("origin") || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : new URL(request.url).origin);
  return `${origin.replace(/\/+$/, "")}/api/uploads/file/${encodeURIComponent(storedName)}`;
}

async function createLocalStagedAssetUpload(request: Request, file: File, options: { slug?: string; index: number }): Promise<StagedListingImageUpload | null> {
  await fs.mkdir(uploadsDir, { recursive: true });
  const pdf = isPdfFile(file);
  const preservedPdf = pdf ? await preservePdfUploadWithoutRasterizing(file) : null;
  const originalBuffer = preservedPdf ? preservedPdf.buffer : Buffer.from(await file.arrayBuffer());
  const originalName = preservedPdf ? preservedPdf.originalName : file.name;
  const extension = preservedPdf?.storedSuffix || path.extname(file.name) || ".jpg";
  const base = path.basename(file.name, path.extname(file.name)) || "suite-upload";
  const storedName = `public-suite-media-${Date.now()}-${options.index}-${safeStoredName(options.slug || "listing")}-${safeStoredName(base)}${extension}`;
  const filePath = path.join(uploadsDir, storedName);
  await fs.writeFile(filePath, originalBuffer);
  return {
    url: absoluteUploadUrl(request, storedName),
    path: `/api/uploads/file/${storedName}`,
    contentType: preservedPdf?.contentType || file.type || "application/octet-stream",
    size: originalBuffer.byteLength,
    originalName,
  };
}

export async function POST(request: Request) {
  try {
    await requirePierManagerAuth();
    const contentType = request.headers.get("content-type") ?? "";
    let draft: unknown;
    let mode: "draft-preview" | "publish-live" = "publish-live";
    let lifecycleAction: "delete-draft" | "make-live" | null = null;
    let propertyIdOrSlug = "";
    let assets: File[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      draft = JSON.parse(String(formData.get("draft") ?? "null"));
      mode = String(formData.get("mode") ?? "publish-live") === "draft-preview" ? "draft-preview" : "publish-live";
      lifecycleAction = ["delete-draft", "make-live"].includes(String(formData.get("action"))) ? String(formData.get("action")) as "delete-draft" | "make-live" : null;
      propertyIdOrSlug = String(formData.get("propertyIdOrSlug") ?? "").trim();
      assets = formData.getAll("assets").filter((item): item is File => item instanceof File);
    } else {
      const body = await request.json();
      draft = body.draft;
      mode = body.mode === "draft-preview" ? "draft-preview" : "publish-live";
      lifecycleAction = ["delete-draft", "make-live"].includes(String(body.action)) ? body.action : null;
      propertyIdOrSlug = String(body.propertyIdOrSlug ?? "").trim();
    }

    if (lifecycleAction) {
      const result = await changePropertyPortalDraftLifecycle({ propertyIdOrSlug, action: lifecycleAction });
      return NextResponse.json({ ok: true, ...result });
    }

    if (!draft) return NextResponse.json({ error: "Draft is required" }, { status: 400 });
    const typedDraft = draft as Parameters<typeof approvePropertyPortalReviewDraft>[0]["draft"];
    const result = await approvePropertyPortalReviewDraft({
      draft: typedDraft,
      assets,
      mode,
      uploadStagedImage: (file, options) => createLocalStagedAssetUpload(request, file, options),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const normalized = createPropertyPortalProxyError(error, "approve and publish draft");
    return NextResponse.json({ error: normalized.message }, { status: 503 });
  }
}
