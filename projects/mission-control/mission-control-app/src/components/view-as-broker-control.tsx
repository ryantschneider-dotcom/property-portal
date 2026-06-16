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
    <div data-testid="view-as-broker-control" className="rounded-2xl border border-[#CB521E]/30 bg-[#CB521E]/10 p-3 text-sm text-zinc-800">
      <label className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-[#CB521E]">
        View As Broker
        <select
          value={brokerId}
          disabled={saving}
          onChange={(event) => changeBroker(event.target.value)}
          className="mt-2 w-full rounded-xl border border-[#CB521E]/20 bg-white px-3 py-2 text-sm normal-case tracking-normal text-zinc-950 outline-none focus:border-[#CB521E]"
        >
          {brokerOptions.map((broker) => (
            <option key={broker.id} value={broker.id}>{broker.name}</option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-xs text-zinc-600">Viewing as {getBrokerDisplayName(brokerId)} ({getBrokerSenderEmail(brokerId)}). Sender identities, PDFs, and broker-scoped listing views use this context.</p>
      {saving ? <p className="mt-1 text-xs text-[#CB521E]">Switching broker context…</p> : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
