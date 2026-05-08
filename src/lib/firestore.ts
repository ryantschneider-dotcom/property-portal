import { config as loadDotenv } from "dotenv";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

loadDotenv({ path: "/data/.openclaw/workspace/scripts/.env" });
loadDotenv({ path: ".env.local" });

function initFirebaseAdmin() {
  if (getApps().length) return getApps()[0]!;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured");
  }

  const serviceAccount = JSON.parse(raw) as { project_id?: string; storage_bucket?: string };
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    serviceAccount.storage_bucket ||
    (serviceAccount.project_id ? `${serviceAccount.project_id}.firebasestorage.app` : undefined) ||
    (serviceAccount.project_id ? `${serviceAccount.project_id}.appspot.com` : undefined);

  return initializeApp({
    credential: cert(serviceAccount as any),
    storageBucket,
  });
}

const app = initFirebaseAdmin();
export const db = getFirestore(app);
export const storage = getStorage(app);
export const PROPERTIES_COLLECTION = "properties";
