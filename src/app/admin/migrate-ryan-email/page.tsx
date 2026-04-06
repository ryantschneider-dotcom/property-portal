import { AdminRyanMigrationButton } from "@/components/admin-ryan-migration-button";

export default function AdminMigrateRyanEmailPage() {
  return (
    <main className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Admin Tools</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Ryan Admin Migration</h1>
        <p className="mt-3 max-w-2xl text-zinc-600">
          Temporary one-time helper to migrate Ryan&apos;s admin login from the old Gmail-based portal account to <code>ryan@piercommercial.com</code> from inside the authenticated admin app.
        </p>
      </div>

      <AdminRyanMigrationButton />
    </main>
  );
}
