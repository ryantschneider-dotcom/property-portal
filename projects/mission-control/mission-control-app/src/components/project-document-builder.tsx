"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { ProjectNoteRecord } from "@/lib/project-notes-data";
import { formatLocalTime } from "@/lib/mission-data";

export function ProjectDocumentBuilder({
  projectName,
  drafts,
}: {
  projectName: string;
  drafts: ProjectNoteRecord[];
}) {
  const [selectedDraftId, setSelectedDraftId] = useState(drafts[0]?.id ?? "");
  const [format, setFormat] = useState<"draft" | "email" | "memo">("draft");
  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId) ?? drafts[0],
    [drafts, selectedDraftId],
  );

  function buildPayload() {
    if (!selectedDraft) return "";

    if (format === "email") {
      return `Subject: ${selectedDraft.title}\n\nHi [Name],\n\n${selectedDraft.content}\n\nBest,\nRyan`;
    }

    if (format === "memo") {
      return `${selectedDraft.title}\nProject: ${projectName}\nUpdated: ${formatLocalTime(new Date(selectedDraft.updatedAt))}\n\n${selectedDraft.content}`;
    }

    return `${selectedDraft.title}\n\n${selectedDraft.content}`;
  }

  async function copyDraft() {
    if (!selectedDraft) return;
    await navigator.clipboard.writeText(buildPayload());
  }

  return (
    <div className="grid gap-6 2xl:grid-cols-[0.75fr_1.25fr]">
      <Card
        title="Draft library"
        description="Choose a draft and use it like a lightweight client-ready document builder."
      >
        <div className="space-y-3">
          {drafts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-neutral-400">
              No drafts yet. Save tool/chat output as a draft or create one in the notes panel.
            </div>
          ) : (
            drafts.map((draft) => {
              const active = draft.id === selectedDraft?.id;
              return (
                <button
                  key={draft.id}
                  onClick={() => setSelectedDraftId(draft.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-cyan-500/20 bg-cyan-500/10"
                      : "border-white/10 bg-black/20 hover:bg-white/5"
                  }`}
                >
                  <p className="font-medium text-white">{draft.title}</p>
                  <p className="mt-2 text-sm text-neutral-400">
                    updated {formatLocalTime(new Date(draft.updatedAt))}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </Card>

      <Card
        title="Document preview"
        description="Use this as a cleaner reading surface before sending or reworking a draft."
      >
        {!selectedDraft ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-neutral-400">
            Pick or create a draft to preview it here.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">{projectName}</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">{selectedDraft.title}</h3>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={format}
                  onChange={(event) => setFormat(event.target.value as "draft" | "email" | "memo")}
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-neutral-100 outline-none"
                >
                  <option value="draft">Draft</option>
                  <option value="email">Email</option>
                  <option value="memo">Memo</option>
                </select>
                <button
                  onClick={copyDraft}
                  className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200 transition hover:bg-cyan-500/15"
                >
                  Copy {format}
                </button>
              </div>
            </div>
            <pre className="mt-6 whitespace-pre-wrap text-sm leading-7 text-neutral-200">
              {buildPayload() || "No draft content yet."}
            </pre>
          </>
        )}
      </Card>
    </div>
  );
}
