import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { playerIndirectUsd, runDays, startingScenario, WORLD_PLAYER_INDIRECT_PCT } from "../index";
import { marketKey, type Difficulty } from "./index";

// Balance probe (22 Nov 2026): a passive player (standard LAX start, no actions) in the world field, seed 2015, two years.
// Before: every starting route ran full at the 1.4x repricing cap with only 1-2 of 4 contested; net margin 42-46% on every
// difficulty (cash 90M -> 425M on hard, 250M -> 656M on easy). After: easy about 16%, medium about 14%, hard about 5%.
const start = (difficulty: Difficulty, rivalField: "world" | "classic" = "world") =>
  startingScenario(airports, aircraftTypes, 2015, { rivalField, difficulty });

describe("passive start in the world field", () => {
  const games = { easy: start("easy"), medium: start("medium"), hard: start("hard") };

  it("rival incumbents fly the player's starting markets on day one, more of them on hard", () => {
    const seats = (d: Difficulty) => {
      const s = games[d];
      const by = new Map<string, number>();
      for (const a of s.rivals!.airlines) for (const r of a.routes) by.set(marketKey(r.origin, r.destination), (by.get(marketKey(r.origin, r.destination)) ?? 0) + r.frequency * r.seatsPerFlight);
      return s.world.routes.map((r) => by.get(marketKey(r.origin, r.destination)) ?? 0);
    };
    for (const d of ["easy", "medium", "hard"] as const) {
      const contested = seats(d).filter((x) => x > 0).length;
      expect(contested, d).toBeGreaterThanOrEqual(3);
    }
    const total = (d: Difficulty) => seats(d).reduce((t, x) => t + x, 0);
    expect(total("hard")).toBeGreaterThan(total("easy"));
    // No airline records the same outstation twice.
    for (const a of games.hard.rivals!.airlines) expect(new Set(a.outstations ?? []).size).toBe((a.outstations ?? []).length);
  });

  it("the indirect cost applies only in the world field", () => {
    expect(playerIndirectUsd(games.medium, 1_000_000)).toBeCloseTo(1_000_000 * WORLD_PLAYER_INDIRECT_PCT);
    expect(playerIndirectUsd(start("medium", "classic"), 1_000_000)).toBe(0);
  });

  it("a passive player earns a plausible margin over two years, easy above medium above hard", () => {
    const margin: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
    for (const d of ["easy", "medium", "hard"] as const) {
      const end = runDays(games[d], 728);
      const days = end.snapshots.slice(-728);
      const rev = days.reduce((t, x) => t + x.revenue, 0), cost = days.reduce((t, x) => t + x.costs, 0);
      margin[d] = (rev - cost) / rev;
      console.log(`PASSIVE ${d}: cash ${(games[d].world.cash / 1e6).toFixed(0)}M -> ${(end.world.cash / 1e6).toFixed(0)}M, net margin ${(margin[d] * 100).toFixed(1)}%`);
      expect(end.world.cash, d).toBeGreaterThan(games[d].world.cash * 0.85);
      expect(end.world.cash, d).toBeLessThan(games[d].world.cash * 1.8);
    }
    expect(margin.easy).toBeGreaterThan(0.08);
    expect(margin.easy).toBeLessThan(0.22);
    expect(margin.medium).toBeGreaterThan(0.04);
    expect(margin.medium).toBeLessThan(0.18);
    expect(margin.hard).toBeGreaterThan(-0.03);
    expect(margin.hard).toBeLessThan(0.1);
    expect(margin.easy).toBeGreaterThan(margin.hard);
    expect(margin.medium).toBeGreaterThan(margin.hard);
  }, 600_000);
});
