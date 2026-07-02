import RadialBracket from "@/components/RadialBracket";
import { getBracket, formatDate } from "@/lib/bracket";

export default function Home() {
	const bracket = getBracket();
	const played = bracket.matches.filter(
		(m) => m.status === "completed",
	).length;
	const total = bracket.matches.length;

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-6xl flex-1 flex-col items-center justify-center px-4 py-4">
			<header className="mb-3 text-center">
				<p className="text-[11px] font-medium uppercase tracking-[0.35em] text-amber-300/80">
					2026 FIFA World Cup · Knockout stage
				</p>
				<h1 className="mt-2 bg-gradient-to-b from-white to-slate-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-5xl">
					Road to the Final
				</h1>
				<div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-slate-400">
					<span className="inline-flex items-center gap-1.5">
						<span className="relative flex h-2 w-2">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
							<span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
						</span>
						{bracket.champion ? (
							<span className="text-white">
								Champions: {bracket.champion}
							</span>
						) : (
							<span>Tournament in progress</span>
						)}
					</span>
					<span className="text-slate-600">·</span>
					<span>
						{played} of {total} ties played
					</span>
					<span className="text-slate-600">·</span>
					<span>Updated {formatDate(bracket.asOf)}</span>
				</div>
			</header>

			<p className="mb-1 text-center text-xs text-slate-500">
				Hover a nation to trace its road to the final · click to pin ·
				hover any tie for the result
			</p>

			<RadialBracket bracket={bracket} />

			<ThirdPlace bracket={bracket} />

			<footer className="mt-5 max-w-2xl text-center text-[11px] leading-relaxed text-slate-600">
				<p>
					Live knockout data compiled from public sources (Wikipedia,
					ESPN, CBS Sports, Sky Sports) and refreshed automatically
					every night. Flags by{" "}
					<a
						href="https://github.com/HatScripts/circle-flags"
						className="underline decoration-slate-700 underline-offset-2 hover:text-slate-400"
						rel="noreferrer"
					>
						circle-flags
					</a>
					. An open-source data-visualisation project — not affiliated
					with FIFA.
				</p>
			</footer>
		</main>
	);
}

function ThirdPlace({ bracket }: { bracket: ReturnType<typeof getBracket> }) {
	const tp = bracket.thirdPlace;
	if (!tp || (tp.teamA === "TBD" && tp.teamB === "TBD")) return null;
	const decided = tp.scoreA !== null && tp.scoreB !== null;
	return (
		<div className="mt-6 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-2 text-center text-xs text-slate-400">
			<span className="uppercase tracking-wider text-slate-500">
				Third place
			</span>{" "}
			<span className="ml-2">
				{tp.teamA} {decided ? `${tp.scoreA}–${tp.scoreB}` : "vs"}{" "}
				{tp.teamB}
			</span>
		</div>
	);
}
