"use client";

import { useEffect, useMemo, useState } from "react";
import { ActivityLogEvent } from "@/lib/activity-log";
import { activityFeed, formatLocalTime } from "@/lib/mission-data";
import { fetchRuns } from "@/lib/run-client";
import { previewText } from "@/lib/text-utils";

export function ActivityStream({ full = false }: { full?: boolean }) {
  const [events, setEvents] = useState<ActivityLogEvent[]>([]);

  useEffect(() => {
    fetchRuns()
      .then((store) => {
        setEvents(store.activityEvents ?? []);
      })
      .catch(() => {
        setEvents([]);
      });
  }, []);

  const merged = useMemo(() => {
    const liveEvents = events.map((event) => ({
      id: event.id,
      type: event.type,
      title: event.title,
      detail: `${event.projectName ? `${event.projectName} • ` : ""}${previewText(event.detail, 140)}`,
      time: formatLocalTime(new Date(event.createdAt)),
    }));

    return [...liveEvents, ...activityFeed].slice(0, full ? 20 : 6);
  }, [events, full]);

  return (
    <ul className="space-y-3 text-sm text-neutral-300">
      {merged.map((item) => (
        <li
          key={item.id}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
        >
          <p className="font-medium text-white">{item.title}</p>
          <p className="mt-1 text-sm text-neutral-400">{item.detail}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cyan-300">
            {item.type} • {item.time}
          </p>
        </li>
      ))}
    </ul>
  );
}
