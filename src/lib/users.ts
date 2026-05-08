import "server-only";

import { createHash } from "crypto";

import { db } from "@/lib/firestore";

export const USERS_COLLECTION = "portal_users";

export type PortalRole = "admin" | "senior_broker" | "junior_broker";

export type PortalUserRecord = {
  id: string;
  email: string;
  name: string;
  role: PortalRole;
  active: boolean;
  passwordHash: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

const LEGACY_SENIOR_BROKER_EMAILS = new Set([
  "anthony@piercommercial.com",
  "joel@piercommercial.com",
]);

export function normalizePortalRole(role: unknown, email?: string | null): PortalRole {
  if (role === "admin") return "admin";
  if (role === "senior_broker") return "senior_broker";
  if (role === "junior_broker") return "junior_broker";
  if (role === "broker") {
    return email && LEGACY_SENIOR_BROKER_EMAILS.has(normalizeEmail(email)) ? "senior_broker" : "junior_broker";
  }
  return email && LEGACY_SENIOR_BROKER_EMAILS.has(normalizeEmail(email)) ? "senior_broker" : "junior_broker";
}

export function isAdminPortalRole(role: PortalRole) {
  return role === "admin";
}

export function isSeniorBrokerRole(role: PortalRole) {
  return role === "senior_broker";
}

export function hashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

export async function listPortalUsers(): Promise<PortalUserRecord[]> {
  const snapshot = await db.collection(USERS_COLLECTION).get();
  return snapshot.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const email = normalizeEmail(String(data.email ?? doc.id));
    return {
      id: doc.id,
      email,
      name: String(data.name ?? data.email ?? doc.id),
      role: normalizePortalRole(data.role, email),
      active: data.active !== false,
      passwordHash: typeof data.passwordHash === "string" ? data.passwordHash : null,
      createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    };
  });
}

export async function getPortalUserByEmail(email: string): Promise<PortalUserRecord | null> {
  const normalizedEmail = normalizeEmail(email);
  const directDoc = await db.collection(USERS_COLLECTION).doc(normalizedEmail).get();
  if (directDoc.exists) {
    const data = directDoc.data() as Record<string, unknown>;
    const resolvedEmail = normalizeEmail(String(data.email ?? directDoc.id));
    return {
      id: directDoc.id,
      email: resolvedEmail,
      name: String(data.name ?? data.email ?? directDoc.id),
      role: normalizePortalRole(data.role, resolvedEmail),
      active: data.active !== false,
      passwordHash: typeof data.passwordHash === "string" ? data.passwordHash : null,
      createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    };
  }

  const snapshot = await db.collection(USERS_COLLECTION).where("email", "==", normalizedEmail).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  const data = doc.data() as Record<string, unknown>;
  const resolvedEmail = normalizeEmail(String(data.email ?? doc.id));
  return {
    id: doc.id,
    email: resolvedEmail,
    name: String(data.name ?? data.email ?? doc.id),
    role: normalizePortalRole(data.role, resolvedEmail),
    active: data.active !== false,
    passwordHash: typeof data.passwordHash === "string" ? data.passwordHash : null,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
  };
}

export async function verifyPortalUser(email: string, password: string): Promise<PortalUserRecord | null> {
  const user = await getPortalUserByEmail(email);
  if (!user || !user.active || !user.passwordHash) return null;
  return user.passwordHash === hashPassword(password) ? user : null;
}
