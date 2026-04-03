import { NextRequest, NextResponse } from "next/server";

import { listPropertyCards } from "@/lib/properties";

export async function GET(request: NextRequest) {
  const transactionParam = request.nextUrl.searchParams.get("transaction");
  const transaction = transactionParam === "sale" || transactionParam === "lease" ? transactionParam : "all";

  const items = await listPropertyCards(transaction);

  return NextResponse.json({
    items,
    pageInfo: {
      limit: items.length,
      hasMore: false,
      nextCursor: null,
    },
  });
}
