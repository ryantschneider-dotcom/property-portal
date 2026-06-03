import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPierPulseImageAltText,
  buildPierPulseImageFilename,
  buildPremiumPierPulseHtml,
  insertUploadedImagesIntoHtml,
  type PierPulseUploadedImage,
} from "../src/lib/pier-pulse-images";

test("PIER Pulse image filenames are safe and role-specific", () => {
  assert.equal(
    buildPierPulseImageFilename({
      role: "hero",
      index: 0,
      title: "Savannah & Chatham Market Intel: 3 Signals",
      generatedAt: "2026-06-01T16:00:00.000Z",
    }),
    "2026-06-01-pier-pulse-savannah-and-chatham-market-intel-3-signals-hero.png",
  );

  assert.equal(
    buildPierPulseImageFilename({
      role: "body",
      index: 2,
      title: "Pooler / I-16 Corridor",
      generatedAt: "2026-06-01T16:00:00.000Z",
      extension: "webp",
    }),
    "2026-06-01-pier-pulse-pooler-i-16-corridor-body-2.webp",
  );
});

test("PIER Pulse image alt text is corridor and article specific", () => {
  assert.match(
    buildPierPulseImageAltText({
      role: "hero",
      index: 0,
      title: "Savannah Market Intel",
      corridorName: "Savannah / Chatham",
    }),
    /Savannah \/ Chatham: Savannah Market Intel/,
  );
});

test("PIER Pulse uploaded body images are inserted as one horizontal gallery row", () => {
  const images: PierPulseUploadedImage[] = [
    {
      role: "body",
      prompt: "Prompt 1",
      altText: "Why it matters visual",
      mediaId: 301,
      sourceUrl: "https://piercommercial.com/wp-content/uploads/why.png",
      link: "https://piercommercial.com/why/",
    },
    {
      role: "body",
      prompt: "Prompt 2",
      altText: "How to play it visual",
      mediaId: 302,
      sourceUrl: "https://piercommercial.com/wp-content/uploads/how.png",
      link: "https://piercommercial.com/how/",
    },
    {
      role: "hero",
      prompt: "Hero prompt",
      altText: "Hero visual",
      mediaId: 300,
      sourceUrl: "https://piercommercial.com/wp-content/uploads/hero.png",
      link: "https://piercommercial.com/hero/",
    },
  ];

  const html =
    "<p>Opening.</p><h2>The Signal</h2><blockquote><p>Quote.</p></blockquote><h2>Why It Matters</h2><p>Section.</p><h2>THE BOTTOM LINE</h2><p>Close.</p>";
  const enriched = insertUploadedImagesIntoHtml({ html, images });

  assert.match(enriched, /wp-image-301/);
  assert.match(enriched, /wp-image-302/);
  assert.doesNotMatch(enriched, /wp-image-300/);
  assert.equal(enriched.includes('alt="Why it matters visual"'), true);
  assert.match(enriched, /class="pier-pulse-image-gallery"/);
  assert.match(enriched, /display: flex; flex-direction: row; gap: 15px; justify-content: center/);
  assert.equal((enriched.match(/pier-pulse-image-gallery/g) ?? []).length, 1);
  assert.equal(enriched.includes('<h2>THE BOTTOM LINE</h2><div class="pier-pulse-image-gallery"'), false);
});

test("PIER Pulse premium HTML wrapper hides editor review note in a backend comment", () => {
  const html = buildPremiumPierPulseHtml({
    corridorName: "Savannah / Chatham",
    title: "Savannah Market Intel",
    html: "<p>Opening sentence.</p><h2>The Signal</h2><p>Signal copy.</p>",
  });

  assert.match(html, /pier-pulse-report/);
  assert.match(html, /PIER Pulse Drop • Savannah \/ Chatham/);
  assert.doesNotMatch(html, /pier-pulse-editor-note/);
  assert.doesNotMatch(html, /<strong>Editor review:<\/strong>/);
  assert.match(html, /<!-- PIER Pulse backend note:/);
  assert.match(html, /<h2>The Signal<\/h2>/);
});

test("PIER Pulse premium HTML wrapper styles Bottom Line sign-off and CTA", () => {
  const html = buildPremiumPierPulseHtml({
    corridorName: "Savannah / Chatham",
    title: "Savannah Market Intel",
    html:
      '<p>Opening sentence.</p><h2>The Signal</h2><p>Signal copy.</p><h2>THE BOTTOM LINE</h2><p>Line one.</p><p>Line two.</p><p>Line three.</p><p>Contact PIER Commercial Real Estate today.</p><p>Phone: 912.353.7707 | Website: piercommercial.com | Instagram: @piercommercial</p><p><a href="https://www.piercommercial.com/contact-us/">Contact Us</a></p>',
  });

  assert.match(html, /class="pier-pulse-bottom-line"/);
  assert.match(html, /background:#f9f9f9; border:1px solid #e5e5e5; padding:25px; margin-top:30px; border-radius:6px;/);
  assert.match(html, /Phone: <strong>912\.353\.7707<\/strong>/);
  assert.match(html, /Website: <strong>piercommercial\.com<\/strong>/);
  assert.match(html, /Instagram: <strong>@piercommercial<\/strong>/);
  assert.match(html, /Click here to contact us/);
  assert.doesNotMatch(html, />Contact Us<\/a>/);
});
