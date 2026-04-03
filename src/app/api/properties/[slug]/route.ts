import { NextResponse } from "next/server";

import { getPropertyBySlug } from "@/lib/properties";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const property = await getPropertyBySlug(slug);

  if (!property) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(property);
}
