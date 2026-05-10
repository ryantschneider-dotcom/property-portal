import "server-only";

import type { AdminPropertyListItem } from "@/lib/admin";

export type ExportConsoleBucket =
  | "ready"
  | "queued"
  | "failed"
  | "warning"
  | "completed";

export type ExportConsoleItem = {
  documentId: string;
  slug: string;
  title: string;
  address: string | null;
  ownerEmail: string | null;
  transactionLabel: string | null;

  workflowStatus: string | null;
  approvalStatus: string | null;

  launchPackageStatus: string | null;
  launchPackageVersion: string | null;
  launchPackageBuiltAt: string | null;
  launchPackageBuiltBy: string | null;

  exportWorkflowStatus: string | null;
  exportDestination: string | null;
  exportCount: number;

  readyReasons: string[];
  blockingReasons: string[];
  warningReasons: string[];

  lastExportAttemptAt: string | null;
  lastExportAttemptBy: string | null;
  lastExportResult: string | null;
  lastExportErrorMessage: string | null;

  buildoutReady: boolean;
  updatedAt: string | null;

  bucket: ExportConsoleBucket;
};

export type ExportConsoleSource = Omit<ExportConsoleItem, "bucket">;

export function buildExportConsoleItem(property: AdminPropertyListItem): ExportConsoleItem {
  const source: ExportConsoleSource = {
    documentId: property.documentId,
    slug: property.slug,
    title: property.title,
    address: property.address,
    ownerEmail: property.ownerEmail,
    transactionLabel: property.transactionLabel,
    workflowStatus: property.workflowStatus,
    approvalStatus: property.approvalStatus,
    launchPackageStatus: property.launchPackageStatus,
    launchPackageVersion: null,
    launchPackageBuiltAt: null,
    launchPackageBuiltBy: null,
    exportWorkflowStatus: property.exportWorkflowStatus,
    exportDestination: property.exportDestination,
    exportCount: property.exportCount,
    readyReasons: property.exportReadyReasons,
    blockingReasons: property.exportBlockingReasons,
    warningReasons: property.exportWarningReasons,
    lastExportAttemptAt: null,
    lastExportAttemptBy: null,
    lastExportResult: property.lastExportResult,
    lastExportErrorMessage: property.lastExportErrorMessage,
    buildoutReady: property.buildoutReady,
    updatedAt: property.updatedAt,
  };

  return {
    ...source,
    bucket: resolveExportConsoleBucket(source),
  };
}

function lower(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

export function resolveExportConsoleBucket(item: ExportConsoleSource): ExportConsoleBucket {
  const exportStatus = lower(item.exportWorkflowStatus);
  const lastResult = lower(item.lastExportResult);

  if (
    exportStatus === "failed"
    || exportStatus === "error"
    || lastResult === "failed"
    || lastResult === "error"
    || Boolean(item.lastExportErrorMessage)
  ) {
    return "failed";
  }

  if (["queued", "exporting", "in_progress"].includes(exportStatus)) {
    return "queued";
  }

  if (["completed", "published"].includes(exportStatus)) {
    return "completed";
  }

  if (item.blockingReasons.length === 0 && item.warningReasons.length > 0) {
    return "warning";
  }

  return "ready";
}

export function shouldIncludeInExportConsole(item: Pick<ExportConsoleSource, "workflowStatus">): boolean {
  return lower(item.workflowStatus) === "approved";
}
