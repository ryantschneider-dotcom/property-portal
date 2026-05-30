export type PropertyHighlightStat = {
  label: string;
  value: string | number | null | undefined;
  helperText?: string;
};

export type PropertyHighlightsCardProps = {
  title: string;
  subtitle?: string | null;
  availableSquareFootage?: string | number | null;
  leaseRate?: string | number | null;
  suiteNumbers?: string[] | string | null;
  highlights?: PropertyHighlightStat[];
  ctaLabel?: string;
  className?: string;
};

function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "number") {
    return value.toLocaleString();
  }

  return value;
}

function formatSuites(suiteNumbers: string[] | string | null | undefined) {
  if (Array.isArray(suiteNumbers)) {
    return suiteNumbers.length > 0 ? suiteNumbers.join(", ") : "—";
  }

  return formatValue(suiteNumbers);
}

function combineClassNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function PropertyHighlightsCard({
  title,
  subtitle,
  availableSquareFootage,
  leaseRate,
  suiteNumbers,
  highlights = [],
  ctaLabel = "View listing details",
  className,
}: PropertyHighlightsCardProps) {
  const coreHighlights: PropertyHighlightStat[] = [
    {
      label: "Available SF",
      value: formatValue(availableSquareFootage),
      helperText: "Available square footage",
    },
    {
      label: "Lease Rate",
      value: formatValue(leaseRate),
      helperText: "Quoted rate",
    },
    {
      label: "Suites",
      value: formatSuites(suiteNumbers),
      helperText: "Suite numbers",
    },
  ];

  const stats = [...coreHighlights, ...highlights];

  return (
    <section className={combineClassNames("rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Property highlights</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{title}</h2>
          {subtitle ? <p className="mt-2 text-sm leading-6 text-zinc-600">{subtitle}</p> : null}
        </div>

        {ctaLabel ? (
          <span className="inline-flex w-fit rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-700">
            {ctaLabel}
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={`${stat.label}-${formatValue(stat.value)}`} className="rounded-2xl bg-zinc-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{stat.label}</p>
            <p className="mt-2 text-xl font-semibold text-zinc-900">{formatValue(stat.value)}</p>
            {stat.helperText ? <p className="mt-1 text-xs text-zinc-500">{stat.helperText}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
