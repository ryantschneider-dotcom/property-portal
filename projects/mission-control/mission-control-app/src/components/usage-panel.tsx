"use client";

import { useEffect, useMemo, useState } from "react";
import { ChatActionRun } from "@/lib/chat-data";
import { ToolRun } from "@/lib/mission-data";
import { defaultModelRate } from "@/lib/pricing";
import { fetchRuns } from "@/lib/run-client";
import { previewText } from "@/lib/text-utils";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

export function UsagePanel() {
  const [toolRuns, setToolRuns] = useState<ToolRun[]>([]);
  const [chatRuns, setChatRuns] = useState<ChatActionRun[]>([]);

  useEffect(() => {
    fetchRuns()
      .then((store) => {
        setToolRuns(store.toolRuns);
        setChatRuns(store.chatRuns);
      })
      .catch(() => {
        setToolRuns([]);
        setChatRuns([]);
      });
  }, []);

  const summary = useMemo(() => {
    const allRuns = [...toolRuns, ...chatRuns].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const inputTokens = allRuns.reduce((sum, run) => sum + run.inputTokens, 0);
    const outputTokens = allRuns.reduce((sum, run) => sum + run.outputTokens, 0);
    const estimatedCost = allRuns.reduce((sum, run) => sum + run.estimatedCost, 0);

    return {
      totalRuns: allRuns.length,
      toolRuns: toolRuns.length,
      chatRuns: chatRuns.length,
      inputTokens,
      outputTokens,
      estimatedCost,
      allRuns,
    };
  }, [toolRuns, chatRuns]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
        <Metric label="Total runs" value={String(summary.totalRuns)} />
        <Metric label="Tool runs" value={String(summary.toolRuns)} />
        <Metric label="Chat actions" value={String(summary.chatRuns)} />
        <Metric label="Input tokens" value={String(summary.inputTokens)} />
        <Metric label="Output tokens" value={String(summary.outputTokens)} />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-lg font-semibold text-white">Estimated usage cost</p>
          <p className="mt-2 text-4xl font-semibold text-cyan-300">
            ${summary.estimatedCost.toFixed(4)}
          </p>
          <p className="mt-3 text-sm leading-6 text-neutral-400">
            This is a local estimate based on the configured model rate for {defaultModelRate.model}.
            It is meant to give Ryan cost visibility while the app grows into a more complete system.
          </p>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
            <p>Input rate: ${defaultModelRate.inputPer1K.toFixed(2)} / 1K tokens</p>
            <p>Output rate: ${defaultModelRate.outputPer1K.toFixed(2)} / 1K tokens</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-lg font-semibold text-white">Recent costed runs</p>
          <div className="mt-4 space-y-3">
            {summary.allRuns.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-neutral-400">
                No runs yet. Tool runs and chat actions will show up here with local token and cost estimates.
              </div>
            ) : (
              summary.allRuns.slice(0, 10).map((run) => (
                <div
                  key={run.id}
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300"
                >
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <p className="font-medium text-white">
                      {"toolName" in run ? run.toolName : run.presetLabel}
                    </p>
                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">
                      ${run.estimatedCost.toFixed(4)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-neutral-500">
                    {run.model} • in {run.inputTokens} tok • out {run.outputTokens} tok
                  </p>
                  {"projectName" in run && run.projectName ? (
                    <p className="mt-2 text-xs uppercase tracking-[0.2em] text-emerald-300">
                      {run.projectName}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm text-neutral-400">
                    {previewText("toolName" in run ? run.input : run.context, 120)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
