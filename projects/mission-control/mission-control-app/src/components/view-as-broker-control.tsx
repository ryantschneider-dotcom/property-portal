"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const brokerOptions = [
  { id: "ryan", name: "Ryan T. Schneider, CCIM", email: "ryan@piercommercial.com" },
  { id: "joel", name: "Joel Boblasky", email: "joel@piercommercial.com" },
  { id: "anthony", name: "Anthony Wagner", email: "anthony@piercommercial.com" },
];

export function getBrokerDisplayName(brokerId?: string | null) {
  return brokerOptions.find((broker) => broker.id === brokerId)?.name ?? brokerOptions[0].name;
}

function getBrokerSenderEmail(brokerId?: string | null) {
  return brokerOptions.find((broker) => broker.id === brokerId)?.email ?? brokerOptions[0].email;
}

export function ViewAsBrokerControl({ activeBrokerId = "ryan" }: { activeBrokerId?: string }) {
  const router = useRouter();
  const [brokerId, setBrokerId] = useState(activeBrokerId || "ryan");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function changeBroker(nextBrokerId: string) {
    setBrokerId(nextBrokerId);
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/impersonation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brokerId: nextBrokerId }),
      });
      if (!response.ok) throw new Error("Unable to update View As broker");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update View As broker");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="view-as-broker-control" className="flex min-w-0 items-center gap-2 rounded-full border border-[#CB521E]/25 bg-[#CB521E]/10 px-2.5 py-1 text-xs text-zinc-800">
      <label className="flex min-w-0 items-center gap-2 font-semibold uppercase tracking-[0.16em] text-[#CB521E]">
        <span className="hidden whitespace-nowrap xl:inline">View as</span>
        <select
          aria-label="View as broker"
          value={brokerId}
          disabled={saving}
          onChange={(event) => changeBroker(event.target.value)}
          className="h-7 max-w-[210px] rounded-full border border-[#CB521E]/20 bg-white px-2.5 text-xs normal-case tracking-normal text-zinc-950 outline-none focus:border-[#CB521E]"
        >
          {brokerOptions.map((broker) => (
            <option key={broker.id} value={broker.id}>{broker.name}</option>
          ))}
        </select>
      </label>
      <span className="hidden max-w-[220px] truncate text-[11px] text-zinc-600 2xl:inline">Viewing as {getBrokerSenderEmail(brokerId)}</span>
      {saving ? <span className="text-[11px] text-[#CB521E]">Switching…</span> : null}
      {error ? <span className="text-[11px] text-red-600">{error}</span> : null}
    </div>
  );
}
