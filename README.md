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
| Tournament snapshot (the data) | `data/bracket.json` |
| Canonical bracket normaliser (shared) | `scripts/lib/canonicalize.mjs` |
| Nightly Wikipedia scraper | `scripts/update-bracket.mjs` |
| Nightly cron | `.github/workflows/refresh-bracket.yml` |

The bracket is a complete binary tree; the geometry is derived entirely from the
canonical `R32-k / R16-k / QF-k / SF-k / F` id scheme, so the app stays dumb and
the data pipeline owns correctness.

### Refreshing the data locally

```bash
pnpm refresh   # re-scrapes Wikipedia into data/bracket.json (defensive; no-ops if unchanged)
```

The scraper aborts without writing if the parse looks wrong (too few matches,
team count changed, or completed ties regress), so a bad scrape can never erase
the last good snapshot.

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
