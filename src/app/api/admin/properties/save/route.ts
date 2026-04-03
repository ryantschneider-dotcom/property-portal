import { NextResponse } from "next/server";
import { db, PROPERTIES_COLLECTION } from "@/lib/firestore";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const docId = payload.id;
    
    if (!docId) {
      return NextResponse.json({ error: "Missing property ID" }, { status: 400 });
    }

    const cleanPayload = JSON.parse(JSON.stringify(payload));
    await db.collection(PROPERTIES_COLLECTION).doc(docId).set(cleanPayload, { merge: true });

    return NextResponse.json({ success: true, id: docId });
  } catch (error) {
    console.error("Save error:", error);
    return NextResponse.json({ error: "Failed to save property" }, { status: 500 });
  }
}