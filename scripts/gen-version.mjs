// Emit public/version.json — a tiny, no-store freshness marker the client polls
// so open/returning tabs auto-reload after a nightly redeploy. Generated at
// build time from the deployed data, so it always matches what's served.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bracket = JSON.parse(readFileSync(join(root, "data", "bracket.json"), "utf8"));
const played = bracket.matches.filter((m) => m.status === "completed").length;

writeFileSync(
  join(root, "public", "version.json"),
  JSON.stringify({ asOf: bracket.asOf, played, champion: bracket.champion ?? null }) + "\n",
);
console.log(`version.json: asOf ${bracket.asOf}, played ${played}`);
