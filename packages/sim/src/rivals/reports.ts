import type { SimState } from "../state";
import { marketKey } from "./engine";
import type { RivalMarketCarrier, RivalMarketReport, RivalNewsItem } from "./types";

/** Stable pseudo-random in [0,1) from a string (fare bands must not flicker between calls). */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const round5 = (x: number) => Math.max(5, Math.round(x / 5) * 5);

/**
 * Fog-of-war view of the rivals for the UI: per market, who flies it, weekly seats, aircraft type and an estimated fare band.
 * No finances, no cash, no fleet size, no plans. The band is the true fare +/- 7-13%, offset by a stable per-(rival, market)
 * error of up to +/-4%, rounded to 5 USD. Pass `playerOnly` to restrict to markets the player flies.
 */
export function rivalReports(state: Pick<SimState, "rivals" | "world">, opts: { playerOnly?: boolean } = {}): RivalMarketReport[] {
  const rivals = state.rivals;
  if (!rivals) return [];
  const playerKeys = new Set(state.world.routes.map((r) => marketKey(r.origin, r.destination)));
  const byMarket = new Map<string, RivalMarketReport>();
  for (const air of rivals.airlines) {
    if (air.status !== "active") continue;
    for (const rt of air.routes) {
      const key = marketKey(rt.origin, rt.destination);
      if (opts.playerOnly && !playerKeys.has(key)) continue;
      let rep = byMarket.get(key);
      if (!rep) {
        const [o, d] = key.split("-") as [string, string];
        rep = { origin: o, destination: d, carriers: [], totalWeeklySeats: 0, playerFlies: playerKeys.has(key) };
        byMarket.set(key, rep);
      }
      const h = hash01(`${air.id}:${key}`);
      const centre = rt.fare * (0.96 + 0.08 * h);
      const half = 0.07 + 0.06 * hash01(`w:${air.id}:${key}`);
      const seats = rt.frequency * rt.seatsPerFlight;
      const c: RivalMarketCarrier = {
        rivalId: air.id, name: air.name, archetype: air.archetype, weeklyFrequency: rt.frequency, weeklySeats: seats, typeId: rt.typeId,
        fareBand: { low: round5(centre * (1 - half)), high: round5(centre * (1 + half)) },
      };
      rep.carriers.push(c);
      rep.totalWeeklySeats += seats;
    }
  }
  return [...byMarket.values()].sort((x, y) => (x.origin + x.destination < y.origin + y.destination ? -1 : 1));
}

/** Recent rival news for decision cards (newest last); `sinceDay` filters, `playerOnly` keeps player-market items. */
export function rivalNews(state: Pick<SimState, "rivals">, opts: { sinceDay?: number; playerOnly?: boolean } = {}): RivalNewsItem[] {
  return (state.rivals?.news ?? []).filter((n) => n.day >= (opts.sinceDay ?? -Infinity) && (!opts.playerOnly || n.playerMarket || n.kind === "bankrupt" || n.kind === "launch"));
}

export interface RivalIndustrySummary {
  active: number;
  bankrupt: number;
  aircraft: number;
  routes: number;
  /** Debug/test only. */
  totalCash: number;
}

/** Aggregate for tests and debugging. Not part of the player-facing fog-of-war view. */
export function rivalIndustry(state: Pick<SimState, "rivals">): RivalIndustrySummary {
  const out: RivalIndustrySummary = { active: 0, bankrupt: 0, aircraft: 0, routes: 0, totalCash: 0 };
  for (const a of state.rivals?.airlines ?? []) {
    if (a.status === "bankrupt") { out.bankrupt++; continue; }
    out.active++;
    out.aircraft += a.fleet.length;
    out.routes += a.routes.length;
    out.totalCash += a.cash;
  }
  return out;
}
