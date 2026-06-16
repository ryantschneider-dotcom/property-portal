import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { uploadMissionControlFirebaseFile } from "@/lib/mission-control-firebase-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_COPILOT_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_COPILOT_ATTACHMENTS = 8;
const ALLOWED_COPILOT_ATTACHMENT_TYPES = [
  /^image\//,
  /^application\/pdf$/,
  /^text\//,
  /^application\/json$/,
  /^application\/csv$/,
  /^text\/csv$/,
  /^application\/vnd\.openxmlformats-officedocument/,
  /^application\/msword$/,
  /^application\/vnd\.ms-/,
];

async function requireAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

function isAllowedCopilotAttachment(file: File) {
  const type = file.type || "application/octet-stream";
  return ALLOWED_COPILOT_ATTACHMENT_TYPES.some((pattern) => pattern.test(type)) || /\.(png|jpe?g|gif|webp|pdf|txt|csv|json|docx?|xlsx?|pptx?)$/i.test(file.name || "");
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const formData = await request.formData();
    const files = formData.getAll("files").filter((item): item is File => item instanceof File).slice(0, MAX_COPILOT_ATTACHMENTS);
    if (!files.length) return NextResponse.json({ error: "No files uploaded" }, { status: 400 });

    for (const file of files) {
      if (file.size > MAX_COPILOT_ATTACHMENT_BYTES) return NextResponse.json({ error: `${file.name || "Attachment"} exceeds 25 MB` }, { status: 413 });
      if (!isAllowedCopilotAttachment(file)) return NextResponse.json({ error: `${file.name || "Attachment"} is not an allowed Co-Pilot attachment type` }, { status: 415 });
    }

    const uploads = await Promise.all(files.map(async (file, index) => {
      const upload = await uploadMissionControlFirebaseFile(file, {
        index,
        folder: ["mission-control", "hermes-copilot", new Date().toISOString().slice(0, 10)],
        fallbackBaseName: `copilot-attachment-${index + 1}`,
      });
      return {
        id: crypto.randomUUID(),
        name: upload.originalName,
        url: upload.url,
        contentType: upload.contentType,
        size: upload.size,
        storagePath: upload.path,
      };
    }));

    return NextResponse.json({ ok: true, attachments: uploads });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to upload Co-Pilot attachment" }, { status: 500 });
  }
}
