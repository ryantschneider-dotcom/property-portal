import "server-only";

import { config as loadDotenv } from "dotenv";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

loadDotenv({ path: "/data/.openclaw/workspace/scripts/.env" });
loadDotenv({ path: ".env.local" });

function initFirebaseAdmin() {
  if (getApps().length) return getApps()[0]!;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  return initializeApp({ credential: cert(JSON.parse(raw!)) });
}

const app = initFirebaseAdmin();
export const db = getFirestore(app);
export const PROPERTIES_COLLECTION = "properties";
