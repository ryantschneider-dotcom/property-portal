type PropertyWebsiteLinkProps = {
  url: string;
};

export function PropertyWebsiteLink({ url }: PropertyWebsiteLinkProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700"
    >
      Visit Property Website
    </a>
  );
}
