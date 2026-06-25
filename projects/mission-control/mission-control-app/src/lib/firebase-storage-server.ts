import path from "path";

import { uploadMissionControlFirebaseFile, safeFirebaseObjectSegment } from "@/lib/mission-control-firebase-storage";

function descriptionToFilename(description: string, originalName?: string) {
  const extension = path.extname(originalName || "") || ".pdf";
  const safeBase = description
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "Vault_Document";
  return `${safeBase}${extension}`;
}

export async function uploadVaultDocumentToFirebase(file: File, input: { propertyId: string; description: string }) {
  const filename = descriptionToFilename(input.description, file.name || "Title_Policy.pdf");
  const propertyId = safeFirebaseObjectSegment(input.propertyId || "listing");
  return uploadMissionControlFirebaseFile(file, {
    slug: propertyId,
    index: 1,
    folder: ["due-diligence-vault", propertyId],
    fallbackBaseName: filename,
  });
}

export { descriptionToFilename };
