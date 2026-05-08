"use client";

import { useMemo, useState } from "react";

import type { PortalRole, PortalUserRecord } from "@/lib/users";

type SafePortalUser = Omit<PortalUserRecord, "passwordHash">;

type AdminUserRoleManagerProps = {
  initialUsers: SafePortalUser[];
  currentAdminEmail: string;
};

const ROLE_OPTIONS: PortalRole[] = ["admin", "senior_broker", "junior_broker", "sales_associate"];

function roleLabel(role: PortalRole) {
  return {
    admin: "Admin",
    senior_broker: "Senior Broker",
    junior_broker: "Junior Broker",
    sales_associate: "Sales Associate",
  }[role];
}

export function AdminUserRoleManager({ initialUsers, currentAdminEmail }: AdminUserRoleManagerProps) {
  const [users, setUsers] = useState(initialUsers);
  const [savingEmail, setSavingEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.email.localeCompare(b.email)),
    [users],
  );

  async function updateRole(email: string, role: PortalRole) {
    setSavingEmail(email);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Unable to update user role.");
        return;
      }

      setUsers((current) => current.map((user) => user.email === email ? { ...user, role: payload.role } : user));
      setMessage(`Updated ${email} to ${roleLabel(payload.role)}.`);
    } catch (err) {
      console.error(err);
      setError("Unable to update user role.");
    } finally {
      setSavingEmail(null);
    }
  }

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">Role Manager</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">Portal users & access levels</h2>
          <p className="mt-2 text-sm text-zinc-600">View all portal users and switch access between admin, senior broker, junior broker, and sales associate without touching Firestore manually.</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          Signed in as <span className="font-semibold text-zinc-900">{currentAdminEmail}</span>
        </div>
      </div>

      {message ? <p className="mt-4 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead>
            <tr className="text-left text-zinc-500">
              <th className="py-3 pr-4 font-medium">Name</th>
              <th className="py-3 pr-4 font-medium">Email</th>
              <th className="py-3 pr-4 font-medium">Role</th>
              <th className="py-3 pr-4 font-medium">Status</th>
              <th className="py-3 pr-4 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {sortedUsers.map((user) => {
              const isSaving = savingEmail === user.email;
              const isSelf = user.email.toLowerCase() === currentAdminEmail.toLowerCase();
              return (
                <tr key={user.email}>
                  <td className="py-4 pr-4 align-top">
                    <div className="font-medium text-zinc-900">{user.name}</div>
                    {isSelf ? <div className="mt-1 text-xs uppercase tracking-[0.18em] text-blue-600">Current admin</div> : null}
                  </td>
                  <td className="py-4 pr-4 align-top text-zinc-700">{user.email}</td>
                  <td className="py-4 pr-4 align-top">
                    <select
                      value={user.role}
                      disabled={isSaving}
                      onChange={(event) => updateRole(user.email, event.target.value as PortalRole)}
                      className="w-full min-w-[190px] rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900"
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>{roleLabel(role)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-4 pr-4 align-top">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${user.active ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>
                      {user.active ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="py-4 pr-4 align-top text-zinc-600">
                    <div>{user.updatedAt || "—"}</div>
                    {isSaving ? <div className="mt-1 text-xs text-zinc-400">Saving…</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
