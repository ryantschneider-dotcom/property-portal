export type DeltaSummaryRow = {
  label: string;
  before: string;
  after: string;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim() || "—";
  if (Array.isArray(value)) return value.length ? `${value.length} item${value.length === 1 ? "" : "s"}` : "—";
  return "Updated";
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function formatNumberWithCommas(value: string) {
  const number = Number(value.replace(/[$,]/g, ""));
  if (!Number.isFinite(number)) return value;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(number);
}

function formatSuiteSnapshot(suite: JsonRecord, action: "Added" | "Removed") {
  const parts: string[] = [];
  const size = displayValue(suite.availableSqFt ?? suite.sizeSf);
  const rent = displayValue(suite.baseRent ?? suite.rent ?? suite.rate);
  const rentType = displayValue(suite.rentType);
  if (size !== "—") parts.push(`${formatNumberWithCommas(size)} SF`);
  if (rent !== "—") parts.push(/^call/i.test(rent) ? rent : `$${formatNumberWithCommas(rent)}`);
  if (rentType !== "—") parts.push(rentType);
  return `${action}: ${parts.length ? parts.join(" • ") : "suite row"}`;
}

const fieldLabels: Record<string, string> = {
  availableSqFt: "Available Sq. Ft.",
  sizeSf: "Available Sq. Ft.",
  baseRent: "Rent Rate",
  rent: "Rent Rate",
  rate: "Rent Rate",
  rentType: "Rent Type",
  suiteNumber: "Suite #",
  title: "Listing Title",
  propertyDescription: "Property Description",
  locationDescription: "Location Description",
  leaseRate: "Lease Rate",
  salePrice: "Sale Price",
};

function humanizeKey(key: string): string {
  return fieldLabels[key] ?? key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function suiteLabel(suite: unknown, index: number, fieldKey: string): string {
  const suiteNumber = isRecord(suite) && typeof suite.suiteNumber === "string" && suite.suiteNumber.trim()
    ? suite.suiteNumber.trim()
    : String(index + 1);
  return `Suite ${suiteNumber} ${humanizeKey(fieldKey)}`;
}

function summarizeSuiteChanges(before: JsonRecord, after: JsonRecord): DeltaSummaryRow[] {
  const beforeSuites = Array.isArray(before.admin && isRecord(before.admin) ? before.admin.suites : before.suites) ? (before.admin && isRecord(before.admin) ? before.admin.suites : before.suites) as unknown[] : [];
  const afterSuites = Array.isArray(after.admin && isRecord(after.admin) ? after.admin.suites : after.suites) ? (after.admin && isRecord(after.admin) ? after.admin.suites : after.suites) as unknown[] : [];
  const suiteCount = Math.max(beforeSuites.length, afterSuites.length);
  const rows: DeltaSummaryRow[] = [];
  const preferredFields = ["availableSqFt", "sizeSf", "baseRent", "rent", "rate", "rentType"];
  for (let index = 0; index < suiteCount; index += 1) {
    const beforeSuite = isRecord(beforeSuites[index]) ? beforeSuites[index] as JsonRecord : {};
    const afterSuite = isRecord(afterSuites[index]) ? afterSuites[index] as JsonRecord : {};
    if (!Object.keys(beforeSuite).length && Object.keys(afterSuite).length) {
      rows.push({ label: `Suite ${displayValue(afterSuite.suiteNumber)}`, before: "Not present", after: formatSuiteSnapshot(afterSuite, "Added") });
      continue;
    }
    if (Object.keys(beforeSuite).length && !Object.keys(afterSuite).length) {
      rows.push({ label: `Suite ${displayValue(beforeSuite.suiteNumber)}`, before: formatSuiteSnapshot(beforeSuite, "Removed"), after: "Removed" });
      continue;
    }
    const keys = new Set([...preferredFields, ...Object.keys(beforeSuite), ...Object.keys(afterSuite)]);
    for (const key of keys) {
      if (key === "suiteNumber" || key === "suitePhotos" || key === "suiteFloorPlans") continue;
      const previous = beforeSuite[key];
      const next = afterSuite[key];
      if (valuesEqual(previous, next)) continue;
      rows.push({ label: suiteLabel(afterSuite.suiteNumber ? afterSuite : beforeSuite, index, key), before: displayValue(previous), after: displayValue(next) });
    }
  }
  return rows;
}

function flattenChanges(before: unknown, after: unknown, path: string[] = []): DeltaSummaryRow[] {
  if (valuesEqual(before, after)) return [];
  if (isRecord(before) || isRecord(after)) {
    const left = isRecord(before) ? before : {};
    const right = isRecord(after) ? after : {};
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    const rows: DeltaSummaryRow[] = [];
    for (const key of keys) {
      if (["admin", "suites", "suitePhotos", "suiteFloorPlans", "media", "photos"].includes(key)) continue;
      rows.push(...flattenChanges(left[key], right[key], [...path, key]));
    }
    return rows;
  }
  const key = path[path.length - 1] ?? "Field";
  return [{ label: humanizeKey(key), before: displayValue(before), after: displayValue(after) }];
}

export function summarizeDeltaChanges(deltaPreview: { before?: unknown; after?: unknown } | null | undefined): DeltaSummaryRow[] {
  if (!deltaPreview) return [];
  const before = isRecord(deltaPreview.before) ? deltaPreview.before : {};
  const after = isRecord(deltaPreview.after) ? deltaPreview.after : {};
  const rows = [...summarizeSuiteChanges(before, after), ...flattenChanges(before, after)];
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.label}|${row.before}|${row.after}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return row.before !== row.after;
  });
}
