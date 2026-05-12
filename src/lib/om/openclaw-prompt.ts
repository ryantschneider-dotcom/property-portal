import type { NormalizedOmInput } from "@/lib/om/types";

export type OpenClawDraftRequest = {
  task: "draft_offering_memorandum_sections";
  template: string;
  systemInstructions: string;
  rules: {
    mustUseOnlyProvidedData: true;
    mustNotInventFacts: true;
    mustReturnJsonOnly: true;
    mustAvoidEmDashes: true;
    mustAvoidAiVocabulary: true;
    mustFlagMissingImportantInputs: true;
  };
  style: {
    tone: string;
    audience: string;
    forbiddenPhrases: string[];
    preferredQualities: string[];
  };
  sectionsRequired: Array<
    | "executiveSummary"
    | "propertyDescription"
    | "locationOverview"
    | "demographicsSummary"
    | "highlights"
    | "disclaimer"
  >;
  property: NormalizedOmInput;
};

export type OpenClawDraftResponse = {
  sections: {
    executiveSummary: string;
    propertyDescription: string;
    locationOverview: string;
    demographicsSummary: string;
    highlights: string[];
    disclaimer: string;
  };
  warnings: string[];
  missingInputs: string[];
  metadata: {
    template: string;
    draftVersion: number;
    [key: string]: string | number | boolean | null;
  };
};

const SYSTEM_INSTRUCTIONS = [
  "You are an expert commercial real estate copywriter drafting offering memorandum narrative sections for PIER Commercial Real Estate.",
  "Write in plain speak. Sound professional, warm, steady, and commercially credible.",
  "Be concise, factual, and readable. Do not sound like a chatbot, marketer, or lawyer.",
  "Never use em dashes.",
  "Avoid typical AI vocabulary and filler such as: leverage, showcase, boasts, nestled, vibrant, thoughtfully designed, state-of-the-art, unlock, premier, exceptional opportunity, strategically located, this property offers.",
  "Do not hype. Do not exaggerate. Do not use unsupported superlatives.",
  "Use only facts provided in the NormalizedOmInput. Never invent missing data, tenant names, proximity claims, pricing logic, market commentary, or property attributes.",
  "If important information is missing, do not guess. Instead, list it in missingInputs or warnings and write around it cleanly.",
  "Return JSON only. No markdown, no commentary, no code fences, no preamble.",
  "The JSON must exactly follow the requested response structure.",
].join(" ");

const FORBIDDEN_PHRASES = [
  "leverage",
  "showcase",
  "boasts",
  "nestled",
  "vibrant",
  "thoughtfully designed",
  "state-of-the-art",
  "unlock",
  "premier",
  "exceptional opportunity",
  "strategically located",
  "this property offers",
];

const PREFERRED_QUALITIES = [
  "plainspoken",
  "commercially credible",
  "specific",
  "clean",
  "institutional but human",
  "warm but firm",
  "fact-driven",
];

export function buildOpenClawOmDraftPrompt(input: NormalizedOmInput, template = "standard-om-v1"): OpenClawDraftRequest {
  return {
    task: "draft_offering_memorandum_sections",
    template,
    systemInstructions: SYSTEM_INSTRUCTIONS,
    rules: {
      mustUseOnlyProvidedData: true,
      mustNotInventFacts: true,
      mustReturnJsonOnly: true,
      mustAvoidEmDashes: true,
      mustAvoidAiVocabulary: true,
      mustFlagMissingImportantInputs: true,
    },
    style: {
      tone: "plain speak, professional, warm but firm, commercially credible",
      audience: "investors, tenants, brokers, lenders, and owner decision-makers",
      forbiddenPhrases: FORBIDDEN_PHRASES,
      preferredQualities: PREFERRED_QUALITIES,
    },
    sectionsRequired: [
      "executiveSummary",
      "propertyDescription",
      "locationOverview",
      "demographicsSummary",
      "highlights",
      "disclaimer",
    ],
    property: input,
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function validateOpenClawDraftResponse(data: unknown): OpenClawDraftResponse {
  if (!data || typeof data !== "object") throw new Error("Draft response must be an object");

  const candidate = data as Partial<OpenClawDraftResponse>;
  const sections = candidate.sections;
  const metadata = candidate.metadata;

  if (!sections || typeof sections !== "object") throw new Error("Draft response missing sections");
  if (typeof sections.executiveSummary !== "string") throw new Error("Draft response missing sections.executiveSummary");
  if (typeof sections.propertyDescription !== "string") throw new Error("Draft response missing sections.propertyDescription");
  if (typeof sections.locationOverview !== "string") throw new Error("Draft response missing sections.locationOverview");
  if (typeof sections.demographicsSummary !== "string") throw new Error("Draft response missing sections.demographicsSummary");
  if (!isStringArray(sections.highlights)) throw new Error("Draft response missing sections.highlights[]");
  if (typeof sections.disclaimer !== "string") throw new Error("Draft response missing sections.disclaimer");

  if (!isStringArray(candidate.warnings)) throw new Error("Draft response missing warnings[]");
  if (!isStringArray(candidate.missingInputs)) throw new Error("Draft response missing missingInputs[]");
  if (!metadata || typeof metadata !== "object") throw new Error("Draft response missing metadata");
  if (typeof metadata.template !== "string") throw new Error("Draft response missing metadata.template");
  if (typeof metadata.draftVersion !== "number") throw new Error("Draft response missing metadata.draftVersion");

  return candidate as OpenClawDraftResponse;
}

export function buildOpenClawOmUserPrompt(input: NormalizedOmInput, template = "standard-om-v1") {
  return JSON.stringify(buildOpenClawOmDraftPrompt(input, template), null, 2);
}
