import { NextRequest, NextResponse } from "next/server";
import { pushActivityEvent } from "@/lib/activity-log";
import { ChatActionRun } from "@/lib/chat-data";
import { ToolRun } from "@/lib/mission-data";
import { readStore, writeStore } from "@/lib/storage";

export async function GET() {
  const store = await readStore();
  return NextResponse.json(store);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    kind: "tool" | "chat";
    run: ToolRun | ChatActionRun;
  };

  const store = await readStore();

  if (body.kind === "tool") {
    store.toolRuns = [body.run as ToolRun, ...store.toolRuns].slice(0, 100);
  } else {
    store.chatRuns = [body.run as ChatActionRun, ...store.chatRuns].slice(0, 100);
  }

  const runProjectId = body.run.projectId;
  if (runProjectId) {
    store.projects = store.projects.map((project) =>
      project.id === runProjectId
        ? {
            ...project,
            linkedRunIds: Array.from(new Set([body.run.id, ...project.linkedRunIds])),
          }
        : project,
    );
  }

  pushActivityEvent(store, {
    type: body.kind,
    title: body.kind === "tool" ? `Tool run: ${(body.run as ToolRun).toolName}` : `Chat action: ${(body.run as ChatActionRun).presetLabel}`,
    detail:
      body.kind === "tool"
        ? (body.run as ToolRun).output
        : (body.run as ChatActionRun).output,
    projectId: body.run.projectId,
    projectName: body.run.projectName,
    createdAt: body.run.createdAt,
  });

  await writeStore(store);
  return NextResponse.json({ ok: true, store });
}
