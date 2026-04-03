export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      <div className="max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Property not found</h1>
        <p className="mt-3 text-zinc-600">The requested property slug does not currently resolve to a Firestore record.</p>
      </div>
    </main>
  );
}
