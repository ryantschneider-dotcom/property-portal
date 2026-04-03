import Image from "next/image";

import type { PropertyDetail } from "@/lib/types";

type PropertyGalleryProps = {
  property: PropertyDetail;
};

export function PropertyGallery({ property }: PropertyGalleryProps) {
  const images = property.media.images.slice(0, 6);

  if (!images.length) {
    return (
      <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-8 text-sm text-zinc-500">
        No gallery images available yet.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {images.map((image, index) => {
        const src = image.urls.large ?? image.urls.xlarge ?? image.urls.full ?? image.urls.original;
        return (
          <div key={`${image.id ?? index}`} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="relative aspect-[4/3] bg-zinc-100">
              {src ? (
                <Image
                  src={src}
                  alt={image.title ?? property.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
              ) : null}
            </div>
            <div className="p-4">
              <p className="text-sm font-medium text-zinc-900">{image.title ?? `Gallery Image ${index + 1}`}</p>
              {image.caption ? <p className="mt-1 text-sm text-zinc-600">{image.caption}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
