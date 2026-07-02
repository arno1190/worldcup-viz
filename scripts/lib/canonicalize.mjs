// Shared bracket canonicaliser used by both the initial snapshot builder and
// the nightly Wikipedia updater. It turns a "raw" bracket (matches carrying a
// `feedsIntoId` linkage, in any numbering) into the canonical id scheme the
// app's radial geometry assumes:
//
//   R16-k <- R32-(2k-1), R32-(2k)     QF-k <- R16-(2k-1), R16-(2k)
//   SF-k  <- QF-(2k-1),  QF-(2k)      F    <- SF-1, SF-2
//
// We rebuild the tree from feedsIntoId, DFS from the Final, and relabel every
// match by its position so standard pairing reflects the real bracket. This
// keeps the app dumb (no linkage logic) while tolerating whatever numbering the
// source used.

/** @typedef {{id:string,round:string,teamA:string,teamB:string,scoreA:number|null,scoreB:number|null,penA:number|null,penB:number|null,winner:string|null,date:string|null,venue:string|null,city:string|null,status:string,feedsIntoId:string|null}} RawMatch */

const ROUND_OF = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  F: "Final",
};

/** Round prefix from a raw match id. */
function prefixOf(id) {
  if (id.startsWith("R32")) return "R32";
  if (id.startsWith("R16")) return "R16";
  if (id.startsWith("QF")) return "QF";
  if (id.startsWith("SF")) return "SF";
  if (id === "F" || id.startsWith("F")) return "F";
  return null;
}

const RANK = { R32: 0, R16: 1, QF: 2, SF: 3, F: 4 };

/**
 * Canonicalise a raw bracket.
 * @param {{matches: RawMatch[]}} raw
 * @param {{teams: {name:string,iso2?:string,circleFlagsSlug?:string,primaryColor?:string}[]}} rawTeams team list (from research)
 * @param {{teams: {name:string,circleFlagsSlug:string,primaryColor:string}[]}} flags
 * @param {{title:string, sources?:string[]}} meta
 */
export function canonicalize(raw, rawTeams, flags, meta) {
  const matches = raw.matches.filter((m) => prefixOf(m.id) && m.id !== "TP");
  const thirdPlace = raw.matches.find((m) => m.id === "TP");
  const byId = new Map(matches.map((m) => [m.id, m]));

  // children[parentId] = [childId, ...] ordered by the child's own id.
  const children = new Map();
  for (const m of matches) {
    const p = m.feedsIntoId;
    if (p && byId.has(p)) {
      if (!children.has(p)) children.set(p, []);
      children.get(p).push(m.id);
    }
  }
  for (const arr of children.values()) arr.sort(cmpId);

  // Root = the Final (round F, feeds nowhere).
  const root = matches.find((m) => prefixOf(m.id) === "F");
  if (!root) throw new Error("canonicalize: no Final match found");

  // DFS to collect leaves (R32) in left-to-right order.
  const leafOrder = [];
  (function dfs(id) {
    const kids = children.get(id) || [];
    if (kids.length === 0) {
      if (prefixOf(id) === "R32") leafOrder.push(id);
      return;
    }
    for (const k of kids) dfs(k);
  })(root.id);

  if (leafOrder.length !== 16) {
    throw new Error(`canonicalize: expected 16 R32 matches via DFS, got ${leafOrder.length}`);
  }

  // Map old id -> new canonical id.
  const remap = new Map();
  leafOrder.forEach((oldId, i) => remap.set(oldId, `R32-${i + 1}`));
  // Derive parents' canonical ids from their canonical children.
  const canonParent = (childCanonId) => {
    const pfx = prefixOf(childCanonId);
    const n = pfx === "F" ? 0 : Number(childCanonId.split("-")[1]);
    if (pfx === "R32") return `R16-${Math.ceil(n / 2)}`;
    if (pfx === "R16") return `QF-${Math.ceil(n / 2)}`;
    if (pfx === "QF") return `SF-${Math.ceil(n / 2)}`;
    if (pfx === "SF") return "F";
    return null;
  };
  // Walk up from each level to assign remaining ids.
  for (const level of ["R32", "R16", "QF", "SF"]) {
    for (const [oldId, canonId] of [...remap.entries()]) {
      if (prefixOf(canonId) !== level) continue;
      const oldMatch = byId.get(oldId);
      const oldParent = oldMatch?.feedsIntoId;
      if (oldParent && byId.has(oldParent) && !remap.has(oldParent)) {
        remap.set(oldParent, canonParent(canonId));
      }
    }
  }

  const teamByName = indexTeams(rawTeams?.teams || []);
  const flagLookup = buildFlagLookup(flags?.teams || []);

  const outMatches = matches.map((m) => {
    const id = remap.get(m.id) || m.id;
    return {
      id,
      round: ROUND_OF[prefixOf(id)] || m.round,
      teamA: m.teamA,
      teamB: m.teamB,
      scoreA: nn(m.scoreA),
      scoreB: nn(m.scoreB),
      penA: nn(m.penA),
      penB: nn(m.penB),
      winner: m.winner ?? null,
      date: m.date ?? null,
      venue: cleanText(m.venue),
      city: cleanText(m.city),
      status: m.status || "TBD",
    };
  });
  outMatches.sort((a, b) => RANK[prefixOf(a.id)] - RANK[prefixOf(b.id)] || cmpNum(a.id, b.id));

  // Build the team list from every name that appears in the bracket, enriched
  // with flag slug + colour.
  const names = new Set();
  for (const m of matches) {
    for (const t of [m.teamA, m.teamB]) if (t && t !== "TBD") names.add(t);
  }
  const teams = [...names].sort().map((name) => {
    const info = teamByName.get(norm(name));
    const iso = info?.iso2 || info?.circleFlagsSlug;
    const flag = flagLookup.byName.get(norm(name)) || (iso ? flagLookup.bySlug.get(iso) : undefined);
    return {
      name,
      slug: flag?.circleFlagsSlug || iso || "xx",
      color: flag?.primaryColor || "#cbd5e1",
    };
  });

  return {
    asOf: raw.asOf || new Date().toISOString().slice(0, 10),
    title: meta?.title || "2026 FIFA World Cup — Road to the Final",
    champion: outMatches.find((m) => m.id === "F")?.winner ?? null,
    teams,
    matches: outMatches,
    thirdPlace: thirdPlace
      ? {
          teamA: thirdPlace.teamA,
          teamB: thirdPlace.teamB,
          scoreA: nn(thirdPlace.scoreA),
          scoreB: nn(thirdPlace.scoreB),
          winner: thirdPlace.winner ?? null,
          date: thirdPlace.date ?? null,
          status: thirdPlace.status || "TBD",
        }
      : null,
    sources: meta?.sources || raw.sources || [],
  };
}

function cmpId(a, b) {
  return cmpNum(a, b);
}
function cmpNum(a, b) {
  const na = Number((a.split("-")[1] ?? "0").replace(/\D/g, "")) || 0;
  const nb = Number((b.split("-")[1] ?? "0").replace(/\D/g, "")) || 0;
  return na - nb;
}
function nn(v) {
  return v === undefined ? null : v;
}
function cleanText(v) {
  if (!v) return null;
  return String(v).replace(/&amp;/g, "&").trim();
}
function norm(s) {
  return String(s).toLowerCase().replace(/[^a-z]/g, "");
}
function indexTeams(teams) {
  const m = new Map();
  for (const t of teams) m.set(norm(t.name), t);
  return m;
}
function buildFlagLookup(flagTeams) {
  const byName = new Map();
  const bySlug = new Map();
  for (const f of flagTeams) {
    byName.set(norm(f.name), f);
    if (f.circleFlagsSlug) bySlug.set(f.circleFlagsSlug, f);
  }
  return { byName, bySlug };
}
