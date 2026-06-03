import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_LENGTH = 32;

function getPreviewSecret() {
  return process.env.PROPERTY_PORTAL_INTERNAL_TOKEN?.trim() || process.env.ADMIN_SETUP_SECRET?.trim() || null;
}

export function createDraftPreviewToken(slug: string) {
  const secret = getPreviewSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(String(slug ?? "").trim()).digest("hex").slice(0, TOKEN_LENGTH);
}

export function appendDraftPreviewToken(path: string, slug: string) {
  const token = createDraftPreviewToken(slug);
  if (!token) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}previewToken=${encodeURIComponent(token)}`;
}

export function isValidDraftPreviewToken(slug: string, token: string | string[] | undefined) {
  const provided = Array.isArray(token) ? token[0] : token;
  const expected = createDraftPreviewToken(slug);
  if (!provided || !expected) return false;

  const providedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}
