import fs from "node:fs";
import path from "node:path";
import { runPierPulseDryRun, extractWithOllamaQwen, buildPierPulseRunSummary, runPierPulseLiveCollectors } from "../src/lib/pier-pulse-runner";
import {
  createWordPressDraft,
  generatePierPulseImageWithOpenAI,
  getPrivatePierPulseWordPressConfigFromEnv,
  uploadPierPulseImagesToWordPress,
  writeSocialDraftsWithConfiguredCloudModel,
  writeWithConfiguredCloudModel,
} from "../src/lib/pier-pulse-wordpress";
import { getCorridorForRun } from "../src/lib/pier-pulse";

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      index += 1;
    } else {
      args.set(key, "true");
    }
  }
  return args;
}

function loadMissionControlDotEnv(envPath = path.join(process.cwd(), ".env")) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^[\"']|[\"']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadMissionControlDotEnv();
  const args = parseArgs(process.argv.slice(2));
  const runIndex = Number(args.get("run-index") ?? process.env.PIER_PULSE_RUN_INDEX ?? "0");
  const sourceFixturePath = args.get("sources") ?? "data/pier-pulse/sample-sources.json";
  const artifactsDir = args.get("artifacts-dir") ?? "data/pier-pulse/artifacts";
  const useOllama = args.get("ollama") === "true" || process.env.PIER_PULSE_USE_OLLAMA === "true";
  const useCloudWriter = args.get("cloud-writer") === "true" || process.env.PIER_PULSE_USE_CLOUD_WRITER === "true";
  const createDraft = args.get("create-wp-draft") === "true" || process.env.PIER_PULSE_CREATE_WP_DRAFT === "true";
  const useImages = args.get("images") === "true" || process.env.PIER_PULSE_USE_IMAGES === "true";
  const useLiveCollectors = args.get("live-collectors") === "true" || process.env.PIER_PULSE_USE_LIVE_COLLECTORS === "true";
  const useSocialDrafts = args.get("social-drafts") !== "false" && process.env.PIER_PULSE_USE_SOCIAL_DRAFTS !== "false";
  const agenticUrl = args.get("agentic-url") ?? process.env.PIER_PULSE_AGENTIC_URL;
  const liveCollectorsConfigPath = args.get("collector-config") ?? process.env.PIER_PULSE_LIVE_COLLECTOR_CONFIG ?? "data/pier-pulse/live-sources.json";
  const articleUrl = args.get("article-url") ?? process.env.PIER_PULSE_ARTICLE_URL ?? "https://www.piercommercial.com/";
  const wordpressConfig = getPrivatePierPulseWordPressConfigFromEnv();
  const corridor = getCorridorForRun(runIndex);
  const liveCollectorResults = useLiveCollectors ? await runPierPulseLiveCollectors({ configPath: liveCollectorsConfigPath, corridorId: corridor.id }) : undefined;

  const result = await runPierPulseDryRun({
    runIndex,
    sourceFixturePath: useLiveCollectors || agenticUrl ? undefined : sourceFixturePath,
    liveCollectorResults,
    agenticSources: agenticUrl
      ? [
          {
            url: agenticUrl,
            title: args.get("agentic-title") ?? "PIER Pulse cloud-agent municipal source",
            sourceName: args.get("agentic-source-name") ?? "Cloud-agent municipal research handoff",
            corridorHint: corridor.name,
            sourceType: "municipal_url",
            instructions: args.get("agentic-instructions"),
          },
        ]
      : undefined,
    socialArticleUrl: articleUrl,
    artifactsDir,
    providers: {
      extract: useOllama
        ? async ({ corridorName, candidate }) => extractWithOllamaQwen({ corridorName, candidate })
        : undefined,
      write: useCloudWriter
        ? async ({ prompt, sourcePack }) =>
            (await writeWithConfiguredCloudModel({ prompt })) ?? {
              title: `${sourcePack.corridor.name} Market Intel: Cloud Writer Unavailable`,
              html: "<h2>Market Signal</h2><p><strong>Cloud writer unavailable.</strong> Review source pack before drafting.</p>",
              excerpt: "Cloud writer unavailable; review source pack before drafting.",
            }
        : undefined,
      writeSocial: useSocialDrafts
        ? async ({ prompt }) =>
            useCloudWriter ? (await writeSocialDraftsWithConfiguredCloudModel({ prompt })) ?? {} : {}
        : undefined,
      generateImage: useImages
        ? async (imageInput) => {
            const image = await generatePierPulseImageWithOpenAI({ imageInput });
            if (!image) throw new Error(`PIER Pulse image generation failed for ${imageInput.role} image ${imageInput.index}`);
            return image;
          }
        : undefined,
      uploadImages: useImages && wordpressConfig ? async (images) => uploadPierPulseImagesToWordPress({ config: wordpressConfig, images }) : undefined,
    },
    providerModes: {
      extractor: useOllama ? "ollama" : "fallback",
      writer: useCloudWriter ? "cloud" : "fallback",
    },
  });

  const wpDraft = createDraft && wordpressConfig ? await createWordPressDraft({ config: wordpressConfig, payload: result.wordpressPayload }) : null;

  console.log(
    JSON.stringify(
      {
        ...buildPierPulseRunSummary(result),
        agenticExtractions: result.agenticExtractions.length,
        wordpressDraft: wpDraft,
        wordpressConfigured: Boolean(wordpressConfig),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
