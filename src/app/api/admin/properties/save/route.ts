import { NextResponse } from "next/server";

import { saveAdminProperty } from "@/lib/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await saveAdminProperty(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save property" },
      { status: 400 },
    );
  }
}
