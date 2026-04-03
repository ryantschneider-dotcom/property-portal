import { NextRequest, NextResponse } from "next/server";

import { listMapMarkers } from "@/lib/properties";

export async function GET(request: NextRequest) {
  const transactionParam = request.nextUrl.searchParams.get("transaction");
  const transaction = transactionParam === "sale" || transactionParam === "lease" ? transactionParam : "all";

  const items = await listMapMarkers(transaction);
  return NextResponse.json({ items });
}
