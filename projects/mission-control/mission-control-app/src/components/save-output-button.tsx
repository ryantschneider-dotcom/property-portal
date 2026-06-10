"use client";

import { useState } from "react";

export function SaveOutputButton({
  projectId,
  title,
  content,
}: {
  projectId: string;
  title: string;
  content: string;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  async function handleSave() {
    if (state === "saving") return;
    setState("saving");

    try {
      const response = await fetch("/api/project-notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId,
          kind: "draft",
          title,
          content,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save draft");
      }

      setState("saved");
    } catch {
      setState("idle");
    }
  }

  return (
    <button
      onClick={handleSave}
      disabled={state !== "idle"}
      className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 transition hover:bg-emerald-500/15 disabled:opacity-70"
    >
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved to drafts" : "Save as draft"}
    </button>
  );
}
