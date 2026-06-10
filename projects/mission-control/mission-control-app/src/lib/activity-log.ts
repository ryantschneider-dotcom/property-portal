export type ActivityLogEvent = {
  id: string;
  type: "tool" | "chat" | "upload" | "project" | "note" | "draft" | "system";
  title: string;
  detail: string;
  createdAt: string;
  projectId?: string;
  projectName?: string;
};

export function pushActivityEvent<T extends { activityEvents: ActivityLogEvent[] }>(
  store: T,
  event: Omit<ActivityLogEvent, "id" | "createdAt"> & { createdAt?: string },
) {
  store.activityEvents = [
    {
      id: crypto.randomUUID(),
      createdAt: event.createdAt ?? new Date().toISOString(),
      ...event,
    },
    ...store.activityEvents,
  ].slice(0, 400);

  return store;
}
