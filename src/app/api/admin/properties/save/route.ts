import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import fs from "node:fs";

function initFirebaseAdmin() {
  if (getApps().length) return getApps()[0]!;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const raw = fs.readFileSync(credPath!, "utf-8");
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

export async function POST(request: Request) {
  try {
    const { idToken } = await request.json();
    const app = initFirebaseAdmin();
    
    const expiresIn = 60 * 60 * 24 * 5 * 1000; 
    const sessionCookie = await getAuth(app).createSessionCookie(idToken, { expiresIn });

    const cookieStore = cookies();
    cookieStore.set("admin_session", sessionCookie, {
      maxAge: expiresIn,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Session creation error:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}