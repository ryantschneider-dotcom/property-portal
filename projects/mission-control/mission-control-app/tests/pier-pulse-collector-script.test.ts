import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("PIER Pulse Python collector deterministically parses RSS and agenda HTML fixtures into JSON envelope", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pier-pulse-collector-"));
  try {
    const rssPath = join(dir, "feed.xml");
    const agendaPath = join(dir, "agenda.html");
    const configPath = join(dir, "sources.json");
    await writeFile(
      rssPath,
      `<?xml version="1.0"?><rss><channel><title>Local News</title><item><title>Pooler warehouse expansion advances</title><link>https://example.com/pooler-warehouse</link><pubDate>Tue, 02 Jun 2026 14:00:00 GMT</pubDate><description>Industrial expansion near I-16 and I-95 moves ahead.</description><category>industrial</category></item><item><title>Police investigate unrelated incident</title><link>https://example.com/police-incident</link><description>Crime update with no commercial real estate signal.</description></item></channel></rss>`,
      "utf8",
    );
    await writeFile(
      agendaPath,
      `<html><body><a href="https://example.com/agenda-zoning">Planning agenda reviews retail outparcel near Pooler Parkway</a></body></html>`,
      "utf8",
    );
    await writeFile(
      configPath,
      JSON.stringify({
        collectorId: "fixture-live-collector",
        corridor: "pooler-bloomingdale-port-wentworth-garden-city",
        corridorHint: "Pooler / Bloomingdale / Port Wentworth / Garden City",
        sources: [
          { type: "rss", name: "Fixture RSS", url: `file://${rssPath}`, includeTerms: ["warehouse", "industrial", "development"], excludeTerms: ["police", "crime"] },
          { type: "agenda_html", name: "Fixture Agenda", url: `file://${agendaPath}`, selector: "a" },
        ],
      }),
      "utf8",
    );

    const { stdout } = await execFileAsync("python3", ["scripts/pier-pulse-live-collector.py", "--config", configPath, "--collected-at", "2026-06-02T14:30:00.000Z"], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024,
    });
    const parsed = JSON.parse(stdout) as { collectorId: string; candidates: Array<{ title: string; url: string; sourceName: string; corridorHint: string }>; errors: string[] };

    assert.equal(parsed.collectorId, "fixture-live-collector");
    assert.equal(parsed.errors.length, 0);
    assert.equal(parsed.candidates.length, 2);
    assert.equal(parsed.candidates[0].title, "Pooler warehouse expansion advances");
    assert.equal(parsed.candidates[0].sourceName, "Fixture RSS");
    assert.equal(parsed.candidates.some((candidate) => candidate.url === "https://example.com/police-incident"), false);
    assert.equal(parsed.candidates[1].url, "https://example.com/agenda-zoning");
    assert.equal(parsed.candidates[1].corridorHint, "Pooler / Bloomingdale / Port Wentworth / Garden City");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("PIER Pulse Python collector classifies deeper CRE intelligence signals", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pier-pulse-collector-intel-"));
  try {
    const rssPath = join(dir, "deep-cre-feed.xml");
    const configPath = join(dir, "sources.json");
    await writeFile(
      rssPath,
      `<?xml version="1.0"?><rss><channel><title>CRE Signals</title>
        <item><title>Downtown Savannah sublease space available at reduced asking rent</title><link>https://example.com/sublease-rent</link><description>Office sublease availability lists 12,000 square feet with asking rent moving lower.</description></item>
        <item><title>Commercial building permit filed for warehouse project</title><link>https://example.com/permit-project</link><description>New project announcement includes site plan review and commercial permit activity near the port.</description></item>
        <item><title>Planning commission agenda advances rezoning and road infrastructure approval</title><link>https://example.com/agenda-zoning-infrastructure</link><description>County agenda item includes zoning changes, infrastructure approval, and utility extension.</description></item>
        <item><title>Ribbon cutting event announced for new retail tenant</title><link>https://example.com/project-event</link><description>Groundbreaking and ribbon cutting event highlights tenant opening and project delivery.</description></item>
      </channel></rss>`,
      "utf8",
    );
    await writeFile(
      configPath,
      JSON.stringify({
        collectorId: "deep-cre-fixture",
        corridor: "savannah-chatham",
        corridorHint: "Savannah / Chatham",
        sources: [{ type: "rss", name: "Deep CRE RSS", url: `file://${rssPath}` }],
      }),
      "utf8",
    );

    const { stdout } = await execFileAsync("python3", ["scripts/pier-pulse-live-collector.py", "--config", configPath], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024,
    });
    const parsed = JSON.parse(stdout) as { candidates: Array<{ title: string; topics: string[]; facts: string[] }> };

    assert.deepEqual(parsed.candidates.map((candidate) => candidate.topics), [
      ["sublease", "rent", "office", "leasing"],
      ["industrial", "development", "permit", "project", "infrastructure"],
      ["zoning", "agenda", "infrastructure"],
      ["retail", "leasing", "project", "event"],
    ]);
    assert.match(parsed.candidates[0].facts.join(" "), /asking rent/i);
    assert.match(parsed.candidates[2].facts.join(" "), /infrastructure approval/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
