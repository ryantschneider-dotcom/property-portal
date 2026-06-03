import Link from "next/link";
import { MissionShell } from "@/components/mission-shell";
import { ListingEditPanel } from "@/components/listing-edit-panel";
import { ProjectDocumentBuilder } from "@/components/project-document-builder";
import { ProjectMetaPanel } from "@/components/project-meta-panel";
import { ProjectNotesPanel } from "@/components/project-notes-panel";
import { SaveOutputButton } from "@/components/save-output-button";
import { Card } from "@/components/ui";
import { getProjectDetail } from "@/lib/server-projects";
import { formatLocalTime } from "@/lib/mission-data";
import { getMissingListingFields, isProjectOverdue } from "@/lib/project-health";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { project, toolRuns, chatRuns, uploads, notes, activityEvents } = await getProjectDetail(id);
  const drafts = notes.filter((note) => note.kind === "draft");
  const timeline = activityEvents;
  const missingListingFields = getMissingListingFields(project);

  return (
    <MissionShell
      title={project.name}
      subtitle="Project detail page showing linked execution history, AI actions, and files in one place."
      currentPath="/projects"
      actions={[
        { href: `/tools?project=${project.id}`, label: "Run tool", tone: "primary" },
        { href: `/chat?project=${project.id}`, label: "AI action" },
        { href: `/uploads?project=${project.id}`, label: "Upload file", tone: "ghost" },
      ]}
    >
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
        <Metric label="Status" value={project.status} />
        {project.type === "listing" ? (
          <Metric label="Property Type" value={project.propertyType || "N/A"} />
        ) : null}
        <Metric label="Tool runs" value={String(toolRuns.length)} />
        <Metric label="Chat actions" value={String(chatRuns.length)} />
        <Metric label="Uploads" value={String(uploads.length)} />
        <Metric label="Notes / drafts" value={String(notes.length)} />
      </div>

      <div className="mt-6 grid gap-6 2xl:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-6">
          <Card title="Project summary" description="Core details and navigation for this project.">
            <p className="text-sm leading-6 text-neutral-300">
              {project.summary || "No summary yet."}
            </p>
            {project.type === "listing" && (
              <div className="mt-4 space-y-2 text-sm text-neutral-300">
                <p><strong>Address:</strong> {project.address}, {project.city}, {project.state} {project.zip}</p>
                <p><strong>Price:</strong> {project.price ? `$${project.price.toLocaleString()}` : 'N/A'}</p>
                <p><strong>Size:</strong> {project.size ? `${project.size.toLocaleString()} sq ft` : 'N/A'}</p>
                {project.units ? <p><strong>Units:</strong> {project.units}</p> : null}
                {project.yearBuilt ? <p><strong>Year Built:</strong> {project.yearBuilt}</p> : null}
                {project.marketingBlurb ? <p><strong>Marketing Blurb:</strong> {project.marketingBlurb}</p> : null}
              </div>
            )}
            {missingListingFields.length > 0 && project.type === "listing" ? (
              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                <p className="font-medium">Missing critical listing fields:</p>
                <ul className="mt-1 list-inside list-disc">
                  {missingListingFields.map((field) => (
                    <li key={field}>{field}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-400">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                created {formatLocalTime(new Date(project.createdAt))}
              </span>
              {project.owner ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  owner {project.owner}
                </span>
              ) : null}
              {project.dueDate ? (
                <span className={`rounded-full border px-3 py-1 ${isProjectOverdue(project) ? "border-rose-500/20 bg-rose-500/10 text-rose-200" : "border-amber-500/20 bg-amber-500/10 text-amber-200"}`}>
                  due {project.dueDate}
                </span>
              ) : null}
              <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-cyan-300">
                {toolRuns.length + chatRuns.length + uploads.length} linked records
              </span>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/tools?project=${project.id}`}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-cyan-400"
              >
                Run a tool for this project
              </Link>
              <Link
                href={`/chat?project=${project.id}`}
                className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/10 px-4 py-2 text-sm text-fuchsia-200 transition hover:bg-fuchsia-500/15"
              >
                Run an AI action
              </Link>
              <Link
                href={`/uploads?project=${project.id}`}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white/10"
              >
                Upload a file
              </Link>
            </div>
          </Card>

          {project.type === "listing" ? (
            <Card title="Edit listing record" description="Update the source listing data used by summaries, agreements, websites, uploads, and task control.">
              <ListingEditPanel project={project} />
            </Card>
          ) : null}

          <ProjectMetaPanel initialProject={project} />
        </div>

        <Card
          title="Linked execution"
          description="All project-linked runs and AI actions should converge here."
        >
          <div className="space-y-4">
            {toolRuns.length === 0 && chatRuns.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-neutral-400">
                No linked runs or actions yet.
              </div>
            ) : (
              <>
                {toolRuns.map((run) => (
                  <div
                    key={run.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-white">Tool run: {run.toolName}</p>
                      <div className="flex flex-wrap gap-2">
                        <SaveOutputButton
                          projectId={project.id}
                          title={`${run.toolName} draft`}
                          content={run.output}
                        />
                        <Link
                          href={`/tools?project=${project.id}`}
                          className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200 transition hover:bg-cyan-500/15"
                        >
                          Run again
                        </Link>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-neutral-400">
                      {formatLocalTime(new Date(run.createdAt))} • est. {"$" + (Number(run?.estimatedCost) || 0).toFixed(4)}
                    </p>
                    <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">
                      {run.output}
                    </pre>
                  </div>
                ))}
                {chatRuns.map((run) => (
                  <div
                    key={run.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-white">Chat action: {run.presetLabel}</p>
                      <div className="flex flex-wrap gap-2">
                        <SaveOutputButton
                          projectId={project.id}
                          title={`${run.presetLabel} draft`}
                          content={run.output}
                        />
                        <Link
                          href={`/chat?project=${project.id}`}
                          className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/10 px-3 py-1.5 text-xs text-fuchsia-200 transition hover:bg-fuchsia-500/15"
                        >
                          Run again
                        </Link>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-neutral-400">
                      {formatLocalTime(new Date(run.createdAt))} • est. {"$" + (Number(run?.estimatedCost) || 0).toFixed(4)}
                    </p>
                    <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">
                      {run.output}
                    </pre>
                  </div>
                ))}
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <ProjectNotesPanel projectId={project.id} initialNotes={notes} />
      </div>

      <div className="mt-6">
        <ProjectDocumentBuilder projectName={project.name} drafts={drafts} />
      </div>

      <div className="mt-6 grid gap-6 2xl:grid-cols-[1.1fr_0.9fr]">
        <Card title="Project timeline" description="Recent changes, outputs, uploads, and note updates in one stream.">
          <div className="space-y-3">
            {timeline.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-neutral-400">
                No project activity yet.
              </div>
            ) : (
              timeline.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-white">{entry.title}</p>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-400">
                      {formatLocalTime(new Date(entry.createdAt))}
                    </span>
                  </div>
                  <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">
                    {entry.detail}
                  </pre>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Linked uploads" description="Files attached to this project are listed here.">
          <div className="space-y-3">
            {uploads.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-neutral-400">
                No project-linked uploads yet.
              </div>
            ) : (
              uploads.map((file) => (
                <div
                  key={file.id}
                  className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <p className="font-medium text-white">{file.originalName}</p>
                    <p className="mt-1 text-sm text-neutral-400">
                      {file.mimeType} • {((Number(file?.size) || 0) / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <a
                    href={file.path}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white/10"
                  >
                    Open file
                  </a>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </MissionShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}