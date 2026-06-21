"use client";

import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="h-8 rounded-full border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-600 transition hover:border-[#CB521E]/30 hover:bg-[#CB521E]/5 hover:text-[#CB521E]"
    >
      Sign out
    </button>
  );
}
