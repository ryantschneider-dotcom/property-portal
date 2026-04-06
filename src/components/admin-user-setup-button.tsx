"use client";

import { useState } from "react";

type SetupResponse = {
  ok?: boolean;
  created?: Array<{ email: string; role: string }>;
  skipped?: Array<{ email: string; reason: string }>;
  error?: string;
};

export function AdminUserSetupButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SetupResponse | null>(null);

  async function handleClick() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/setup-users-browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as SetupResponse;
      setResult(payload);
    } catch {
      setResult({ error: "Failed to initialize users." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-3xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-amber-700">Temporary Setup Tool</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">Initialize Portal Users</h2>
      <p className="mt-3 text-sm text-zinc-700">
        One-time admin helper to create Ryan, Anthony, and Joel in the `portal_users` collection using the configured setup passwords.
      </p>

      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="mt-5 inline-flex items-center justify-center rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
      >
        {loading ? "Initializing…" : "Initialize Portal Users"}
      </button>

      {result && (
        <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
          {result.error ? (
            <p className="text-red-600 font-medium">{result.error}</p>
          ) : (
            <>
              <p className="font-medium text-zinc-900">Setup complete.</p>
              <div className="mt-3">
                <p className="font-medium">Created:</p>
                <ul className="mt-1 list-disc pl-5">
                  {(result.created ?? []).map((item) => (
                    <li key={item.email}>{item.email} ({item.role})</li>
                  ))}
                </ul>
              </div>
              <div className="mt-3">
                <p className="font-medium">Skipped:</p>
                <ul className="mt-1 list-disc pl-5">
                  {(result.skipped ?? []).map((item) => (
                    <li key={`${item.email}-${item.reason}`}>{item.email} — {item.reason}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
