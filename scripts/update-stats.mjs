// Nightly refresh of player/team stats from Wikipedia's structured Goalscorers
// module (Module:Goalscorers/data/2026 FIFA World Cup). That module is the only
// reliably-parseable public source, and it tracks GOALS only — so this script
// refreshes:
//   • topScorers  (goals, per player)
//   • bestAttack  (goals scored, summed per country)
// Assists and defensive stats are not published in machine-readable form, so
// data/stats.json's `topAssists` and `bestDefense` are treated as curated and
// preserved verbatim. Defensive: on a bad/empty parse the script aborts without
// writing, keeping the last good stats.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const MODULE_PAGE = "Module:Goalscorers/data/2026 FIFA World Cup";
const API = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(MODULE_PAGE)}&prop=wikitext&format=json&formatversion=2`;

const TOP_SCORERS = 10;
const TOP_ATTACK = 10;

function die(msg) {
  console.error("ABORT:", msg);
  process.exit(1);
}

async function main() {
  const codes = JSON.parse(readFileSync(join(root, "data", "fifa-codes.json"), "utf8"));
  const prev = JSON.parse(readFileSync(join(root, "data", "stats.json"), "utf8"));

  const res = await fetch(API, { headers: { "User-Agent": "worldcup-viz/1.0 (open-source data viz)" } });
  if (!res.ok) die(`Wikipedia API HTTP ${res.status}`);
  const wt = (await res.json())?.parse?.wikitext;
  if (!wt) die("no wikitext in module response");

  // Isolate the goalscorers table.
  const start = wt.indexOf("data.goalscorers");
  if (start === -1) die("data.goalscorers not found");
  const rest = wt.slice(start + 1);
  const end = rest.indexOf("\ndata.");
  const body = end === -1 ? wt.slice(start) : wt.slice(start, start + 1 + end);

  // { "[[Player|Display]]", "COD", 3 }
  const re = /\{\s*"\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]"\s*,\s*"([A-Z]{3})"\s*,\s*(\d+)\s*\}/g;
  const entries = [];
  const unknown = new Set();
  let m;
  while ((m = re.exec(body))) {
    const player = m[1].replace(/&nbsp;|&#160;/g, " ").trim();
    const code = m[2];
    const goals = Number(m[3]);
    const info = codes[code];
    if (!info) {
      unknown.add(code);
      continue;
    }
    entries.push({ player, team: info.name, iso2: info.iso2, goals });
  }

  if (unknown.size) console.warn("skipped unknown FIFA codes:", [...unknown].join(", "));
  if (entries.length < 5) die(`only ${entries.length} scorers parsed — treating as a parse failure`);

  // Carry over per-player assists and per-team "matches played" from the last
  // curated snapshot so the extra sub-stats survive the goals refresh.
  const assistByPlayer = new Map();
  for (const s of [...(prev.topScorers || []), ...(prev.topAssists || [])]) {
    if (s.player && s.assists != null) assistByPlayer.set(s.player, s.assists);
  }
  const matchesByTeam = new Map((prev.bestAttack || []).map((a) => [a.team, a.matches]));

  const byGoalsThenName = (a, b) => b.goals - a.goals || a.player.localeCompare(b.player);
  const topScorers = entries
    .slice()
    .sort(byGoalsThenName)
    .slice(0, TOP_SCORERS)
    .map((s) => {
      const assists = assistByPlayer.get(s.player);
      return { player: s.player, team: s.team, iso2: s.iso2, goals: s.goals, ...(assists != null ? { assists } : {}) };
    });

  const goalsForTeam = new Map();
  for (const e of entries) {
    const cur = goalsForTeam.get(e.team) || { team: e.team, iso2: e.iso2, goalsFor: 0 };
    cur.goalsFor += e.goals;
    goalsForTeam.set(e.team, cur);
  }
  const bestAttack = [...goalsForTeam.values()]
    .sort((a, b) => b.goalsFor - a.goalsFor || a.team.localeCompare(b.team))
    .slice(0, TOP_ATTACK)
    .map((a) => ({ ...a, ...(matchesByTeam.get(a.team) != null ? { matches: matchesByTeam.get(a.team) } : {}) }));

  // Try to read the module's own "last updated" date.
  const upd = wt.match(/data\.updated[\s\S]{0,200}?"(\d{4}-\d{2}-\d{2})"/);
  const asOf = upd ? upd[1] : new Date().toISOString().slice(0, 10);

  const next = {
    asOf,
    topScorers,
    topAssists: prev.topAssists || [],
    bestAttack,
    bestDefense: prev.bestDefense || [],
  };

  const nextStr = JSON.stringify(next, null, 2) + "\n";
  const prevStr = JSON.stringify(prev, null, 2) + "\n";
  if (nextStr === prevStr) {
    console.log(`Stats unchanged (${topScorers.length} scorers, top ${bestAttack[0]?.team} ${bestAttack[0]?.goalsFor}). asOf ${asOf}`);
    process.exit(0);
  }
  writeFileSync(join(root, "data", "stats.json"), nextStr);
  console.log(
    `Updated stats.json: ${topScorers.length} scorers (leader ${topScorers[0].player} ${topScorers[0].goals}); best attack ${bestAttack[0].team} ${bestAttack[0].goalsFor}. asOf ${asOf}.`,
  );
}

main().catch((e) => die(e.message));
