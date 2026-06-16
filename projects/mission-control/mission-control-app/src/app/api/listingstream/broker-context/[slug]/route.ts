import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { AUTH_COOKIE, isValidAuthToken } from "@/lib/auth";
import { buildPropertyPortalUrl, createPropertyPortalProxyError, getPropertyPortalInternalHeaders, safePropertyPortalFetch } from "@/lib/property-portal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

const brokerDirectory: Record<string, { name: string; email: string }> = {
  "ryan": { name: "Ryan T. Schneider", email: "ryan@piercommercial.com" },
  "ryan t schneider": { name: "Ryan T. Schneider", email: "ryan@piercommercial.com" },
  "ryan t. schneider": { name: "Ryan T. Schneider", email: "ryan@piercommercial.com" },
  "joel": { name: "Joel Boblasky", email: "joel@piercommercial.com" },
  "joel boblasky": { name: "Joel Boblasky", email: "joel@piercommercial.com" },
  "anthony": { name: "Anthony Wagner", email: "anthony@piercommercial.com" },
  "anthony wagner": { name: "Anthony Wagner", email: "anthony@piercommercial.com" },
};

async function requirePierManagerAuth() {
  const cookieStore = await cookies();
  const ok = await isValidAuthToken(cookieStore.get(AUTH_COOKIE)?.value);
  if (!ok) throw new Error("Unauthorized");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringAt(source: unknown, path: string[]) {
  let current = source;
  for (const key of path) {
    if (!isRecord(current)) return "";
    current = current[key];
  }
  return typeof current === "string" || typeof current === "number" ? String(current).trim() : "";
}

function lookupBrokerDirectory(name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z.\s]/g, "").replace(/\s+/g, " ").trim();
  return brokerDirectory[normalized] || brokerDirectory[normalized.split(" ")[0]] || null;
}

function extractBrokerContext(listing: Record<string, unknown>) {
  const nameCandidates = [
    stringAt(listing, ["brokerProfile", "name"]),
    stringAt(listing, ["leadBroker", "name"]),
    stringAt(listing, ["leadBroker"]),
    stringAt(listing, ["listingAgent", "name"]),
    stringAt(listing, ["agent", "name"]),
    stringAt(listing, ["content", "leadBroker"]),
    stringAt(listing, ["content", "brokerName"]),
    stringAt(listing, ["property", "leadBroker"]),
  ];
  const emailCandidates = [
    stringAt(listing, ["brokerProfile", "email"]),
    stringAt(listing, ["leadBroker", "email"]),
    stringAt(listing, ["listingAgent", "email"]),
    stringAt(listing, ["agent", "email"]),
    stringAt(listing, ["brokerEmail"]),
    stringAt(listing, ["leadBrokerEmail"]),
    stringAt(listing, ["ownerEmail"]),
    stringAt(listing, ["content", "brokerEmail"]),
  ].filter((candidate) => /@/.test(candidate));
  const rawName = nameCandidates.find(Boolean) || "Ryan T. Schneider";
  const directory = lookupBrokerDirectory(rawName);
  return {
    name: directory?.name || rawName,
    email: emailCandidates[0] || directory?.email || "ryan@piercommercial.com",
    source: emailCandidates[0] ? "listing" : directory ? "pier-directory" : "fallback",
  };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requirePierManagerAuth();
    const { slug } = await context.params;
    const response = await safePropertyPortalFetch(fetch, buildPropertyPortalUrl(`/api/properties/${encodeURIComponent(slug)}?fresh=${Date.now()}`), {
      cache: "no-store",
      headers: {
        accept: "application/json",
        ...getPropertyPortalInternalHeaders(),
      },
    }, "broker context");
    const data = await response.json().catch(() => ({}));
    if (!isRecord(data)) return NextResponse.json({ error: "ListingStream did not return listing broker details." }, { status: 502 });
    return NextResponse.json({ ok: true, broker: extractBrokerContext(data) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const normalized = createPropertyPortalProxyError(error, "broker context");
    return NextResponse.json({ error: normalized.message }, { status: 503 });
  }
}
