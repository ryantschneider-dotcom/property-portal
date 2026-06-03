import { NextRequest, NextResponse } from "next/server";
import { pushActivityEvent } from "@/lib/activity-log";
import { getCorridorForRun } from "@/lib/pier-pulse";
import { runPierPulseDryRun, extractWithOllamaQwen, buildPierPulseRunSummary, runPierPulseLiveCollectors } from "@/lib/pier-pulse-runner";
import {
  createWordPressDraft,
  getPierPulseWordPressConfigFromEnv,
  getPrivatePierPulseWordPressConfigFromEnv,
  writeSocialDraftsWithConfiguredCloudModel,
  writeWithConfiguredCloudModel,
} from "@/lib/pier-pulse-wordpress";
import { readStore, writeStore } from "@/lib/storage";

export async function GET() {
  return NextResponse.json({
    ok: true,
    workflow: "pier-pulse-drop",
    phase: "phase-1-mvp",
    wordpress: getPierPulseWordPressConfigFromEnv(),
    defaults: {
      sourceFixturePath: "data/pier-pulse/sample-sources.json",
      artifactsDir: "data/pier-pulse/artifacts",
      draftOnly: true,
    },
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    runIndex?: number;
    sourceFixturePath?: string;
    artifactsDir?: string;
    useOllama?: boolean;
    useCloudWriter?: boolean;
    createWordPressDraft?: boolean;
    useLiveCollectors?: boolean;
    liveCollectorConfigPath?: string;
    useSocialDrafts?: boolean;
    articleUrl?: string;
  };

  const useOllama = body.useOllama ?? process.env.PIER_PULSE_USE_OLLAMA === "true";
  const useCloudWriter = body.useCloudWriter ?? process.env.PIER_PULSE_USE_CLOUD_WRITER === "true";
  const useLiveCollectors = body.useLiveCollectors ?? process.env.PIER_PULSE_USE_LIVE_COLLECTORS === "true";
  const useSocialDrafts = body.useSocialDrafts ?? process.env.PIER_PULSE_USE_SOCIAL_DRAFTS !== "false";
  const createDraft = body.createWordPressDraft === true;
  const runIndex = Number.isFinite(body.runIndex) ? Number(body.runIndex) : Number(process.env.PIER_PULSE_RUN_INDEX ?? "0");
  const corridor = getCorridorForRun(runIndex);
  const liveCollectorResults = useLiveCollectors
    ? await runPierPulseLiveCollectors({
        configPath: body.liveCollectorConfigPath ?? process.env.PIER_PULSE_LIVE_COLLECTOR_CONFIG ?? "data/pier-pulse/live-sources.json",
        corridorId: corridor.id,
      })
    : undefined;

  const result = await runPierPulseDryRun({
    runIndex,
    sourceFixturePath: useLiveCollectors ? undefined : body.sourceFixturePath ?? "data/pier-pulse/sample-sources.json",
    liveCollectorResults,
    socialArticleUrl: body.articleUrl ?? process.env.PIER_PULSE_ARTICLE_URL ?? "https://www.piercommercial.com/",
    artifactsDir: body.artifactsDir ?? "data/pier-pulse/artifacts",
    providers: {
      extract: useOllama ? async ({ corridorName, candidate }) => extractWithOllamaQwen({ corridorName, candidate }) : undefined,
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
    },
    providerModes: {
      extractor: useOllama ? "ollama" : "fallback",
      writer: useCloudWriter ? "cloud" : "fallback",
    },
  });

  const wpConfig = getPrivatePierPulseWordPressConfigFromEnv();
  const wordpressDraft = createDraft && wpConfig ? await createWordPressDraft({ config: wpConfig, payload: result.wordpressPayload }) : null;

  const store = await readStore();
  pushActivityEvent(store, {
    type: "draft",
    title: wordpressDraft ? "PIER Pulse WordPress draft created" : "PIER Pulse draft artifact generated",
    detail: `${result.sourcePack.corridor.name}: ${result.sourcePack.sources.length} sources used. Artifact: ${result.artifactPath}`,
  });
  await writeStore(store);

  return NextResponse.json({
    ...buildPierPulseRunSummary(result),
    wordpressDraft,
  });
}
