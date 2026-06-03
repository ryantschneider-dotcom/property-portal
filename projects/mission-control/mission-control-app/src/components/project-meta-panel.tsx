"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { ProjectRecord } from "@/lib/projects-data";

const statusOptions: ProjectRecord["status"][] = ["active", "waiting", "paused", "idea", "done"];

export function ProjectMetaPanel({ initialProject }: { initialProject: ProjectRecord }) {
  const [project, setProject] = useState(initialProject);
  const [saving, setSaving] = useState(false);

  async function saveProject() {
    setSaving(true);

    try {
      const response = await fetch("/api/projects", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(project),
      });

      if (!response.ok) {
        throw new Error("Failed to save project");
      }

      const result = (await response.json()) as { project: ProjectRecord };
      setProject(result.project);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Project tracking"
      description="Keep the project state, owner, and due date current so the workspace reflects real operating status."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-neutral-300">
          <span className="text-neutral-500">Status</span>
          <select
            value={project.status}
            onChange={(event) => setProject((current) => ({ ...current, status: event.target.value as ProjectRecord["status"] }))}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-100 outline-none"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-neutral-300">
          <span className="text-neutral-500">Owner</span>
          <input
            value={project.owner ?? ""}
            onChange={(event) => setProject((current) => ({ ...current, owner: event.target.value }))}
            placeholder="Owner name"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
          />
        </label>

        <label className="block text-sm text-neutral-300 md:col-span-2">
          <span className="text-neutral-500">Due date</span>
          <input
            type="date"
            value={project.dueDate ?? ""}
            onChange={(event) => setProject((current) => ({ ...current, dueDate: event.target.value || undefined }))}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-100 outline-none"
          />
        </label>

        <label className="block text-sm text-neutral-300 md:col-span-2">
          <span className="text-neutral-500">Summary</span>
          <textarea
            value={project.summary}
            onChange={(event) => setProject((current) => ({ ...current, summary: event.target.value }))}
            placeholder="Short project summary"
            className="mt-2 min-h-[140px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={saveProject}
          disabled={saving}
          className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-cyan-400 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save project"}
        </button>
      </div>
    </Card>
  );
}
