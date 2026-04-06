import Link from "next/link";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-zinc-200 bg-zinc-950 px-6 py-8 text-white">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-zinc-400">PIER Admin</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Portal Control</h1>
          <nav className="mt-10 space-y-2 text-sm">
            <Link href="/admin/properties" className="block rounded-xl bg-white/10 px-4 py-3 font-medium text-white transition hover:bg-white/15">
              Properties
            </Link>
            <Link href="/admin/setup-users" className="block rounded-xl px-4 py-3 text-zinc-300 transition hover:bg-white/5 hover:text-white">
              Setup Users
            </Link>
            <Link href="/admin/migrate-ryan-email" className="block rounded-xl px-4 py-3 text-zinc-300 transition hover:bg-white/5 hover:text-white">
              Migrate Ryan Login
            </Link>
            <Link href="/" className="block rounded-xl px-4 py-3 text-zinc-300 transition hover:bg-white/5 hover:text-white">
              Public Site
            </Link>
          </nav>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
