import type { MissionStore } from "@/lib/storage";
import { ProjectRecord } from "@/lib/projects-data";

export type ProjectSummary = ProjectRecord & {
  toolRunCount: number;
  chatRunCount: number;
  uploadCount: number;
  totalLinkedRecords: number;
};

export function summarizeProject(
  project: ProjectRecord,
  counts: { toolRunCount: number; chatRunCount: number; uploadCount: number },
): ProjectSummary {
  return {
    ...project,
    ...counts,
    totalLinkedRecords: counts.toolRunCount + counts.chatRunCount + counts.uploadCount,
  };
}

export function listProjectSummaries(store: MissionStore): ProjectSummary[] {
  return store.projects.map((project) => {
    const toolRunCount = store.toolRuns.filter((run) => run.projectId === project.id).length;
    const chatRunCount = store.chatRuns.filter((run) => run.projectId === project.id).length;
    const uploadCount = store.uploads.filter((file) => file.projectId === project.id).length;

    return summarizeProject(project, {
      toolRunCount,
      chatRunCount,
      uploadCount,
    });
  });
}

export function getProjectSummary(store: MissionStore, projectId: string) {
  return listProjectSummaries(store).find((project) => project.id === projectId);
}
