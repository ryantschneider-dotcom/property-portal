import { ActivityLogEvent } from "@/lib/activity-log";
import { ChatActionRun } from "@/lib/chat-data";
import { ToolRun } from "@/lib/mission-data";
import { ProjectSummary } from "@/lib/project-summaries";

export type MissionStoreClient = {
  toolRuns: ToolRun[];
  chatRuns: ChatActionRun[];
  projects: ProjectSummary[];
  activityEvents: ActivityLogEvent[];
};

export async function fetchRuns(): Promise<MissionStoreClient> {
  const response = await fetch("/api/runs", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to fetch run history");
  }
  return response.json();
}

export async function saveRun(kind: "tool" | "chat", run: ToolRun | ChatActionRun) {
  // 1. Save to internal Mission Control store first
  const response = await fetch("/api/runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ kind, run }),
  });

  if (!response.ok) {
    throw new Error("Failed to save run history");
  }

  // 2. Local Push: Bounce the payload through the Next.js backend
  try {
    await fetch("/api/wake-mack", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        trigger: "mission_control_task",
        kind: kind,
        taskId: run.id,
        name: kind === "tool" ? (run as ToolRun).toolName : (run as ChatActionRun).presetLabel,
        content: kind === "tool" ? (run as ToolRun).input : (run as ChatActionRun).context,
        projectId: run.projectId || "none"
      }),
    });
    console.log("Local push trigger fired successfully.");
  } catch (error) {
    console.error("Local trigger failed, but task was still saved locally.", error);
  }

  return response.json() as Promise<{ ok: true; store: MissionStoreClient }>;
}