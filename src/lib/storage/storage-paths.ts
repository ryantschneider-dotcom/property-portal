import type { PropertyDocumentKind } from "@/lib/types";

const STORAGE_ROOT = "properties";
const DEFAULT_HTML_VERSION = "v1";
const DEFAULT_PDF_VERSION = "v1";

function sanitizeSegment(value: string, fallback = "unknown") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");

  return normalized || fallback;
}

function joinStoragePath(...parts: Array<string | null | undefined>) {
  return parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .join("/");
}

function splitFilename(filename: string) {
  const sanitized = sanitizeStorageFilename(filename || "file");
  const lastDot = sanitized.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === sanitized.length - 1) {
    return { basename: sanitized, extension: "" };
  }

  return {
    basename: sanitized.slice(0, lastDot),
    extension: sanitized.slice(lastDot + 1).toLowerCase(),
  };
}

export function sanitizeStorageFilename(filename: string) {
  const trimmed = String(filename || "").trim();
  if (!trimmed) return "file";

  const cleaned = trimmed
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");

  return cleaned || "file";
}

export function buildPropertyStorageRoot(propertyId: string) {
  return joinStoragePath(STORAGE_ROOT, sanitizeSegment(propertyId));
}

export function buildPublicRoot(propertyId: string) {
  return joinStoragePath(buildPropertyStorageRoot(propertyId), "public");
}

export function buildPrivateRoot(propertyId: string) {
  return joinStoragePath(buildPropertyStorageRoot(propertyId), "private");
}

export function buildPublicImagePath(propertyId: string, imageId: string, variant = "original", filename = "asset") {
  const safeImageId = sanitizeSegment(imageId, "image");
  const safeVariant = sanitizeSegment(variant, "original");
  const safeFilename = sanitizeStorageFilename(filename);
  const { extension } = splitFilename(safeFilename);
  const finalFilename = extension ? `${safeVariant}.${extension}` : safeVariant;

  return joinStoragePath(buildPublicRoot(propertyId), "gallery", safeImageId, finalFilename);
}

export function buildPublicDocumentPath(propertyId: string, kind: PropertyDocumentKind | string, documentId: string, filename: string) {
  return joinStoragePath(
    buildPublicRoot(propertyId),
    "documents",
    sanitizeSegment(kind, "other"),
    sanitizeSegment(documentId, "document"),
    sanitizeStorageFilename(filename),
  );
}

export function buildPrivateSourcePath(propertyId: string, source: "broker-upload" | "buildout-import" | "internal-upload", filename: string) {
  return joinStoragePath(buildPrivateRoot(propertyId), "source", source, sanitizeStorageFilename(filename));
}

export function buildPrivateGeneratedHtmlPath(propertyId: string, runId: string, version = DEFAULT_HTML_VERSION) {
  return joinStoragePath(
    buildPrivateRoot(propertyId),
    "generated",
    "html",
    sanitizeSegment(runId, "run"),
    `${sanitizeSegment(version, DEFAULT_HTML_VERSION)}.html`,
  );
}

export function buildPrivateGeneratedOmPdfPath(propertyId: string, documentId: string, version = DEFAULT_PDF_VERSION) {
  return joinStoragePath(
    buildPrivateRoot(propertyId),
    "generated",
    "om-drafts",
    sanitizeSegment(documentId, "document"),
    `${sanitizeSegment(version, DEFAULT_PDF_VERSION)}.pdf`,
  );
}

export function buildPrivateOmInputSnapshotPath(propertyId: string, runId: string) {
  return joinStoragePath(
    buildPrivateRoot(propertyId),
    "generated",
    "om-input",
    `${sanitizeSegment(runId, "run")}.json`,
  );
}

export function buildPrivateNarrativeSnapshotPath(propertyId: string, runId: string) {
  return joinStoragePath(
    buildPrivateRoot(propertyId),
    "generated",
    "narrative",
    `${sanitizeSegment(runId, "run")}.json`,
  );
}

export function buildPrivateAuditPath(propertyId: string, filename: string) {
  return joinStoragePath(buildPrivateRoot(propertyId), "audit", sanitizeStorageFilename(filename));
}
