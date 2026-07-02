import bracketData from "@/data/bracket.json";
import type { Bracket, Match } from "./types";

export function getBracket(): Bracket {
	return bracketData as Bracket;
}

/** Format a scoreline for display, including a penalty shootout if present. */
export function scoreline(m: Match): string | null {
	if (m.scoreA === null || m.scoreB === null) return null;
	let s = `${m.scoreA}–${m.scoreB}`;
	if (m.penA !== null && m.penB !== null) s += ` (${m.penA}–${m.penB} pens)`;
	return s;
}

export function formatDate(iso: string | null): string {
	if (!iso) return "";
	const [y, mo, d] = iso.split("-").map(Number);
	if (!y || !mo || !d) return iso;
	const months = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];
	return `${d} ${months[mo - 1]} ${y}`;
}

/* ------------------------------------------------------------------ colours */

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace("#", "");
	const v = h.length === 3 ? h.replace(/(.)/g, "$1$1") : h;
	return [
		parseInt(v.slice(0, 2), 16),
		parseInt(v.slice(2, 4), 16),
		parseInt(v.slice(4, 6), 16),
	];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	const l = (max + min) / 2;
	const d = max - min;
	const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
	if (d !== 0) {
		switch (max) {
			case r:
				h = ((g - b) / d) % 6;
				break;
			case g:
				h = (b - r) / d + 2;
				break;
			default:
				h = (r - g) / d + 4;
		}
		h *= 60;
		if (h < 0) h += 360;
	}
	return [h, s, l];
}

/**
 * A vivid version of a national colour that reads well as a glowing line on a
 * near-black background. Very dark navies (France, USA, England) get lifted;
 * everything is pushed to a punchy saturation/lightness band.
 */
export function glowColor(hex: string): string {
	try {
		const [r, g, b] = hexToRgb(hex);
		let [h, s, l] = rgbToHsl(r, g, b);
		s = Math.max(s, 0.62);
		l = Math.min(Math.max(l, 0.56), 0.68);
		return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
	} catch {
		return "#e2e8f0";
	}
}
