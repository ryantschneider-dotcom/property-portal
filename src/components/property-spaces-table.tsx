import type { PropertyDetail } from "@/lib/types";

type PropertySpace = NonNullable<PropertyDetail["spaces"]>[number];

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatSquareFeet(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "—";
  return `${formatNumber(value)} SF`;
}

export function formatSpaceRate(space: PropertySpace) {
  if (space.rawRateLabel?.trim()) return space.rawRateLabel.trim();

  if (typeof space.ratePerSf === "number" && Number.isFinite(space.ratePerSf) && space.ratePerSf > 0) {
    return `$${formatNumber(space.ratePerSf)}/SF`;
  }

  if (typeof space.monthlyRate === "number" && Number.isFinite(space.monthlyRate) && space.monthlyRate > 0) {
    return `$${formatNumber(space.monthlyRate)}/month`;
  }

  return "—";
}

function formatSuiteLabel(space: PropertySpace) {
  return space.suite || space.name || "—";
}

export function PropertySpacesTable({ spaces }: { spaces: PropertySpace[] }) {
  const visibleSpaces = spaces.filter((space) => space.suite || space.name || space.sizeSf || space.ratePerSf || space.monthlyRate || space.rawRateLabel);

  if (visibleSpaces.length === 0) return null;

  return (
    <section className="rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Available Spaces</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight">Spaces</h2>
      <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-[0.18em] text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Suite</th>
              <th className="px-4 py-3 font-semibold">Square Footage</th>
              <th className="px-4 py-3 font-semibold">Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 text-zinc-700">
            {visibleSpaces.map((space, index) => (
              <tr key={String(space.id ?? space.suite ?? space.name ?? index)}>
                <td className="px-4 py-3 font-medium text-zinc-900">{formatSuiteLabel(space)}</td>
                <td className="px-4 py-3">{formatSquareFeet(space.sizeSf)}</td>
                <td className="px-4 py-3">{formatSpaceRate(space)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
