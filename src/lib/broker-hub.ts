import { randomUUID } from "crypto";

import { storage } from "@/lib/firestore";
export {
  BROKER_HUB_BROKERS,
  BROKER_HUB_COUNTIES,
  BROKER_HUB_LEASE_TYPES,
  BROKER_HUB_PROPERTY_TYPES,
  BROKER_HUB_TRANSACTION_TYPES,
  buildListingSlug,
  getCountyEnrichmentPlan,
  normalizeCountyName,
  normalizeParcelId,
  parseOptionalNumber,
  slugify,
} from "@/lib/broker-hub-shared";

export async function uploadBrokerAsset(folder: "intake" | "revision", slug: string, file: File, index: number) {
  const bucket = storage.bucket();
  const bytes = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const storagePath = `broker-hub/${folder}/${slug}/${Date.now()}-${index}-${safeName}`;
  const bucketFile = bucket.file(storagePath);

  await bucketFile.save(bytes, {
    metadata: {
      contentType: file.type || "application/octet-stream",
      cacheControl: "private, max-age=31536000",
    },
    resumable: false,
  });

  await bucketFile.makePublic();
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
  const isImage = (file.type || "").startsWith("image/");

  return {
    id: randomUUID(),
    title: file.name,
    filename: file.name,
    description: null,
    caption: null,
    documentType: isImage ? "photo" : "document",
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    uploadedAt: new Date().toISOString(),
    isPrimary: index === 0 && isImage,
    sortOrder: index,
    path: storagePath,
    url: publicUrl,
    urls: isImage
      ? {
          original: publicUrl,
          full: publicUrl,
          xlarge: publicUrl,
          large: publicUrl,
          medium: publicUrl,
          thumb: publicUrl,
        }
      : undefined,
  };
}
