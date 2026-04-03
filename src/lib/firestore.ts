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

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!credPath) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS is missing");
  }

  const raw = fs.readFileSync(credPath, "utf-8");
  const serviceAccount = JSON.parse(raw);

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

const app = initFirebaseAdmin();
export const db = getFirestore(app);
export const PROPERTIES_COLLECTION = "properties";
