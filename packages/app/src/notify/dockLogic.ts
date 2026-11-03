// Pure geometry for the notification dock (unit-tested; no DOM access here).
export interface Pt { x: number; y: number }
export interface Size { w: number; h: number }
export interface Rect { left: number; top: number; right: number; bottom: number }
export type Corner = "bottom-left" | "bottom-right" | "top-left" | "top-right";
export const CORNERS: Corner[] = ["bottom-left", "bottom-right", "top-left", "top-right"];

const overlaps = (a: Rect, b: Rect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/**
 * Keep a dock of `size` fully inside `bounds` (the free area under the top bar and beside the toolbar) and out of the `avoid` rects
 * (time pill ...). If it overlaps one it is moved above it, or below when there is no room above; as a last resort the bounds win.
 */
export function clampPos(pos: Pt, size: Size, bounds: Rect, avoid: readonly Rect[] = [], gap = 8): Pt {
  const maxX = Math.max(bounds.left, bounds.right - size.w);
  const maxY = Math.max(bounds.top, bounds.bottom - size.h);
  let p = { x: Math.min(maxX, Math.max(bounds.left, pos.x)), y: Math.min(maxY, Math.max(bounds.top, pos.y)) };
  for (const r of avoid) {
    const box = (q: Pt): Rect => ({ left: q.x, top: q.y, right: q.x + size.w, bottom: q.y + size.h });
    if (!overlaps(box(p), r)) continue;
    const above = r.top - gap - size.h;
    const below = r.bottom + gap;
    if (above >= bounds.top) p = { ...p, y: above };
    else if (below <= maxY) p = { ...p, y: below };
  }
  return p;
}

/** Top-left position that anchors a dock of `size` to a corner of `bounds`. */
export function cornerPos(corner: Corner, size: Size, bounds: Rect, margin = 14): Pt {
  const x = corner.endsWith("left") ? bounds.left + margin : bounds.right - size.w - margin;
  const y = corner.startsWith("top") ? bounds.top + margin : bounds.bottom - size.h - margin;
  return { x, y };
}

/** Number shown on the badge: pending decisions plus offers the player has not looked at. */
export const unresolvedCount = (decisions: number, unseenOffers: number): number => decisions + unseenOffers;

/** Decisions to answer now first (newest first within each group), those put off with "Decide later" after them. Always listed above routine notices. */
export function sortDecisions<T extends { id: string; day: number }>(decisions: readonly T[], snoozed: readonly string[]): T[] {
  const later = (d: T) => (snoozed.includes(d.id) ? 1 : 0);
  return [...decisions].sort((a, b) => later(a) - later(b) || b.day - a.day);
}

/** Notices still shown after "Clear notices" (ids at or below `clearedUpTo` are hidden). */
export function visibleNotices<T extends { id: number }>(notices: readonly T[], clearedUpTo: number, limit = 12): T[] {
  return notices.filter((n) => n.id > clearedUpTo).slice(0, limit);
}

export function parseSaved(raw: string | null): { minimized: boolean; corner: Corner; pos: Pt | null } {
  const d = { minimized: false, corner: "bottom-left" as Corner, pos: null as Pt | null };
  if (!raw) return d;
  try {
    const v = JSON.parse(raw) as Partial<{ minimized: unknown; corner: unknown; pos: unknown }>;
    const pos = v.pos as Partial<Pt> | null | undefined;
    return {
      minimized: v.minimized === true,
      corner: CORNERS.includes(v.corner as Corner) ? (v.corner as Corner) : d.corner,
      pos: pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) ? { x: pos.x!, y: pos.y! } : null,
    };
  } catch { return d; }
}
