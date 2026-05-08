import "server-only";

const DEFAULT_TIMEOUT_MS = 60_000;

type LaunchpadResearchResult = {
  public_records?: Record<string, unknown>;
  places?: Record<string, unknown>;
  research?: Record<string, unknown>;
  ai_copy?: Record<string, unknown>;
};

function asString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function getLaunchpadServiceUrl() {
  return asString(process.env.LAUNCHPAD_SERVICE_URL || process.env.LAUNCHPAD_API_URL);
}

function getLaunchpadServiceToken() {
  return asString(process.env.LAUNCHPAD_SERVICE_TOKEN || process.env.LAUNCHPAD_API_TOKEN);
}

function getLaunchpadServiceTimeoutMs() {
  const raw = Number(process.env.LAUNCHPAD_SERVICE_TIMEOUT_MS || process.env.LAUNCHPAD_API_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

export function hasLaunchpadServiceConfig() {
  return Boolean(getLaunchpadServiceUrl());
}

export async function runLaunchpadEnrichment(
  row: Record<string, unknown>,
  mapCoordinates?: { lat?: number | null; lng?: number | null } | null,
) {
  const serviceUrl = getLaunchpadServiceUrl();
  if (!serviceUrl) {
    throw new Error("LAUNCHPAD_SERVICE_URL missing in Node runtime");
  }

  const timeoutMs = getLaunchpadServiceTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/enrich`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(getLaunchpadServiceToken() ? { Authorization: `Bearer ${getLaunchpadServiceToken()}` } : {}),
      },
      body: JSON.stringify({
        row,
        mapCoordinates: mapCoordinates ?? null,
      }),
    });

    const text = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = text ? JSON.parse(text) as Record<string, unknown> : {};
    } catch {
      throw new Error(`Launchpad service returned non-JSON response (${response.status})`);
    }

    if (!response.ok) {
      throw new Error(asString(payload.error) || `Launchpad service failed (${response.status})`);
    }

    return {
      public_records: (payload.public_records as Record<string, unknown> | undefined) ?? {},
      places: (payload.places as Record<string, unknown> | undefined) ?? {},
      research: (payload.research as Record<string, unknown> | undefined) ?? {},
      ai_copy: (payload.ai_copy as Record<string, unknown> | undefined) ?? {},
    } satisfies LaunchpadResearchResult;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Launchpad service timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
