"use client";

import { useState } from "react";
import type { Stats } from "@/lib/types";
import { formatDate } from "@/lib/bracket";

type TabKey = "scorers" | "assists" | "attack" | "defense";

interface Row {
  key: string;
  iso2: string;
  primary: string; // main label (player or team)
  secondary?: string; // sub label (team, for players)
  value: number; // the ranked value (drives the bar)
  valueLabel: string; // formatted value text
  note?: string; // extra small stat, e.g. "2 assists"
}

const TABS: { key: TabKey; label: string; unit: string }[] = [
  { key: "scorers", label: "Scorers", unit: "goals" },
  { key: "assists", label: "Assists", unit: "assists" },
  { key: "attack", label: "Attack", unit: "scored" },
  { key: "defense", label: "Defense", unit: "conceded" },
];

function rowsFor(tab: TabKey, stats: Stats): Row[] {
  switch (tab) {
    case "scorers":
      return stats.topScorers.map((s, i) => ({
        key: `${s.player}-${i}`,
        iso2: s.iso2,
        primary: s.player,
        secondary: s.team,
        value: s.goals,
        valueLabel: String(s.goals),
        note: s.assists ? `${s.assists} ast` : undefined,
      }));
    case "assists":
      return stats.topAssists.map((s, i) => ({
        key: `${s.player}-${i}`,
        iso2: s.iso2,
        primary: s.player,
        secondary: s.team,
        value: s.assists,
        valueLabel: String(s.assists),
        note: s.goals ? `${s.goals} gls` : undefined,
      }));
    case "attack":
      return stats.bestAttack.map((s, i) => ({
        key: `${s.team}-${i}`,
        iso2: s.iso2,
        primary: s.team,
        value: s.goalsFor,
        valueLabel: String(s.goalsFor),
        note: s.matches ? `${s.matches} pld` : undefined,
      }));
    case "defense":
      // Lower is better; invert for the bar so fewer-conceded = longer bar.
      return stats.bestDefense.map((s, i) => ({
        key: `${s.team}-${i}`,
        iso2: s.iso2,
        primary: s.team,
        value: s.goalsAgainst,
        valueLabel: String(s.goalsAgainst),
        note:
          s.cleanSheets != null
            ? `${s.cleanSheets} clean sheet${s.cleanSheets === 1 ? "" : "s"}`
            : undefined,
      }));
  }
}

const MEDAL = ["text-amber-300", "text-slate-300", "text-amber-600"];

export default function RankingPanel({ stats }: { stats: Stats }) {
  const [tab, setTab] = useState<TabKey>("scorers");
  const rows = rowsFor(tab, stats);
  const invert = tab === "defense";
  const values = rows.map((r) => r.value);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-6 pb-3">
        <h2 className="text-lg font-semibold tracking-tight text-white">
          Tournament rankings
        </h2>
        <p className="text-xs text-slate-500">
          Group stage + knockout · as of {formatDate(stats.asOf)}
        </p>
      </div>

      {/* tabs */}
      <div
        className="flex gap-1 px-4"
        role="tablist"
        aria-label="Ranking category"
      >
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-t-md px-2 py-2 text-xs font-medium transition-colors ${
                on
                  ? "bg-white/[0.06] text-white"
                  : "text-slate-400 hover:bg-white/[0.03] hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="h-px bg-white/10" />

      {/* list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-slate-500">
            No data yet.
          </p>
        ) : (
          <ol className="space-y-1">
            {rows.map((r, i) => {
              // bar width: attack/assists/scorers -> proportional to value;
              // defense -> proportional to how few conceded (fewer = fuller).
              const frac = invert
                ? 1 - (r.value - min) / Math.max(1, max - min)
                : r.value / max;
              const width = `${Math.round(18 + frac * 82)}%`;
              return (
                <li
                  key={r.key}
                  className="group relative flex items-center gap-2.5 overflow-hidden rounded-md px-2 py-1.5"
                >
                  <span
                    className="absolute inset-y-0 left-0 -z-10 rounded-md bg-gradient-to-r from-amber-400/15 to-transparent transition-[width]"
                    style={{ width }}
                    aria-hidden
                  />
                  <span
                    className={`w-4 shrink-0 text-center text-xs font-semibold tabular-nums ${
                      MEDAL[i] ?? "text-slate-500"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/flags/${r.iso2}.svg`}
                    alt=""
                    width={22}
                    height={22}
                    className="shrink-0 rounded-full ring-1 ring-white/10"
                    loading="lazy"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-100">
                      {r.primary}
                    </span>
                    {r.secondary && (
                      <span className="block truncate text-[11px] text-slate-500">
                        {r.secondary}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums text-white">
                      {r.valueLabel}
                    </span>
                    {r.note && (
                      <span className="block text-[10px] text-slate-500">
                        {r.note}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="border-t border-white/10 px-5 py-3 text-[11px] text-slate-500">
        {active.label} ranked by {active.unit}. Compiled from public sources.
      </div>
    </div>
  );
}
