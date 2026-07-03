"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import { motion } from "motion/react";
import type { Bracket, Match } from "@/lib/types";
import { buildLayout, teamRoute, type LayoutNode } from "@/lib/layout";
import { glowColor, scoreline, formatDate, formatKickoff } from "@/lib/bracket";

interface Props {
  bracket: Bracket;
}

export default function RadialBracket({ bracket }: Props) {
  const layout = useMemo(() => buildLayout(bracket), [bracket]);
  const matchById = useMemo(
    () => new Map(bracket.matches.map((m) => [m.id, m])),
    [bracket.matches],
  );
  const teamByName = useMemo(
    () => new Map(bracket.teams.map((t) => [t.name, t])),
    [bracket.teams],
  );

  // Which team currently occupies each node (leaf = starting team; match node =
  // its winner once decided).
  const occupant = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const [id, node] of layout.nodes) {
      if (node.kind === "leaf") {
        const m = matchById.get(node.matchId);
        map.set(id, m ? (node.slot === "A" ? m.teamA : m.teamB) : null);
      } else {
        const m = matchById.get(node.matchId);
        map.set(id, m && m.status === "completed" ? m.winner : null);
      }
    }
    return map;
  }, [layout, matchById]);

  const teamOf = useCallback(
    (name: string | null | undefined) =>
      name && name !== "TBD" ? teamByName.get(name) : undefined,
    [teamByName],
  );

  const [hoverTeam, setHoverTeam] = useState<string | null>(null);
  const [pinnedTeam, setPinnedTeam] = useState<string | null>(null);
  const [tip, setTip] = useState<{
    match: Match;
    x: number;
    y: number;
    cw: number;
    ch: number;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const activeTeam = hoverTeam ?? pinnedTeam;
  const route = useMemo(
    () => (activeTeam ? teamRoute(bracket, layout, activeTeam) : null),
    [activeTeam, bracket, layout],
  );
  const routeNodeSet = useMemo(() => new Set(route?.nodeIds ?? []), [route]);
  const routeEdgeSet = useMemo(() => new Set(route?.edgeIds ?? []), [route]);

  const showTipAt = useCallback(
    (match: Match, clientX: number, clientY: number) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      setTip({
        match,
        x: clientX - (rect?.left ?? 0),
        y: clientY - (rect?.top ?? 0),
        cw: rect?.width ?? 0,
        ch: rect?.height ?? 0,
      });
    },
    [],
  );

  const focusNode = useCallback(
    (node: LayoutNode, clientX: number, clientY: number) => {
      const m = matchById.get(node.matchId);
      if (m) showTipAt(m, clientX, clientY);
      const who = occupant.get(node.id) ?? null;
      if (who) setHoverTeam(who);
    },
    [matchById, occupant, showTipAt],
  );

  // Pointer entry: use the cursor position.
  const onNodeEnter = useCallback(
    (node: LayoutNode, e: React.MouseEvent) =>
      focusNode(node, e.clientX, e.clientY),
    [focusNode],
  );

  // Keyboard focus: derive a position from the focused element's box.
  const onNodeFocus = useCallback(
    (node: LayoutNode, e: React.FocusEvent) => {
      const r = e.currentTarget.getBoundingClientRect();
      focusNode(node, r.left + r.width / 2, r.top + r.height / 2);
    },
    [focusNode],
  );

  const clearHover = useCallback(() => {
    setHoverTeam(null);
    setTip(null);
  }, []);

  const togglePin = useCallback((team: string | null) => {
    setPinnedTeam((p) => (p === team ? null : team));
  }, []);

  const onNodeKeyDown = useCallback(
    (who: string | null | undefined, e: React.KeyboardEvent) => {
      if (who && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        togglePin(who);
      }
    },
    [togglePin],
  );

  // Screen-reader description of a match slot.
  const describe = useCallback((m: Match | undefined): string | undefined => {
    if (!m) return undefined;
    if (m.status === "completed" && m.winner) {
      const loser = m.winner === m.teamA ? m.teamB : m.teamA;
      return `${m.round}: ${m.winner} beat ${loser} ${scoreline(m) ?? ""}`.trim();
    }
    const when = m.date ? `, ${formatDate(m.date)}` : "";
    return `${m.round}: ${m.teamA} versus ${m.teamB}${when}`;
  }, []);

  const dimmed = activeTeam != null;

  return (
    <div
      ref={wrapRef}
      className="relative w-full select-none"
      onMouseLeave={clearHover}
    >
      <svg
        viewBox={`0 0 ${layout.size} ${layout.size}`}
        className="mx-auto block h-auto w-full max-w-[min(92vw,66vh)] lg:max-w-[min(58vw,82vh)]"
        role="group"
        aria-label={`${bracket.title}. Interactive radial knockout bracket — focus a nation to trace its road to the final.`}
        onClick={() => setPinnedTeam(null)}
      >
        <defs>
          <radialGradient id="trophyGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffdf8c" stopOpacity="0.9" />
            <stop offset="28%" stopColor="#f6b23b" stopOpacity="0.45" />
            <stop offset="60%" stopColor="#b8791a" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {[...layout.nodes.values()].map((n) => (
            <clipPath key={`clip-${n.id}`} id={`clip-${n.id}`}>
              <circle cx={n.x} cy={n.y} r={n.nodeR} />
            </clipPath>
          ))}
        </defs>

        {/* faint concentric guide rings */}
        {[0.795, 0.61, 0.445, 0.3].map((r, i) => (
          <circle
            key={`ring-${i}`}
            cx={layout.center}
            cy={layout.center}
            r={r * 545}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={0.04}
          />
        ))}

        {/* central trophy glow */}
        <circle
          cx={layout.center}
          cy={layout.center}
          r={340}
          fill="url(#trophyGlow)"
        />

        {/* edges */}
        <g strokeLinecap="round" strokeLinejoin="round" fill="none">
          {layout.edges.map((edge) => {
            const parent = matchById.get(edge.matchId);
            const who = occupant.get(edge.childId) ?? null;
            const lit =
              parent?.status === "completed" &&
              who != null &&
              parent.winner === who;
            const onRoute = routeEdgeSet.has(edge.id);
            const t = who ? teamOf(who) : undefined;
            const color = t ? glowColor(t.color) : "#94a3b8";

            if (!lit) {
              // structural connector (match not yet decided along this edge)
              return (
                <path
                  key={edge.id}
                  d={edge.d}
                  stroke="#ffffff"
                  strokeOpacity={dimmed ? 0.04 : 0.09}
                  strokeWidth={1.5}
                />
              );
            }
            return (
              <motion.path
                key={edge.id}
                d={edge.d}
                stroke={color}
                strokeWidth={onRoute ? 5 : 3}
                strokeOpacity={dimmed ? (onRoute ? 1 : 0.12) : 0.62}
                filter={onRoute ? "url(#soft)" : undefined}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              />
            );
          })}
        </g>

        {/* nodes */}
        <g>
          {[...layout.nodes.values()].map((n) => {
            const who = occupant.get(n.id);
            const t = teamOf(who);
            const m = matchById.get(n.matchId);
            const onRoute = routeNodeSet.has(n.id);
            const isActive = who && who === activeTeam;
            const nodeOpacity = dimmed ? (onRoute || isActive ? 1 : 0.3) : 1;

            // Empty / undetermined inner slot -> small hollow marker.
            if (n.kind === "match" && !t) {
              return (
                <g
                  key={n.id}
                  style={{
                    cursor: m ? "pointer" : "default",
                    opacity: nodeOpacity,
                  }}
                  tabIndex={m ? 0 : undefined}
                  role={m ? "img" : undefined}
                  aria-label={describe(m)}
                  onMouseEnter={(e) => m && onNodeEnter(n, e)}
                  onMouseMove={(e) => m && showTipAt(m, e.clientX, e.clientY)}
                  onMouseLeave={clearHover}
                  onFocus={(e) => m && onNodeFocus(n, e)}
                  onBlur={clearHover}
                >
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={Math.max(4, n.nodeR - 8)}
                    fill="#0b0f1a"
                    stroke="#64748b"
                    strokeOpacity={0.5}
                  />
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.nodeR + 4}
                    fill="transparent"
                  />
                </g>
              );
            }
            if (!t) return null;

            const ringColor = glowColor(t.color);
            return (
              <g
                key={n.id}
                style={{
                  cursor: "pointer",
                  opacity: nodeOpacity,
                }}
                tabIndex={0}
                role="button"
                aria-pressed={pinnedTeam === who}
                aria-label={`${who}${m ? ` — ${describe(m)}` : ""}. Activate to pin its road to the final.`}
                onMouseEnter={(e) => onNodeEnter(n, e)}
                onMouseMove={(e) => m && showTipAt(m, e.clientX, e.clientY)}
                onMouseLeave={clearHover}
                onFocus={(e) => onNodeFocus(n, e)}
                onBlur={clearHover}
                onKeyDown={(e) => onNodeKeyDown(who, e)}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePin(who!);
                }}
              >
                {/* glow halo for active node */}
                {(onRoute || isActive) && (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.nodeR + 5}
                    fill={ringColor}
                    opacity={0.35}
                    filter="url(#soft)"
                  />
                )}
                <circle cx={n.x} cy={n.y} r={n.nodeR + 1.5} fill="#0b0f1a" />
                <image
                  href={`/flags/${t.slug}.svg`}
                  x={n.x - n.nodeR}
                  y={n.y - n.nodeR}
                  width={n.nodeR * 2}
                  height={n.nodeR * 2}
                  clipPath={`url(#clip-${n.id})`}
                  preserveAspectRatio="xMidYMid slice"
                />
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.nodeR}
                  fill="none"
                  stroke={onRoute || isActive ? ringColor : "#ffffff"}
                  strokeOpacity={onRoute || isActive ? 1 : 0.25}
                  strokeWidth={onRoute || isActive ? 2.5 : 1}
                />
                {/* larger invisible hit target */}
                <circle cx={n.x} cy={n.y} r={n.nodeR + 4} fill="transparent" />
              </g>
            );
          })}
        </g>

        {/* trophy / champion */}
        {bracket.champion ? (
          (() => {
            const champ = teamOf(bracket.champion);
            return (
              <g>
                <circle
                  cx={layout.center}
                  cy={layout.center}
                  r={30}
                  fill="#0b0f1a"
                />
                {champ && (
                  <>
                    <image
                      href={`/flags/${champ.slug}.svg`}
                      x={layout.center - 26}
                      y={layout.center - 26}
                      width={52}
                      height={52}
                      clipPath="url(#clip-champ)"
                    />
                    <clipPath id="clip-champ">
                      <circle cx={layout.center} cy={layout.center} r={26} />
                    </clipPath>
                    <circle
                      cx={layout.center}
                      cy={layout.center}
                      r={26}
                      fill="none"
                      stroke="#ffd76a"
                      strokeWidth={3}
                    />
                  </>
                )}
              </g>
            );
          })()
        ) : (
          <image
            href="/trophy.png"
            x={layout.center - 52}
            y={layout.center - 52}
            width={104}
            height={104}
            preserveAspectRatio="xMidYMid meet"
          />
        )}
      </svg>

      {tip && <MatchTip tip={tip} bracket={bracket} teamByName={teamByName} />}
    </div>
  );
}

/* -------------------------------------------------------------- tooltip card */

const TIP_W = 288; // matches w-72

function MatchTip({
  tip,
  teamByName,
}: {
  tip: { match: Match; x: number; y: number; cw: number; ch: number };
  bracket: Bracket;
  teamByName: Map<string, { name: string; slug: string; color: string }>;
}) {
  const m = tip.match;
  const a = teamByName.get(m.teamA);
  const b = teamByName.get(m.teamB);
  const kickoff = formatKickoff(m.kickoffUtc);
  const colorA = a ? glowColor(a.color) : "#94a3b8";
  const colorB = b ? glowColor(b.color) : "#94a3b8";
  const statusLabel =
    m.status === "completed"
      ? "Full time"
      : m.status === "live"
        ? "Live"
        : m.status === "scheduled"
          ? "Scheduled"
          : "Awaiting teams";

  // Estimate height so the flip keeps the card on-screen.
  const estH =
    150 +
    (m.goals?.length ? 24 + m.goals.length * 16 : 0) +
    (m.stats ? 150 : 0);
  const flipX = tip.x + 16 + TIP_W > tip.cw;
  const flipY = tip.y + 16 + estH > tip.ch;
  const left = Math.max(4, flipX ? tip.x - TIP_W - 16 : tip.x + 16);
  const top = Math.max(4, flipY ? Math.max(4, tip.ch - estH - 4) : tip.y + 16);

  return (
    <div
      className="pointer-events-none absolute z-20 w-72 rounded-xl border border-white/10 bg-[#0d1117]/95 p-3 text-sm shadow-2xl backdrop-blur"
      style={{ left, top }}
    >
      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-400">
        <span>{m.round}</span>
        <span
          className={
            m.status === "completed"
              ? "text-emerald-400"
              : m.status === "live"
                ? "text-red-400"
                : "text-amber-300/80"
          }
        >
          {statusLabel}
        </span>
      </div>
      <TeamRow
        team={a}
        name={m.teamA}
        score={m.scoreA}
        pen={m.penA}
        winner={m.winner === m.teamA}
      />
      <TeamRow
        team={b}
        name={m.teamB}
        score={m.scoreB}
        pen={m.penB}
        winner={m.winner === m.teamB}
      />

      {m.goals && m.goals.length > 0 && (
        <div className="mt-2 border-t border-white/10 pt-2">
          <div className="space-y-0.5">
            {[...m.goals]
              .sort((g1, g2) => g1.minute - g2.minute)
              .map((g, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 text-[11px] text-slate-300"
                >
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: g.team === "A" ? colorA : colorB }}
                  />
                  <span className="w-7 shrink-0 tabular-nums text-slate-500">
                    {g.minute}&apos;
                  </span>
                  <span className="truncate">{g.scorer}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {m.stats && (
        <div className="mt-2 border-t border-white/10 pt-2">
          <StatRow
            label="Possession"
            a={m.stats.possession[0]}
            b={m.stats.possession[1]}
            suffix="%"
            colorA={colorA}
            colorB={colorB}
          />
          <StatRow
            label="Shots (on target)"
            a={m.stats.shots[0]}
            b={m.stats.shots[1]}
            subA={m.stats.shotsOnTarget[0]}
            subB={m.stats.shotsOnTarget[1]}
            colorA={colorA}
            colorB={colorB}
          />
          <StatRow
            label="Expected goals"
            a={m.stats.xg[0]}
            b={m.stats.xg[1]}
            decimals
            colorA={colorA}
            colorB={colorB}
          />
          <StatRow
            label="Corners"
            a={m.stats.corners[0]}
            b={m.stats.corners[1]}
            colorA={colorA}
            colorB={colorB}
          />
          {m.stats.formation && (
            <div className="mt-1 flex justify-between text-[10px] text-slate-500">
              <span>{m.stats.formation[0]}</span>
              <span className="uppercase tracking-wider">formation</span>
              <span>{m.stats.formation[1]}</span>
            </div>
          )}
        </div>
      )}

      {(m.venue || m.date || kickoff || m.attendance || m.referee) && (
        <div className="mt-2 border-t border-white/10 pt-2 text-[11px] leading-relaxed text-slate-400">
          {kickoff ? (
            <div>
              {kickoff.date} ·{" "}
              <span className="text-slate-300">{kickoff.time}</span>{" "}
              <span className="text-slate-500">your time</span>
            </div>
          ) : (
            m.date && <div>{formatDate(m.date)}</div>
          )}
          {m.venue && (
            <div>
              {m.venue}
              {m.city ? `, ${m.city}` : ""}
            </div>
          )}
          {(m.attendance || m.referee) && (
            <div className="text-slate-500">
              {m.attendance ? `${m.attendance.toLocaleString()} att.` : ""}
              {m.attendance && m.referee ? " · " : ""}
              {m.referee ? `Ref: ${m.referee}` : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatRow({
  label,
  a,
  b,
  subA,
  subB,
  suffix = "",
  decimals = false,
  colorA,
  colorB,
}: {
  label: string;
  a: number | null;
  b: number | null;
  subA?: number | null;
  subB?: number | null;
  suffix?: string;
  decimals?: boolean;
  colorA: string;
  colorB: string;
}) {
  const av = a ?? 0;
  const bv = b ?? 0;
  const total = av + bv || 1;
  const fmt = (n: number | null | undefined) =>
    n == null ? "–" : decimals ? n.toFixed(2) : String(n);
  return (
    <div className="mb-1.5">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="tabular-nums font-medium text-slate-200">
          {fmt(a)}
          {suffix}
          {subA != null && (
            <span className="ml-0.5 text-slate-500">({subA})</span>
          )}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <span className="tabular-nums font-medium text-slate-200">
          {subB != null && (
            <span className="mr-0.5 text-slate-500">({subB})</span>
          )}
          {fmt(b)}
          {suffix}
        </span>
      </div>
      <div className="mt-0.5 flex h-1 overflow-hidden rounded-full bg-white/5">
        <div style={{ width: `${(av / total) * 100}%`, background: colorA }} />
        <div style={{ width: `${(bv / total) * 100}%`, background: colorB }} />
      </div>
    </div>
  );
}

function TeamRow({
  team,
  name,
  score,
  pen,
  winner,
}: {
  team?: { slug: string };
  name: string;
  score: number | null;
  pen: number | null;
  winner: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 py-0.5 ${winner ? "font-semibold text-white" : "text-slate-300"}`}
    >
      {team ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/flags/${team.slug}.svg`}
          alt=""
          width={18}
          height={18}
          className="rounded-full"
        />
      ) : (
        <span className="inline-block h-[18px] w-[18px] rounded-full bg-slate-700" />
      )}
      <span className="flex-1 truncate">{name}</span>
      {score !== null && (
        <span className="tabular-nums">
          {score}
          {pen !== null && (
            <span className="ml-1 text-[11px] text-slate-400">({pen})</span>
          )}
        </span>
      )}
    </div>
  );
}
