import { createHash, createSign, randomUUID } from "crypto";
import path from "path";

export type MissionControlFirebaseUpload = {
  url: string;
  path: string;
  contentType: string;
  size: number;
  originalName: string;
};

export type MissionControlFirebaseSignedUpload = MissionControlFirebaseUpload & {
  id: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

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

export function getFirebaseStorageBucket() {
  const bucket = (process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
  if (!bucket) throw new Error("FIREBASE_STORAGE_BUCKET is required for Mission Control staged media uploads.");
  return bucket;
}

export async function getFirebaseAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedFirebaseAccessToken && cachedFirebaseAccessToken.expiresAt - 60 > now) return cachedFirebaseAccessToken.token;
  const serviceAccount = getFirebaseServiceAccount();
  const tokenUri = serviceAccount.token_uri || "https://oauth2.googleapis.com/token";
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/devstorage.read_write https://www.googleapis.com/auth/datastore",
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
  const data = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number };
  if (!response.ok || !data.access_token) throw new Error(`Firebase Storage auth failed with status ${response.status}.`);
  cachedFirebaseAccessToken = { token: data.access_token, expiresAt: now + Number(data.expires_in || 3600) };
  return data.access_token;
}

export function safeFirebaseObjectSegment(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_") || "upload";
}

export function isPdfUploadFile(file: File) {
  return /pdf/i.test(file.type || "") || /\.pdf$/i.test(file.name);
}

function getUploadObjectName(originalName: string, options: { slug?: string; index: number; folder?: string[]; fallbackBaseName?: string }) {
  const extension = path.extname(originalName) || ".bin";
  const base = path.basename(originalName, path.extname(originalName)) || options.fallbackBaseName || "upload";
  const folder = options.folder?.length ? options.folder : ["property-intake", safeFirebaseObjectSegment(options.slug || "listing"), "suite-media"];
  return [
    ...folder.map(safeFirebaseObjectSegment),
    `${Date.now()}-${options.index}-${safeFirebaseObjectSegment(base)}${extension}`,
  ].join("/");
}

function encodeGcsPathSegment(segment: string) {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeCanonicalUri(bucket: string, objectName: string) {
  return `/${encodeGcsPathSegment(bucket)}/${objectName.split("/").map(encodeGcsPathSegment).join("/")}`;
}

function getV4Timestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function getV4Date(date: Date) {
  return getV4Timestamp(date).slice(0, 8);
}

function encodeCanonicalQuery(params: Record<string, string>) {
  return Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export function createMissionControlFirebaseSignedUpload(input: {
  originalName?: string;
  contentType?: string;
  size: number;
  index: number;
  folder?: string[];
  fallbackBaseName?: string;
  expiresInSeconds?: number;
}): MissionControlFirebaseSignedUpload {
  const bucket = getFirebaseStorageBucket();
  const serviceAccount = getFirebaseServiceAccount();
  const token = randomUUID();
  const originalName = input.originalName || input.fallbackBaseName || "copilot-attachment";
  const objectName = getUploadObjectName(originalName, {
    index: input.index,
    folder: input.folder,
    fallbackBaseName: input.fallbackBaseName,
  });
  const contentType = input.contentType || "application/octet-stream";
  const now = new Date();
  const expiresInSeconds = Math.min(Math.max(input.expiresInSeconds || 15 * 60, 60), 60 * 60);
  const timestamp = getV4Timestamp(now);
  const date = getV4Date(now);
  const credentialScope = `${date}/auto/storage/goog4_request`;
  const signedHeaders = "content-type;host;x-goog-meta-firebasestoragedownloadtokens";
  const canonicalUri = encodeCanonicalUri(bucket, objectName);
  const canonicalHeaders = [
    `content-type:${contentType}`,
    "host:storage.googleapis.com",
    `x-goog-meta-firebasestoragedownloadtokens:${token}`,
    "",
  ].join("\n");
  const queryParams = {
    "X-Goog-Algorithm": "GOOG4-RSA-SHA256",
    "X-Goog-Credential": `${serviceAccount.client_email}/${credentialScope}`,
    "X-Goog-Date": timestamp,
    "X-Goog-Expires": String(expiresInSeconds),
    "X-Goog-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = encodeCanonicalQuery(queryParams);
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const canonicalRequestHash = createHash("sha256").update(canonicalRequest).digest("hex");
  const stringToSign = ["GOOG4-RSA-SHA256", timestamp, credentialScope, canonicalRequestHash].join("\n");
  const signer = createSign("RSA-SHA256");
  signer.update(stringToSign);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key.replace(/\\n/g, "\n")).toString("hex");
  const uploadUrl = `https://storage.googleapis.com${canonicalUri}?${canonicalQuery}&X-Goog-Signature=${signature}`;
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}?${new URLSearchParams({ alt: "media", token })}`;

  return {
    id: randomUUID(),
    uploadUrl,
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-goog-meta-firebasestoragedownloadtokens": token,
    },
    expiresAt: new Date(now.getTime() + expiresInSeconds * 1000).toISOString(),
    url,
    path: objectName,
    contentType,
    size: input.size,
    originalName,
  };
}

export async function uploadMissionControlFirebaseFile(file: File, options: { slug?: string; index: number; folder?: string[]; fallbackBaseName?: string }): Promise<MissionControlFirebaseUpload> {
  const bucket = getFirebaseStorageBucket();
  const token = randomUUID();
  const originalBuffer = Buffer.from(await file.arrayBuffer());
  const originalName = file.name || options.fallbackBaseName || "suite-upload";
  const extension = path.extname(originalName) || (isPdfUploadFile(file) ? ".pdf" : ".bin");
  const base = path.basename(originalName, path.extname(originalName)) || options.fallbackBaseName || "suite-upload";
  const folder = options.folder?.length ? options.folder : ["property-intake", safeFirebaseObjectSegment(options.slug || "listing"), "suite-media"];
  const objectName = [
    ...folder.map(safeFirebaseObjectSegment),
    `${Date.now()}-${options.index}-${safeFirebaseObjectSegment(base)}${extension}`,
  ].join("/");
  const contentType = file.type || (isPdfUploadFile(file) ? "application/pdf" : "application/octet-stream");
  const metadata = {
    name: objectName,
    contentType,
    metadata: { firebaseStorageDownloadTokens: token },
  };
  const boundary = `mission-control-${randomUUID()}`;
  const metadataPart = Buffer.from(
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`,
  );
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
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Firebase Storage upload failed with status ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`);
  }
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}?${new URLSearchParams({ alt: "media", token })}`;
  return {
    url,
    path: objectName,
    contentType,
    size: originalBuffer.byteLength,
    originalName,
  };
}
