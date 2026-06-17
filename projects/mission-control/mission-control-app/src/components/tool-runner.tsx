"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SaveOutputButton } from "@/components/save-output-button";
import { Card } from "@/components/ui";
import {
  ToolDefinition,
  ToolRun,
  formatLocalTime,
  generateToolOutput,
} from "@/lib/mission-data";
import { previewText } from "@/lib/text-utils";
import { defaultModelRate, estimateCost, estimateTokens } from "@/lib/pricing";
import { createLocalId } from "@/lib/id";
import { fetchProjects } from "@/lib/projects-client";
import { ProjectSummary } from "@/lib/project-summaries";
import { fetchRuns, saveRun } from "@/lib/run-client";

export function ToolRunner({
  tools,
  initialProjectId = "",
}: {
  tools: ToolDefinition[];
  initialProjectId?: string;
}) {
  const [selectedToolId, setSelectedToolId] = useState(tools[0]?.id ?? "");
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const [input, setInput] = useState("");
  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);

  useEffect(() => {
    fetchRuns()
      .then((store) => setRuns(store.toolRuns))
      .catch(() => setRuns([]));

    fetchProjects()
      .then((items) => setProjects(items))
      .catch(() => setProjects([]));
  }, []);

  const selectedTool = useMemo(
    () => tools.find((tool) => tool.id === selectedToolId) ?? tools[0],
    [selectedToolId, tools],
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

  async function runTool() {
    if (!selectedTool) return;

    const now = new Date();
    const output = generateToolOutput(selectedTool.name, input);
    const inputTokens = estimateTokens(input);
    const outputTokens = estimateTokens(output);

    const run: ToolRun = {
      id: createLocalId(),
      toolId: selectedTool.id,
      toolName: selectedTool.name,
      input,
      output,
      createdAt: now.toISOString(),
      model: defaultModelRate.model,
      inputTokens,
      outputTokens,
      estimatedCost: estimateCost(inputTokens, outputTokens),
      projectId: selectedProject?.id,
      projectName: selectedProject?.name,
    };

    try {
      const result = await saveRun("tool", run);
      setRuns(result.store.toolRuns);
    } catch {
      const nextRuns = [run, ...runs].slice(0, 25);
      setRuns(nextRuns);
    }
  }

  return (
    <div className="grid gap-4 2xl:grid-cols-[0.9fr_1.1fr]">
      <Card
        title="Tool registry"
        description="Choose a tool, add raw input, and run a local first-pass action."
      >
        <div className="space-y-2">
          {tools.map((tool) => {
            const active = tool.id === selectedToolId;
            return (
              <button
                key={tool.id}
                onClick={() => setSelectedToolId(tool.id)}
                className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                  active
                    ? "border-[#CB521E]/40 bg-[#CB521E]/10 shadow-sm"
                    : "border-zinc-200 bg-zinc-50 hover:border-[#CB521E]/30 hover:bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-zinc-950">{tool.name}</p>
                    <p className="mt-1 text-sm text-zinc-600">
                      {tool.description}
                    </p>
                  </div>
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-zinc-700">
                    {tool.category}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="space-y-3">
        <Card
          title={selectedTool?.name ?? "Tool launcher"}
          description={selectedTool?.output ?? "Select a tool to begin."}
        >
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                <span className="text-zinc-600">Input mode:</span>{" "}
                {selectedTool?.inputMode ?? "n/a"}
              </div>
              <label className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                <span className="text-zinc-600">Project link:</span>
                <select
                  value={selectedProjectId}
                  onChange={(event) => setSelectedProjectId(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none"
                >
                  <option value="">No project linked</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Paste notes, lead details, listing facts, PM issue details, or raw input here…"
              className="min-h-[180px] w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-[#CB521E] focus:ring-2 focus:ring-[#CB521E]/15"
            />
            <div className="flex flex-wrap gap-3">
              <button
                onClick={runTool}
                className="rounded-xl bg-[#CB521E] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a94318]"
              >
                Run tool
              </button>
              <button
                onClick={() => setInput("")}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-700 transition hover:bg-zinc-50"
              >
                Clear input
              </button>
              {selectedProject ? (
                <Link
                  href={`/projects/${selectedProject.id}`}
                  className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700 transition hover:bg-emerald-500/15"
                >
                  Open project
                </Link>
              ) : null}
            </div>
          </div>
        </Card>

        <Card
          title={selectedProject ? `Tool history · ${selectedProject.name}` : "Recent tool runs"}
          description={
            selectedProject
              ? "History is filtered to the selected project so you can reuse work without hunting through everything else."
              : "Stored locally so the app can become reusable operating history, not just a one-shot tool launcher."
          }
        >
          <div className="space-y-2">
            {visibleRuns.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-600">
                {selectedProject
                  ? "No tool runs linked to this project yet."
                  : "No tool runs yet. Launch one and it will appear here."}
              </div>
            ) : (
              visibleRuns.map((run) => (
                <div
                  key={run.id}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
                >
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="font-medium text-zinc-950">{run.toolName}</p>
                      <p className="mt-1 text-sm text-zinc-600">
                        {previewText(run.input, 140)}
                      </p>
                    </div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[#CB521E]">
                      {formatLocalTime(new Date(run.createdAt))}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600">
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                      {run.model}
                    </span>
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                      in {run.inputTokens} tok
                    </span>
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">
                      out {run.outputTokens} tok
                    </span>
                    <span className="rounded-full border border-[#CB521E]/20 bg-[#CB521E]/10 px-3 py-1 text-[#CB521E]">
                      est. ${run.estimatedCost.toFixed(4)}
                    </span>
                    {run.projectName ? (
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-emerald-700">
                        {run.projectName}
                      </span>
                    ) : null}
                  </div>
                  {run.projectId ? (
                    <div className="mt-3 flex flex-wrap gap-3">
                      <SaveOutputButton
                        projectId={run.projectId}
                        title={`${run.toolName} draft`}
                        content={run.output}
                      />
                    </div>
                  ) : null}
                  <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-zinc-200 bg-white p-3 text-sm leading-6 text-zinc-700">
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
