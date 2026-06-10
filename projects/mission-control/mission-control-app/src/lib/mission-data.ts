import { bulletList, firstSentence, previewText, textLines } from "@/lib/text-utils";

export type ToolDefinition = {
  id: string;
  name: string;
  category: "brokerage" | "pm" | "ops" | "ai";
  description: string;
  inputMode: "form" | "notes" | "mixed";
  output: string;
  status: "ready" | "planned";
};

export type ActivityEvent = {
  id: string;
  type: "tool" | "chat" | "upload" | "project" | "note" | "draft" | "workflow" | "system";
  title: string;
  detail: string;
  time: string;
};

export type ToolRun = {
  id: string;
  toolId: string;
  toolName: string;
  input: string;
  output: string;
  createdAt: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  projectId?: string;
  projectName?: string;
};

export const toolRegistry: ToolDefinition[] = [
  {
    id: "follow-up-generator",
    name: "Follow-Up Generator",
    category: "brokerage",
    description:
      "Turn rough notes from a call, tour, or email chain into a clean follow-up draft and next-step list.",
    inputMode: "notes",
    output: "Email draft + next actions",
    status: "ready",
  },
  {
    id: "lead-qualification",
    name: "Lead Qualification",
    category: "brokerage",
    description:
      "Score a lead, identify missing qualification info, and recommend whether to engage, qualify further, or slow-play.",
    inputMode: "form",
    output: "Qualification summary + response draft",
    status: "ready",
  },
  {
    id: "listing-intake-formatter",
    name: "Listing Intake Formatter",
    category: "brokerage",
    description:
      "Convert raw property info into a structured listing intake with a missing-items checklist.",
    inputMode: "mixed",
    output: "Listing summary + missing items",
    status: "ready",
  },
  {
    id: "pm-issue-builder",
    name: "PM Issue Update Builder",
    category: "pm",
    description:
      "Turn a service issue into a status summary, urgency classification, and communication drafts.",
    inputMode: "mixed",
    output: "PM issue update + messages",
    status: "ready",
  },
  {
    id: "bov-summary",
    name: "Property / BOV Summary",
    category: "brokerage",
    description:
      "Create a first-pass property summary or BOV skeleton from rough notes and comps.",
    inputMode: "mixed",
    output: "BOV summary + pricing direction",
    status: "ready",
  },
  {
    id: "chat-actions",
    name: "AI Action Console",
    category: "ai",
    description:
      "Launch AI-assisted prompt actions against project, workflow, or tool context from inside Mission Control.",
    inputMode: "mixed",
    output: "Context-aware AI run",
    status: "planned",
  },
];

export const activityFeed: ActivityEvent[] = [
  {
    id: "evt-1",
    type: "system",
    title: "Mission Control shell refactor",
    detail: "Shifted the UI toward a left rail, command bar, and right-side activity panel.",
    time: "just now",
  },
  {
    id: "evt-2",
    type: "project",
    title: "Mission Control MVP scaffolded",
    detail: "Next.js app shell created and validated with a successful production build.",
    time: "earlier today",
  },
  {
    id: "evt-3",
    type: "workflow",
    title: "Workflow templates committed",
    detail: "Follow-up, listing intake, PM issue, and activity templates are now saved in workspace history.",
    time: "earlier today",
  },
  {
    id: "evt-4",
    type: "project",
    title: "Maintenance SaaS sales pack expanded",
    detail: "Homepage, pricing, FAQ, demo script, and sales call script were all added.",
    time: "earlier today",
  },
];

export function formatLocalTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function generateToolOutput(toolName: string, input: string) {
  const summary = firstSentence(input);
  const lines = textLines(input, 4);
  const preview = previewText(input, 260);

  switch (toolName) {
    case "Follow-Up Generator":
      return `BOTTOM LINE\n- Keep momentum and close the loop quickly.\n\nDRAFT FOLLOW-UP\nSubject: Quick follow-up\n\nHi [Name],\n\nThank you again for the conversation. The main takeaway on my side is: ${summary}\n\nFrom here, the cleanest next step is to confirm the open item and keep the process moving. If helpful, I can send over the next piece of information today.\n\nBest,\nRyan\n\nINTERNAL NEXT STEPS\n- Confirm any missing pricing/details\n- Tighten the ask into one sentence\n- Send same-day if speed matters`;

    case "Lead Qualification":
      return `LEAD QUALIFICATION\n- Current read: ${preview.length > 120 ? "workable, but still underqualified" : "early-stage and lightly qualified"}\n\nWHAT WE KNOW\n${bulletList(lines, [preview])}\n\nWHAT IS MISSING\n- Timing\n- Budget / economic range\n- Decision-maker\n- Space requirement / use case\n\nRECOMMENDED NEXT MOVE\n- Qualify further before investing heavy time\n- Push for timing + budget in the next touch\n- Slow-play if the answers stay soft\n\nSUGGESTED REPLY\nThanks for reaching out. Before I point you in the wrong direction, can you confirm timing, size requirement, and budget range? That will help me narrow the right options quickly.`;

    case "Listing Intake Formatter":
      return `LISTING INTAKE SUMMARY\n- ${summary}\n\nCAPTURED DETAILS\n${bulletList(lines, [preview])}\n\nMISSING / NEED TO VERIFY\n- Asking price / rent guidance\n- Size / square footage\n- Ownership contact and decision path\n- Photos, flyer, or source docs\n\nRECOMMENDED NEXT MOVE\n- Build the clean intake sheet\n- Request the missing items in one pass\n- Move to first-draft marketing copy once facts are confirmed`;

    case "PM Issue Update Builder":
      return `PM ISSUE UPDATE\n- ${summary}\n\nURGENCY\n- ${/leak|electrical|hazard|security|no heat|no ac/i.test(preview) ? "Urgent / needs quick review" : "Routine unless more detail changes the urgency"}\n\nTENANT UPDATE\nWe received the issue and are reviewing the next step now. We will follow up as soon as the service path is confirmed.\n\nINTERNAL NEXT STEPS\n- Verify urgency and scope\n- Assign vendor if appropriate\n- Confirm access/logistics\n- Track completion and close the loop`;

    case "Property / BOV Summary":
      return `PROPERTY / BOV FIRST PASS\n- ${summary}\n\nVALUE DRIVERS / SIGNALS\n${bulletList(lines, [preview])}\n\nWHAT STILL NEEDS SUPPORT\n- Comparable sales or lease comps\n- Size / rent / pricing support\n- Market context\n- Likely objections or risk points\n\nRECOMMENDED NEXT MOVE\n- Tighten comp support\n- Confirm pricing direction\n- Build the client-ready summary with a clear recommendation`;

    default:
      return `EXECUTIVE SUMMARY\n- ${summary}\n\nCAPTURED DETAILS\n${bulletList(lines, [preview])}\n\nRECOMMENDED NEXT STEPS\n- Review the raw input\n- Tighten it into a usable draft\n- Save it into project history`;
  }
}
