import "server-only";

import { execFile } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = process.cwd();
const PYTHON = process.env.PYTHON_BIN || "python3";
const LAUNCHPAD_PATH = path.join(PROJECT_ROOT, "scripts", "listing_launchpad.py");
const ENV_CANDIDATES = [
  "/data/.openclaw/workspace/scripts/.env",
  path.join(PROJECT_ROOT, ".env.local"),
  path.join(PROJECT_ROOT, ".env"),
  path.join(PROJECT_ROOT, "scripts", ".env"),
];

type LaunchpadResearchResult = {
  public_records?: Record<string, unknown>;
  places?: Record<string, unknown>;
  research?: Record<string, unknown>;
  ai_copy?: Record<string, unknown>;
};

function parseEnvFile(filePath: string) {
  const text = readFileSync(filePath, "utf8");
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key) values[key] = value;
  }
  return values;
}

function resolveEnvPath() {
  return ENV_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
}

function loadScriptEnv() {
  const envPath = resolveEnvPath();
  if (!envPath) return {};

  try {
    return parseEnvFile(envPath);
  } catch {
    return {};
  }
}

function parseJsonBlock(stdout: string) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const candidate = lines.slice(i).join("\n");
    try {
      return JSON.parse(candidate) as LaunchpadResearchResult;
    } catch {
      // keep scanning upward for the final JSON block
    }
  }
  throw new Error("Unable to parse launchpad enrichment output");
}

export async function runLaunchpadEnrichment(row: Record<string, unknown>, mapCoordinates?: { lat?: number | null; lng?: number | null } | null) {
  const env = {
    ...loadScriptEnv(),
    ...process.env,
  };

  const envPath = resolveEnvPath();

  console.log("[enrich][launchpad] starting python enrichment", {
    address: row.street_name,
    city: row.city,
    state: row.state,
    zip: row.zip_code,
    projectRoot: PROJECT_ROOT,
    cwdExists: existsSync(PROJECT_ROOT),
    launchpadPath: LAUNCHPAD_PATH,
    launchpadExists: existsSync(LAUNCHPAD_PATH),
    envPath,
    hasInputCoordinates: Boolean(mapCoordinates?.lat != null && mapCoordinates?.lng != null),
    hasOpenAiKey: Boolean(env.OPENAI_API_KEY),
    hasMapsKey: Boolean(env.Maps_API_KEY),
    openAiModel: env.OPENAI_MODEL || null,
  });

  const script = `
import importlib.util, json, os
from pathlib import Path

launchpad_path = ${JSON.stringify(LAUNCHPAD_PATH)}
env_path = ${JSON.stringify(envPath)}
if env_path and Path(env_path).exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
    except Exception:
        pass

spec = importlib.util.spec_from_file_location('listing_launchpad', launchpad_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

row = json.loads(${JSON.stringify(JSON.stringify(row))})
coords = json.loads(${JSON.stringify(JSON.stringify(mapCoordinates ?? {}))})
map_coordinates = None
if isinstance(coords, dict) and coords.get('lat') is not None and coords.get('lng') is not None:
    map_coordinates = {'lat': coords.get('lat'), 'lng': coords.get('lng')}

public_records = module.research_public_records_placeholder(row)
places = module.research_google_places(row, map_coordinates)
research = module.enrich_research_package(row, public_records, {'public_records': public_records, 'places': places})
public_records = research.get('public_records') or public_records
places = research.get('places') or places
ai_copy = module.generate_ai_copy(row, public_records, research)

print(json.dumps({
    'public_records': public_records,
    'places': places,
    'research': research,
    'ai_copy': ai_copy,
}, default=str))
`.trim();

  const { stdout, stderr } = await execFileAsync(PYTHON, ["-c", script], {
    cwd: PROJECT_ROOT,
    env,
    maxBuffer: 1024 * 1024 * 8,
  });

  if (stderr && stderr.trim()) {
    console.warn("[enrich][launchpad] python stderr", stderr.trim());
  }

  const parsed = parseJsonBlock(stdout);
  console.log("[enrich][launchpad] completed python enrichment", {
    placesStatus: parsed.places && typeof parsed.places === "object" ? (parsed.places as Record<string, unknown>).status ?? null : null,
    aiGenerator: parsed.ai_copy && typeof parsed.ai_copy === "object" ? (parsed.ai_copy as Record<string, unknown>).generator ?? null : null,
    aiError: parsed.ai_copy && typeof parsed.ai_copy === "object" ? (parsed.ai_copy as Record<string, unknown>).error ?? null : null,
    researchKeys: parsed.research && typeof parsed.research === "object" ? Object.keys(parsed.research) : [],
  });

  return parsed;
}
