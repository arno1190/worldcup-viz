// Nightly stats refresh — Zafronix World Cup API (single source).
//   GET /matches?year=2026 -> every match with scores + goals[] (scorer, team)
// From that one call we derive:
//   • topScorers  — aggregate goals[] (scorer names normalised so "K. Mbappe"
//                   and "Mbappé" merge), attributed to the scoring team
//   • bestAttack  — goals scored per team (from scorelines)
//   • bestDefense — goals conceded + clean sheets per team
//   • topAssists  — aggregated if goals[] carry assist data; otherwise the last
//                   curated list is preserved
// Defensive: aborts without writing on a bad/empty response or a missing key.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { zget, teamResolver, SEASON, scorerKey, cleanScorer, pickScorerDisplay } from "./lib/zafronix.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const TOP = 10;

function die(msg) {
  console.error("ABORT:", msg);
  process.exit(1);
}

const isOwnGoal = (s) => /\bog\b|own goal/i.test(String(s));

async function main() {
  const prev = JSON.parse(readFileSync(join(root, "data", "stats.json"), "utf8"));
  const resolve = teamResolver();

  const matches = (await zget(`/matches?year=${SEASON}`))?.data;
  if (!Array.isArray(matches) || matches.length < 32) die(`unexpected /matches payload (${matches?.length})`);

  const played = matches.filter((m) => m.homeScore != null && m.awayScore != null);

  // --- scorers + assists from goal events ---
  const scorers = new Map(); // key -> { display, team, goals }
  const assists = new Map(); // key -> { display, team, assists }
  for (const m of matches) {
    for (const g of m.goals || []) {
      if (!g.scorer || isOwnGoal(g.scorer) || isOwnGoal(g.type)) continue;
      const team = resolve(g.team === "home" ? m.homeTeam : m.awayTeam);
      const k = scorerKey(g.scorer) + "|" + team.name;
      const cur = scorers.get(k) || { display: "", team: team.name, iso2: team.slug, goals: 0 };
      cur.display = pickScorerDisplay(cur.display, cleanScorer(g.scorer));
      cur.goals += 1;
      scorers.set(k, cur);
      const aName = g.assist || g.assistedBy || g.assist_by;
      if (aName) {
        const ak = scorerKey(aName) + "|" + team.name;
        const ac = assists.get(ak) || { display: "", team: team.name, iso2: team.slug, assists: 0 };
        ac.display = pickScorerDisplay(ac.display, cleanScorer(aName));
        ac.assists += 1;
        assists.set(ak, ac);
      }
    }
  }

  const topScorers = [...scorers.values()]
    .sort((a, b) => b.goals - a.goals || a.display.localeCompare(b.display))
    .slice(0, TOP)
    .map((s) => ({ player: s.display, team: s.team, iso2: s.iso2, goals: s.goals }));

  if (topScorers.length < 5) die(`only ${topScorers.length} scorers derived — treating as a parse failure`);

  const derivedAssists = [...assists.values()]
    .sort((a, b) => b.assists - a.assists || a.display.localeCompare(b.display))
    .slice(0, 8)
    .map((s) => ({ player: s.display, team: s.team, iso2: s.iso2, assists: s.assists }));
  // The feed only sparsely publishes assist data (mostly 1s), so it's only
  // trustworthy once a real leader emerges. Otherwise keep the curated list.
  const useDerived = derivedAssists.length >= 5 && (derivedAssists[0]?.assists ?? 0) >= 3;
  const topAssists = useDerived ? derivedAssists : prev.topAssists || [];

  // --- team attack / defense from scorelines ---
  const teamAgg = new Map(); // name -> { name, iso2, gf, ga, cs, mp }
  const bump = (name, gf, ga) => {
    const t = resolve(name);
    const cur = teamAgg.get(t.name) || { team: t.name, iso2: t.slug, gf: 0, ga: 0, cs: 0, mp: 0 };
    cur.gf += gf;
    cur.ga += ga;
    cur.mp += 1;
    if (ga === 0) cur.cs += 1;
    teamAgg.set(t.name, cur);
  };
  for (const m of played) {
    bump(m.homeTeam, m.homeScore, m.awayScore);
    bump(m.awayTeam, m.awayScore, m.homeScore);
  }
  const teams = [...teamAgg.values()];
  const bestAttack = teams
    .slice()
    .sort((a, b) => b.gf - a.gf || a.team.localeCompare(b.team))
    .slice(0, TOP)
    .map((t) => ({ team: t.team, iso2: t.iso2, goalsFor: t.gf, matches: t.mp }));
  const bestDefense = teams
    .slice()
    .sort((a, b) => a.ga - b.ga || b.cs - a.cs || b.mp - a.mp || a.team.localeCompare(b.team))
    .slice(0, TOP)
    .map((t) => ({ team: t.team, iso2: t.iso2, goalsAgainst: t.ga, cleanSheets: t.cs, matches: t.mp }));

  const next = {
    asOf: new Date().toISOString().slice(0, 10),
    topScorers,
    topAssists,
    bestAttack,
    bestDefense,
  };

  const nextStr = JSON.stringify(next, null, 2) + "\n";
  const prevStr = JSON.stringify(prev, null, 2) + "\n";
  if (nextStr === prevStr) {
    console.log(`Stats unchanged (leader ${topScorers[0].player} ${topScorers[0].goals}).`);
    process.exit(0);
  }
  writeFileSync(join(root, "data", "stats.json"), nextStr);
  console.log(
    `Updated stats.json: leader ${topScorers[0].player} ${topScorers[0].goals}; best attack ${bestAttack[0].team} ${bestAttack[0].goalsFor}; best defense ${bestDefense[0].team} ${bestDefense[0].goalsAgainst} GA; assists ${topAssists === prev.topAssists ? "(curated, preserved)" : "(live)"}.`,
  );
}

main().catch((e) => die(e.message));
