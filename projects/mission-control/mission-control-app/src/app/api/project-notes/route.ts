import { NextRequest, NextResponse } from "next/server";
import { pushActivityEvent } from "@/lib/activity-log";
import { ProjectNoteRecord } from "@/lib/project-notes-data";
import { readStore, writeStore } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  const store = await readStore();

  const notes = projectId
    ? store.projectNotes.filter((item) => item.projectId === projectId)
    : store.projectNotes;

  return NextResponse.json({ notes });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    projectId?: string;
    kind?: ProjectNoteRecord["kind"];
    title?: string;
    content?: string;
  };

  if (!body.projectId || !body.title?.trim()) {
    return NextResponse.json({ error: "projectId and title are required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const note: ProjectNoteRecord = {
    id: crypto.randomUUID(),
    projectId: body.projectId,
    kind: body.kind === "draft" ? "draft" : "note",
    title: body.title.trim(),
    content: body.content?.trim() ?? "",
    createdAt: now,
    updatedAt: now,
  };

  const store = await readStore();
  const project = store.projects.find((item) => item.id === body.projectId);
  store.projectNotes = [note, ...store.projectNotes].slice(0, 500);
  pushActivityEvent(store, {
    type: note.kind,
    title: `${note.kind === "draft" ? "Draft" : "Note"} created: ${note.title}`,
    detail: note.content || `${note.kind === "draft" ? "Draft" : "Note"} created`,
    projectId: note.projectId,
    projectName: project?.name,
    createdAt: note.createdAt,
  });
  await writeStore(store);

  return NextResponse.json({ ok: true, note, notes: store.projectNotes.filter((item) => item.projectId === body.projectId) });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as {
    id?: string;
    title?: string;
    content?: string;
    kind?: ProjectNoteRecord["kind"];
  };

  if (!body.id || !body.title?.trim()) {
    return NextResponse.json({ error: "id and title are required" }, { status: 400 });
  }

  const store = await readStore();
  const existing = store.projectNotes.find((item) => item.id === body.id);

  if (!existing) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  store.projectNotes = store.projectNotes.map((item) =>
    item.id === body.id
      ? {
          ...item,
          title: body.title!.trim(),
          content: body.content?.trim() ?? "",
          kind: body.kind === "draft" ? "draft" : "note",
          updatedAt: new Date().toISOString(),
        }
      : item,
  );

  const updatedNote = store.projectNotes.find((item) => item.id === body.id)!;
  const project = store.projects.find((item) => item.id === updatedNote.projectId);
  pushActivityEvent(store, {
    type: updatedNote.kind,
    title: `${updatedNote.kind === "draft" ? "Draft" : "Note"} updated: ${updatedNote.title}`,
    detail: updatedNote.content || `${updatedNote.kind === "draft" ? "Draft" : "Note"} updated`,
    projectId: updatedNote.projectId,
    projectName: project?.name,
    createdAt: updatedNote.updatedAt,
  });

  await writeStore(store);

  return NextResponse.json({
    ok: true,
    note: store.projectNotes.find((item) => item.id === body.id),
    notes: store.projectNotes.filter((item) => item.projectId === existing.projectId),
  });
}
