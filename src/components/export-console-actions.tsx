"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ExportAction = "build_package" | "queue_export" | "retry_export" | "mark_failed";

export function ExportConsoleActions({
  propertyId,
  canQueue,
  canRetry,
}: {
  propertyId: string;
  canQueue: boolean;
  canRetry: boolean;
}) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<ExportAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: ExportAction) {
    setBusyAction(action);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/exports/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, action }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Export action failed.");
        return;
      }
      setMessage(payload.message ?? "Updated export workflow.");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Export action failed.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run("build_package")}
          disabled={busyAction !== null}
          className="rounded-full border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:border-zinc-900 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busyAction === "build_package" ? "Building…" : "Rebuild package"}
        </button>
        {canQueue ? (
          <button
            type="button"
            onClick={() => run("queue_export")}
            disabled={busyAction !== null}
            className="rounded-full bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busyAction === "queue_export" ? "Queueing…" : "Queue export"}
          </button>
        ) : null}
        {canRetry ? (
          <button
            type="button"
            onClick={() => run("retry_export")}
            disabled={busyAction !== null}
            className="rounded-full bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busyAction === "retry_export" ? "Retrying…" : "Retry export"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => run("mark_failed")}
          disabled={busyAction !== null}
          className="rounded-full border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 transition hover:border-red-500 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busyAction === "mark_failed" ? "Updating…" : "Mark failed"}
        </button>
      </div>
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
