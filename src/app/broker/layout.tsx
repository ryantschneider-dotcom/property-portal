import type { ReactNode } from "react";

export default function BrokerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-950">
      <header className="border-b border-zinc-300 bg-zinc-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-400">Internal Admin</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">PIER Internal Broker Hub</h1>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
    </div>
  );
}
