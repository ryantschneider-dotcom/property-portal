export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "crypto";

import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";
import { getPortalSession } from "@/lib/portal-session";
import { uploadBrokerAsset } from "@/lib/broker-hub";

export async function POST(request: Request) {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const propertyId = String(formData.get("propertyId") ?? "").trim();
    const instructions = String(formData.get("instructions") ?? "").trim();
    const files = formData.getAll("assets").filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (!propertyId || !instructions) {
      return NextResponse.json({ error: "Property and revision instructions are required." }, { status: 400 });
    }

    const propertyRef = db.collection(PROPERTIES_COLLECTION).doc(propertyId);
    const snapshot = await propertyRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ error: "Property not found." }, { status: 404 });
    }

    const raw = (snapshot.data() as Record<string, any> | undefined) ?? {};
    const slug = String(snapshot.get("slug") ?? propertyId);
    const revisionWorkflow = raw.meta?.revisionWorkflow ?? {};
    const currentRequest = revisionWorkflow.currentRequest ?? null;

    const uploadedAssets = await Promise.all(files.map((file, index) => uploadBrokerAsset("revision", slug, file, index)));
    const now = new Date().toISOString();
    const responseId = randomUUID();
    const documentEntries = uploadedAssets
      .filter((asset) => asset.documentType !== "photo")
      .map((asset) => ({
        id: asset.id,
        title: asset.title,
        description: null,
        documentType: "revision-support",
        url: asset.url,
        filename: asset.filename,
        contentType: asset.contentType,
      }));
    const imageEntries = uploadedAssets
      .filter((asset) => asset.documentType === "photo")
      .map((asset) => ({
        id: asset.id,
        title: asset.title,
        caption: null,
        isPrimary: false,
        sortOrder: asset.sortOrder,
        urls: asset.urls,
      }));

    const brokerResponse = {
      id: responseId,
      createdAt: now,
      createdByEmail: session.email,
      createdByName: session.name,
      instructions,
      uploadedAssets,
      uploadedAssetCount: uploadedAssets.length,
      status: "broker_updated",
      mode: "enrich_edit_request",
    };

    const updatePayload: Record<string, unknown> = {
      updatedAt: now,
      updatedByUserId: session.email,
      workflowStatus: "broker_updated_pending_review",
      meta: {
        updatedAt: now,
        revisionQueue: FieldValue.arrayUnion({
          ...brokerResponse,
          requestId: currentRequest?.id ?? null,
        }),
        latestRevisionRequest: {
          createdAt: now,
          createdByEmail: session.email,
          createdByName: session.name,
          instructions,
          uploadedAssetCount: uploadedAssets.length,
          requestId: currentRequest?.id ?? null,
          mode: "enrich_edit_request",
        },
        brokerHub: {
          latestEditRequest: {
            createdAt: now,
            createdByEmail: session.email,
            createdByName: session.name,
            instructions,
            uploadedAssetCount: uploadedAssets.length,
            propertyId,
            slug,
            mode: "enrich_edit_request",
          },
        },
        enrichment: {
          editRequest: {
            status: "queued",
            requestedAt: now,
            requestedByEmail: session.email,
            requestedByName: session.name,
            instructions,
            uploadedAssetCount: uploadedAssets.length,
            mode: "enrich_edit_request",
          },
        },
        revisionWorkflow: currentRequest
          ? {
              currentRequest: {
                ...currentRequest,
                status: "broker_updated",
                brokerResponse,
                brokerUpdatedAt: now,
                brokerUpdatedBy: session.email,
              },
              history: FieldValue.arrayUnion({
                ...currentRequest,
                status: "broker_updated",
                brokerResponse,
                brokerUpdatedAt: now,
                brokerUpdatedBy: session.email,
              }),
            }
          : {
              history: FieldValue.arrayUnion({
                id: responseId,
                createdAt: now,
                createdBy: session.email,
                createdByName: session.name,
                status: "broker_updated",
                summary: instructions,
                categories: [],
                brokerResponse,
              }),
            },
      },
    };

    if (documentEntries.length || imageEntries.length) {
      updatePayload.media = {
        ...(documentEntries.length ? { documents: FieldValue.arrayUnion(...documentEntries) } : {}),
        ...(imageEntries.length ? { images: FieldValue.arrayUnion(...imageEntries) } : {}),
      };
    }

    await propertyRef.set(updatePayload, { merge: true });

    revalidatePath("/broker/revisions");
    revalidatePath("/broker");
    revalidatePath("/admin/properties");
    revalidatePath(`/admin/properties/${slug}/edit`);

    return NextResponse.json({
      ok: true,
      propertyId,
      slug,
      uploadedAssetCount: uploadedAssets.length,
      workflowStatus: "broker_updated_pending_review",
      revisionRequestId: currentRequest?.id ?? null,
      responseId,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to save revision request." }, { status: 500 });
  }
}
