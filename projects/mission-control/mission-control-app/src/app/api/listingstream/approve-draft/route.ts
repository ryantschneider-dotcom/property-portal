import { createSign, randomUUID } from "crypto";
import path from "path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { approvePropertyPortalReviewDraft, changePropertyPortalDraftLifecycle, createPropertyPortalProxyError, type StagedListingImageUpload } from "@/lib/property-portal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

type FirebaseServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

let cachedFirebaseAccessToken: { token: string; expiresAt: number } | null = null;

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function getFirebaseServiceAccount(): FirebaseServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is required for Mission Control staged media uploads.");
  const parsed = JSON.parse(raw) as FirebaseServiceAccount;
  if (!parsed.client_email || !parsed.private_key) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.");
  return parsed;
}

function getFirebaseStorageBucket() {
  const bucket = (process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
  if (!bucket) throw new Error("FIREBASE_STORAGE_BUCKET is required for Mission Control staged media uploads.");
  return bucket;
}

async function getFirebaseAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedFirebaseAccessToken && cachedFirebaseAccessToken.expiresAt - 60 > now) return cachedFirebaseAccessToken.token;
  const serviceAccount = getFirebaseServiceAccount();
  const tokenUri = serviceAccount.token_uri || "https://oauth2.googleapis.com/token";
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/devstorage.read_write",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };
  const unsignedJwt = `${base64UrlJson(header)}.${base64UrlJson(claim)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key.replace(/\\n/g, "\n")).toString("base64url");
  const assertion = `${unsignedJwt}.${signature}`;
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !data.access_token) throw new Error(`Firebase Storage auth failed with status ${response.status}.`);
  cachedFirebaseAccessToken = { token: data.access_token, expiresAt: now + Number(data.expires_in || 3600) };
  return data.access_token;
}

async function uploadStagedAssetToFirebase(file: File, options: { slug?: string; index: number }): Promise<StagedListingImageUpload | null> {
  const bucket = getFirebaseStorageBucket();
  const token = randomUUID();
  const originalBuffer = Buffer.from(await file.arrayBuffer());
  const originalName = file.name || "suite-upload";
  const extension = path.extname(originalName) || (isPdfFile(file) ? ".pdf" : ".bin");
  const base = path.basename(originalName, path.extname(originalName)) || "suite-upload";
  const objectName = [
    "property-intake",
    safeStoredName(options.slug || "listing"),
    "suite-media",
    `${Date.now()}-${options.index}-${safeStoredName(base)}${extension}`,
  ].join("/");
  const contentType = file.type || (isPdfFile(file) ? "application/pdf" : "application/octet-stream");
  const metadata = {
    name: objectName,
    contentType,
    metadata: { firebaseStorageDownloadTokens: token },
  };
  const boundary = `mission-control-${randomUUID()}`;
  const metadataPart = Buffer.from([
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${contentType}`,
    "",
  ].join("\r\n"));
  const closingPart = Buffer.from(`\r\n--${boundary}--\r\n`);
  const accessToken = await getFirebaseAccessToken();
  const response = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=multipart&name=${encodeURIComponent(objectName)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: Buffer.concat([metadataPart, originalBuffer, closingPart]),
  });
  if (!response.ok) throw new Error(`Firebase Storage upload failed with status ${response.status}.`);
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}?${new URLSearchParams({ alt: "media", token })}`;
  return {
    url,
    path: objectName,
    contentType,
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
      uploadStagedImage: (file, options) => uploadStagedAssetToFirebase(file, options),
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
