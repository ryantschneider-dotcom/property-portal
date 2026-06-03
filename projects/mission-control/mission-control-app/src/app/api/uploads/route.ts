import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { pushActivityEvent } from "@/lib/activity-log";
import { UploadedFileRecord } from "@/lib/uploads-data";
import { readStore, writeStore } from "@/lib/storage";

const uploadsDir = path.join(process.cwd(), "data", "uploads");

export async function GET() {
  const store = await readStore();
  return NextResponse.json({ uploads: store.uploads });
}

export async function POST(request: NextRequest) {
  await fs.mkdir(uploadsDir, { recursive: true });

  const formData = await request.formData();
  const file = formData.get("file");
  const projectId = formData.get("projectId")?.toString() || undefined;
  const category = formData.get("category")?.toString() || undefined;
  const notes = formData.get("notes")?.toString().trim() || undefined;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const storedName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const filePath = path.join(uploadsDir, storedName);

  await fs.writeFile(filePath, buffer);

  const store = await readStore();
  const record: UploadedFileRecord = {
    id: crypto.randomUUID(),
    originalName: file.name,
    storedName,
    path: `/api/uploads/file/${storedName}`,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
    createdAt: new Date().toISOString(),
    projectId,
    category: category === "Offering" || category === "Photos" || category === "Maps" || category === "Due Diligence" || category === "Agreement" || category === "Other" ? category : "Other",
    notes,
  };

  store.uploads = [record, ...store.uploads].slice(0, 200);
  const project = projectId ? store.projects.find((item) => item.id === projectId) : undefined;

  pushActivityEvent(store, {
    type: "upload",
    title: `Upload: ${record.originalName}`,
    detail: `${record.mimeType} • ${(record.size / 1024).toFixed(1)} KB`,
    projectId,
    projectName: project?.name,
    createdAt: record.createdAt,
  });

  await writeStore(store);

  return NextResponse.json({ ok: true, uploads: store.uploads });
}
