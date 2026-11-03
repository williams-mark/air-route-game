import type { Airport } from "@arg/contracts";
import type { ZoomBand } from "./layers";

export interface Px { x: number; y: number }

/** How many airport markers a viewport may hold at this zoom (few at continental zoom, all when close). */
export const markerBudget = (zoom: number): number => Math.max(14, Math.round(6 * 2 ** ((zoom - 2.8) * 1.15)));
/** Minimum screen distance (px) between two markers. */
export const markerSpacing = (band: ZoomBand): number => (band === "far" ? 18 : band === "mid" ? 14 : 26);

export interface LodInput {
  airports: readonly Airport[];
  /** Lower = more important. Airports missing from the map rank last. */
  rank: ReadonlyMap<string, number>;
  /** Airports to consider first (those with routes, selection). */
  priority?: ReadonlySet<string>;
  project: (lon: number, lat: number) => Px;
  width: number;
  height: number;
  spacing: number;
  budget: number;
}

/**
 * Level of detail for airport markers: walk airports by importance and keep one only if it is on screen,
 * at least `spacing` px from every kept marker, and within the zoom budget. Hit-testing sees only kept markers.
 */
export function selectMarkers(inp: LodInput): Set<string> {
  const { airports, rank, priority, project, width, height, spacing, budget } = inp;
  const margin = 24;
  const cands: Array<{ a: Airport; p: Px }> = [];
  for (const a of airports) {
    const p = project(a.lon, a.lat);
    if (p.x < -margin || p.y < -margin || p.x > width + margin || p.y > height + margin) continue;
    cands.push({ a, p });
  }
  const order = (c: { a: Airport }) => (priority?.has(c.a.id) ? 0 : 1);
  cands.sort((x, y) => order(x) - order(y) || (rank.get(x.a.id) ?? 1e9) - (rank.get(y.a.id) ?? 1e9) || (x.a.id < y.a.id ? -1 : 1));
  const keep = new Set<string>();
  const cell = Math.max(1, spacing);
  const grid = new Map<string, Px[]>();
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  const s2 = spacing * spacing;
  for (const { a, p } of cands) {
    if (keep.size >= budget) break;
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell);
    let clash = false;
    for (let dx = -1; dx <= 1 && !clash; dx++) {
      for (let dy = -1; dy <= 1 && !clash; dy++) {
        const bucket = grid.get(key(cx + dx, cy + dy));
        if (bucket) for (const q of bucket) if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 < s2) { clash = true; break; }
      }
    }
    if (clash) continue;
    keep.add(a.id);
    const k = key(cx, cy);
    const b = grid.get(k);
    if (b) b.push(p); else grid.set(k, [p]);
  }
  return keep;
}
