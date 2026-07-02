// Build data/bracket.json from a raw research/scrape payload.
// Usage: node scripts/build-snapshot.mjs [rawFile]   (default: scratch-raw.json)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canonicalize } from "./lib/canonicalize.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const rawFile = process.argv[2] || join(root, "scratch-raw.json");

const payload = JSON.parse(readFileSync(rawFile, "utf8"));
const raw = payload.bracket;
const flags = payload.flags;

const bracket = canonicalize(
  raw,
  { teams: raw.teams },
  flags,
  {
    title: "2026 FIFA World Cup — Road to the Final",
    sources: raw.sources,
  },
);

const outPath = join(root, "data", "bracket.json");
writeFileSync(outPath, JSON.stringify(bracket, null, 2) + "\n");

// Sanity report.
const counts = bracket.matches.reduce((a, m) => ((a[m.round] = (a[m.round] || 0) + 1), a), {});
console.log("Wrote", outPath);
console.log("asOf", bracket.asOf, "| champion", bracket.champion);
console.log("teams", bracket.teams.length, "| matches", bracket.matches.length);
console.log("rounds", counts);
const completed = bracket.matches.filter((m) => m.status === "completed").length;
console.log("completed matches", completed);
