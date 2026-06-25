import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { uploadVaultDocumentToFirebase } from "@/lib/firebase-storage-server";
import { buildPropertyPortalUrl, createPropertyPortalProxyError, getPropertyPortalInternalHeaders, safePropertyPortalFetch } from "@/lib/property-portal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

async function registerVaultDocument(payload: Record<string, unknown>) {
  const response = await safePropertyPortalFetch(fetch, buildPropertyPortalUrl("/api/broker/vault-documents"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...getPropertyPortalInternalHeaders(),
    },
    body: JSON.stringify(payload),
  }, "vault document registration");
  const data = await response.json().catch(() => ({}));
  return { data, status: response.status };
}

export async function POST(request: Request) {
  try {
    await requirePierManagerAuth();
    const formData = await request.formData();
    const file = formData.get("file");
    const propertyId = String(formData.get("propertyId") || "").trim();
    const description = String(formData.get("description") || "").trim();
    if (!(file instanceof File)) return NextResponse.json({ error: "Vault document file is required." }, { status: 400 });
    if (!propertyId) return NextResponse.json({ error: "propertyId is required." }, { status: 400 });
    if (!description) return NextResponse.json({ error: "Document description is required." }, { status: 400 });

    const upload = await uploadVaultDocumentToFirebase(file, { propertyId, description });
    const registered = await registerVaultDocument({
      propertyId,
      description,
      fileName: upload.originalName,
      contentType: upload.contentType,
      size: upload.size,
      storagePath: upload.path,
      url: upload.url,
    });
    return NextResponse.json({ ok: true, upload, registration: registered.data }, { status: registered.status });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const normalized = createPropertyPortalProxyError(error, "vault document upload");
    return NextResponse.json({ error: normalized.message }, { status: 503 });
  }
}

export { registerVaultDocument };
