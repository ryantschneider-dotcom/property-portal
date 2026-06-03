import { NextResponse } from "next/server";
import { ensureStore } from "@/lib/storage";

export async function GET() {
  await ensureStore();

  return NextResponse.json({
    ok: true,
    service: "mission-control",
    timestamp: new Date().toISOString(),
  });
}
