type PropertyBadgeProps = {
  label: string;
};

export function PropertyBadge({ label }: PropertyBadgeProps) {
  return (
    <span className="rounded-full border border-zinc-200 bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-700 shadow-sm backdrop-blur">
      {label}
    </span>
  );
}
