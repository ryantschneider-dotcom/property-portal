import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { getMailchimpConfig, normalizeMailchimpLists } from "@/lib/mailchimp-listing-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

function mailchimpHeaders(apiKey: string) {
  return {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`mission-control:${apiKey}`).toString("base64")}`,
  };
}

export async function GET() {
  try {
    await requirePierManagerAuth();
    const config = getMailchimpConfig();
    if (!config.configured) {
      return NextResponse.json({ configured: false, items: [], error: "Mailchimp is not configured yet. Add MAILCHIMP_API_KEY with the data-center suffix (example: ...-us1) before pulling audiences." });
    }

    const response = await fetch(`${config.apiBaseUrl}/lists?count=1000&sort_field=date_created&sort_dir=DESC`, {
      cache: "no-store",
      headers: mailchimpHeaders(config.apiKey),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ configured: true, items: [], error: "Mailchimp audience lookup failed. Check the API key permissions and server prefix." }, { status: response.status });
    }
    return NextResponse.json({ configured: true, items: normalizeMailchimpLists(data) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Could not load Mailchimp audiences." }, { status: 503 });
  }
}
