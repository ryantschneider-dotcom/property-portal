import { bulletList, firstSentence, previewText, textLines } from "@/lib/text-utils";

export type ChatPreset = {
  id: string;
  label: string;
  description: string;
  prompt: string;
};

export type ChatActionRun = {
  id: string;
  presetId: string;
  presetLabel: string;
  context: string;
  output: string;
  createdAt: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  projectId?: string;
  projectName?: string;
};

export const chatPresets: ChatPreset[] = [
  {
    id: "summarize-notes",
    label: "Summarize notes",
    description: "Turn rough notes into a clean executive summary and next actions.",
    prompt: "Summarize this material into the bottom line, key risks, and recommended next steps.",
  },
  {
    id: "draft-follow-up",
    label: "Draft follow-up",
    description: "Create a direct follow-up draft based on raw context or call notes.",
    prompt: "Draft a concise follow-up email and include the next-step list.",
  },
  {
    id: "analyze-project",
    label: "Analyze project context",
    description: "Review a project update and return the highest-value recommendations.",
    prompt: "Review this project context and tell me what matters most, what is weak, and what to do next.",
  },
  {
    id: "turn-into-workflow",
    label: "Turn into workflow",
    description: "Take rough process notes and structure them into a repeatable workflow.",
    prompt: "Turn this into a repeatable workflow with steps, handoffs, and likely bottlenecks.",
  },
];

export function generateChatOutput(label: string, context: string) {
  const summary = firstSentence(context);
  const preview = previewText(context, 280);
  const lines = textLines(context, 4);

  switch (label) {
    case "Summarize notes":
      return `EXECUTIVE SUMMARY\n- ${summary}\n\nKEY POINTS\n${bulletList(lines, [
        "Clarify the real objective",
        "Identify the blockers or missing facts",
        "Decide the next move instead of collecting more noise",
      ])}\n\nRISKS / GAPS\n${bulletList(
        lines.slice(1, 3).map((line) => `Pressure-test: ${line}`),
        ["The material may still be missing ownership, timing, or decision criteria."],
      )}\n\nRECOMMENDED NEXT STEPS\n- Tighten this into a 3-part brief: goal, risk, next move\n- Assign one owner to each next action\n- Strip anything that does not change the decision\n\nSOURCE SNAPSHOT\n${preview}`;

    case "Draft follow-up":
      return `BOTTOM LINE\n- Follow up directly, keep momentum, and close the open loop.\n\nDRAFT\nSubject: Quick follow-up\n\nHi [Name],\n\nFollowing up on our conversation. The main point I took away was: ${summary}\n\nFrom here, the cleanest next step is to confirm the open item and keep the process moving. If helpful, I can send over the next piece of information today so we can stay on track.\n\nBest,\nRyan\n\nINTERNAL NEXT STEPS\n- Confirm any missing facts before sending\n- Tighten the ask or next action into one sentence\n- Send same-day if speed matters`;

    case "Analyze project context":
      return `EXECUTIVE SUMMARY\n- ${summary}\n\nWHAT LOOKS STRONG\n${bulletList(lines, ["There is enough context to act.", "The work has forward motion."])}\n\nWHAT LOOKS WEAK\n- Ownership may still be soft\n- Priority stack may still be too broad\n- The next milestone may not be explicit enough\n\nDEVIL'S ADVOCATE\n- If this is not tied to a real outcome, it may just be well-organized drift\n- If the next action has no owner or date, this is weaker than it looks\n\nRECOMMENDATION\n- Lock the next milestone\n- Assign the owner\n- Kill or defer anything nonessential\n\nSOURCE SNAPSHOT\n${preview}`;

    case "Turn into workflow":
      return `WORKFLOW DRAFT\n\nOBJECTIVE\n- ${summary}\n\nSTEPS\n1. Intake the raw input\n2. Normalize the facts into a usable format\n3. Route to the right owner\n4. Execute the next action\n5. Track status and blockers\n6. Close the loop and archive the result\n\nHANDOFF / FAILURE POINTS\n- Missing facts at intake\n- No owner assigned\n- No follow-up trigger after the first action\n\nNOTES CAPTURED\n${bulletList(lines, [preview])}`;

    default:
      return `EXECUTIVE SUMMARY\n- ${summary}\n\nCAPTURED CONTEXT\n${bulletList(lines, [preview])}\n\nRECOMMENDED NEXT STEP\n- Convert this into one clear decision, one owner, and one next move.`;
  }
}
