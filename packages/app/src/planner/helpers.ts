// Pure layout math for the fleet planner timeline (no DOM, no React).
import type { Day, Id } from "@arg/contracts";
import { activePin, type DowntimeWindow, type PlannerPin } from "@arg/sim";

export const ROW_H = 26;
export const GROUP_H = 28;
export const AXIS_H = 36;
export const LEFT_W = 270;
export const HORIZONS = [30, 90, 180, 365] as const;
/** Days of history shown left of the today line. */
export const LEAD_DAYS = 10;

export interface Scale { from: Day; to: Day; pxPerDay: number; width: number }

/** Scale for [from, to) drawn into `width` pixels (at least `minPxPerDay` wide per day so 365 days scroll rather than squash). */
export function makeScale(from: Day, to: Day, viewportPx: number, minPxPerDay = 3): Scale {
  const days = Math.max(1, to - from);
  const pxPerDay = Math.max(minPxPerDay, viewportPx / days);
  return { from, to, pxPerDay, width: Math.round(days * pxPerDay) };
}

export const dayX = (sc: Scale, day: Day): number => (day - sc.from) * sc.pxPerDay;
export const xDay = (sc: Scale, x: number): Day => Math.floor(sc.from + x / sc.pxPerDay);

/** Rectangle for [start, end) clipped to the scale, with a minimum visible width; null when entirely outside. */
export function barRect(sc: Scale, start: Day, end: Day, minW = 2): { x: number; w: number } | null {
  const a = Math.max(start, sc.from), b = Math.min(end, sc.to);
  if (b <= a && !(start === end && start >= sc.from && start < sc.to)) return null;
  const x = dayX(sc, a);
  return { x, w: Math.max(minW, (b - a) * sc.pxPerDay) };
}

export interface Tick { x: number; day: Day; major: boolean; label: string }
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Axis ticks: weekly for 30 days, fortnightly for 90, monthly beyond. `dateOf` maps a day to year/month/dayOfMonth. */
export function axisTicks(sc: Scale, dateOf: (d: Day) => { year: number; month: number; dayOfMonth: number }): Tick[] {
  const span = sc.to - sc.from;
  const out: Tick[] = [];
  for (let d = sc.from; d < sc.to; d++) {
    const t = dateOf(d);
    const first = t.dayOfMonth === 1;
    const show = span <= 45 ? d % 7 === 0 : span <= 120 ? t.dayOfMonth === 1 || t.dayOfMonth === 15 : first;
    if (!show) continue;
    out.push({ x: dayX(sc, d), day: d, major: first, label: first ? `${MONTHS[t.month]}${t.month === 0 ? ` ${t.year}` : ""}` : `${t.dayOfMonth}` });
  }
  return out;
}

export interface Seg {
  start: Day;
  end: Day;
  kind: "fly" | "check" | "pre";
  routeId: Id | null;
  /** A pin (standing or time-boxed) decides the route for this stretch. */
  pinned: boolean;
  check?: DowntimeWindow["kind"];
}

/**
 * Bars for one aircraft row between `from` and `to`: waiting for delivery, flying (route = active pin else the route
 * it flies today), or in a check/refit. Adjacent stretches with identical meaning are merged.
 */
export function buildSegments(o: {
  from: Day; to: Day; delivery: Day | null; windows: readonly DowntimeWindow[]; baseRoute: Id | null; pins: readonly PlannerPin[]; today: Day;
}): Seg[] {
  const start = Math.max(o.from, o.today);
  if (o.to <= start) return [];
  const cuts = new Set<Day>([start, o.to]);
  const add = (d: Day) => { if (d > start && d < o.to) cuts.add(d); };
  if (o.delivery !== null) add(o.delivery);
  for (const w of o.windows) { add(w.startDay); add(w.endDay); }
  for (const p of o.pins) { if (p.fromDay !== undefined) add(p.fromDay); if (p.toDay !== undefined) add(p.toDay + 1); }
  const days = [...cuts].sort((a, b) => a - b);
  const out: Seg[] = [];
  for (let i = 0; i + 1 < days.length; i++) {
    const a = days[i]!, b = days[i + 1]!;
    let seg: Seg;
    const win = o.windows.find((w) => w.startDay <= a && a < w.endDay);
    if (o.delivery !== null && a < o.delivery) seg = { start: a, end: b, kind: "pre", routeId: null, pinned: false };
    else if (win) seg = { start: a, end: b, kind: "check", routeId: null, pinned: false, check: win.kind };
    else {
      const pin = activePin(o.pins, a);
      seg = { start: a, end: b, kind: "fly", routeId: pin ? pin.routeId : o.baseRoute, pinned: !!pin };
    }
    const prev = out[out.length - 1];
    if (prev && prev.kind === seg.kind && prev.routeId === seg.routeId && prev.pinned === seg.pinned && prev.check === seg.check && prev.end === seg.start) prev.end = seg.end;
    else out.push(seg);
  }
  return out;
}

export interface PlannerRow<T> { kind: "group" | "aircraft"; key: string; y: number; h: number; group?: string; count?: number; collapsed?: boolean; item?: T }

/** Rows grouped by type (group header, then its aircraft unless collapsed) with y offsets. */
export function layoutRows<T>(groups: ReadonlyArray<{ key: string; items: readonly T[] }>, collapsed: ReadonlySet<string>): { rows: PlannerRow<T>[]; height: number } {
  const rows: PlannerRow<T>[] = [];
  let y = 0;
  for (const g of groups) {
    const c = collapsed.has(g.key);
    rows.push({ kind: "group", key: `g:${g.key}`, y, h: GROUP_H, group: g.key, count: g.items.length, collapsed: c });
    y += GROUP_H;
    if (c) continue;
    for (const [i, item] of g.items.entries()) { rows.push({ kind: "aircraft", key: `a:${g.key}:${i}`, y, h: ROW_H, item, group: g.key }); y += ROW_H; }
  }
  return { rows, height: y };
}

/** Stable colour slot for a route id (index in the route list modulo the palette). */
export const ROUTE_COLORS = 10;
export function routeSlot(routeIds: readonly Id[], id: Id | null): number {
  if (id === null) return -1;
  const i = routeIds.indexOf(id);
  return i < 0 ? -1 : i % ROUTE_COLORS;
}

export function money(n: number): string {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${Math.round(a / 1e3)}k` : `${Math.round(a)}`;
  return `${n < 0 ? "-" : n > 0 ? "+" : ""}$${s}`;
}

/** Summary of a cabin as "F8 J24 Y150". */
export function cabinSummary(layout: { sections: Array<{ cls: string; rows: number; seatsAcross: number }> }): string {
  const by: Record<string, number> = {};
  for (const s of layout.sections) by[s.cls] = (by[s.cls] ?? 0) + s.rows * s.seatsAcross;
  return (["F", "J", "W", "Y"] as const).filter((c) => by[c]).map((c) => `${c}${by[c]}`).join(" ");
}
