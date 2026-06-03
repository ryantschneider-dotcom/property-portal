"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { fetchProjects } from "@/lib/projects-client";
import { formatLocalTime } from "@/lib/mission-data";
import { ProjectSummary } from "@/lib/project-summaries";
import { UploadedFileRecord } from "@/lib/uploads-data";
import { fetchUploads, uploadFile } from "@/lib/uploads-client";

export function UploadWorkspace({ initialProjectId = "" }: { initialProjectId?: string }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [uploads, setUploads] = useState<UploadedFileRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [category, setCategory] = useState("Offering");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => setProjects([]));
    fetchUploads().then(setUploads).catch(() => setUploads([]));
  }, []);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  const visibleUploads = useMemo(
    () =>
      selectedProjectId
        ? uploads.filter((file) => file.projectId === selectedProjectId)
        : uploads,
    [uploads, selectedProjectId],
  );

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        const result = await uploadFile(file, selectedProjectId || undefined, { category, notes });
        setUploads(result.uploads);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-6 2xl:grid-cols-[0.9fr_1.1fr]">
      <Card
        title="Upload files"
        description="Files are now stored by the app on disk, not just staged as a placeholder."
      >
        <div className="space-y-4">
          <label className="block rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
            <span className="text-neutral-500">Project link:</span>
            <select
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
              className="mt-2 w-full rounded-lg border border-white/10 bg-[#0a0f14] px-3 py-2 text-sm text-neutral-200 outline-none"
            >
              <option value="">No project linked</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
              <span className="text-neutral-500">Asset category:</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="mt-2 w-full rounded-lg border border-white/10 bg-[#0a0f14] px-3 py-2 text-sm text-neutral-200 outline-none"
              >
                <option value="Offering">Offering</option>
                <option value="Photos">Photos</option>
                <option value="Maps">Maps</option>
                <option value="Due Diligence">Due Diligence</option>
                <option value="Agreement">Agreement</option>
                <option value="Other">Other</option>
              </select>
            </label>
            <label className="block rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
              <span className="text-neutral-500">Asset notes:</span>
              <input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="e.g. OM photos, tax map, signed LOI"
                className="mt-2 w-full rounded-lg border border-white/10 bg-[#0a0f14] px-3 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-500"
              />
            </label>
          </div>

          <label className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-500/30 bg-cyan-500/5 p-6 text-center">
            <input
              type="file"
              className="hidden"
              multiple
              onChange={(event) => handleFiles(event.target.files)}
            />
            <p className="text-lg font-semibold text-white">
              {uploading ? "Uploading…" : "Click to choose files"}
            </p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">
              Uploaded files are now saved in Mission Control&apos;s data storage and can be linked to a project.
            </p>
          </label>
          {selectedProject ? (
            <Link
              href={`/projects/${selectedProject.id}`}
              className="inline-flex rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200 transition hover:bg-emerald-500/15"
            >
              Open project
            </Link>
          ) : null}
        </div>
      </Card>

      <Card
        title={selectedProject ? `Stored uploads · ${selectedProject.name}` : "Stored uploads"}
        description={
          selectedProject
            ? "Files are filtered to the selected project so document history stays attached to the right workstream."
            : "This is the first real file layer for Mission Control."
        }
      >
        <div className="space-y-3">
          {visibleUploads.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-neutral-400">
              {selectedProject ? "No uploaded files linked to this project yet." : "No uploaded files yet."}
            </div>
          ) : (
            visibleUploads.map((file) => (
              <div
                key={file.id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-medium text-white">{file.originalName}</p>
                    <p className="mt-1 text-sm text-neutral-400">
                      {file.mimeType} • {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <a
                    href={file.path}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-200 transition hover:bg-white/10"
                  >
                    Open file
                  </a>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-400">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    stored {formatLocalTime(new Date(file.createdAt))}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    {file.category ?? "Other"}
                  </span>
                  {file.notes ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                      {file.notes}
                    </span>
                  ) : null}
                  {file.projectId ? (
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-emerald-300">
                      linked to project
                    </span>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
