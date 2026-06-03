import { isProjectOverdue } from "@/lib/project-health";
import { listProjectSummaries } from "@/lib/project-summaries";
import { readStore } from "@/lib/storage";

export async function getDashboardData() {
  const store = await readStore();

  const recentToolRuns = store.toolRuns.slice(0, 5);
  const recentChatRuns = store.chatRuns.slice(0, 5);
  const recentUploads = store.uploads.slice(0, 5);
  const projectSummaries = listProjectSummaries(store);
  const activeProjects = projectSummaries
    .sort((a, b) => {
      const statusOrder = (projectStatus: string) => {
        if (projectStatus === "active") return 0;
        if (projectStatus === "waiting") return 1;
        if (projectStatus === "paused") return 2;
        if (projectStatus === "idea") return 3;
        return 4;
      };

      const statusDiff = statusOrder(a.status) - statusOrder(b.status);
      if (statusDiff !== 0) return statusDiff;

      if (a.dueDate && b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }

      if (a.dueDate) return -1;
      if (b.dueDate) return 1;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .slice(0, 6);

  const overdueProjects = projectSummaries.filter((project) => isProjectOverdue(project)).slice(0, 5);
  const waitingProjects = projectSummaries.filter((project) => project.status === "waiting").slice(0, 5);
  const ownerlessProjects = projectSummaries.filter((project) => !project.owner?.trim()).slice(0, 5);

  return {
    counts: {
      tools: recentToolRuns.length,
      chats: recentChatRuns.length,
      uploads: recentUploads.length,
      projects: store.projects.length,
      overdue: overdueProjects.length,
      waiting: waitingProjects.length,
      ownerless: ownerlessProjects.length,
    },
    recentToolRuns,
    recentChatRuns,
    recentUploads,
    activeProjects,
    overdueProjects,
    waitingProjects,
    ownerlessProjects,
  };
}
