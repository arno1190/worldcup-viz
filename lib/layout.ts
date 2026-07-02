import type { Bracket, Match, Round } from "./types";

/**
 * Radial bracket geometry.
 *
 * The 2026 knockout is a complete binary tree: 32 leaves (teams) -> 16 -> 8 ->
 * 4 -> 2 -> 1 champion. We lay the 32 leaves around the outer ring and place
 * each match's winner node on an inner ring at the mean angle of its two
 * children, so paths converge on the trophy at the centre.
 *
 * Match ids are canonical and pairing is standard:
 *   R16-k  <- R32-(2k-1), R32-(2k)
 *   QF-k   <- R16-(2k-1), R16-(2k)
 *   SF-k   <- QF-(2k-1),  QF-(2k)
 *   F      <- SF-1, SF-2
 * The data pipeline is responsible for emitting matches in this canonical order.
 */

export const VIEWBOX = 1200;
export const CENTER = VIEWBOX / 2;

/** Ring radii as a fraction of the max radius, outermost first. */
const RING_FRAC = [1.0, 0.795, 0.61, 0.445, 0.3, 0.155] as const;
const MAX_R = 545;

/** Flag-node radius per ring (leaves .. champion). */
export const NODE_R = [27, 21, 18, 16, 15, 24] as const;

export const ROUND_BY_RING: Round[] = [
	"Round of 32", // ring 0 holds the 32 team leaves; their match is R32
	"Round of 32",
	"Round of 16",
	"Quarter-finals",
	"Semi-finals",
	"Final",
];

export type NodeKind = "leaf" | "match";

export interface LayoutNode {
	id: string;
	kind: NodeKind;
	/** Match this node belongs to. For a leaf, the R32 match it plays in. */
	matchId: string;
	/** For a leaf: which side of the match ("A" | "B"). */
	slot?: "A" | "B";
	ring: number;
	angle: number; // degrees, -90 = top
	rFrac: number;
	x: number;
	y: number;
	nodeR: number;
}

export interface LayoutEdge {
	id: string;
	childId: string;
	parentId: string;
	/** The match whose result this edge represents (the parent match). */
	matchId: string;
	d: string;
}

export interface Layout {
	nodes: Map<string, LayoutNode>;
	edges: LayoutEdge[];
	/** leaf index (0..31) -> node id */
	leaves: string[];
	size: number;
	center: number;
}

const RAD = Math.PI / 180;

export function polar(
	angleDeg: number,
	rFrac: number,
): { x: number; y: number } {
	const r = rFrac * MAX_R;
	return {
		x: CENTER + r * Math.cos(angleDeg * RAD),
		y: CENTER + r * Math.sin(angleDeg * RAD),
	};
}

function leafAngle(i: number): number {
	// 32 leaves spread over the full circle, starting at the top (-90) going
	// clockwise, centred in their sector. Angles are kept monotonic (not
	// normalised) so parent = mean(children) never crosses the wrap point.
	return -90 + (i + 0.5) * (360 / 32);
}

/** Build the "radial then arc" elbow connector from a child to its parent. */
function connectorPath(
	childAngle: number,
	childR: number,
	parentAngle: number,
	parentR: number,
): string {
	const start = polar(childAngle, childR);
	const knee = polar(childAngle, parentR);
	let d = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} L ${knee.x.toFixed(2)} ${knee.y.toFixed(2)}`;
	const steps = Math.max(
		2,
		Math.round(Math.abs(parentAngle - childAngle) / 2),
	);
	for (let s = 1; s <= steps; s++) {
		const a = childAngle + ((parentAngle - childAngle) * s) / steps;
		const p = polar(a, parentR);
		d += ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
	}
	return d;
}

/** Parse a canonical match id into its round index (ring) and 1-based number. */
function ringForMatch(id: string): number {
	if (id.startsWith("R32")) return 1;
	if (id.startsWith("R16")) return 2;
	if (id.startsWith("QF")) return 3;
	if (id.startsWith("SF")) return 4;
	if (id === "F") return 5;
	return -1;
}

/**
 * Standard-pairing children of a match id.
 * Returns child match ids (or leaf indices for R32).
 */
export function childrenOf(id: string): {
	leaves?: [number, number];
	matches?: [string, string];
} {
	if (id.startsWith("R32")) {
		const k = Number(id.slice(4));
		return { leaves: [2 * k - 2, 2 * k - 1] };
	}
	if (id.startsWith("R16")) {
		const k = Number(id.slice(4));
		return { matches: [`R32-${2 * k - 1}`, `R32-${2 * k}`] };
	}
	if (id.startsWith("QF")) {
		const k = Number(id.slice(3));
		return { matches: [`R16-${2 * k - 1}`, `R16-${2 * k}`] };
	}
	if (id.startsWith("SF")) {
		const k = Number(id.slice(3));
		return { matches: [`QF-${2 * k - 1}`, `QF-${2 * k}`] };
	}
	if (id === "F") {
		return { matches: ["SF-1", "SF-2"] };
	}
	return {};
}

const RING_ORDER = ["R32", "R16", "QF", "SF", "F"] as const;

export function buildLayout(bracket: Bracket): Layout {
	const byId = new Map(bracket.matches.map((m) => [m.id, m]));
	const nodes = new Map<string, LayoutNode>();
	const angleOf = new Map<string, number>();
	const leaves: string[] = [];

	// 1) Leaf nodes: 32 team slots in canonical order.
	for (let k = 1; k <= 16; k++) {
		const matchId = `R32-${k}`;
		for (const [slotIdx, slot] of [
			[0, "A"],
			[1, "B"],
		] as const) {
			const i = 2 * (k - 1) + slotIdx;
			const angle = leafAngle(i);
			const p = polar(angle, RING_FRAC[0]);
			const id = `leaf-${i}`;
			nodes.set(id, {
				id,
				kind: "leaf",
				matchId,
				slot,
				ring: 0,
				angle,
				rFrac: RING_FRAC[0],
				x: p.x,
				y: p.y,
				nodeR: NODE_R[0],
			});
			angleOf.set(id, angle);
			leaves[i] = id;
		}
	}

	// 2) Winner nodes per match, ring by ring, angle = mean of children.
	const matchIds: string[] = [];
	for (let k = 1; k <= 16; k++) matchIds.push(`R32-${k}`);
	for (let k = 1; k <= 8; k++) matchIds.push(`R16-${k}`);
	for (let k = 1; k <= 4; k++) matchIds.push(`QF-${k}`);
	for (let k = 1; k <= 2; k++) matchIds.push(`SF-${k}`);
	matchIds.push("F");

	const childNodeIds = (id: string): [string, string] => {
		const c = childrenOf(id);
		if (c.leaves) return [`leaf-${c.leaves[0]}`, `leaf-${c.leaves[1]}`];
		return c.matches as [string, string];
	};

	for (const id of matchIds) {
		const [c1, c2] = childNodeIds(id);
		const a1 = angleOf.get(c1);
		const a2 = angleOf.get(c2);
		const angle = a1 !== undefined && a2 !== undefined ? (a1 + a2) / 2 : 0;
		const ring = ringForMatch(id);
		const rFrac = RING_FRAC[ring];
		const p = polar(angle, rFrac);
		nodes.set(id, {
			id,
			kind: "match",
			matchId: id,
			ring,
			angle,
			rFrac,
			x: p.x,
			y: p.y,
			nodeR: NODE_R[ring],
		});
		angleOf.set(id, angle);
	}

	// 3) Edges: two per match (each child -> the match's winner node).
	const edges: LayoutEdge[] = [];
	for (const id of matchIds) {
		const parent = nodes.get(id)!;
		for (const childId of childNodeIds(id)) {
			const child = nodes.get(childId)!;
			edges.push({
				id: `${childId}->${id}`,
				childId,
				parentId: id,
				matchId: id,
				d: connectorPath(
					child.angle,
					child.rFrac,
					parent.angle,
					parent.rFrac,
				),
			});
		}
	}

	void byId;
	void RING_ORDER;
	return { nodes, edges, leaves, size: VIEWBOX, center: CENTER };
}

/**
 * Trace a team's route from its leaf inward, following matches it actually won.
 * Returns the ordered node ids and edge ids to highlight, and the deepest match
 * the team reached (for the tooltip / detail).
 */
export interface TeamRoute {
	team: string;
	nodeIds: string[];
	edgeIds: string[];
	matchIds: string[];
	color: string;
}

export function teamRoute(
	bracket: Bracket,
	layout: Layout,
	team: string,
): TeamRoute | null {
	const color =
		bracket.teams.find((t) => t.name === team)?.color ?? "#ffffff";
	// Find the leaf for this team.
	let leafId: string | null = null;
	for (const id of layout.leaves) {
		const n = layout.nodes.get(id)!;
		const m = bracket.matches.find((mm) => mm.id === n.matchId);
		if (!m) continue;
		const name = n.slot === "A" ? m.teamA : m.teamB;
		if (name === team) {
			leafId = id;
			break;
		}
	}
	if (!leafId) return null;

	const nodeIds: string[] = [leafId];
	const edgeIds: string[] = [];
	const matchIds: string[] = [];

	const byId = new Map(bracket.matches.map((m) => [m.id, m]));
	let currentNodeId = leafId;
	let matchId: string | undefined = layout.nodes.get(leafId)!.matchId;

	while (matchId) {
		const m = byId.get(matchId);
		if (!m) break;
		matchIds.push(matchId);
		// Only advance (light the inward edge) if the team actually won.
		if (m.status === "completed" && m.winner === team) {
			edgeIds.push(`${currentNodeId}->${matchId}`);
			nodeIds.push(matchId);
			currentNodeId = matchId;
			matchId = parentMatchOf(matchId);
		} else {
			break; // eliminated here (or match not played yet)
		}
	}

	return { team, nodeIds, edgeIds, matchIds, color };
}

/** The match a given match's winner advances into (inverse of childrenOf). */
export function parentMatchOf(id: string): string | undefined {
	if (id.startsWith("R32")) {
		const k = Number(id.slice(4));
		return `R16-${Math.ceil(k / 2)}`;
	}
	if (id.startsWith("R16")) {
		const k = Number(id.slice(4));
		return `QF-${Math.ceil(k / 2)}`;
	}
	if (id.startsWith("QF")) {
		const k = Number(id.slice(3));
		return `SF-${Math.ceil(k / 2)}`;
	}
	if (id.startsWith("SF")) {
		return "F";
	}
	return undefined;
}

/** Which team currently occupies a match slot, resolving "TBD" cleanly. */
export function slotTeam(m: Match | undefined, slot: "A" | "B"): string {
	if (!m) return "TBD";
	return slot === "A" ? m.teamA : m.teamB;
}
