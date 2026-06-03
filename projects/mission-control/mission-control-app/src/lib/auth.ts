export const AUTH_COOKIE = "mission_control_auth";

const AUTH_TOKEN_VERSION = "v1";
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

export function isValidPassword(password: string) {
  return password === getMissionControlPassword();
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

export async function createAuthToken(now = Date.now()) {
  const expiresAt = now + AUTH_TOKEN_MAX_AGE_SECONDS * 1000;
  const nonce = crypto.randomUUID();
  const payload = `${AUTH_TOKEN_VERSION}.${expiresAt}.${nonce}`;
  const key = await getSigningKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function isValidAuthToken(token?: string | null, now = Date.now()) {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 4) return false;

  const [version, expiresAtValue, nonce, signatureValue] = parts;
  if (version !== AUTH_TOKEN_VERSION || !nonce || !signatureValue) return false;

  const expiresAt = Number(expiresAtValue);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;

  const payload = `${version}.${expiresAtValue}.${nonce}`;
  const key = await getSigningKey();

  try {
    return crypto.subtle.verify("HMAC", key, fromBase64Url(signatureValue), encoder.encode(payload));
  } catch {
    return false;
  }
}
