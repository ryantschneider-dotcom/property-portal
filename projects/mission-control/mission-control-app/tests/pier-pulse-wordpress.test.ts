import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGeminiWriterRequest,
  buildOpenAiWriterRequest,
  createWordPressDraft,
  generatePierPulseImageWithOpenAI,
  getPierPulseWordPressConfigFromEnv,
  uploadPierPulseImagesToWordPress,
  uploadWordPressMedia,
  validateDraftOnlyPayload,
  writeWithConfiguredCloudModel,
  type PierPulseWordPressConfig,
} from "../src/lib/pier-pulse-wordpress";

test("PIER Pulse WordPress config reads env without exposing secrets", () => {
  const config = getPierPulseWordPressConfigFromEnv({
    PIER_PULSE_WP_BASE_URL: "https://piercommercial.com",
    PIER_PULSE_WP_USERNAME: "ryan",
    PIER_PULSE_WP_APP_PASSWORD: "secret-app-password",
  });

  assert.equal(config.baseUrl, "https://piercommercial.com");
  assert.equal(config.username, "ryan");
  assert.equal(config.hasPassword, true);
  assert.equal("appPassword" in config, false);
});

test("PIER Pulse WordPress draft validator rejects non-draft payloads", () => {
  assert.throws(
    () =>
      validateDraftOnlyPayload({
        title: "Bad",
        content: "<p>Bad</p>",
        excerpt: "Bad",
        status: "publish" as "draft",
        categories: [99],
        tags: [126],
        featured_media: 20240,
        meta: {
          pier_pulse_corridor: "Savannah / Chatham",
          pier_pulse_source_count: 1,
          pier_pulse_generated_at: "2026-06-01T16:00:00.000Z",
        },
      }),
    /draft-only/i,
  );
});

test("PIER Pulse WordPress client posts only to wp/v2/posts with draft payload", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(
      JSON.stringify({ id: 12345, link: "https://piercommercial.com/?p=12345&preview=true", status: "draft" }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  };

  const config: PierPulseWordPressConfig = {
    baseUrl: "https://piercommercial.com/",
    username: "ryan",
    appPassword: "secret-app-password",
  };

  const result = await createWordPressDraft({
    config,
    fetchImpl,
    payload: {
      title: "Draft",
      content: "<p>Draft</p>",
      excerpt: "Draft",
      status: "draft",
      categories: [99],
      tags: [126, 127, 128, 129, 130],
      featured_media: 20240,
      meta: {
        pier_pulse_corridor: "Savannah / Chatham",
        pier_pulse_source_count: 1,
        pier_pulse_generated_at: "2026-06-01T16:00:00.000Z",
      },
    },
  });

  assert.equal(result.id, 12345);
  assert.equal(result.status, "draft");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://piercommercial.com/wp-json/wp/v2/posts");
  assert.equal(calls[0].init.method, "POST");
  assert.match(String(calls[0].init.headers && (calls[0].init.headers as Record<string, string>).Authorization), /^Basic /);
});

test("PIER Pulse WordPress media upload sends generated image bytes to media library", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(
      JSON.stringify({
        id: 6789,
        source_url: "https://piercommercial.com/wp-content/uploads/pier-pulse-hero.png",
        link: "https://piercommercial.com/pier-pulse-hero/",
        alt_text: "PIER Pulse hero image",
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  };

  const result = await uploadWordPressMedia({
    config: { baseUrl: "https://piercommercial.com/", username: "ryan", appPassword: "secret-app-password" },
    fetchImpl,
    image: {
      role: "hero",
      prompt: "Premium market intel hero.",
      altText: "PIER Pulse hero image",
      filename: "pier-pulse-hero.png",
      mimeType: "image/png",
      data: new Uint8Array([137, 80, 78, 71]),
    },
  });

  assert.equal(result.mediaId, 6789);
  assert.equal(result.role, "hero");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://piercommercial.com/wp-json/wp/v2/media");
  assert.equal(calls[0].init.method, "POST");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["content-type"], "image/png");
  assert.match(headers["content-disposition"], /pier-pulse-hero\.png/);
});

test("PIER Pulse WordPress image uploader preserves upload order for hero then body assets", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ id: 7001, source_url: "https://piercommercial.com/image.png", link: "https://piercommercial.com/image/" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });

  const uploaded = await uploadPierPulseImagesToWordPress({
    config: { baseUrl: "https://piercommercial.com", username: "ryan", appPassword: "secret-app-password" },
    fetchImpl,
    images: [
      {
        role: "hero",
        prompt: "Hero.",
        altText: "Hero alt",
        filename: "hero.png",
        mimeType: "image/png",
        data: new Uint8Array([1]),
      },
      {
        role: "body",
        prompt: "Body.",
        altText: "Body alt",
        filename: "body.png",
        mimeType: "image/png",
        data: new Uint8Array([2]),
      },
    ],
  });

  assert.deepEqual(
    uploaded.map((image) => image.role),
    ["hero", "body"],
  );
});

test("PIER Pulse OpenAI image generator returns safe image metadata and bytes", async () => {
  const fetchImpl: typeof fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { prompt?: string; size?: string };
    assert.equal(String(url), "https://api.openai.com/v1/images/generations");
    assert.match(body.prompt ?? "", /architectural photography/i);
    assert.match(body.prompt ?? "", /no alphabetic characters, no numbers, no text, no words, no labels, no captions, no typography, no logos/i);
    assert.match(body.prompt ?? "", /high-end stylized, conceptual, cinematic, 3D architectural, abstract, and premium editorial CRE imagery/i);
    assert.match(body.prompt ?? "", /Keep the visual grounded in the corridor and Source Pack facts/i);
    assert.equal(body.size, "1536x1024");
    return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from([1, 2, 3]).toString("base64") }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const image = await generatePierPulseImageWithOpenAI({
    apiKey: "test-openai-key",
    fetchImpl,
    imageInput: {
      role: "hero",
      index: 0,
      title: "Savannah Market Intel",
      corridorName: "Savannah / Chatham",
      prompt: "Premium architectural photography for Savannah.",
    },
  });

  assert.equal(image?.mimeType, "image/png");
  assert.equal(image?.data.byteLength, 3);
  assert.match(image?.filename ?? "", /savannah-market-intel-hero\.png/);
  assert.match(image?.altText ?? "", /Savannah \/ Chatham/);
});

test("PIER Pulse cloud writer requests preserve source pack prompt and JSON response mode", () => {
  const prompt = "Write PIER market intel from this source pack.";
  const gemini = buildGeminiWriterRequest({ prompt, model: "gemini-2.5-flash" });
  const openai = buildOpenAiWriterRequest({ prompt, model: "gpt-4.1-mini" });

  assert.match(JSON.stringify(gemini.body), /PIER/);
  assert.match(JSON.stringify(gemini.body), /heroImagePrompt/);
  assert.match(JSON.stringify(gemini.body), /middleImagePrompts/);
  assert.equal(gemini.model, "gemini-2.5-flash");
  assert.match(JSON.stringify(openai.body), /json_object/);
  assert.match(JSON.stringify(openai.body), /heroImagePrompt/);
  assert.match(JSON.stringify(openai.body), /middleImagePrompts/);
  assert.equal(openai.model, "gpt-4.1-mini");
});

test("PIER Pulse cloud writer falls back to OpenAI when Gemini is configured but unavailable", async () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_API_KEY;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  delete process.env.GOOGLE_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-key";

  try {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED" } }), { status: 403, headers: { "content-type": "application/json" } });
      }
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "Savannah OpenAI Fallback Intel",
                  html: "<p>Draft</p>",
                  excerpt: "Draft excerpt.",
                  heroImagePrompt: "Premium fallback hero prompt.",
                  middleImagePrompts: ["Middle fallback 1.", "Middle fallback 2.", "Middle fallback 3."],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const output = await writeWithConfiguredCloudModel({ prompt: "Write PIER draft.", fetchImpl });

    assert.equal(output?.title, "Savannah OpenAI Fallback Intel");
    assert.equal(calls.length, 2);
    assert.match(calls[0], /generativelanguage\.googleapis\.com/);
    assert.match(calls[1], /api\.openai\.com/);
  } finally {
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
    if (originalGoogleKey === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = originalGoogleKey;
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
  }
});

test("PIER Pulse cloud writer parses enriched image prompt JSON from Gemini", async () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_API_KEY;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  delete process.env.GOOGLE_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      title: "Savannah Market Intel",
                      html: "<p>Draft</p><h2>The Signal</h2><blockquote><p>Signal.</p><cite>PIER Staff</cite></blockquote>",
                      excerpt: "Draft excerpt.",
                      heroImagePrompt: "Premium hero prompt.",
                      middleImagePrompts: ["Middle prompt 1.", "Middle prompt 2.", "Middle prompt 3."],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const output = await writeWithConfiguredCloudModel({ prompt: "Write PIER draft.", fetchImpl });

    assert.equal(output?.heroImagePrompt, "Premium hero prompt.");
    assert.deepEqual(output?.middleImagePrompts, ["Middle prompt 1.", "Middle prompt 2.", "Middle prompt 3."]);
  } finally {
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
    if (originalGoogleKey === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = originalGoogleKey;
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
  }
});
