import { randomUUID } from "node:crypto";

import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

function clean(value: string | undefined | null) {
  return String(value ?? "").trim();
}

function getStorageBucketName() {
  return clean(process.env.FIREBASE_STORAGE_BUCKET) || clean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
}

function getProjectId() {
  return clean(process.env.FIREBASE_PROJECT_ID) || clean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
}

function parseServiceAccount(): ServiceAccount | undefined {
  const rawJson = clean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (rawJson) {
    const parsed = JSON.parse(rawJson) as ServiceAccount;
    if (typeof parsed.privateKey === "string") parsed.privateKey = parsed.privateKey.replace(/\\n/g, "\n");
    return parsed;
  }

  const clientEmail = clean(process.env.FIREBASE_CLIENT_EMAIL);
  const privateKey = clean(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, "\n");
  const projectId = getProjectId();
  if (clientEmail && privateKey && projectId) {
    return { projectId, clientEmail, privateKey };
  }

  return undefined;
}

function getFirebaseStorageBucket() {
  const storageBucket = getStorageBucketName();
  if (!storageBucket) {
    throw new Error("Firebase Storage bucket is not configured. Set FIREBASE_STORAGE_BUCKET or NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.");
  }

  const appName = "mission-control-listing-media";
  const existingApp = getApps().find((app) => app.name === appName);
  const app = existingApp ?? initializeApp(
    {
      ...(parseServiceAccount() ? { credential: cert(parseServiceAccount() as ServiceAccount) } : {}),
      projectId: getProjectId() || undefined,
      storageBucket,
    },
    appName,
  );
  return getStorage(app).bucket(storageBucket);
}

function safeFilePart(value: string, fallback: string) {
  const cleaned = clean(value)
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

function getExtension(file: File) {
  const nameMatch = clean(file.name).match(/\.([a-z0-9]{1,8})$/i);
  if (nameMatch) return nameMatch[1].toLowerCase();
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

function assertImageFile(file: File) {
  if (!file.type.startsWith("image/")) return false;
  if (!file.size || file.size <= 0) return false;
  return true;
}

export type FirebaseStagedMediaUpload = {
  url: string;
  path: string;
  contentType: string;
  size: number;
  originalName: string;
};

export async function uploadStagedListingImageToFirebase(file: File, options: { slug?: string; index?: number } = {}): Promise<FirebaseStagedMediaUpload | null> {
  if (!assertImageFile(file)) return null;

  const bucket = getFirebaseStorageBucket();
  const slug = safeFilePart(options.slug || "draft-listing", "draft-listing");
  const index = Math.max(1, options.index ?? 1);
  const ext = getExtension(file);
  const basename = safeFilePart(file.name, `photo-${index}`);
  const objectPath = `listingstream/draft-media/${slug}/${Date.now()}-${index}-${randomUUID()}-${basename}.${ext}`;
  const object = bucket.file(objectPath);
  const buffer = Buffer.from(await file.arrayBuffer());

  await object.save(buffer, {
    resumable: false,
    metadata: {
      contentType: file.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
      cacheControl: "public, max-age=31536000, immutable",
      metadata: {
        source: "mission-control-pier-manager",
        originalName: file.name || `photo-${index}.${ext}`,
      },
    },
  });

  await object.makePublic();
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(objectPath).replace(/%2F/g, "/")}`;

  return {
    url: publicUrl,
    path: objectPath,
    contentType: file.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
    size: file.size,
    originalName: file.name || `photo-${index}.${ext}`,
  };
}
