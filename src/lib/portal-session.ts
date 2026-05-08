import "server-only";

import { cookies } from "next/headers";

import { normalizePortalRole, type PortalRole } from "@/lib/users";

export type PortalSession = {
  email: string;
  role: PortalRole;
  name: string;
};

export function parsePortalSession(value: string | undefined | null): PortalSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      email?: string;
      role?: PortalRole;
      name?: string;
    };

    if (!parsed.email || !parsed.role) return null;

    return {
      email: parsed.email,
      role: normalizePortalRole(parsed.role, parsed.email),
      name: parsed.name ?? parsed.email,
    };
  } catch {
    return null;
  }
}

export async function getPortalSession(): Promise<PortalSession | null> {
  const cookieStore = await cookies();
  return parsePortalSession(cookieStore.get("admin_session")?.value);
}
