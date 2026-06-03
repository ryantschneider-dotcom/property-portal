import { NextRequest, NextResponse } from "next/server";
import { pushActivityEvent } from "@/lib/activity-log";
import {
  createListingTask,
  getTasksForProject,
  isListingTaskPriority,
  isListingTaskStatus,
  ListingTaskPriority,
  ListingTaskStatus,
} from "@/lib/listing-tasks-data";
import { readStore, writeStore } from "@/lib/storage";

type TaskBody = {
  id?: string;
  projectId?: string;
  title?: string;
  description?: string;
  owner?: string;
  priority?: ListingTaskPriority;
  status?: ListingTaskStatus;
};

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId") || undefined;
  const store = await readStore();
  return NextResponse.json({ tasks: getTasksForProject(store.listingTasks, projectId) });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as TaskBody;

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const store = await readStore();
  const task = createListingTask({
    projectId: body.projectId,
    title: body.title,
    description: body.description,
    owner: body.owner,
    priority: isListingTaskPriority(body.priority) ? body.priority : "Normal",
    status: isListingTaskStatus(body.status) ? body.status : "todo",
  });

  store.listingTasks = [task, ...store.listingTasks].slice(0, 500);
  const project = task.projectId ? store.projects.find((item) => item.id === task.projectId) : undefined;

  pushActivityEvent(store, {
    type: "project",
    title: `Task created: ${task.title}`,
    detail: task.description || `Priority: ${task.priority}`,
    projectId: task.projectId,
    projectName: project?.name,
    createdAt: task.createdAt,
  });

  await writeStore(store);
  return NextResponse.json({ ok: true, tasks: getTasksForProject(store.listingTasks, body.projectId) });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as TaskBody;

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const store = await readStore();
  const existing = store.listingTasks.find((task) => task.id === body.id);

  if (!existing) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }

  const updated = {
    ...existing,
    title: body.title?.trim() || existing.title,
    description: body.description === undefined ? existing.description : body.description.trim() || undefined,
    owner: body.owner === undefined ? existing.owner : body.owner.trim() || undefined,
    priority: isListingTaskPriority(body.priority) ? body.priority : existing.priority,
    status: isListingTaskStatus(body.status) ? body.status : existing.status,
    projectId: body.projectId === undefined ? existing.projectId : body.projectId.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };

  store.listingTasks = store.listingTasks.map((task) => (task.id === updated.id ? updated : task));
  const project = updated.projectId ? store.projects.find((item) => item.id === updated.projectId) : undefined;

  pushActivityEvent(store, {
    type: "project",
    title: `Task updated: ${updated.title}`,
    detail: `Status: ${updated.status} • Priority: ${updated.priority}`,
    projectId: updated.projectId,
    projectName: project?.name,
    createdAt: updated.updatedAt,
  });

  await writeStore(store);
  return NextResponse.json({ ok: true, tasks: getTasksForProject(store.listingTasks, updated.projectId) });
}
