export type PierPulseImageRole = "hero" | "body";

export type PierPulseGeneratedImage = {
  role: PierPulseImageRole;
  prompt: string;
  altText: string;
  filename: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  data: Uint8Array;
};

export type PierPulseGeneratedImageManifest = Omit<PierPulseGeneratedImage, "data"> & {
  byteLength: number;
};

export type PierPulseUploadedImage = {
  role: PierPulseImageRole;
  prompt: string;
  altText: string;
  mediaId: number;
  sourceUrl: string;
  link: string;
};

export type PierPulseImageGenerationInput = {
  prompt: string;
  role: PierPulseImageRole;
  index: number;
  title: string;
  corridorName: string;
};

export type PierPulseImageGenerator = (input: PierPulseImageGenerationInput) => Promise<PierPulseGeneratedImage>;

export function buildPierPulseImageFilename(input: {
  role: PierPulseImageRole;
  index: number;
  title: string;
  generatedAt?: string;
  extension?: "png" | "jpg" | "jpeg" | "webp";
}) {
  const datePrefix = (input.generatedAt ?? new Date().toISOString()).slice(0, 10);
  const safeTitle = input.title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  const suffix = input.role === "hero" ? "hero" : `body-${input.index}`;
  return `${datePrefix}-pier-pulse-${safeTitle || "market-intel"}-${suffix}.${input.extension ?? "png"}`;
}

export function buildPierPulseImageAltText(input: { role: PierPulseImageRole; index: number; title: string; corridorName: string }) {
  if (input.role === "hero") {
    return `PIER Pulse market intelligence hero image for ${input.corridorName}: ${input.title}`;
  }
  return `PIER Pulse supporting market visual ${input.index} for ${input.corridorName}: ${input.title}`;
}

export function buildPierPulseImageGenerationInputs(input: {
  title: string;
  corridorName: string;
  heroImagePrompt: string;
  middleImagePrompts: [string, string, string] | string[];
}) {
  return [
    {
      prompt: input.heroImagePrompt,
      role: "hero" as const,
      index: 0,
      title: input.title,
      corridorName: input.corridorName,
    },
    ...input.middleImagePrompts.slice(0, 3).map((prompt, index) => ({
      prompt,
      role: "body" as const,
      index: index + 1,
      title: input.title,
      corridorName: input.corridorName,
    })),
  ];
}

export function buildGeneratedImageManifest(image: PierPulseGeneratedImage): PierPulseGeneratedImageManifest {
  return {
    role: image.role,
    prompt: image.prompt,
    altText: image.altText,
    filename: image.filename,
    mimeType: image.mimeType,
    byteLength: image.data.byteLength,
  };
}

export function buildPremiumPierPulseHtml(input: { html: string; corridorName: string; title: string }) {
  const trimmed = input.html.trim();
  if (trimmed.includes('class="pier-pulse-report"') && trimmed.includes('class="pier-pulse-bottom-line"')) return trimmed;

  const openingMatch = trimmed.match(/^([\s\S]*?)(<h2[^>]*>)/i);
  const openingHtml = openingMatch?.[1]?.trim();
  const restHtml = stylePierPulseBottomLine(openingMatch ? trimmed.slice(openingMatch[1].length) : trimmed);
  const openingBlock = openingHtml
    ? `<div class="pier-pulse-opening"><p class="pier-pulse-eyebrow">PIER Pulse Drop • ${escapeHtml(input.corridorName)}</p>${openingHtml}</div>`
    : `<div class="pier-pulse-opening"><p class="pier-pulse-eyebrow">PIER Pulse Drop • ${escapeHtml(input.corridorName)}</p></div>`;

  return `<div class="pier-pulse-report">
${openingBlock}
<div class="pier-pulse-article-body">
${restHtml.trim()}
</div>
<!-- PIER Pulse backend note: Editor review should verify local facts, links, image fit, and author attribution before publishing. This note is intentionally hidden from the rendered post body. -->
</div>`;
}

export const PIER_PULSE_BOTTOM_LINE_STYLE =
  "background:#f9f9f9; border:1px solid #e5e5e5; padding:25px; margin-top:30px; border-radius:6px;";

export function stylePierPulseBottomLine(html: string) {
  if (html.includes('class="pier-pulse-bottom-line"')) return html;
  const contactLinkUpdated = html.replace(
    /<a\s+href="https:\/\/www\.piercommercial\.com\/contact-us\/">\s*Contact Us\s*<\/a>/gi,
    '<a href="https://www.piercommercial.com/contact-us/">Click here to contact us</a>',
  );
  const metricsBolded = contactLinkUpdated.replace(
    /Phone:\s*912\.353\.7707\s*\|\s*Website:\s*piercommercial\.com\s*\|\s*Instagram:\s*@piercommercial/gi,
    'Phone: <strong>912.353.7707</strong> | Website: <strong>piercommercial.com</strong> | Instagram: <strong>@piercommercial</strong>',
  );
  const bottomLineMatch = metricsBolded.match(/<h2[^>]*>\s*THE BOTTOM LINE\s*<\/h2>/i);
  if (!bottomLineMatch || bottomLineMatch.index === undefined) return metricsBolded;
  const start = bottomLineMatch.index;
  const before = metricsBolded.slice(0, start);
  const bottomLine = metricsBolded.slice(start).trim();
  return `${before}<div class="pier-pulse-bottom-line" style="${PIER_PULSE_BOTTOM_LINE_STYLE}">${bottomLine}</div>`;
}

export function insertUploadedImagesIntoHtml(input: { html: string; images: PierPulseUploadedImage[] }) {
  const bodyImages = input.images.filter((image) => image.role === "body").slice(0, 3);
  if (bodyImages.length === 0) return input.html;

  const gallery = buildWordPressImageGallery(bodyImages);
  const parts = input.html.split(/(<h2[^>]*>|<h3[^>]*>)/i);
  if (parts.length < 3) {
    return `${input.html.trim()}\n${gallery}`;
  }

  let inserted = false;
  const enriched: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    enriched.push(parts[index]);
    const nextPart = parts[index + 1] ?? "";
    if (/^<h[23][^>]*>$/i.test(nextPart)) {
      enriched.push(nextPart);
      index += 1;
      const headingTextPart = parts[index + 1] ?? "";
      enriched.push(headingTextPart);
      index += 1;
      if (!inserted && shouldInsertAfterHeading(headingTextPart)) {
        enriched.push(gallery);
        inserted = true;
      }
    }
  }

  if (!inserted) {
    enriched.push(gallery);
  }

  return enriched.join("");
}

export function buildWordPressImageGallery(images: PierPulseUploadedImage[]) {
  const figures = images
    .slice(0, 3)
    .map((image) => buildWordPressImageFigure(image))
    .join("\n");
  return `<div class="pier-pulse-image-gallery" style="display: flex; flex-direction: row; gap: 15px; justify-content: center; align-items: stretch; flex-wrap: nowrap; margin: 24px 0;">\n${figures}\n</div>`;
}

export function buildWordPressImageFigure(image: PierPulseUploadedImage) {
  const escapedAlt = escapeHtml(image.altText);
  const escapedUrl = escapeHtml(image.sourceUrl);
  return `<figure class="wp-block-image size-large pier-pulse-image" style="flex: 1 1 0; margin: 0;"><img src="${escapedUrl}" alt="${escapedAlt}" class="wp-image-${image.mediaId}" style="width: 100%; height: auto; display: block;" /></figure>`;
}

function shouldInsertAfterHeading(headingTextPart: string) {
  const text = headingTextPart.replace(/<[^>]+>/g, "").toLowerCase();
  if (!text.trim()) return false;
  if (text.includes("source pack") || text.includes("bottom line")) return false;
  return true;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
