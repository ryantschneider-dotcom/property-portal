import { UploadedFileRecord } from "@/lib/uploads-data";

export async function fetchUploads(): Promise<UploadedFileRecord[]> {
  const response = await fetch("/api/uploads", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to fetch uploads");
  }
  const data = (await response.json()) as { uploads: UploadedFileRecord[] };
  return data.uploads;
}

export async function uploadFile(file: File, projectId?: string, metadata?: { category?: string; notes?: string }) {
  const formData = new FormData();
  formData.append("file", file);
  if (projectId) formData.append("projectId", projectId);
  if (metadata?.category) formData.append("category", metadata.category);
  if (metadata?.notes) formData.append("notes", metadata.notes);

  const response = await fetch("/api/uploads", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Failed to upload file");
  }

  return response.json() as Promise<{ ok: true; uploads: UploadedFileRecord[] }>;
}
