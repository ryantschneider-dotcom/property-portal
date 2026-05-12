import { buildNormalizedOmInput } from "@/lib/om/normalize-om-input";
import { validateNormalizedOmInput } from "@/lib/om/validate-om-input";

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (const arg of argv) {
    if (arg.startsWith("--property=")) args.set("property", arg.split("=")[1] ?? "");
    if (arg === "--write-snapshot") args.set("writeSnapshot", true);
  }
  return {
    propertyId: String(args.get("property") ?? "").trim(),
    writeSnapshot: args.get("writeSnapshot") === true,
  };
}

async function main() {
  const { propertyId, writeSnapshot } = parseArgs(process.argv.slice(2));
  if (!propertyId) {
    throw new Error("Usage: tsx scripts/build-om-input.ts --property=<id> [--write-snapshot]");
  }

  const input = await buildNormalizedOmInput(propertyId);
  const validation = validateNormalizedOmInput(input);

  const output = {
    ok: validation.ok,
    input,
    warnings: validation.warnings,
    snapshotRequested: writeSnapshot,
  };

  console.log(JSON.stringify(output, null, 2));

  if (!validation.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
