import { AdminUserRoleManager } from "@/components/admin-user-role-manager";
import { AdminUserSetupButton } from "@/components/admin-user-setup-button";
import { getPortalSession } from "@/lib/portal-session";
import { listPortalUsers, isAdminPortalRole } from "@/lib/users";

export default async function AdminSetupUsersPage() {
  const session = await getPortalSession();
  const users = await listPortalUsers();

  if (!session || !isAdminPortalRole(session.role)) {
    return null;
  }

  return (
    <main className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Admin Tools</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Portal User Manager</h1>
        <p className="mt-3 max-w-3xl text-zinc-600">
          Manage portal access levels for your team from one place. Initialize baseline users if needed, then assign admin, senior broker, or junior broker directly from the dashboard.
        </p>
      </div>

      <div className="space-y-6">
        <AdminUserRoleManager
          initialUsers={users.map(({ passwordHash, ...user }) => user)}
          currentAdminEmail={session.email}
        />
        <AdminUserSetupButton />
      </div>
    </main>
  );
}
