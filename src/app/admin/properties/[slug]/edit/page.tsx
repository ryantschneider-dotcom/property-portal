import { notFound } from "next/navigation";

import { AdminPropertyForm } from "@/components/admin-property-form";
import { getAdminPropertyFormData } from "@/lib/admin";

export default async function EditAdminPropertyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const property = await getAdminPropertyFormData(slug);

  if (!property) {
    notFound();
  }

  return (
    <main className="px-6 py-10 lg:px-10 lg:py-12">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Admin Dashboard</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Edit property</h1>
        <p className="mt-3 max-w-2xl text-zinc-600">
          Comprehensive Firestore-backed editor for property metadata, descriptions, pricing, and custom website links.
        </p>
      </div>

      <AdminPropertyForm initialData={property} mode="edit" />
    </main>
  );
}
