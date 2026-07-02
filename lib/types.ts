export type Round =
  | "Round of 32"
  | "Round of 16"
  | "Quarter-finals"
  | "Semi-finals"
  | "Final"
  | "Third place";

export type MatchStatus = "completed" | "scheduled" | "live" | "TBD";

/** A national team competing in the knockout stage. */
export interface Team {
  /** Full country name, used as the key everywhere. */
  name: string;
  /** circle-flags slug, e.g. "fr", "gb-eng". Flag lives at /flags/<slug>.svg */
  slug: string;
  /** Representative national-team colour used to light the winner path. */
  color: string;
}

/** A single knockout match slot. Teams may be "TBD" until determined. */
export interface Match {
  id: string;
  round: Round;
  teamA: string;
  teamB: string;
  scoreA: number | null;
  scoreB: number | null;
  /** Penalty-shootout goals, null when the match was not decided on penalties. */
  penA: number | null;
  penB: number | null;
  winner: string | null;
  date: string | null;
  /** Kickoff instant in UTC (ISO 8601, e.g. "2026-06-28T19:00:00Z"), or null. */
  kickoffUtc: string | null;
  venue: string | null;
  city: string | null;
  status: MatchStatus;
}

export interface ThirdPlace {
  teamA: string;
  teamB: string;
  scoreA: number | null;
  scoreB: number | null;
  winner: string | null;
  date: string | null;
  status: MatchStatus;
}

/** The full tournament snapshot rendered by the viz. */
export interface Bracket {
  /** ISO date the data reflects, e.g. "2026-07-02". */
  asOf: string;
  /** Human label for the tournament. */
  title: string;
  champion: string | null;
  teams: Team[];
  matches: Match[];
  thirdPlace: ThirdPlace | null;
  /** URLs the snapshot was derived from. */
  sources: string[];
}

/* ------------------------------------------------------------------- stats */

export interface ScorerStat {
  player: string;
  team: string;
  iso2: string;
  goals: number;
  assists?: number;
  matches?: number;
}

export interface AssistStat {
  player: string;
  team: string;
  iso2: string;
  assists: number;
  goals?: number;
  matches?: number;
}

export interface AttackStat {
  team: string;
  iso2: string;
  goalsFor: number;
  matches?: number;
}

export interface DefenseStat {
  team: string;
  iso2: string;
  goalsAgainst: number;
  cleanSheets?: number;
  matches?: number;
}

export interface Stats {
  asOf: string;
  topScorers: ScorerStat[];
  topAssists: AssistStat[];
  bestAttack: AttackStat[];
  bestDefense: DefenseStat[];
}
