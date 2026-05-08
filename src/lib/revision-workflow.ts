import "server-only";

export const REVISION_CATEGORY_OPTIONS = [
  "identity",
  "pricing",
  "media",
  "copy",
  "facts",
  "buildout",
  "compliance",
] as const;

export type RevisionCategoryCode = (typeof REVISION_CATEGORY_OPTIONS)[number];
export type RevisionSeverity = "warning" | "blocker";
export type RevisionRequestStatus = "open" | "broker_updated" | "resolved" | "superseded";

export type RevisionCategoryInput = {
  code: RevisionCategoryCode;
  title: string;
  severity: RevisionSeverity;
  items: string[];
};

export type RevisionRequestRecord = {
  id: string;
  createdAt: string;
  createdBy: string;
  createdByName: string | null;
  status: RevisionRequestStatus;
  summary: string | null;
  categories: RevisionCategoryInput[];
};

export function revisionCategoryTitle(code: RevisionCategoryCode) {
  return ({
    identity: "Identity",
    pricing: "Pricing",
    media: "Media",
    copy: "Copy",
    facts: "Facts",
    buildout: "Buildout",
    compliance: "Compliance",
  }[code]);
}

export function normalizeRevisionCategories(input: unknown): RevisionCategoryInput[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const results: RevisionCategoryInput[] = [];

  for (const entry of input) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const code = String(row.code ?? "").trim() as RevisionCategoryCode;
    if (!REVISION_CATEGORY_OPTIONS.includes(code)) continue;
    if (seen.has(code)) continue;
    const severity: RevisionSeverity = row.severity === "warning" ? "warning" : "blocker";
    const title = String(row.title ?? revisionCategoryTitle(code)).trim() || revisionCategoryTitle(code);
    const items = Array.isArray(row.items)
      ? row.items.map((item) => String(item ?? "").trim()).filter(Boolean)
      : String(row.items ?? "")
          .split(/\n+/)
          .map((item) => item.trim())
          .filter(Boolean);
    if (!items.length) continue;
    seen.add(code);
    results.push({ code, title, severity, items });
  }

  return results;
}
