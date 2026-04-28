import "server-only";

import { execFile } from "child_process";
import { readFileSync } from "fs";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const PYTHON = process.env.PYTHON_BIN || "python3";
const LAUNCHPAD_PATH = `${process.cwd()}/scripts/listing_launchpad.py`;
const SCRIPTS_ENV = "/data/.openclaw/workspace/scripts/.env";

type LaunchpadResearchResult = {
  public_records?: Record<string, unknown>;
  places?: Record<string, unknown>;
  research?: Record<string, unknown>;
  ai_copy?: Record<string, unknown>;
};

function loadScriptEnv() {
  try {
    const text = readFileSync(SCRIPTS_ENV, "utf8");
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
  const script = `
import importlib.util, json, os
from pathlib import Path

launchpad_path = ${JSON.stringify(LAUNCHPAD_PATH)}
env_path = ${JSON.stringify(SCRIPTS_ENV)}
if Path(env_path).exists():
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

  const env = {
    ...loadScriptEnv(),
    ...process.env,
  };

  const { stdout, stderr } = await execFileAsync(PYTHON, ["-c", script], {
    cwd: "/data/.openclaw/workspace/property-portal",
    env,
    maxBuffer: 1024 * 1024 * 8,
  });

  if (stderr && stderr.trim()) {
    console.warn("launchpad enrichment stderr:", stderr.trim());
  }

  return parseJsonBlock(stdout);
}
