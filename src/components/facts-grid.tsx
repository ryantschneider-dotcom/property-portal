type FactsGridProps = {
  facts: Array<{ label: string; value: string }>;
};

export function FactsGrid({ facts }: FactsGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {facts.map((fact) => (
        <div key={fact.label} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">{fact.label}</p>
          <p className="mt-2 text-xl font-semibold tracking-tight text-zinc-900">{fact.value}</p>
        </div>
      ))}
    </div>
  );
}
