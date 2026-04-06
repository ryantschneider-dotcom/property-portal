import { AdminUserSetupButton } from "@/components/admin-user-setup-button";

export default function AdminSetupUsersPage() {
  return (
    <main className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Admin Tools</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Portal User Setup</h1>
        <p className="mt-3 max-w-2xl text-zinc-600">
          Temporary one-time helper to initialize the admin and broker portal users from inside the working admin app.
        </p>
      </div>

      <AdminUserSetupButton />
    </main>
  );
}
