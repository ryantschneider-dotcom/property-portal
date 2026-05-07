import Link from "next/link";

export function BrokerHubHome() {
  const cards = [
    { href: "/broker/new", title: "New Listing Entry" },
    { href: "/broker/revisions", title: "Listing Revisions" },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2">
      {cards.map((card) => (
        <Link
          key={card.href}
          href={card.href}
          className="flex min-h-[220px] items-center justify-center rounded-[2rem] border border-zinc-400 bg-white p-8 text-center text-3xl font-semibold tracking-tight text-zinc-950 shadow-sm transition hover:bg-zinc-50 hover:shadow-md sm:min-h-[260px] sm:text-4xl"
        >
          {card.title}
        </Link>
      ))}
    </section>
  );
}
