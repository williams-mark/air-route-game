import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { runDays, startingScenario } from "../index";
import { DIFFICULTY, marketKey, type Difficulty } from "./index";
import { distanceKm } from "../geo";

const start = (difficulty: Difficulty) => startingScenario(airports, aircraftTypes, 2015, { rivalField: "world", difficulty });
const ap = new Map(airports.map((a) => [a.id, a]));

describe("difficulty", () => {
  const games = { easy: start("easy"), medium: start("medium"), hard: start("hard") };

  it("sets starting cash and the size of the field", () => {
    for (const d of ["easy", "medium", "hard"] as const) {
      expect(games[d].world.cash).toBe(DIFFICULTY[d].startingCashUsd);
      expect(games[d].rivals!.airlines.length).toBe(DIFFICULTY[d].intensity.airlines);
    }
    expect(games.easy.world.cash).toBeGreaterThan(games.medium.world.cash);
    expect(games.hard.world.cash).toBeLessThan(games.medium.world.cash);
    expect(games.medium.params.difficulty).toBeUndefined(); // medium is the default and is not stored
    expect(games.hard.params.difficulty).toBe("hard");
  });

  it("medium is the field as calibrated, apart from one airline at the player's hub", () => {
    expect(games.medium.rivals!.intensity).toBeUndefined();
    expect(games.medium.rivals!.airlines.some((a) => a.bases[0] === "LAX")).toBe(true);
  });

  it("hard places airlines at and near the player's hub; easy places none on purpose", () => {
    const lax = ap.get("LAX")!;
    const hubs = (d: Difficulty) => games[d].rivals!.airlines.map((a) => a.bases[0]!);
    expect(hubs("hard").slice(0, 3)[0]).toBe("LAX");
    for (const h of hubs("hard").slice(0, 3)) expect(distanceKm(lax, ap.get(h)!)).toBeLessThan(700);
    expect(games.hard.rivals!.airlines[0]!.overheadDelta).toBeLessThan(0);
    expect(games.easy.rivals!.airlines[0]!.overheadDelta).toBeGreaterThan(0);
  });

  it("the player's starting routes face more competition on hard than on easy", () => {
    const contested = (d: Difficulty) => {
      const s = games[d];
      const flown = new Set(s.rivals!.airlines.flatMap((a) => a.routes.map((r) => marketKey(r.origin, r.destination))));
      return s.world.routes.filter((r) => flown.has(marketKey(r.origin, r.destination))).length;
    };
    expect(contested("hard")).toBeGreaterThan(contested("easy"));
  });

  it("hard rivals expand faster than easy ones over a year", () => {
    const routesAfterYear = (d: Difficulty) => runDays(games[d], 364).rivals!.airlines.reduce((n, a) => n + (a.status === "active" ? a.routes.length : 0), 0);
    const easy = routesAfterYear("easy"), hard = routesAfterYear("hard");
    expect(hard).toBeGreaterThan(easy * 1.3);
  }, 300_000);
});
