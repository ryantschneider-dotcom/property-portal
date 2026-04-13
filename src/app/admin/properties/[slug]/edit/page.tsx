import { notFound } from "next/navigation";

import { AdminPropertyForm } from "@/components/admin-property-form";
import { getAdminPropertyFormData } from "@/lib/admin";
import { getAdminWorkflowSnapshot } from "@/lib/admin-workflow";
import { getPropertyBySlug } from "@/lib/properties";

export default async function EditAdminPropertyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [property, propertyDetail, workflow] = await Promise.all([
    getAdminPropertyFormData(slug),
    getPropertyBySlug(slug),
    getAdminWorkflowSnapshot(slug),
  ]);

  if (!property || !propertyDetail) {
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

      <AdminPropertyForm
        initialData={property}
        mode="edit"
        media={propertyDetail.media}
        documentId={propertyDetail.id}
        workflow={workflow ?? undefined}
      />
    </main>
  );
}
