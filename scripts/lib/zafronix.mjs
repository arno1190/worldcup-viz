// Zafronix World Cup API client + team-name resolver.
// Base: https://api.zafronix.com/fifa/worldcup/v1  (auth: X-API-Key header)
// Free tier: 250 requests/day. We use 1 call per endpoint per refresh.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");

export const BASE = "https://api.zafronix.com/fifa/worldcup/v1";
export const SEASON = 2026;

export function apiKey() {
  const k = process.env.ZAFRONIX_KEY;
  if (!k) throw new Error("ZAFRONIX_KEY env var is not set");
  return k;
}

export async function zget(path) {
  const r = await fetch(BASE + path, {
    headers: { "X-API-Key": apiKey(), "User-Agent": "worldcup-viz/1.0 (open-source data viz)" },
  });
  if (!r.ok) throw new Error(`Zafronix ${path} -> HTTP ${r.status}`);
  return r.json();
}

/* --------------------------------------------------------- team resolution */

// Fold accents, drop "and"/punctuation, sort words — so "DR Congo" and
// "Congo DR" collapse to the same key.
export function normName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\band\b|&/g, " ")
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

// Explicit aliases for names that don't normalize to our canonical spelling.
const ALIASES = {
  usa: "United States",
  "cote d'ivoire": "Ivory Coast",
  "côte d'ivoire": "Ivory Coast",
  "korea republic": "South Korea",
  "ir iran": "Iran",
  "iran islamic republic of": "Iran",
  turkiye: "Türkiye",
  turkey: "Türkiye",
  czechia: "Czechia",
  "czech republic": "Czechia",
  "cape verde": "Cabo Verde",
};

let _resolver = null;

/**
 * Returns resolve(name) -> { name, slug, color } for any World Cup nation,
 * combining data/teams.json (32 knockout teams, with colours) and
 * data/fifa-codes.json (all scoring nations, name + iso2). Unresolved names
 * fall back to a neutral slug/colour and are logged.
 */
export function teamResolver() {
  if (_resolver) return _resolver;
  const teams = JSON.parse(readFileSync(join(root, "data", "teams.json"), "utf8")).teams;
  const fifa = JSON.parse(readFileSync(join(root, "data", "fifa-codes.json"), "utf8"));

  const byNorm = new Map();
  for (const t of teams) byNorm.set(normName(t.name), { name: t.name, slug: t.slug, color: t.color });
  for (const info of Object.values(fifa)) {
    const key = normName(info.name);
    if (!byNorm.has(key)) byNorm.set(key, { name: info.name, slug: info.iso2, color: "#cbd5e1" });
  }

  const warned = new Set();
  _resolver = (raw) => {
    if (!raw) return null;
    const aliased = ALIASES[String(raw).toLowerCase().trim()] || raw;
    const hit = byNorm.get(normName(aliased));
    if (hit) return hit;
    if (!warned.has(raw)) {
      warned.add(raw);
      console.warn(`  [resolver] no match for team "${raw}" — using neutral flag`);
    }
    return { name: raw, slug: "xx", color: "#cbd5e1" };
  };
  return _resolver;
}
