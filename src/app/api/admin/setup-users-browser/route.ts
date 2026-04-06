export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { db } from "@/lib/firestore";
import { hashPassword, USERS_COLLECTION } from "@/lib/users";

const DEFAULT_USERS = [
  {
    email: "ryantschneider-dotcom@gmail.com",
    name: "Ryan T. Schneider",
    role: "admin",
    passwordEnv: "SETUP_ADMIN_PASSWORD",
  },
  {
    email: "anthony@piercommercial.com",
    name: "Anthony",
    role: "broker",
    passwordEnv: "SETUP_ANTHONY_PASSWORD",
  },
  {
    email: "joel@piercommercial.com",
    name: "Joel",
    role: "broker",
    passwordEnv: "SETUP_JOEL_PASSWORD",
  },
] as const;

export async function POST() {
  try {
    const created = [] as Array<{ email: string; role: string }>;
    const skipped = [] as Array<{ email: string; reason: string }>;
    const now = new Date().toISOString();

    for (const user of DEFAULT_USERS) {
      const password = process.env[user.passwordEnv];
      if (!password) {
        skipped.push({ email: user.email, reason: `Missing ${user.passwordEnv}` });
        continue;
      }

      const docRef = db.collection(USERS_COLLECTION).doc(user.email.toLowerCase());
      const existing = await docRef.get();
      if (existing.exists) {
        skipped.push({ email: user.email, reason: "Already exists" });
        continue;
      }

      await docRef.set({
        email: user.email.toLowerCase(),
        name: user.name,
        role: user.role,
        active: true,
        passwordHash: hashPassword(password),
        createdAt: now,
        updatedAt: now,
      });

      created.push({ email: user.email, role: user.role });
    }

    return NextResponse.json({ ok: true, created, skipped });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to initialize portal users" }, { status: 500 });
  }
}
