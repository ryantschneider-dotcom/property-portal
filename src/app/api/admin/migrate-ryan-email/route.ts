export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { db } from "@/lib/firestore";
import { hashPassword, USERS_COLLECTION } from "@/lib/users";

const OLD_EMAIL = "ryantschneider-dotcom@gmail.com";
const NEW_EMAIL = "ryan@piercommercial.com";

export async function POST() {
  try {
    const now = new Date().toISOString();
    const newPassword = process.env.SETUP_ADMIN_PASSWORD;
    if (!newPassword) {
      return NextResponse.json({ error: "Missing SETUP_ADMIN_PASSWORD" }, { status: 500 });
    }

    const oldRef = db.collection(USERS_COLLECTION).doc(OLD_EMAIL);
    const newRef = db.collection(USERS_COLLECTION).doc(NEW_EMAIL);

    const [oldDoc, newDoc] = await Promise.all([oldRef.get(), newRef.get()]);

    if (!newDoc.exists) {
      await newRef.set({
        email: NEW_EMAIL,
        name: "Ryan T. Schneider",
        role: "admin",
        active: true,
        passwordHash: hashPassword(newPassword),
        createdAt: now,
        updatedAt: now,
        migratedFrom: oldDoc.exists ? OLD_EMAIL : null,
      }, { merge: true });
    } else {
      await newRef.set({
        email: NEW_EMAIL,
        name: "Ryan T. Schneider",
        role: "admin",
        active: true,
        passwordHash: hashPassword(newPassword),
        updatedAt: now,
      }, { merge: true });
    }

    if (oldDoc.exists) {
      await oldRef.set({
        active: false,
        replacedBy: NEW_EMAIL,
        updatedAt: now,
      }, { merge: true });
    }

    return NextResponse.json({ ok: true, oldEmail: OLD_EMAIL, newEmail: NEW_EMAIL, oldUserExisted: oldDoc.exists, newUserExisted: newDoc.exists });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to migrate Ryan admin email" }, { status: 500 });
  }
}
