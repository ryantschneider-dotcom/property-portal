import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { createMissionControlFirebaseSignedUpload } from "@/lib/mission-control-firebase-storage";

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
  /^application\/octet-stream$/,
];

type AttachmentRequest = {
  files?: Array<{
    name?: unknown;
    type?: unknown;
    size?: unknown;
  }>;
};

async function requireAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

function isAllowedCopilotAttachment(file: { name: string; type: string }) {
  const type = file.type || "application/octet-stream";
  return ALLOWED_COPILOT_ATTACHMENT_TYPES.some((pattern) => pattern.test(type)) || /\.(png|jpe?g|gif|webp|pdf|txt|csv|json|docx?|xlsx?|pptx?)$/i.test(file.name || "");
}

function normalizeRequestedFiles(body: AttachmentRequest) {
  if (!Array.isArray(body.files)) return [];
  return body.files.slice(0, MAX_COPILOT_ATTACHMENTS).map((file, index) => {
    const name = typeof file.name === "string" && file.name.trim() ? file.name.trim() : `copilot-attachment-${index + 1}`;
    const type = typeof file.type === "string" && file.type.trim() ? file.type.trim() : "application/octet-stream";
    const size = typeof file.size === "number" ? file.size : Number(file.size || 0);
    return { name, type, size };
  });
}

export async function POST(request: Request) {
  try {
    await requireAuth();
    const body = (await request.json().catch(() => ({}))) as AttachmentRequest;
    const files = normalizeRequestedFiles(body);
    if (!files.length) return NextResponse.json({ error: "No files requested for signed upload" }, { status: 400 });

    for (const file of files) {
      if (!Number.isFinite(file.size) || file.size <= 0) return NextResponse.json({ error: `${file.name || "Attachment"} has an invalid size` }, { status: 400 });
      if (file.size > MAX_COPILOT_ATTACHMENT_BYTES) return NextResponse.json({ error: `${file.name || "Attachment"} exceeds 25 MB` }, { status: 413 });
      if (!isAllowedCopilotAttachment(file)) return NextResponse.json({ error: `${file.name || "Attachment"} is not an allowed Co-Pilot attachment type` }, { status: 415 });
    }

    const signedUploads = files.map((file, index) => createMissionControlFirebaseSignedUpload({
      originalName: file.name,
      contentType: file.type,
      size: file.size,
      index,
      folder: ["mission-control", "hermes-copilot", new Date().toISOString().slice(0, 10)],
      fallbackBaseName: `copilot-attachment-${index + 1}`,
      expiresInSeconds: 15 * 60,
    })).map((upload) => ({
      id: upload.id,
      name: upload.originalName,
      url: upload.url,
      contentType: upload.contentType,
      size: upload.size,
      storagePath: upload.path,
      uploadUrl: upload.uploadUrl,
      method: upload.method,
      headers: upload.headers,
      expiresAt: upload.expiresAt,
    }));

    return NextResponse.json({ ok: true, attachments: signedUploads });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to prepare Co-Pilot attachment upload" }, { status: 500 });
  }
}
