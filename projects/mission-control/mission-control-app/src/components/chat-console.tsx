"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SaveOutputButton } from "@/components/save-output-button";
import { Card } from "@/components/ui";
import { ChatActionRun, chatPresets, generateChatOutput } from "@/lib/chat-data";
import { formatLocalTime } from "@/lib/mission-data";
import { previewText } from "@/lib/text-utils";
import { defaultModelRate, estimateCost, estimateTokens } from "@/lib/pricing";
import { createLocalId } from "@/lib/id";
import { fetchProjects } from "@/lib/projects-client";
import { ProjectSummary } from "@/lib/project-summaries";
import { fetchRuns, saveRun } from "@/lib/run-client";

export function ChatConsole({ initialProjectId = "" }: { initialProjectId?: string }) {
  const [selectedPresetId, setSelectedPresetId] = useState(chatPresets[0]?.id ?? "");
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [context, setContext] = useState("");
  const [runs, setRuns] = useState<ChatActionRun[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  useEffect(() => {
    fetchRuns()
      .then((store) => setRuns(store.chatRuns))
      .catch(() => setRuns([]));

    fetchProjects()
      .then((items) => setProjects(items))
      .catch(() => setProjects([]));
  }, []);

  const selectedPreset = useMemo(
    () => chatPresets.find((preset) => preset.id === selectedPresetId) ?? chatPresets[0],
    [selectedPresetId],
  );

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  const visibleRuns = useMemo(
    () =>
      selectedProjectId
        ? runs.filter((run) => run.projectId === selectedProjectId)
        : runs,
    [runs, selectedProjectId],
  );

  async function runPreset() {
    if (!selectedPreset) return;

    const output = generateChatOutput(selectedPreset.label, context);
    const inputTokens = estimateTokens(context);
    const outputTokens = estimateTokens(output);

    const run: ChatActionRun = {
      id: createLocalId(),
      presetId: selectedPreset.id,
      presetLabel: selectedPreset.label,
      context,
      output,
      createdAt: new Date().toISOString(),
      model: defaultModelRate.model,
      inputTokens,
      outputTokens,
      estimatedCost: estimateCost(inputTokens, outputTokens),
      projectId: selectedProject?.id,
      projectName: selectedProject?.name,
    };

    try {
      const result = await saveRun("chat", run);
      setRuns(result.store.chatRuns);
    } catch {
      const nextRuns = [run, ...runs].slice(0, 25);
      setRuns(nextRuns);
    }
  }

  return (
    <div className="grid gap-6 2xl:grid-cols-[0.8fr_1.2fr]">
      <Card
        title="Prompt actions"
        description="Quick AI actions for common operating tasks inside Mission Control."
      >
        <div className="space-y-3">
          {chatPresets.map((preset) => {
            const active = preset.id === selectedPresetId;
            return (
              <button
                key={preset.id}
                onClick={() => setSelectedPresetId(preset.id)}
                className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                  active
                    ? "border-fuchsia-500/40 bg-fuchsia-500/10"
                    : "border-white/10 bg-black/20 hover:bg-white/5"
                }`}
              >
                <p className="font-medium text-white">{preset.label}</p>
                <p className="mt-1 text-sm leading-6 text-neutral-400">
                  {preset.description}
                </p>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="space-y-6">
        <Card
          title={selectedPreset?.label ?? "AI action"}
          description={selectedPreset?.prompt ?? "Choose an action preset to begin."}
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
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              placeholder="Paste notes, project context, copied email threads, raw thoughts, or rough material here…"
              className="min-h-[240px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
            />
            <div className="flex flex-wrap gap-3">
              <button
                onClick={runPreset}
                className="rounded-xl bg-fuchsia-500 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-fuchsia-400"
              >
                Run action
              </button>
              <button
                onClick={() => setContext("")}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-neutral-300 transition hover:bg-white/10"
              >
                Clear context
              </button>
              {selectedProject ? (
                <Link
                  href={`/projects/${selectedProject.id}`}
                  className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200 transition hover:bg-emerald-500/15"
                >
                  Open project
                </Link>
              ) : null}
            </div>
          </div>
        </Card>

        <Card
          title={selectedProject ? `Chat history · ${selectedProject.name}` : "Recent chat actions"}
          description={
            selectedProject
              ? "History is filtered to the selected project so the AI actions stay reusable inside that workstream."
              : "Stored locally so the chat module functions like reusable project history, not just a transient console."
          }
        >
          <div className="space-y-3">
            {visibleRuns.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-neutral-400">
                {selectedProject
                  ? "No chat actions linked to this project yet."
                  : "No chat actions yet. Run one and it will appear here."}
              </div>
            ) : (
              visibleRuns.map((run) => (
                <div
                  key={run.id}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="font-medium text-white">{run.presetLabel}</p>
                      <p className="mt-1 text-sm text-neutral-400">
                        {previewText(run.context, 140)}
                      </p>
                    </div>
                    <p className="text-xs uppercase tracking-[0.2em] text-fuchsia-300">
                      {formatLocalTime(new Date(run.createdAt))}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-400">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                      {run.model}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                      in {run.inputTokens} tok
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                      out {run.outputTokens} tok
                    </span>
                    <span className="rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-3 py-1 text-fuchsia-300">
                      est. ${run.estimatedCost.toFixed(4)}
                    </span>
                    {run.projectName ? (
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-emerald-300">
                        {run.projectName}
                      </span>
                    ) : null}
                  </div>
                  {run.projectId ? (
                    <div className="mt-3 flex flex-wrap gap-3">
                      <SaveOutputButton
                        projectId={run.projectId}
                        title={`${run.presetLabel} draft`}
                        content={run.output}
                      />
                    </div>
                  ) : null}
                  <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">
                    {run.output}
                  </pre>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
