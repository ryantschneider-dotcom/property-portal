import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function initFirebaseAdmin() {
  if (getApps().length) return getApps()[0]!;
  // Read the raw JSON string directly from Vercel's environment variables
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  return initializeApp({ credential: cert(JSON.parse(raw!)) });
}

export async function POST(request: Request) {
  try {
    const { idToken } = await request.json();
    const app = initFirebaseAdmin();
    
    const expiresIn = 60 * 60 * 24 * 5 * 1000; 
    const sessionCookie = await getAuth(app).createSessionCookie(idToken, { expiresIn });

    const cookieStore = await cookies();
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