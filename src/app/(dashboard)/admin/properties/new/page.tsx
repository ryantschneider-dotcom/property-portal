import { AdminPropertyForm } from "@/components/admin-property-form";
import { buildEmptyAdminFormData } from "@/lib/admin";

export default function NewAdminPropertyPage() {
  return (
    <main className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Admin Dashboard</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Create new property</h1>
        <p className="mt-3 max-w-2xl text-zinc-600">
          Scaffolded admin editor for creating a new listing directly in Firestore.
        </p>
      </div>

      <AdminPropertyForm initialData={buildEmptyAdminFormData()} mode="new" userRole="admin" />
    </main>
  );
}
