export type ListingTaskStatus = "todo" | "doing" | "done";
export type ListingTaskPriority = "Low" | "Normal" | "High";

export type ListingTaskRecord = {
  id: string;
  projectId?: string;
  title: string;
  description?: string;
  owner?: string;
  priority: ListingTaskPriority;
  status: ListingTaskStatus;
  createdAt: string;
  updatedAt: string;
};

export type ListingTaskInput = {
  projectId?: string;
  title: string;
  description?: string;
  owner?: string;
  priority?: ListingTaskPriority;
  status?: ListingTaskStatus;
};

export const taskStatuses: ListingTaskStatus[] = ["todo", "doing", "done"];
export const taskPriorities: ListingTaskPriority[] = ["Low", "Normal", "High"];

function clean(value?: string) {
  return value?.trim() || undefined;
}

export function isListingTaskStatus(value: unknown): value is ListingTaskStatus {
  return typeof value === "string" && taskStatuses.includes(value as ListingTaskStatus);
}

export function isListingTaskPriority(value: unknown): value is ListingTaskPriority {
  return typeof value === "string" && taskPriorities.includes(value as ListingTaskPriority);
}

export function createListingTask(input: ListingTaskInput, now = new Date()): ListingTaskRecord {
  const title = clean(input.title);
  if (!title) throw new Error("Task title is required");

  const timestamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    projectId: clean(input.projectId),
    title,
    description: clean(input.description),
    owner: clean(input.owner),
    priority: input.priority && isListingTaskPriority(input.priority) ? input.priority : "Normal",
    status: input.status && isListingTaskStatus(input.status) ? input.status : "todo",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function moveListingTask(task: ListingTaskRecord, status: ListingTaskStatus, now = new Date()): ListingTaskRecord {
  if (!isListingTaskStatus(status)) throw new Error("Invalid task status");
  return {
    ...task,
    status,
    updatedAt: now.toISOString(),
  };
}

export function getTasksForProject(tasks: ListingTaskRecord[], projectId?: string) {
  if (!projectId) return tasks;
  return tasks.filter((task) => task.projectId === projectId);
}
