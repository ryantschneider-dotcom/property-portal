import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, status } = body;

    // Locate the Mission Control database
    const dataDir = path.join(process.cwd(), "data");
    const dataFile = path.join(dataDir, "mission-control-store.json");

    // Read the current data
    const rawData = await fs.readFile(dataFile, "utf8");
    const store = JSON.parse(rawData);

    // Create the new activity event
    const newEvent = {
      id: Math.random().toString(36).substring(7),
      title: message || "Mack Update",
      description: status || "Processing task...",
      timestamp: new Date().toISOString(),
      type: "system"
    };

    // Make sure the array exists, then add the new event to the top
    if (!store.activityEvents) {
      store.activityEvents = [];
    }
    store.activityEvents.unshift(newEvent);

    // Keep the log clean by capping it at the 50 most recent events
    store.activityEvents = store.activityEvents.slice(0, 50);

    // Save the updated list back to the file
    await fs.writeFile(dataFile, JSON.stringify(store, null, 2), "utf8");

    return NextResponse.json({ ok: true, event: newEvent });
  } catch (error) {
    console.error("Failed to post activity:", error);
    return NextResponse.json({ ok: false, error: "Failed to post activity" }, { status: 500 });
  }
}