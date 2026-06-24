import { promises as fs } from "fs";
import path from "path";
import { ActivityLogEvent } from "@/lib/activity-log";
import { ChatActionRun } from "@/lib/chat-data";
import { ToolRun } from "@/lib/mission-data";
import { ListingTaskRecord } from "@/lib/listing-tasks-data";
import { ProjectNoteRecord } from "@/lib/project-notes-data";
import { ProjectRecord } from "@/lib/projects-data";
import { CopilotMessage, normalizeCopilotMessages } from "@/lib/hermes-copilot";
import { UploadedFileRecord } from "@/lib/uploads-data";

export type MissionStore = {
  toolRuns: ToolRun[];
  chatRuns: ChatActionRun[];
  copilotMessages: CopilotMessage[];
  projects: ProjectRecord[];
  uploads: UploadedFileRecord[];
  projectNotes: ProjectNoteRecord[];
  listingTasks: ListingTaskRecord[];
  activityEvents: ActivityLogEvent[];
};

function resolveAppRoot() {
  const configuredRoot = process.env.MISSION_CONTROL_APP_ROOT?.trim();
  if (configuredRoot && configuredRoot !== ".") {
    return path.resolve(configuredRoot);
  }

  const initCwd = process.env.INIT_CWD?.trim();
  if (initCwd) {
    return path.resolve(initCwd);
  }

  const cwd = process.cwd();
  const parent = path.dirname(cwd);

  if (path.basename(cwd) === "standalone" && path.basename(parent) === ".next") {
    return path.resolve(cwd, "../..");
  }

  if (configuredRoot === ".") {
    return cwd;
  }

  return cwd;
}

function resolveDataDir() {
  const configuredDataDir = process.env.MISSION_CONTROL_DATA_DIR?.trim();
  if (configuredDataDir) {
    return path.resolve(configuredDataDir);
  }

  // Vercel serverless functions run from /var/task, which is read-only at runtime.
  // Keep the local/standalone JSON store behavior, but move ephemeral production
  // runtime state into /tmp so health checks and dashboard SSR do not crash.
  if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) {
    return path.join("/tmp", "mission-control-store");
  }

  return path.join(appRoot, "data");
}

const appRoot = resolveAppRoot();
const dataDir = resolveDataDir();
const dataFile = path.join(dataDir, "mission-control-store.json");
const backupFile = path.join(dataDir, "mission-control-store.bak.json");
const tempFile = path.join(dataDir, "mission-control-store.tmp.json");

const emptyStore: MissionStore = {
  toolRuns: [],
  chatRuns: [],
  copilotMessages: [],
  projects: [],
  uploads: [],
  projectNotes: [],
  listingTasks: [],
  activityEvents: [],
};

export async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(emptyStore, null, 2), "utf8");
  }
}

function isMissionStore(value: unknown): value is Partial<MissionStore> {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<MissionStore>;
  return (
    Array.isArray(candidate.toolRuns) &&
    Array.isArray(candidate.chatRuns) &&
    Array.isArray(candidate.projects) &&
    Array.isArray(candidate.uploads)
  );
}

function normalizeStore(store: Partial<MissionStore>): MissionStore {
  return {
    toolRuns: Array.isArray(store.toolRuns) ? store.toolRuns : [],
    chatRuns: Array.isArray(store.chatRuns) ? store.chatRuns : [],
    copilotMessages: normalizeCopilotMessages(store.copilotMessages),
    projects: Array.isArray(store.projects) ? store.projects : [],
    uploads: Array.isArray(store.uploads) ? store.uploads : [],
    projectNotes: Array.isArray(store.projectNotes) ? store.projectNotes : [],
    listingTasks: Array.isArray(store.listingTasks) ? store.listingTasks : [],
    activityEvents: Array.isArray(store.activityEvents) ? store.activityEvents : [],
  };
}

async function parseStoreFile(filePath: string) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!isMissionStore(parsed)) {
    throw new Error(`Invalid mission store format in ${path.basename(filePath)}`);
  }

  return normalizeStore(parsed);
}

export async function readStore(): Promise<MissionStore> {
  await ensureStore();

  try {
    return await parseStoreFile(dataFile);
  } catch {
    try {
      const backupStore = await parseStoreFile(backupFile);
      await fs.writeFile(dataFile, JSON.stringify(backupStore, null, 2), "utf8");
      return backupStore;
    } catch {
      await fs.writeFile(dataFile, JSON.stringify(emptyStore, null, 2), "utf8");
      return emptyStore;
    }
  }
}

export async function writeStore(store: MissionStore) {
  await ensureStore();

  try {
    await fs.copyFile(dataFile, backupFile);
  } catch {
    // first write; no existing file to back up yet
  }

  const payload = JSON.stringify(store, null, 2);
  await fs.writeFile(tempFile, payload, "utf8");
  await fs.rename(tempFile, dataFile);
}
