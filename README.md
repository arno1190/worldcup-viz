# 2026 World Cup — Road to the Final

An interactive **radial knockout bracket** for the 2026 FIFA World Cup. Hover any
nation to trace its road to the final; every tie reveals its result (score,
penalties, date, venue) on hover. Completed matches light their winner's path in
national colours, converging on the trophy at the centre.

Live data is compiled from public sources and **refreshed automatically every
night** via a scheduled GitHub Action that reads Wikipedia's knockout bracket.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **motion** for path-draw animation
- Pure-SVG radial geometry (no charting library)
- Flags by [circle-flags](https://github.com/HatScripts/circle-flags), vendored into `public/flags`

## How it works

| Piece | File |
| --- | --- |
| Radial layout math (32→16→8→4→2→trophy) | `lib/layout.ts` |
| Interactive bracket component | `components/RadialBracket.tsx` |
| Tournament snapshot (results + kickoff times) | `data/bracket.json` |
| Player / team rankings | `data/stats.json` |
| Zafronix API client + team resolver | `scripts/lib/zafronix.mjs` |
| Canonical bracket normaliser (shared) | `scripts/lib/canonicalize.mjs` |
| Bracket refresh (results + kickoff times) | `scripts/update-bracket.mjs` |
| Stats refresh (scorers, attack, defense) | `scripts/update-stats.mjs` |
| Nightly cron | `.github/workflows/refresh-bracket.yml` |

## Data source

All live data comes from the [Zafronix World Cup API](https://api.zafronix.com/docs)
(`X-API-Key`, free tier 250 req/day — ~3 calls per refresh):

- **Bracket** — `GET /bracket?year=2026` gives the knockout tree with `W<matchNo>`
  refs (the real feeds-into linkage), results, clean team names and precomputed
  `kickoffUtc`; `GET /matches` adds penalty-shootout scores. The refs are handed
  to `canonicalize.mjs` which relabels to the app's canonical
  `R32-k / R16-k / QF-k / SF-k / F` scheme. Kickoff times render in the **viewer's
  own timezone**.
- **Stats** — `GET /matches?year=2026` (one call) yields every match with
  `goals[]`; `topScorers`, `bestAttack` and `bestDefense` are aggregated from it
  (scorer names normalised so `K. Mbappe` / `Mbappé` merge). Assist data in the
  feed is too sparse to rank, so `topAssists` is a curated list preserved across
  refreshes.

Each refresh **aborts without writing** on a bad/empty response, a missing key,
or a failed structural check, so a bad run can never erase the last good data.
ESPN's public API (`site.api.espn.com/.../soccer/fifa.world`) is a keyless
fallback for the bracket if ever needed.

### Refreshing locally

```bash
export ZAFRONIX_KEY=zwc_...   # see .env.example
pnpm refresh                  # bracket + stats (defensive; no-ops if unchanged)
```

## Develop

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # production build
```

## Deploy

Deployed on Vercel. Connect the GitHub repo via Vercel's Git integration so the
nightly commit auto-triggers a production redeploy.

## Notes

An open-source data-visualisation project. Not affiliated with FIFA. Data
accuracy depends on the public sources it is compiled from.

## License

MIT
