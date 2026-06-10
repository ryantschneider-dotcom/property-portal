export function normalizeText(text: string) {
  return text
    .trim()
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

export function previewText(text: string, maxLength = 180) {
  const normalized = normalizeText(text).replace(/\n+/g, " ");

  if (!normalized) {
    return "No input provided.";
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trimEnd()}…` : normalized;
}

export function textLines(text: string, max = 4) {
  return normalizeText(text)
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, max);
}

export function firstSentence(text: string) {
  const normalized = previewText(text, 260);
  const [sentence] = normalized.split(/(?<=[.!?])\s+/);
  return sentence || normalized;
}

export function bulletList(items: string[], fallback: string[]) {
  const source = items.filter(Boolean).length ? items.filter(Boolean) : fallback;
  return source.map((item) => `- ${item}`).join("\n");
}
