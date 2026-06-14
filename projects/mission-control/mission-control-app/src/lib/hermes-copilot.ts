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

  switch (command) {
    case "/intel":
      return `Run /intel for: ${target}. Scrape official reporting, agency documents, primary sources, and alternative viewpoints. Return two clearly separated sections: OFFICIAL REPORTING and ALTERNATIVE VIEWPOINTS, then a PIER broker bottom line.${contextBlock}`;
    case "/spin":
      return `Run /spin with tone/angle: ${target}. Use the most recent /intel data in context when available. Draft a persuasive piece from that angle without fabricating facts. Include headline, thesis, argument, counterargument, and close.${contextBlock}`;
    case "/ig_cre":
      return `Draft a PIER Commercial Instagram post about: ${target}. Tone: corporate, institutional, CCIM-level, understated, no hype. Include caption, visual direction, and hashtags.${contextBlock}`;
    case "/ig_life":
      return `Draft a lifestyle Instagram post about: ${target}. Tone: authentic, hands-on, grounded Ryan voice for woodworking, goat milk soap, beekeeping, family projects, or land stewardship. Include caption, visual direction, and hashtags.${contextBlock}`;
    case "/site":
      return `Trigger and supervise the Gate 1-5 Offering Site Generator for listing: ${target}. Report Gate 1 baseline, Gate 2 enrichment, Gate 5 deployment URL, and blockers. Use ListingStream/Mission Control safe public-only rules.${contextBlock}`;
    case "/scrape":
      return `Execute the county GIS/qPublic playbook for address/listing: ${target}. Use address variants, qPublic/direct lookup, geocoding, and ArcGIS REST spatial queries. Return the raw data, source URLs, PARID, acreage, zoning, assessed values, and any missing fields.${contextBlock}`;
    case "/status":
      return `Report uptime and queue health for Vercel, Mission Control, ListingStream, and OpenClaw. Include gateway health, queue posture, recent errors, and whether the secure tunnel is configured.${contextBlock}`;
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

export function renderMarkdownPreview(text: string) {
  return text
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
