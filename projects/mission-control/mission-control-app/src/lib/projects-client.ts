import { ProjectRecord } from "@/lib/projects-data";
import { ProjectSummary } from "@/lib/project-summaries";

export type ProjectInput = Omit<ProjectRecord, "id" | "createdAt" | "linkedRunIds">;

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const response = await fetch("/api/projects", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to fetch projects");
  }
  const data = (await response.json()) as { projects: ProjectSummary[] };
  return data.projects;
}

export async function createProject(input: ProjectInput) {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to create project");
  }

  return response.json() as Promise<{ ok: true; projects: ProjectSummary[] }>;
}

export async function updateProject(input: Partial<ProjectRecord> & { id: string }) {
  const response = await fetch("/api/projects", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to update project");
  }

  return response.json() as Promise<{ ok: true; projects: ProjectSummary[] }>;
}
