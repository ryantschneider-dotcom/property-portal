import type { PropertyDetail } from "@/lib/types";

type PropertyDocumentsProps = {
  property: PropertyDetail;
};

export function PropertyDocuments({ property }: PropertyDocumentsProps) {
  if (!property.media.documents.length) {
    return (
      <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-8 text-sm text-zinc-500">
        No documents attached to this property yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {property.media.documents.map((document, index) => (
        <a
          key={`${document.id ?? index}`}
          href={document.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-zinc-400"
        >
          <p className="text-base font-semibold text-zinc-900">{document.title ?? document.filename ?? `Document ${index + 1}`}</p>
          {document.description ? <p className="mt-1 text-sm text-zinc-600">{document.description}</p> : null}
          <p className="mt-2 text-sm font-medium text-zinc-900">Open document →</p>
        </a>
      ))}
    </div>
  );
}
