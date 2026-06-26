import { cookies } from "next/headers";
import Link from "next/link";
import { ReactNode } from "react";
import { ActivityStream } from "@/components/activity-stream";
import { SignOutButton } from "@/components/sign-out-button";
import { ViewAsBrokerControl } from "@/components/view-as-broker-control";
import { AUTH_COOKIE, getAuthSession } from "@/lib/auth";

type NavItem = {
  href: string;
  label: string;
  match?: "exact" | "prefix";
};

type PageAction = {
  href: string;
  label: string;
  tone?: "primary" | "secondary" | "ghost";
};

const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: "Mission Control",
    items: [
      { href: "/", label: "Global Dashboard", match: "exact" },
      { href: "/pier-workspace", label: "PIER Workspace", match: "prefix" },
      { href: "/pier-manager", label: "Listing Portal", match: "prefix" },
      { href: "/offering-summaries", label: "Offering Summaries", match: "prefix" },
      { href: "/listing-agreements", label: "Listing Agreements", match: "prefix" },
      { href: "/sales-contracts", label: "Sales Contracts", match: "prefix" },
      { href: "/offering-websites", label: "Offering Websites", match: "prefix" },
      { href: "/daily-control", label: "Daily Task Control", match: "prefix" },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/tools", label: "AI Tools", match: "prefix" },
      { href: "/workflows", label: "Workflows", match: "prefix" },
      { href: "/uploads", label: "Uploads", match: "prefix" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/activity", label: "Activity", match: "prefix" },
      { href: "/usage", label: "Usage", match: "prefix" },
      { href: "/settings", label: "Settings", match: "prefix" },
    ],
  },
];

const postureItems = [
  "Private Ryan-only console",
  "Local/Tailscale access",
  "Listing intake as source path",
  "No client-facing access",
];

const MISSION_SHELL_HEADER_HEIGHT_CLASS = "[--mission-shell-header-height:48px] md:[--mission-shell-header-height:52px]";
const MASTER_CONSOLE_SHELL_CLASS = `flex min-h-screen min-w-0 flex-col bg-[#f6f4f1] scroll-pt-[var(--mission-shell-header-height)] ${MISSION_SHELL_HEADER_HEIGHT_CLASS}`;
const MASTER_CONSOLE_HEADER_CLASS = "sticky top-0 z-20 flex h-[var(--mission-shell-header-height)] flex-none items-center overflow-hidden border-b border-zinc-200/80 bg-white/95 px-3 py-1 shadow-sm backdrop-blur-xl lg:px-4";
const MASTER_CONSOLE_HEADER_CLEARANCE_CLASS = "min-h-0 flex-1 bg-[#f6f4f1] px-3 pb-3 pt-[calc(var(--mission-shell-header-height)+1.5rem)] scroll-pt-[var(--mission-shell-header-height)] lg:px-4 xl:px-5";
const compactTopNav: NavItem[] = [
  { href: "/", label: "Dashboard", match: "exact" },
  { href: "/pier-workspace", label: "PIER", match: "prefix" },
  { href: "/pier-manager", label: "Portal", match: "prefix" },
];


function getBrokerDisplayName(brokerId?: string | null) {
  if (brokerId === "joel") return "Joel Boblasky";
  if (brokerId === "anthony") return "Anthony Wagner";
  return "Ryan T. Schneider, CCIM";
}

async function getCurrentAuthSession() {
  const cookieStore = await cookies();
  return getAuthSession(cookieStore.get(AUTH_COOKIE)?.value);
}

export async function MissionShell({
  title,
  subtitle,
  currentPath,
  actions = [],
  children,
}: {
  title: string;
  subtitle: string;
  currentPath: string;
  actions?: PageAction[];
  children: ReactNode;
}) {
  const session = await getCurrentAuthSession();
  const isStaff = session?.role === "staff";
  const isBroker = session?.role === "broker" || isStaff;
  const canSwitchBroker = session?.role === "master" || isStaff;
  const activeBrokerId = session?.brokerId ?? "ryan";
  const activeBrokerName = getBrokerDisplayName(activeBrokerId);
  const shellModeLabel = isBroker ? "Broker Listing Console" : "Mission Control OS";
  const visibleActions: PageAction[] = [];
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="min-h-screen bg-[#f6f4f1] text-zinc-950">
      <div className={`grid min-h-screen ${isBroker ? "grid-cols-1" : "lg:grid-cols-[238px_1fr] 2xl:grid-cols-[280px_minmax(0,1fr)_300px]"}`}>
        {!isBroker && (
          <>
          <aside className="border-r border-white/10 bg-zinc-950 text-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
          <div className="p-3">
            <Link href="/" className="block rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-sm backdrop-blur transition hover:bg-white/[0.06]">
              <div className="rounded-2xl bg-[#1a1a1a] p-3 ring-1 ring-white/10">
                <img
                  src="/brand/pier-logo.png"
                  alt="PIER Commercial Real Estate"
                  className="h-auto w-full object-contain"
                />
              </div>
              <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-[#f6a87f]">
                Private Mission Control
              </p>
              <h1 className="mt-2 text-xl font-semibold text-white">Mission Control OS</h1>
              <p className="mt-2 text-xs leading-5 text-zinc-400">
                Structured PIER workflows, system operations, and Ryan-only command modules.
              </p>
            </Link>

            <nav className="mt-4 space-y-4">
              {navGroups.map((group) => (
                <div key={group.title}>
                  <p className="mb-2 px-2 text-[10px] uppercase tracking-[0.24em] text-zinc-500">
                    {group.title}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const active =
                        item.match === "exact"
                          ? currentPath === item.href
                          : currentPath === item.href || currentPath.startsWith(`${item.href}/`);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`group flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition ${
                            active
                              ? "border-[#CB521E]/50 bg-[#CB521E] text-white shadow-lg shadow-[#CB521E]/15"
                              : "border-transparent text-zinc-300 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        >
                          <span>{item.label}</span>
                          <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-white" : "bg-zinc-700 group-hover:bg-[#CB521E]"}`} />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">
                Access posture
              </p>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-300">
                {postureItems.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-[#CB521E]">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          </aside>
          </>
        )}

        <main className={MASTER_CONSOLE_SHELL_CLASS}>
          <header className={MASTER_CONSOLE_HEADER_CLASS}>
            <div className="flex w-full min-w-0 items-center gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#CB521E]">
                    {shellModeLabel}
                  </p>
                  <div className="flex min-w-0 items-baseline gap-2">
                    <h2 className="truncate text-base font-semibold tracking-tight text-zinc-950 xl:text-lg">{title}</h2>
                    <p className="hidden max-w-[44vw] truncate text-xs text-zinc-500 2xl:block">{subtitle}</p>
                  </div>
                </div>
                <nav aria-label="Primary workspace navigation" className="hidden items-center gap-1 xl:flex">
                  {compactTopNav.map((item) => {
                    const active = item.match === "exact" ? currentPath === item.href : currentPath === item.href || currentPath.startsWith(`${item.href}/`);
                    return (
                      <Link
                        key={`top-${item.href}`}
                        href={item.href}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                          active ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              </div>

              <div className="flex flex-none items-center justify-end gap-2">
                <div className="hidden items-center gap-1.5 text-[11px] text-zinc-500 2xl:flex">
                  <span className="rounded-full border border-[#CB521E]/20 bg-[#CB521E]/10 px-2 py-0.5 text-[#CB521E]">{today}</span>
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-50 px-2 py-0.5 text-emerald-700">{isBroker ? "Broker Console" : "online"}</span>
                  {canSwitchBroker ? <span className="hidden rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 2xl:inline">Impersonation Mode: viewing as {activeBrokerName}</span> : null}
                </div>
                <div className="flex items-center gap-1.5">
                  {visibleActions.map((action) => (
                    <Link
                      key={`${action.href}-${action.label}`}
                      href={action.href}
                      className={actionClassName(action.tone ?? "secondary")}
                    >
                      {action.label}
                    </Link>
                  ))}
                  {canSwitchBroker ? <ViewAsBrokerControl activeBrokerId={activeBrokerId} /> : null}
                  <SignOutButton />
                </div>
              </div>
            </div>
          </header>

          <div data-testid="mission-shell-content" className={MASTER_CONSOLE_HEADER_CLEARANCE_CLASS}>{children}</div>
        </main>

        {!isBroker && (
        <aside className="hidden border-l border-zinc-200/80 bg-white/80 p-3 backdrop-blur 2xl:block">
          <div className="sticky top-3 space-y-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
              <p className="text-[10px] uppercase tracking-[0.24em] text-[#CB521E]">
                Live activity
              </p>
              <div className="mt-4">
                <ActivityStream />
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
              <p className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">
                Quick jump
              </p>
              <div className="mt-3 space-y-2">
                {actions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
                    No page-specific shortcuts on this view yet.
                  </div>
                ) : (
                  actions.map((action) => (
                    <Link
                      key={`rail-${action.href}-${action.label}`}
                      href={action.href}
                      className="block rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 transition hover:border-[#CB521E]/30 hover:bg-[#CB521E]/5"
                    >
                      {action.label}
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        </aside>
        )}
      </div>
    </div>
  );
}

function actionClassName(tone: "primary" | "secondary" | "ghost") {
  switch (tone) {
    case "primary":
      return "rounded-full bg-[#CB521E] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#a94318]";
    case "ghost":
      return "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:border-[#CB521E]/30 hover:bg-[#CB521E]/5";
    case "secondary":
    default:
      return "rounded-full border border-[#CB521E]/20 bg-[#CB521E]/10 px-3 py-1.5 text-xs font-semibold text-[#CB521E] transition hover:bg-[#CB521E]/15";
  }
}
