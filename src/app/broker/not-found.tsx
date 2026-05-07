export default function BrokerNotFound() {
  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-10 text-zinc-950 sm:px-6">
      <div className="mx-auto max-w-xl rounded-xl border border-zinc-300 bg-white p-6 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">Broker Hub</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Broker page not found</h1>
        <p className="mt-3 text-sm text-zinc-600">This internal broker route does not exist. Use the dashboard to return to a valid broker tool page.</p>
      </div>
    </main>
  );
}
