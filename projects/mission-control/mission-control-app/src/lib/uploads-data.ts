export type UploadedFileRecord = {
  id: string;
  originalName: string;
  storedName: string;
  path: string;
  size: number;
  mimeType: string;
  createdAt: string;
  projectId?: string;
  category?: "Offering" | "Photos" | "Maps" | "Due Diligence" | "Agreement" | "Other";
  notes?: string;
};
