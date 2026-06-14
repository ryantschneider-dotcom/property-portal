export type CopilotMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  command?: string | null;
  status?: "sent" | "ok" | "error";
};

export type ParsedCopilotCommand =
  | { type: "slash-command"; command: CopilotCommandName; args: string }
  | { type: "chat"; command: null; args: string };

export type CopilotCommandName = "/intel" | "/spin" | "/ig_cre" | "/ig_life" | "/site" | "/scrape" | "/status";

export type CopilotBackendStatus = {
  ok: boolean;
  status: string;
  url?: string;
  error?: string;
};

export type CopilotActionResult = {
  ok: boolean;
  summary: string;
  data?: unknown;
};

export const copilotSlashCommands: { name: CopilotCommandName; label: string; description: string; placeholder: string }[] = [
  { name: "/intel", label: "Intel brief", description: "Official reporting plus alternative viewpoints with separated takeaways.", placeholder: "/intel Savannah port expansion" },
  { name: "/spin", label: "Spin draft", description: "Turn the latest intel into a persuasive angle by tone.", placeholder: "/spin pro-growth institutional" },
  { name: "/ig_cre", label: "PIER Instagram", description: "Corporate, institutional CRE Instagram draft.", placeholder: "/ig_cre Whitemarsh Plaza leasing" },
  { name: "/ig_life", label: "Lifestyle Instagram", description: "Authentic hands-on lifestyle draft for woodworking, soap, bees, and family projects.", placeholder: "/ig_life cypress table build" },
  { name: "/site", label: "Offering site", description: "Trigger the Gate 1-5 Offering Site Generator for a listing.", placeholder: "/site 12 West State Street" },
  { name: "/scrape", label: "County scrape", description: "Run the county GIS/qPublic playbook and return raw parcel data.", placeholder: "/scrape 12 West State Street, Savannah, GA 31401" },
  { name: "/status", label: "System status", description: "Report Vercel, queue, and OpenClaw health.", placeholder: "/status" },
];

const commandSet = new Set(copilotSlashCommands.map((command) => command.name));

export function parseCopilotCommand(input: string): ParsedCopilotCommand {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return { type: "chat", command: null, args: trimmed };
  const [rawCommand = "", ...parts] = trimmed.split(/\s+/);
  if (commandSet.has(rawCommand as CopilotCommandName)) {
    return { type: "slash-command", command: rawCommand as CopilotCommandName, args: parts.join(" ").trim() };
  }
  return { type: "chat", command: null, args: trimmed };
}

export function normalizeCopilotMessages(input: unknown): CopilotMessage[] {
  if (!Array.isArray(input)) return [];
  const messages: CopilotMessage[] = [];
  for (const message of input) {
    if (!message || typeof message !== "object" || Array.isArray(message)) continue;
    const candidate = message as Record<string, unknown>;
    const role = candidate.role === "user" || candidate.role === "assistant" ? candidate.role : null;
    const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : null;
    const content = typeof candidate.content === "string" && candidate.content.trim() ? candidate.content.trim() : null;
    const createdAt = typeof candidate.createdAt === "string" && !Number.isNaN(Date.parse(candidate.createdAt)) ? candidate.createdAt : null;
    if (!role || !id || !content || !createdAt) continue;
    const command = typeof candidate.command === "string" ? candidate.command : null;
    const status = candidate.status === "sent" || candidate.status === "ok" || candidate.status === "error" ? candidate.status : undefined;
    messages.push({ id, role, content, createdAt, command, status });
  }
  return messages.slice(-80);
}

export function buildCopilotPrompt(command: CopilotCommandName | null, args: string, history: CopilotMessage[]) {
  const recentContext = history.slice(-12).map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n");
  const target = args.trim() || "the current context";
  const contextBlock = recentContext ? `\n\nActive Mission Control conversation context:\n${recentContext}` : "";
  const executorMandate =
    "You are the executor. Execute the required tools immediately to fulfill this slash command. Do not acknowledge a queue, do not say the task is processing, and do not wait for another system. Return only the execution results, source URLs, and any blockers after you have actually run the tools.";

  switch (command) {
    case "/intel":
      return `${executorMandate}\n\nRun /intel for: ${target}. Use web/research tools now: scrape official reporting, agency documents, primary sources, and alternative viewpoints. Return two clearly separated sections: OFFICIAL REPORTING and ALTERNATIVE VIEWPOINTS, then a PIER broker bottom line.${contextBlock}`;
    case "/spin":
      return `${executorMandate}\n\nRun /spin with tone/angle: ${target}. Use the most recent /intel data in context when available; if source facts are missing, use tools to gather them before drafting. Draft a persuasive piece from that angle without fabricating facts. Include headline, thesis, argument, counterargument, and close.${contextBlock}`;
    case "/ig_cre":
      return `${executorMandate}\n\nDraft a PIER Commercial Instagram post about: ${target}. Use tools for any factual/current claims before writing. Tone: corporate, institutional, CCIM-level, understated, no hype. Include caption, visual direction, and hashtags.${contextBlock}`;
    case "/ig_life":
      return `${executorMandate}\n\nDraft a lifestyle Instagram post about: ${target}. Use tools if factual/current verification is needed before writing. Tone: authentic, hands-on, grounded Ryan voice for woodworking, goat milk soap, beekeeping, family projects, or land stewardship. Include caption, visual direction, and hashtags.${contextBlock}`;
    case "/site":
      return `${executorMandate}\n\nTrigger and supervise the Gate 1-5 Offering Site Generator for listing: ${target}. Use the available Mission Control/ListingStream tools immediately. Report Gate 1 baseline, Gate 2 enrichment, Gate 5 deployment URL, and blockers. Use ListingStream/Mission Control safe public-only rules.${contextBlock}`;
    case "/scrape":
      return `${executorMandate}\n\nRun the county GIS/qPublic playbook for address/listing: ${target}. Use tools now: address variants, qPublic/direct lookup, geocoding, county property-search endpoints, and ArcGIS REST spatial queries. Return the raw data, source URLs, PARID, acreage, zoning, assessed values, owner/public-record facts, and any missing fields.${contextBlock}`;
    case "/status":
      return `${executorMandate}\n\nReport uptime and queue health for Vercel, Mission Control, ListingStream, and OpenClaw. Use available system/status tools immediately. Include gateway health, queue posture, recent errors, and whether the secure tunnel is configured.${contextBlock}`;
    default:
      return `${args.trim()}${contextBlock}`;
  }
}

export function createCopilotAssistantFallback(input: {
  message: string;
  command: CopilotCommandName | null;
  args: string;
  backend: CopilotBackendStatus;
  action?: CopilotActionResult | null;
}) {
  if (input.command === "/status") {
    return `## Hermes Co-Pilot Status\n\n- OpenClaw: ${input.backend.ok ? input.backend.status || "live" : `unreachable (${input.backend.error || "check tunnel"})`}\n- Mission Control: online\n- Vercel: ${input.action?.summary || "status probe ready"}\n- Secure tunnel: ${input.backend.url ? "configured" : "using default local OpenClaw gateway; set OPENCLAW_GATEWAY_WS_URL / OPENCLAW_GATEWAY_HTTP_URL for production tunnel"}\n\nUse /site, /scrape, /intel, /spin, /ig_cre, or /ig_life from this tab. Runtime output is persisted in the active Co-Pilot conversation history.`;
  }

  if (input.action?.ok) return `## Command accepted\n\n${input.action.summary}\n\nI forwarded this through the Hermes Co-Pilot command suite. If OpenClaw is available, it is also queued there for autonomous execution.`;

  const prompt = buildCopilotPrompt(input.command, input.args || input.message, []);
  return `## Hermes Co-Pilot\n\nI prepared this command for OpenClaw execution:\n\n\`\`\`text\n${prompt}\n\`\`\`\n\nBackend status: ${input.backend.ok ? input.backend.status : input.backend.error || "offline"}`;
}

export function stripReasoningTags(text: string) {
  return text
    .replace(/(?:[ \t]*\n)+[ \t]*<think\b[^>]*>[\s\S]*?<\/think>[ \t]*(?:\n[ \t]*)+/gi, "\n")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function renderMarkdownPreview(text: string) {
  return stripReasoningTags(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br />");
}
