"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setError("Invalid password");
        setLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0f14] px-6 text-neutral-100">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
        <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-300">
          Mission Control
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Sign in</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          Private single-user access for Ryan’s internal Mission Control.
        </p>

        <div className="mt-6 space-y-4">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
          />

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}

          <button
            onClick={handleLogin}
            className="w-full rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-medium text-neutral-950 transition hover:bg-cyan-400"
          >
            {loading ? "Signing in…" : "Enter Mission Control"}
          </button>
        </div>
      </div>
    </div>
  );
}
