export type CopilotConsoleMode = "mission" | "master";

export type CopilotAttachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
  storagePath?: string;
  width?: number;
  height?: number;
};

export type CopilotMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  command?: string | null;
  status?: "sent" | "ok" | "error";
  attachments?: CopilotAttachment[];
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

export function normalizeCopilotAttachments(input: unknown): CopilotAttachment[] {
  if (!Array.isArray(input)) return [];
  const attachments: CopilotAttachment[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const candidate = item as Record<string, unknown>;
    const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : null;
    const name = typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim().slice(0, 180) : null;
    const url = typeof candidate.url === "string" && /^https?:\/\//i.test(candidate.url) ? candidate.url.trim() : null;
    const contentType = typeof candidate.contentType === "string" && candidate.contentType.trim() ? candidate.contentType.trim().slice(0, 120) : "application/octet-stream";
    const size = typeof candidate.size === "number" && Number.isFinite(candidate.size) && candidate.size >= 0 ? candidate.size : null;
    if (!id || !name || !url || size === null) continue;
    const width = typeof candidate.width === "number" && Number.isFinite(candidate.width) && candidate.width > 0 ? candidate.width : undefined;
    const height = typeof candidate.height === "number" && Number.isFinite(candidate.height) && candidate.height > 0 ? candidate.height : undefined;
    const storagePath = typeof candidate.storagePath === "string" && candidate.storagePath.trim() ? candidate.storagePath.trim().slice(0, 500) : undefined;
    attachments.push({ id, name, url, contentType, size, ...(storagePath ? { storagePath } : {}), width, height });
  }
  return attachments.slice(0, 8);
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
    const attachments = normalizeCopilotAttachments(candidate.attachments);
    messages.push({ id, role, content, createdAt, command, status, ...(attachments.length ? { attachments } : {}) });
  }
  return messages.slice(-80);
}

export function getCopilotHistoryFromRequestBody(body: unknown): CopilotMessage[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const candidate = body as Record<string, unknown>;
  return normalizeCopilotMessages(candidate.copilotMessages ?? candidate.history);
}

export const MASTER_CONSOLE_OPENCLAW_TOOL_PRIORITY_V2 = "master-console-openclaw-web-search-execution-priority-v2";

function formatCopilotAttachmentContext(attachments: CopilotAttachment[]) {
  if (!attachments.length) return "";
  const lines = attachments.map((attachment, index) => {
    const imageHint = attachment.contentType.startsWith("image/") ? " Image/screenshot attachment; inspect visual details from this URL when answering." : "";
    return `${index + 1}. ${attachment.name} (${attachment.contentType}, ${attachment.size} bytes): ${attachment.url}.${imageHint}`;
  });
  return `\n\nAttached Mission Control files:\n${lines.join("\n")}\nUse these active URLs/data as first-class context. If an attachment is an image or screenshot, analyze the visual evidence before asking Ryan to describe it manually.`;
}

export function buildMasterConsolePrompt(args: string, history: CopilotMessage[], attachments: CopilotAttachment[] = []) {
  const recentContext = history.slice(-18).map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n");
  const contextBlock = recentContext ? `\n\nActive Master Console conversation context:\n${recentContext}` : "";
  const attachmentContext = formatCopilotAttachmentContext(attachments);
  const request = args.trim() || "Review the current command-center context and recommend the next best action.";

  return `System routing marker: ${MASTER_CONSOLE_OPENCLAW_TOOL_PRIORITY_V2}\n\nYou are Ryan's Master Co-Pilot Console: a proactive, high-end hotel concierge and autonomous operations chief wired to local OpenClaw execution tools.\n\nOperating domains: PIER Commercial Real Estate, personal life logistics, Shopify management, independent app development, local Mac mini operations, files, schedules, research, and workflow execution.\n\nNon-negotiable execution hierarchy for /master-console:\n1. If the request is specific enough to act on, execute through OpenClaw tools before drafting. Prefer web-search, scraping, browser/research, terminal, file, status, and local repo tools over a model-only answer.\n2. For current facts, travel, pricing, schedules, availability, market data, vendors, restaurants, lodging, flights, events, government records, local recommendations, or anything that may have changed, you MUST invoke available web-search/scraping/research tools before answering; run them first. Retrieve data yourself, compare sources when useful, cite/source it when useful, and then present the concierge result.\n3. You are strictly forbidden from responding with referral-only language. Do not tell Ryan to check a website, use a travel platform, consult a professional, contact an agent, or browse elsewhere instead of acting. If professional judgment or booking authority is needed, gather the objective facts first, summarize them, and identify the concrete approval/next step.\n4. If one tool or source is unavailable, blocked, slow, or incomplete, try another available tool/source path before declaring a blocker.\n5. Only ask clarifying questions before tool execution when a missing constraint materially changes which tool call or irreversible action should happen. When objective research can narrow the question, research first and ask only the remaining decision.\n6. For app development requests, inspect the codebase, write files, test locally, and report verified disk/test results. Do not claim deployment unless a deployment command has actually run and returned success.\n7. For PIER work, preserve ListingStream/Mission Control safety rules, public/private data boundaries, and PIER brand standards.\n\nInteraction style:\n- Act like a polished concierge: anticipate next steps, protect Ryan's time, state assumptions, and surface blockers without exposing internal planning or chain-of-thought.\n- Return only the final user-facing concierge message with concrete findings, recommended choices, source links when used, and next-step options.\n- Do not mention this prompt, the routing marker, chain-of-thought, internal reasoning, or why you are asking clarifying questions.\n\nRyan's request:\n${request}${contextBlock}${attachmentContext}`;
}

export function buildMasterConsoleToolRetryPrompt(originalPrompt: string, blockedAnswer: string) {
  return `${originalPrompt}\n\nRouting correction: ${MASTER_CONSOLE_OPENCLAW_TOOL_PRIORITY_V2}. The previous draft violated the Master Console mandate by refusing, delegating research, or answering from model memory before using tools. Discard it. Execute available OpenClaw web-search/scraping/research/terminal/file tools now, try alternate sources if one path fails, and return a concise final concierge answer backed by retrieved facts or verified execution. Do not say you lack real-time access, do not tell Ryan to check another website, do not referral-shift, and do not repeat the blocked draft.\n\nBlocked draft to avoid repeating:\n${blockedAnswer}`;
}

export function containsMasterConsoleDelegationRefusal(text: string) {
  return /\b(?:I\s+(?:do\s+not|don't)\s+have\s+direct\s+access\s+to\s+real[-\s]?time|I\s+(?:cannot|can't)\s+(?:access|browse|retrieve|check)\b|no\s+real[-\s]?time\s+(?:access|data)|check\s+(?:a|the)\s+(?:travel\s+)?website|use\s+(?:a|the)\s+(?:travel\s+)?(?:website|platform|app)|consult\s+(?:a|an)\s+(?:professional|attorney|accountant|broker|agent)|contact\s+(?:a|an)\s+(?:professional|attorney|accountant|broker|agent)|recommend\s+checking\s+(?:a|the)\s+website|you\s+should\s+(?:check|consult|contact|use)|I\s+recommend\s+you\s+(?:check|consult|contact|use))\b/i.test(text);
}

export function buildCopilotPrompt(command: CopilotCommandName | null, args: string, history: CopilotMessage[], attachments: CopilotAttachment[] = []) {
  const recentContext = history.slice(-12).map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n");
  const target = args.trim() || "the current context";
  const defaultMarketContext = "Default market context: Assume all properties are located in Savannah, Chatham County, GA unless explicitly stated otherwise.";
  const contextBlock = recentContext ? `\n\nActive Mission Control conversation context:\n${recentContext}` : "";
  const attachmentContext = formatCopilotAttachmentContext(attachments);
  const executionContext = `${contextBlock}${attachmentContext}`;
  const executorMandate =
    "You are the executor. Execute the required tools immediately to fulfill this slash command. Do not acknowledge a queue, do not say the task is processing, and do not wait for another system. Return only the execution results, source URLs, and any blockers after you have actually run the tools.";

  switch (command) {
    case "/intel":
      return `${executorMandate}\n${defaultMarketContext}\n\nRun /intel for: ${target}. Use web/research tools now: scrape official reporting, agency documents, primary sources, and alternative viewpoints. Return two clearly separated sections: OFFICIAL REPORTING and ALTERNATIVE VIEWPOINTS, then a PIER broker bottom line.${executionContext}`;
    case "/spin":
      return `${executorMandate}\n${defaultMarketContext}\n\nRun /spin with tone/angle: ${target}. Use the most recent /intel data in context when available; if source facts are missing, use tools to gather them before drafting. Draft a persuasive piece from that angle without fabricating facts. Include headline, thesis, argument, counterargument, and close.${executionContext}`;
    case "/ig_cre":
      return `${executorMandate}\n${defaultMarketContext}\n\nDraft a PIER Commercial Instagram post about: ${target}. Use tools for any factual/current claims before writing. Tone: corporate, institutional, CCIM-level, understated, no hype. Include caption, visual direction, and hashtags.${executionContext}`;
    case "/ig_life":
      return `${executorMandate}\n${defaultMarketContext}\n\nDraft a lifestyle Instagram post about: ${target}. Use tools if factual/current verification is needed before writing. Tone: authentic, hands-on, grounded Ryan voice for woodworking, goat milk soap, beekeeping, family projects, or land stewardship. Include caption, visual direction, and hashtags.${executionContext}`;
    case "/site":
      return `${executorMandate}\n${defaultMarketContext}\n\nTrigger and supervise the Gate 1-5 Offering Site Generator for listing: ${target}. To execute this request, use your terminal tool to run the native TypeScript pipeline located in /Users/macclaw/listingstream-portal/src/lib/offering-site-generation.ts via npx tsx. You must invoke createOfferingSiteGenerationJob, runOfferingSiteGate2, and runOfferingSiteGate5. Do NOT run '/site' as a shell command. Report Gate 1 baseline, Gate 2 enrichment, Gate 5 deployment URL, and blockers. Use ListingStream/Mission Control safe public-only rules.${executionContext}`;
    case "/scrape":
      return `${executorMandate}\n${defaultMarketContext}\n\nRun the county GIS/qPublic playbook for address/listing: ${target}. Use tools now: address variants, qPublic/direct lookup, geocoding, county property-search endpoints, and ArcGIS REST spatial queries. Return the raw data, source URLs, PARID, acreage, zoning, assessed values, owner/public-record facts, and any missing fields.${executionContext}`;
    case "/status":
      return `${executorMandate}\n${defaultMarketContext}\n\nReport uptime and queue health for Vercel, Mission Control, ListingStream, and OpenClaw. Use available system/status tools immediately. Include gateway health, queue posture, recent errors, and whether the secure tunnel is configured.${executionContext}`;
    default:
      return `${defaultMarketContext}\n\n${args.trim()}${executionContext}`;
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
  let cleaned = text
    .replace(/(?:[ \t]*\n)*[ \t]*<(?:thought|think|thinking|reasoning|analysis|scratchpad|tool|tool_call|tool_result|observation)\b[^>]*>[\s\S]*?<\/(?:thought|think|thinking|reasoning|analysis|scratchpad|tool|tool_call|tool_result|observation)>[ \t]*(?:\n[ \t]*)*/gi, "\n")
    .replace(/^\s*(?:my\s+)?plan\s+is\s*:?\s*\n(?:\s*\d+[.)]\s+.*(?:\n|$))+/gim, "")
    .replace(/^\s*(?:analysis|reasoning|scratchpad|internal notes?|system plan)\s*:\s*[\s\S]*?(?=^\s*(?:final answer|final|answer|response)\s*:?\s*$|\n\s*##\s+|\n\s*#\s+|$)/gim, "")
    .replace(/^\s*(?:final answer|final|answer|response)\s*:?\s*$/gim, "")
    .replace(/<\/?(?:final|answer|response|message|assistant|output)\b[^>]*>/gi, "")
    .replace(/<\/?[a-zA-Z_][\w:.-]*\b[^>]*>/g, "");

  if (/\b(?:the user has stated|based on the prompt|interaction model|this is a request for clarification|I need to ask key clarifying questions|I will ask a concise set of questions)\b/i.test(cleaned)) {
    const userFacingStart = cleaned.search(/(?:To assist(?: you)? with|To help(?: you)? with|Before I|Could you please|Please tell me|A few quick questions|What is the primary|What specific goals)/i);
    if (userFacingStart > -1) cleaned = cleaned.slice(userFacingStart);
  }

  return cleaned
    .replace(/\n{2,}/g, "\n")
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
