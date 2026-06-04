import type { ReactNode } from "react";

export default function BrokerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-950">
      <header className="bg-zinc-950 text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        <div className="mx-auto max-w-6xl px-4 py-2 sm:px-6 lg:px-8">
          <h1 className="text-[13px] font-extrabold tracking-[-0.02em] text-white">PIER Internal Broker Hub</h1>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">{children}</div>
    </div>
  );
}
