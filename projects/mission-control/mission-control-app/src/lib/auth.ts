export const AUTH_COOKIE = "mission_control_auth";

export type AuthRole = "master" | "broker";
export type AuthSession = { role: AuthRole; brokerId?: string };

const AUTH_TOKEN_VERSION = "v2";
const AUTH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

export function getMissionControlPassword() {
  const configured = process.env.MISSION_CONTROL_PASSWORD?.trim();

  if (!configured) {
    throw new Error("MISSION_CONTROL_PASSWORD is not configured.");
  }

  if (process.env.NODE_ENV === "production" && configured === "change-me") {
    throw new Error("MISSION_CONTROL_PASSWORD must be changed from the default value before production use.");
  }

  return configured;
}

export function getBrokerPassword() {
  const configured = process.env.BROKER_PASSWORD?.trim();

  if (!configured) {
    throw new Error("BROKER_PASSWORD is not configured.");
  }

  if (process.env.NODE_ENV === "production" && configured === "change-me") {
    throw new Error("BROKER_PASSWORD must be changed from the default value before production use.");
  }

  return configured;
}

export function getAuthConfig() {
  return {
    masterPassword: getMissionControlPassword(),
    brokerPassword: getBrokerPassword(),
  };
}

export function getLoginRole(password: string): AuthRole | null {
  const candidate = password.trim();
  const { masterPassword, brokerPassword } = getAuthConfig();

  if (candidate === masterPassword) return "master";
  if (candidate === brokerPassword && brokerPassword !== masterPassword) return "broker";
  return null;
}

export function isValidPassword(password: string) {
  return getLoginRole(password) !== null;
}

export function getAuthCookieMaxAgeSeconds() {
  return AUTH_TOKEN_MAX_AGE_SECONDS;
}

async function getSigningKey() {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(getMissionControlPassword()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isAuthRole(value: string): value is AuthRole {
  return value === "master" || value === "broker";
}

export async function createAuthToken(role?: AuthRole, now = Date.now(), brokerId = "") {
  const sessionRole = arguments.length === 0 ? "master" : role;
  const expiresAt = now + AUTH_TOKEN_MAX_AGE_SECONDS * 1000;
  const nonce = crypto.randomUUID();
  const safeBrokerId = brokerId.toLowerCase().replace(/[^a-z0-9_-]+/g, "");
  const payload = `${AUTH_TOKEN_VERSION}.${expiresAt}.${sessionRole ?? ""}.${safeBrokerId}.${nonce}`;
  const key = await getSigningKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function getAuthSession(token?: string | null, now = Date.now()): Promise<AuthSession | null> {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 5 && parts.length !== 6) return null;

  const version = parts[0];
  const expiresAtValue = parts[1];
  const role = parts[2];
  const brokerId = parts.length === 6 ? parts[3] : "";
  const nonce = parts.length === 6 ? parts[4] : parts[3];
  const signatureValue = parts.length === 6 ? parts[5] : parts[4];
  if (version !== AUTH_TOKEN_VERSION || !isAuthRole(role) || !nonce || !signatureValue) return null;

  const expiresAt = Number(expiresAtValue);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;

  const payload = parts.length === 6 ? `${version}.${expiresAtValue}.${role}.${brokerId}.${nonce}` : `${version}.${expiresAtValue}.${role}.${nonce}`;
  const key = await getSigningKey();

  try {
    const verified = await crypto.subtle.verify("HMAC", key, fromBase64Url(signatureValue), encoder.encode(payload));
    return verified ? { role, ...(brokerId ? { brokerId } : {}) } : null;
  } catch {
    return null;
  }
}

export async function isValidAuthToken(token?: string | null, now = Date.now()) {
  return (await getAuthSession(token, now)) !== null;
}

export async function isMasterSession(token?: string | null, now = Date.now()) {
  return (await getAuthSession(token, now))?.role === "master";
}

const brokerAllowedExactPaths = new Set(["/pier-manager", "/login", "/api/auth/logout"]);
const brokerAllowedPrefixes = ["/pier-manager/", "/api/listingstream/", "/api/offering-summaries/", "/api/uploads/file/"];

export function isBrokerAllowedPath(pathname: string) {
  return brokerAllowedExactPaths.has(pathname) || brokerAllowedPrefixes.some((prefix) => pathname.startsWith(prefix));
}
