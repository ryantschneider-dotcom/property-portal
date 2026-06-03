export function buildDraftPreviewPath(slug: string) {
  const cleaned = String(slug ?? "").trim().replace(/^\/+|\/+$/g, "");
  return cleaned ? `/preview/${encodeURIComponent(cleaned)}` : "/preview";
}

export function isBrokerHostPublicPreviewPath(pathname: string) {
  return pathname.startsWith("/properties/") || pathname.startsWith("/preview/");
}
