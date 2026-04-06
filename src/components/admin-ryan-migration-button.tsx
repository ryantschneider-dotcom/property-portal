"use client";

import { useState } from "react";

type MigrationResponse = {
  ok?: boolean;
  oldEmail?: string;
  newEmail?: string;
  oldUserExisted?: boolean;
  newUserExisted?: boolean;
  error?: string;
};

export function AdminRyanMigrationButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MigrationResponse | null>(null);

  async function handleClick() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/migrate-ryan-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      const text = await response.text();
      let payload: MigrationResponse;

      try {
        payload = text ? (JSON.parse(text) as MigrationResponse) : {};
      } catch {
        payload = { error: text || "Unexpected response from migration route." };
      }

      if (!response.ok && !payload.error) {
        payload.error = `Request failed with status ${response.status}`;
      }

      setResult(payload);
    } catch {
      setResult({ error: "Failed to run Ryan admin migration." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-3xl border border-sky-300 bg-sky-50 p-6 shadow-sm">
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-sky-700">Temporary Migration Tool</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">Migrate Ryan Admin Email</h2>
      <p className="mt-3 text-sm text-zinc-700">
        One-time helper to create or update <code>ryan@piercommercial.com</code> as the active admin user and retire the old Ryan login if it exists.
      </p>

      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="mt-5 inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
      >
        {loading ? "Running migration…" : "Run Ryan Email Migration"}
      </button>

      {result && (
        <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
          {result.error ? (
            <p className="font-medium text-red-600">{result.error}</p>
          ) : (
            <>
              <p className="font-medium text-zinc-900">Migration complete.</p>
              <ul className="mt-3 list-disc pl-5">
                <li>Old email: {result.oldEmail}</li>
                <li>New email: {result.newEmail}</li>
                <li>Old user existed: {String(result.oldUserExisted)}</li>
                <li>New user existed: {String(result.newUserExisted)}</li>
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
