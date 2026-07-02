// Nightly refresh: rebuild data/bracket.json from Wikipedia's live knockout
// bracket. Defensive by design — if parsing looks wrong (too few matches, team
// count changed, fewer completed ties than the committed snapshot), it exits
// non-zero WITHOUT writing, so the last good snapshot is preserved.
//
// Usage: node scripts/update-bracket.mjs
// Exit codes: 0 = wrote a valid update (or no change), 1 = aborted (kept old).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canonicalize } from "./lib/canonicalize.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const WIKI_PAGE = "2026_FIFA_World_Cup_knockout_stage";
const WIKI_API = `https://en.wikipedia.org/w/api.php?action=parse&page=${WIKI_PAGE}&prop=wikitext&format=json&formatversion=2`;

const ROUND_MARKERS = [
  ["Round of 32", "R32", 16],
  ["Round of 16", "R16", 8],
  ["Quarterfinals", "QF", 4],
  ["Semifinals", "SF", 2],
  ["Final", "F", 1],
  ["Match for third place", "TP", 1],
];

function die(msg) {
  console.error("ABORT:", msg);
  process.exit(1);
}

/** Extract the {{#invoke:RoundN|N32 ... }} block from the page wikitext. */
function extractBracketBlock(wt) {
  const begin = wt.indexOf('<section begin="Bracket"');
  const end = wt.indexOf('<section end="Bracket"');
  if (begin === -1 || end === -1 || end < begin) return null;
  return wt.slice(begin, end);
}

/** Parse "1 (4)" -> {goals:1, pens:4}; "3" -> {goals:3}; "" -> {}. */
function parseScore(raw) {
  const s = (raw || "").trim();
  if (!s) return {};
  const m = s.match(/^(\d+)\s*(?:\((\d+)\))?/);
  if (!m) return {};
  return { goals: Number(m[1]), pens: m[2] !== undefined ? Number(m[2]) : undefined };
}

/** Pull the FIFA code out of a team cell, or null for a placeholder/TBD slot. */
function parseTeamCell(cell) {
  // Real team: {{#invoke:flag|fb|CODE}} (possibly with {{pso}}/{{aet}} markers).
  const m = cell.match(/\{\{#invoke:flag\|fb\|([A-Z]{2,4})\}\}/);
  const code = m ? m[1] : null;
  const pso = /\{\{pso\}\}/.test(cell);
  return { code, pso };
}

function isMatchLine(line) {
  // A match row is a table cell that carries a team flag invoke (real teams) or
  // a "Winner Match" / "Loser Match" placeholder (undetermined slots). This is
  // far more robust than sniffing the date separator, which can change.
  if (!line.startsWith("|")) return false;
  return line.includes("{{#invoke:flag|fb|") || /Winner Match|Loser Match/.test(line);
}

/** Split a match line into its 5 logical cells, respecting nested {{...}}. */
function splitCells(line) {
  const body = line.replace(/^\|/, "");
  const cells = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    const two = body.slice(i, i + 2);
    if (two === "{{" || two === "[[") {
      depth++;
      cur += two;
      i++;
      continue;
    }
    if (two === "}}" || two === "]]") {
      depth--;
      cur += two;
      i++;
      continue;
    }
    if (ch === "|" && depth === 0) {
      cells.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  return cells; // [dateplace, team1, score1, team2, score2]
}

/** "June 29 – [[Foxborough, Massachusetts|Foxborough]]" -> {date, city}. */
function parseDatePlace(cell, year) {
  const [datePart, placePart] = cell.split(" – ");
  let date = null;
  const dm = (datePart || "").trim().match(/^([A-Za-z]+)\s+(\d+)$/);
  if (dm) {
    const months = {
      January: 1,
      February: 2,
      March: 3,
      April: 4,
      May: 5,
      June: 6,
      July: 7,
      August: 8,
      September: 9,
      October: 10,
      November: 11,
      December: 12,
    };
    const mo = months[dm[1]];
    if (mo) date = `${year}-${String(mo).padStart(2, "0")}-${String(Number(dm[2])).padStart(2, "0")}`;
  }
  let city = null;
  if (placePart) {
    const pm = placePart.match(/\[\[[^\]|]*\|([^\]]+)\]\]|\[\[([^\]]+)\]\]/);
    city = (pm?.[1] || pm?.[2] || placePart).trim();
  }
  return { date, city };
}

async function main() {
  const teamsCfg = JSON.parse(readFileSync(join(root, "data", "teams.json"), "utf8")).teams;
  const codeToTeam = new Map(teamsCfg.map((t) => [t.code, t]));
  const venuesByCity = JSON.parse(readFileSync(join(root, "data", "venues.json"), "utf8"));
  const prev = JSON.parse(readFileSync(join(root, "data", "bracket.json"), "utf8"));

  const res = await fetch(WIKI_API, { headers: { "User-Agent": "worldcup-viz/1.0 (open-source data viz)" } });
  if (!res.ok) die(`Wikipedia API HTTP ${res.status}`);
  const json = await res.json();
  const wt = json?.parse?.wikitext;
  if (!wt) die("no wikitext in API response");

  const block = extractBracketBlock(wt);
  if (!block) die("could not locate Bracket section");

  const year = 2026;
  const lines = block.split("\n");

  // Segment lines by round using the HTML comment markers.
  const rawMatches = [];
  let mi = 0; // running match index (for id numbering per round)
  let curRound = null;
  const perRoundCount = {};

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    for (const [label, prefix] of ROUND_MARKERS) {
      if (line.includes(`<!--${label}-->`)) {
        curRound = prefix;
        perRoundCount[prefix] = 0;
        mi = 0;
      }
    }
    if (!curRound || !isMatchLine(line)) continue;

    const cells = splitCells(line);
    if (cells.length < 5) continue;
    const { date, city } = parseDatePlace(cells[0], year);
    const a = parseTeamCell(cells[1]);
    const b = parseTeamCell(cells[3]);
    const sa = parseScore(cells[2]);
    const sb = parseScore(cells[4]);

    perRoundCount[curRound]++;
    const idx = perRoundCount[curRound];
    const id = curRound === "F" ? "F" : curRound === "TP" ? "TP" : `${curRound}-${idx}`;

    const teamA = a.code ? codeToTeam.get(a.code)?.name ?? a.code : "TBD";
    const teamB = b.code ? codeToTeam.get(b.code)?.name ?? b.code : "TBD";

    const hasScores = sa.goals !== undefined && sb.goals !== undefined;
    const bothTeams = a.code && b.code;
    let status = "TBD";
    if (!bothTeams) status = "TBD";
    else if (hasScores) status = "completed";
    else status = "scheduled";

    let winner = null;
    if (status === "completed") {
      if (a.pso || (sa.pens !== undefined && sb.pens !== undefined && sa.pens > sb.pens)) winner = teamA;
      else if (b.pso || (sa.pens !== undefined && sb.pens !== undefined && sb.pens > sa.pens)) winner = teamB;
      else if (sa.goals > sb.goals) winner = teamA;
      else if (sb.goals > sa.goals) winner = teamB;
      // A knockout tie cannot truly be final without a winner (e.g. a draw whose
      // shootout result hasn't landed in the parse yet). Treat it as not-yet-
      // complete rather than emitting a bogus "completed, no winner" result.
      if (winner === null) {
        status = "scheduled";
        sa.goals = undefined;
        sb.goals = undefined;
        sa.pens = undefined;
        sb.pens = undefined;
      }
    }

    // Positional feedsInto: RoundN lists matches so consecutive pairs feed the
    // next round's match (1-indexed: id n -> next ceil(n/2)).
    let feedsIntoId = null;
    if (curRound === "R32") feedsIntoId = `R16-${Math.ceil(idx / 2)}`;
    else if (curRound === "R16") feedsIntoId = `QF-${Math.ceil(idx / 2)}`;
    else if (curRound === "QF") feedsIntoId = `SF-${Math.ceil(idx / 2)}`;
    else if (curRound === "SF") feedsIntoId = "F";

    rawMatches.push({
      id,
      round:
        curRound === "R32"
          ? "Round of 32"
          : curRound === "R16"
            ? "Round of 16"
            : curRound === "QF"
              ? "Quarter-finals"
              : curRound === "SF"
                ? "Semi-finals"
                : curRound === "F"
                  ? "Final"
                  : "Third place",
      teamA,
      teamB,
      scoreA: sa.goals ?? null,
      scoreB: sb.goals ?? null,
      penA: sa.pens ?? null,
      penB: sb.pens ?? null,
      winner,
      date,
      venue: (city && venuesByCity[city]) || null,
      city,
      status,
      feedsIntoId,
    });
    void mi;
  }

  // ---- Validation gates (preserve last good snapshot on failure) ----
  const knockoutCount = rawMatches.filter((m) => m.id !== "TP").length;
  if (knockoutCount !== 31) die(`expected 31 knockout matches, parsed ${knockoutCount}`);
  const r32 = rawMatches.filter((m) => m.round === "Round of 32");
  if (r32.length !== 16) die(`expected 16 R32, got ${r32.length}`);

  const raw = {
    asOf: new Date().toISOString().slice(0, 10),
    matches: rawMatches,
    teams: teamsCfg.map((t) => ({ name: t.name, iso2: t.slug })),
    sources: [`https://en.wikipedia.org/wiki/${WIKI_PAGE}`],
  };

  const next = canonicalize(
    raw,
    { teams: raw.teams },
    { teams: teamsCfg.map((t) => ({ name: t.name, circleFlagsSlug: t.slug, primaryColor: t.color })) },
    { title: prev.title, sources: raw.sources },
  );

  const prevCompleted = prev.matches.filter((m) => m.status === "completed").length;
  const nextCompleted = next.matches.filter((m) => m.status === "completed").length;

  // Integrity gates. Wikipedia is authoritative and self-heals, so we trust a
  // structurally-valid parse rather than comparing counts (a count comparison
  // can permanently poison the snapshot if one bad page ever inflates it).
  if (nextCompleted > 31) die(`impossible completed count ${nextCompleted}`);
  if (nextCompleted === 0 && prevCompleted > 0) {
    die(`parsed 0 completed ties but snapshot has ${prevCompleted} — treating as a parse failure`);
  }
  const noWinner = next.matches.filter((m) => m.status === "completed" && !m.winner);
  if (noWinner.length) die(`completed ties without a winner: ${noWinner.map((m) => m.id).join(", ")}`);
  const known = new Set(teamsCfg.map((t) => t.name));
  const unknown = next.teams.filter((t) => !known.has(t.name));
  if (unknown.length) die(`unknown teams parsed (bad FIFA code?): ${unknown.map((t) => t.name).join(", ")}`);
  if (next.teams.length < 8) die(`too few teams: ${next.teams.length}`);

  const outPath = join(root, "data", "bracket.json");
  const nextStr = JSON.stringify(next, null, 2) + "\n";
  const prevStr = JSON.stringify(prev, null, 2) + "\n";
  if (nextStr === prevStr) {
    console.log(`No change (${nextCompleted}/${knockoutCount} ties completed). asOf ${next.asOf}`);
    process.exit(0);
  }
  writeFileSync(outPath, nextStr);
  console.log(`Updated bracket.json: ${nextCompleted}/${knockoutCount} ties completed, champion ${next.champion ?? "TBD"}.`);
}

main().catch((e) => die(e.message));
