import Link from "next/link";

const OPTIONS = [
  { label: "All", value: "all" },
  { label: "For Sale", value: "sale" },
  { label: "For Lease", value: "lease" },
] as const;

type FilterToggleProps = {
  current: "all" | "sale" | "lease";
};

export function FilterToggle({ current }: FilterToggleProps) {
  return (
    <div className="inline-flex rounded-full border border-zinc-200 bg-white p-1 shadow-sm">
      {OPTIONS.map((option) => {
        const active = option.value === current;
        const href = option.value === "all" ? "/" : `/?transaction=${option.value}`;
        return (
          <Link
            key={option.value}
            href={href}
            className={[
              "rounded-full px-4 py-2 text-sm font-medium transition",
              active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
            ].join(" ")}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
