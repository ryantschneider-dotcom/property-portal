import { notFound } from "next/navigation";
import { readStore } from "@/lib/storage";

export async function getProjectDetail(projectId: string) {
  const store = await readStore();
  const project = store.projects.find((item) => item.id === projectId);

  if (!project) {
    notFound();
  }

  const toolRuns = store.toolRuns.filter((run) => run.projectId === projectId);
  const chatRuns = store.chatRuns.filter((run) => run.projectId === projectId);
  const uploads = store.uploads.filter((file) => file.projectId === projectId);
  const notes = store.projectNotes.filter((note) => note.projectId === projectId);
  const activityEvents = store.activityEvents.filter((event) => event.projectId === projectId);

  return {
    project,
    toolRuns,
    chatRuns,
    uploads,
    notes,
    activityEvents,
  };
}
