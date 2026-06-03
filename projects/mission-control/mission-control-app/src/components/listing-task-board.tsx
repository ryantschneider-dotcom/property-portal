"use client";

import { useMemo, useState } from "react";
import { ListingTaskPriority, ListingTaskRecord, ListingTaskStatus } from "@/lib/listing-tasks-data";
import { ProjectSummary } from "@/lib/project-summaries";

const inputClass = "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#CB521E]/50 focus:ring-2 focus:ring-[#CB521E]/10";

async function createTask(input: { projectId?: string; title: string; description?: string; owner?: string; priority: ListingTaskPriority }) {
  const response = await fetch("/api/listing-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Failed to create task");
  return response.json() as Promise<{ ok: true; tasks: ListingTaskRecord[] }>;
}

async function updateTask(input: { id: string; status: ListingTaskStatus; projectId?: string }) {
  const response = await fetch("/api/listing-tasks", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Failed to update task");
  return response.json() as Promise<{ ok: true; tasks: ListingTaskRecord[] }>;
}

const columns: { status: ListingTaskStatus; title: string }[] = [
  { status: "todo", title: "To Do" },
  { status: "doing", title: "Doing" },
  { status: "done", title: "Done" },
];

export function ListingTaskBoard({
  initialTasks,
  projects,
}: {
  initialTasks: ListingTaskRecord[];
  projects: ProjectSummary[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("Hermes");
  const [priority, setPriority] = useState<ListingTaskPriority>("Normal");
  const [saving, setSaving] = useState(false);

  const filteredTasks = useMemo(
    () => (projectId ? tasks.filter((task) => task.projectId === projectId) : tasks),
    [projectId, tasks],
  );

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const result = await createTask({ projectId: projectId || undefined, title, description, owner, priority });
      setTasks(projectId ? [...result.tasks, ...tasks.filter((task) => task.projectId !== projectId)] : result.tasks);
      setTitle("");
      setDescription("");
    } finally {
      setSaving(false);
    }
  }

  async function handleMove(task: ListingTaskRecord, status: ListingTaskStatus) {
    const result = await updateTask({ id: task.id, status, projectId: task.projectId });
    setTasks((current) => current.map((item) => result.tasks.find((updated) => updated.id === item.id) ?? item));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="border-l-4 border-[#CB521E] pl-4">
          <h3 className="text-lg font-semibold text-zinc-950">Create task</h3>
          <p className="mt-1 text-sm leading-6 text-zinc-600">Attach daily work to a listing or leave it general.</p>
        </div>
        <div className="mt-5 space-y-4">
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className={inputClass}>
            <option value="">General Mission Control task</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <input value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} placeholder="Task title" />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} className={`${inputClass} min-h-[110px]`} placeholder="Task details / next action" />
          <div className="grid gap-4 md:grid-cols-2">
            <input value={owner} onChange={(event) => setOwner(event.target.value)} className={inputClass} placeholder="Owner" />
            <select value={priority} onChange={(event) => setPriority(event.target.value as ListingTaskPriority)} className={inputClass}>
              <option value="Low">Low</option>
              <option value="Normal">Normal</option>
              <option value="High">High</option>
            </select>
          </div>
          <button onClick={handleCreate} disabled={saving || !title.trim()} className="rounded-xl bg-[#CB521E] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#a94318] disabled:opacity-50">
            {saving ? "Saving…" : "Add task"}
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {columns.map((column) => {
          const columnTasks = filteredTasks.filter((task) => task.status === column.status);
          return (
            <div key={column.status} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h3 className="border-l-4 border-[#CB521E] pl-3 text-lg font-semibold text-zinc-950">{column.title}</h3>
              <div className="mt-4 space-y-3">
                {columnTasks.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-500">No tasks.</p> : columnTasks.map((task) => (
                  <article key={task.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="font-semibold text-zinc-950">{task.title}</h4>
                      <span className="rounded-full border border-[#CB521E]/20 bg-[#CB521E]/10 px-2 py-1 text-[11px] text-[#CB521E]">{task.priority}</span>
                    </div>
                    {task.description ? <p className="mt-2 text-sm leading-6 text-zinc-600">{task.description}</p> : null}
                    <p className="mt-3 text-xs text-zinc-500">Owner: {task.owner || "Unassigned"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {columns.filter((target) => target.status !== task.status).map((target) => (
                        <button key={target.status} onClick={() => handleMove(task, target.status)} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 transition hover:border-[#CB521E]/30 hover:bg-[#CB521E]/5">
                          Move to {target.title}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
