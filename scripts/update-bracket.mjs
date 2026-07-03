// Nightly bracket refresh — Zafronix World Cup API (single source).
//   GET /bracket?year=2026  -> KO tree with W<matchNo> refs (linkage) + results
//                              + kickoffUtc + clean team names
//   GET /matches?year=2026  -> penalty-shootout scores (joined by matchNo)
//
// The W-refs give the real feeds-into linkage; we hand provisional round ids +
// feedsInto to the shared canonicaliser, which relabels to the app's canonical
// R32-k / R16-k / QF-k / SF-k / F scheme. Defensive: aborts without writing on
// a bad/empty response, a missing key, or a structural check failure, so the
// last good snapshot is always preserved. ~2 API calls/run.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canonicalize } from "./lib/canonicalize.mjs";
import { zget, teamResolver, SEASON, cleanScorer } from "./lib/zafronix.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const STAGE = {
  round_of_32: { prefix: "R32", round: "Round of 32" },
  round_of_16: { prefix: "R16", round: "Round of 16" },
  quarter_final: { prefix: "QF", round: "Quarter-finals" },
  semi_final: { prefix: "SF", round: "Semi-finals" },
  final: { prefix: "F", round: "Final" },
  third_place: { prefix: "TP", round: "Third place" },
};

function die(msg) {
  console.error("ABORT:", msg);
  process.exit(1);
}

// Pull the compact stat set we display from a single-match `statistics` block.
function extractStats(m) {
  const s = m?.statistics;
  const h = s?.home,
    a = s?.away;
  if (!h || !a || h.possessionPct == null) return null;
  const pair = (x, y) => [x ?? null, y ?? null];
  const st = {
    possession: pair(h.possessionPct, a.possessionPct),
    shots: pair(h.shotsTotal, a.shotsTotal),
    shotsOnTarget: pair(h.shotsOnGoal, a.shotsOnGoal),
    corners: pair(h.corners, a.corners),
    fouls: pair(h.fouls, a.fouls),
    xg: pair(h.expectedGoals, a.expectedGoals),
  };
  if (m.formations?.home && m.formations?.away) st.formation = [m.formations.home, m.formations.away];
  return st;
}

async function main() {
  const teamsCfg = JSON.parse(readFileSync(join(root, "data", "teams.json"), "utf8")).teams;
  const venuesByCity = JSON.parse(readFileSync(join(root, "data", "venues.json"), "utf8"));
  const prev = JSON.parse(readFileSync(join(root, "data", "bracket.json"), "utf8"));
  const resolve = teamResolver();

  const bracket = await zget(`/bracket?year=${SEASON}`);
  const stages = bracket?.stages;
  if (!stages || !Array.isArray(stages.round_of_32)) die("no bracket.stages in response");

  // The /matches list carries penalties, attendance, referee and the goal
  // timeline for every match — no extra calls needed for those.
  const detailByNo = new Map();
  try {
    const matches = (await zget(`/matches?year=${SEASON}`))?.data || [];
    for (const m of matches) {
      detailByNo.set(m.matchNo, {
        penalties: m.penalties && m.penalties.home != null ? m.penalties : null,
        attendance: typeof m.attendance === "number" ? m.attendance : null,
        referee: m.referee?.name || null,
        goals: (m.goals || [])
          .filter((g) => g && g.scorer)
          .map((g) => ({
            minute: typeof g.minute === "number" ? g.minute : null,
            team: g.team === "home" ? "A" : "B",
            scorer: cleanScorer(g.scorer),
          })),
      });
    }
  } catch (e) {
    console.warn("match-list fetch failed (non-fatal):", e.message);
  }

  // Rich per-match statistics live on /matches/{id}. They're immutable once a
  // match finishes, so we fetch each completed tie's stats ONCE and cache it in
  // bracket.json — a few calls per night, capped to protect the daily quota.
  const STATS_FETCH_CAP = 24;
  const prevStatsByPair = new Map();
  for (const m of prev.matches || []) {
    if (m.stats) prevStatsByPair.set([m.teamA, m.teamB].sort().join("|"), m.stats);
  }
  const statsByNo = new Map();
  let fetched = 0;
  for (const st of Object.values(STAGE)) void st;
  const koFlat = Object.entries(STAGE).flatMap(([k]) => stages[k] || []);
  for (const m of koFlat) {
    if (!m.winner || !m.home || !m.away) continue; // only completed ties
    const pairKey = [resolve(m.home).name, resolve(m.away).name].sort().join("|");
    const cached = prevStatsByPair.get(pairKey);
    if (cached) {
      statsByNo.set(m.matchNo, cached);
      continue;
    }
    if (fetched >= STATS_FETCH_CAP) continue;
    try {
      const detail = await zget(`/matches/2026-${String(m.matchNo).padStart(3, "0")}`);
      fetched++;
      const s = extractStats(detail?.data || detail);
      if (s) statsByNo.set(m.matchNo, s);
    } catch (e) {
      console.warn(`stats fetch failed for match ${m.matchNo} (non-fatal):`, e.message);
    }
  }
  if (fetched) console.log(`fetched stats for ${fetched} newly-completed ties`);

  // Flatten KO matches and assign provisional ids per stage (sorted by matchNo).
  const koMatches = [];
  for (const [stageKey, meta] of Object.entries(STAGE)) {
    const arr = (stages[stageKey] || []).slice().sort((a, b) => a.matchNo - b.matchNo);
    arr.forEach((m, i) => {
      const id =
        meta.prefix === "F" ? "F" : meta.prefix === "TP" ? "TP" : `${meta.prefix}-${i + 1}`;
      koMatches.push({ ...m, _id: id, _round: meta.round });
    });
  }

  // Linkage: a ref "W<n>" on match M means match n feeds into M.
  const provByNo = new Map(koMatches.map((m) => [m.matchNo, m._id]));
  const parentOfNo = new Map();
  for (const m of koMatches) {
    for (const ref of [m.homeRef, m.awayRef]) {
      const w = /^W(\d+)$/.exec(String(ref || ""));
      if (w) parentOfNo.set(Number(w[1]), m._id);
    }
  }

  const rawMatches = koMatches.map((m) => {
    const teamA = m.home ? resolve(m.home).name : "TBD";
    const teamB = m.away ? resolve(m.away).name : "TBD";
    const bothKnown = m.home && m.away;
    const winner = m.winner ? resolve(m.winner).name : null;
    const detail = detailByNo.get(m.matchNo) || {};
    const pen = detail.penalties;
    const scoreA = m.homeScore != null ? m.homeScore : null;
    const scoreB = m.awayScore != null ? m.awayScore : null;
    const city = m.city || null;

    let status = "TBD";
    if (!bothKnown) status = "TBD";
    else if (winner) status = "completed";
    else status = "scheduled";

    return {
      id: m._id,
      round: m._round,
      teamA,
      teamB,
      scoreA: status === "completed" ? scoreA : status === "scheduled" ? null : null,
      scoreB: status === "completed" ? scoreB : status === "scheduled" ? null : null,
      penA: status === "completed" && pen ? pen.home : null,
      penB: status === "completed" && pen ? pen.away : null,
      winner,
      date: m.kickoffUtc ? m.kickoffUtc.slice(0, 10) : null,
      kickoffUtc: m.kickoffUtc || null,
      venue: (city && venuesByCity[city]) || m.stadium || null,
      city,
      status,
      goals: status === "completed" && detail.goals?.length ? detail.goals : null,
      attendance: status === "completed" ? (detail.attendance ?? null) : null,
      referee: status === "completed" ? (detail.referee ?? null) : null,
      stats: status === "completed" ? (statsByNo.get(m.matchNo) ?? null) : null,
      feedsIntoId: parentOfNo.get(m.matchNo) || null,
    };
  });

  const raw = {
    asOf: new Date().toISOString().slice(0, 10),
    matches: rawMatches,
    teams: teamsCfg.map((t) => ({ name: t.name, iso2: t.slug })),
    sources: ["https://api.zafronix.com (Zafronix World Cup API)"],
  };

  const next = canonicalize(
    raw,
    { teams: raw.teams },
    { teams: teamsCfg.map((t) => ({ name: t.name, circleFlagsSlug: t.slug, primaryColor: t.color })) },
    { title: prev.title, sources: raw.sources },
  );

  // ---- Integrity gates (preserve last good snapshot on failure) ----
  const knockout = next.matches.length;
  if (knockout !== 31) die(`expected 31 knockout matches, built ${knockout}`);
  const r32 = next.matches.filter((m) => m.round === "Round of 32");
  if (r32.length !== 16) die(`expected 16 R32, got ${r32.length}`);
  const noWinner = next.matches.filter((m) => m.status === "completed" && !m.winner);
  if (noWinner.length) die(`completed ties without a winner: ${noWinner.map((m) => m.id).join(", ")}`);
  const badFlag = next.teams.filter((t) => t.slug === "xx");
  if (badFlag.length) die(`unresolved teams: ${badFlag.map((t) => t.name).join(", ")}`);

  const prevCompleted = prev.matches.filter((m) => m.status === "completed").length;
  const nextCompleted = next.matches.filter((m) => m.status === "completed").length;
  if (nextCompleted === 0 && prevCompleted > 0) die(`0 completed ties parsed but snapshot has ${prevCompleted}`);

  const nextStr = JSON.stringify(next, null, 2) + "\n";
  const prevStr = JSON.stringify(prev, null, 2) + "\n";
  if (nextStr === prevStr) {
    console.log(`No bracket change (${nextCompleted}/${knockout} ties completed). asOf ${next.asOf}`);
    process.exit(0);
  }
  writeFileSync(join(root, "data", "bracket.json"), nextStr);
  console.log(`Updated bracket.json: ${nextCompleted}/${knockout} ties completed, champion ${next.champion ?? "TBD"}.`);
}

main().catch((e) => die(e.message));
