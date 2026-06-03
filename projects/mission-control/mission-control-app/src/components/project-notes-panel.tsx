"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { ProjectNoteRecord } from "@/lib/project-notes-data";
import { formatLocalTime } from "@/lib/mission-data";
import { previewText } from "@/lib/text-utils";

export function ProjectNotesPanel({
  projectId,
  initialNotes,
}: {
  projectId: string;
  initialNotes: ProjectNoteRecord[];
}) {
  const [notes, setNotes] = useState<ProjectNoteRecord[]>(initialNotes);
  const [selectedKind, setSelectedKind] = useState<ProjectNoteRecord["kind"]>("note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const grouped = useMemo(
    () => ({
      drafts: notes.filter((note) => note.kind === "draft"),
      workingNotes: notes.filter((note) => note.kind === "note"),
    }),
    [notes],
  );

  function loadNote(note: ProjectNoteRecord) {
    setEditingId(note.id);
    setSelectedKind(note.kind);
    setTitle(note.title);
    setContent(note.content);
  }

  function resetForm() {
    setEditingId(null);
    setSelectedKind("note");
    setTitle("");
    setContent("");
  }

  async function saveNote() {
    if (!title.trim()) return;
    setSaving(true);

    try {
      const response = await fetch("/api/project-notes", {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingId,
          projectId,
          kind: selectedKind,
          title,
          content,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save note");
      }

      const result = (await response.json()) as { notes: ProjectNoteRecord[] };
      setNotes(result.notes);
      resetForm();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 2xl:grid-cols-[0.95fr_1.05fr]">
      <Card
        title={editingId ? "Edit note / draft" : "Add note / draft"}
        description="Use notes for raw thinking and drafts for cleaner client-ready material inside the project itself."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["note", "draft"] as const).map((kind) => {
              const active = selectedKind === kind;
              return (
                <button
                  key={kind}
                  onClick={() => setSelectedKind(kind)}
                  className={`rounded-xl border px-4 py-2 text-sm transition ${
                    active
                      ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-200"
                      : "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10"
                  }`}
                >
                  {kind === "note" ? "Working note" : "Draft"}
                </button>
              );
            })}
          </div>

          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={selectedKind === "draft" ? "Draft title" : "Note title"}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
          />

          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={
              selectedKind === "draft"
                ? "Write the cleaner draft here…"
                : "Capture raw notes, thinking, objections, or next steps here…"
            }
            className="min-h-[260px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
          />

          <div className="flex flex-wrap gap-3">
            <button
              onClick={saveNote}
              disabled={saving}
              className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-cyan-400 disabled:opacity-60"
            >
              {saving ? "Saving…" : editingId ? "Update" : "Save"}
            </button>
            <button
              onClick={resetForm}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-neutral-300 transition hover:bg-white/10"
            >
              Clear
            </button>
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        <NotesList
          title="Drafts"
          description="Client-facing or cleaner internal drafts."
          items={grouped.drafts}
          onEdit={loadNote}
          emptyText="No drafts yet."
          tone="fuchsia"
        />
        <NotesList
          title="Working notes"
          description="Raw thinking, facts, next steps, and loose operating notes."
          items={grouped.workingNotes}
          onEdit={loadNote}
          emptyText="No working notes yet."
          tone="cyan"
        />
      </div>
    </div>
  );
}

function NotesList({
  title,
  description,
  items,
  onEdit,
  emptyText,
  tone,
}: {
  title: string;
  description: string;
  items: ProjectNoteRecord[];
  onEdit: (note: ProjectNoteRecord) => void;
  emptyText: string;
  tone: "cyan" | "fuchsia";
}) {
  const toneClass =
    tone === "fuchsia"
      ? "border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-200"
      : "border-cyan-500/20 bg-cyan-500/10 text-cyan-200";

  return (
    <Card title={title} description={description}>
      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-sm text-neutral-400">
            {emptyText}
          </div>
        ) : (
          items.map((note) => (
            <div key={note.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-white">{note.title}</p>
                    <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${toneClass}`}>
                      {note.kind}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-neutral-400">
                    {previewText(note.content, 180)}
                  </p>
                </div>
                <button
                  onClick={() => onEdit(note)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-300 transition hover:bg-white/10"
                >
                  Edit
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-400">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  updated {formatLocalTime(new Date(note.updatedAt))}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                  created {formatLocalTime(new Date(note.createdAt))}
                </span>
              </div>
              <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">
                {note.content || "No content yet."}
              </pre>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
