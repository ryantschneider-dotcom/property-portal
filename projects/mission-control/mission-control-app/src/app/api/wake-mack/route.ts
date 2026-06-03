import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    // Fire the payload directly into OpenClaw's local gateway on port 1455
    const openclawResponse = await fetch("http://host.docker.internal:1455/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `New task from Mission Control: [${payload.name}]. Task ID: ${payload.taskId}. Content: ${payload.content}`,
        agentId: "main"
      })
    });

    if (!openclawResponse.ok) {
      console.error("OpenClaw rejected the push. Status:", openclawResponse.status);
    }

    return NextResponse.json({ ok: true, forwarded: true });
  } catch (error) {
    console.error("Failed to push to OpenClaw:", error);
    return NextResponse.json({ ok: false, error: "Failed to forward trigger" }, { status: 500 });
  }
}