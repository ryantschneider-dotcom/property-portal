export type ProjectNoteKind = "note" | "draft";

export type ProjectNoteRecord = {
  id: string;
  projectId: string;
  kind: ProjectNoteKind;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};
