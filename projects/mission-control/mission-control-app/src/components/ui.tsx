import { ReactNode } from "react";

export function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 border-l-4 border-[#CB521E] pl-4">
        <h3 className="text-lg font-semibold text-zinc-950">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-zinc-600">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-950">{value}</p>
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "orange" | "green" | "amber" | "red" | "neutral" }) {
  const classes = {
    orange: "border-[#CB521E]/20 bg-[#CB521E]/10 text-[#CB521E]",
    green: "border-emerald-500/20 bg-emerald-50 text-emerald-700",
    amber: "border-amber-500/20 bg-amber-50 text-amber-700",
    red: "border-rose-500/20 bg-rose-50 text-rose-700",
    neutral: "border-zinc-200 bg-zinc-100 text-zinc-600",
  }[tone];

  return <span className={`rounded-full border px-3 py-1 text-xs ${classes}`}>{children}</span>;
}
