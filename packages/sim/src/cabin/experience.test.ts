import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import type { AircraftType, CabinLayout, CabinSection, Route } from "@arg/contracts";
import { defaultLayout } from "../fleet/layout";
import { EXPERIENCE_PARAMS, ageServicePenalty, combineExperience, experienceFareMultipliers, experienceProfile } from "./experience";
import { cabinsFor, simulateRouteWeek } from "../route/routeModel";
import type { Aircraft } from "@arg/contracts";
import { applyCommand } from "../commands";
import { startingScenario } from "../scenario";

const type = (id: string): AircraftType => {
  const t = aircraftTypes.find((x) => x.id === id);
  if (!t) throw new Error(`no type ${id}`);
  return t;
};
const widebody = type("B787-9");
const sec = (cls: CabinSection["cls"], rows: number, seatsAcross: number, pitchIn: number): CabinSection => ({ cls, rows, seatsAcross, pitchIn });
/** Business 1-2-1 (4 across) or 2-2-2 (6 across) at 60 in pitch, economy behind it. */
const business = (across: 4 | 6): CabinLayout => ({ sections: [sec("J", 8, across, 60), sec("Y", 20, 9, 31)] });

describe("passenger experience: multiplier", () => {
  it("the reference cabin (default layout, standard service, new aircraft) is neutral: multiplier 1, score 60", () => {
    const ref = defaultLayout(widebody);
    const p = experienceProfile(widebody, ref, 0);
    for (const c of Object.values(p)) {
      expect(c!.fareMultiplier, c!.cls).toBeCloseTo(1, 9);
      expect(c!.score, c!.cls).toBe(EXPERIENCE_PARAMS.referenceScore);
    }
    expect(experienceFareMultipliers(widebody, ref, 0)).toEqual(expect.objectContaining({ Y: 1 }));
  });

  it("economy multiplier stays 1 whatever the service level, age or layout", () => {
    const p = experienceProfile(widebody, business(4), 25, { Y: "basic" });
    expect(p.Y!.fareMultiplier).toBe(1);
    expect(p.Y!.serviceLevel).toBe("basic");
  });

  it("every premium multiplier lies in the bounds 0.85 to 1.25, across all types, classes and service levels", () => {
    const { fareMin, fareMax } = EXPERIENCE_PARAMS;
    for (const t of aircraftTypes) {
      for (const level of ["basic", "standard", "superior"] as const) {
        for (const age of [0, 12, 30]) {
          const layouts = [defaultLayout(t), business(4), business(6)];
          for (const layout of layouts) {
            const prof = experienceProfile(t, layout, age, { F: level, J: level, W: level, Y: level });
            for (const c of Object.values(prof)) {
              expect(c!.fareMultiplier, `${t.id} ${c!.cls} ${level} ${age}y`).toBeGreaterThanOrEqual(fareMin - 1e-9);
              expect(c!.fareMultiplier, `${t.id} ${c!.cls} ${level} ${age}y`).toBeLessThanOrEqual(fareMax + 1e-9);
            }
          }
        }
      }
    }
  });

  it("a business cabin in 1-2-1 with superior service prices above 2-2-2 with standard service", () => {
    const superior121 = experienceProfile(widebody, business(4), 0, { J: "superior" }).J!;
    const standard222 = experienceProfile(widebody, business(6), 0, { J: "standard" }).J!;
    expect(superior121.ratio).toBeGreaterThan(standard222.ratio);
    expect(superior121.fareMultiplier).toBeGreaterThan(standard222.fareMultiplier);
  });

  it("basic service earns less than standard on the same cabin, superior more", () => {
    const at = (l: "basic" | "standard" | "superior") => experienceProfile(widebody, business(4), 0, { J: l }).J!.fareMultiplier;
    expect(at("basic")).toBeLessThan(at("standard"));
    expect(at("superior")).toBeGreaterThan(at("standard"));
  });

  it("aircraft age costs experience only beyond the free years, capped", () => {
    expect(ageServicePenalty(3)).toBe(0);
    expect(ageServicePenalty(EXPERIENCE_PARAMS.ageFreeYears)).toBe(0);
    expect(ageServicePenalty(12)).toBeGreaterThan(0);
    expect(ageServicePenalty(40)).toBeCloseTo(EXPERIENCE_PARAMS.agePenaltyMax, 9);
    const young = experienceProfile(widebody, business(4), 2, { J: "standard" }).J!;
    const old = experienceProfile(widebody, business(4), 20, { J: "standard" }).J!;
    expect(old.ratio).toBeLessThan(young.ratio);
  });

  it("cabinsFor applies the premium multiplier to the fares of a layout and leaves the notional split alone", () => {
    const route: Pick<Route, "fares"> = { fares: { Y: 400, J: 1500 } };
    const ac: Aircraft = {
      id: "ac1", typeId: widebody.id, tailNumber: "T1", layout: business(4), status: "active", ageDays: 0,
      hoursSinceCheck: { A: 0, B: 0, C: 0, D: 0 },
    };
    const sup = cabinsFor(route, widebody, ac, 5000, { J: "superior" }).find((c) => c.cls === "J")!;
    const std = cabinsFor(route, widebody, ac, 5000, { J: "standard" }).find((c) => c.cls === "J")!;
    expect(sup.fare).toBeGreaterThan(std.fare);
    expect(std.fare).toBeCloseTo(1500 * experienceFareMultipliers(widebody, business(4), 0, { J: "standard" }).J!, 6);
    const notional = cabinsFor(route, widebody, undefined, 5000, { J: "superior" }).find((c) => c.cls === "J")!;
    expect(notional.fare).toBe(1500);
  });

  it("combineExperience weights cabins by seats and groups by share", () => {
    const p = experienceProfile(widebody, defaultLayout(widebody), 0);
    const seats = Object.fromEntries(Object.keys(p).map((k) => [k, 10])) as Record<"F" | "J" | "W" | "Y", number>;
    const one = combineExperience([{ weight: 1, seats, profile: p }]);
    expect(one.score).toBeCloseTo(EXPERIENCE_PARAMS.referenceScore, 6);
    expect(combineExperience([]).score).toBe(0);
  });
});

describe("passenger experience: route and command", () => {
  it("the premium fare line of a route rises with superior service and falls with basic, economy unchanged", () => {
    const apMap = new Map(airports.map((a) => [a.id, a]));
    const typeMap = new Map(aircraftTypes.map((t) => [t.id, t]));
    const ac: Aircraft = { id: "ac1", typeId: widebody.id, tailNumber: "T1", layout: business(4), status: "active", ageDays: 0, hoursSinceCheck: { A: 0, B: 0, C: 0, D: 0 } };
    const route: Route = { id: "r1", origin: "LAX", destination: "JFK", weeklyFrequency: 7, fares: { Y: 500, J: 2000 }, typeId: widebody.id };
    const line = (level: "basic" | "superior") => {
      const w = simulateRouteWeek(route, apMap, typeMap, 0, { fleetAircraft: [ac], serviceLevels: { J: level } })!;
      expect(w.evaluation.feasible).toBe(true);
      const f = w.evaluation.lines.find((l) => l.key === "fare_J")!;
      const y = w.evaluation.lines.find((l) => l.key === "fare_Y")!;
      return { j: f.weekly, y: y.weekly, exp: w.experience };
    };
    const sup = line("superior");
    const bas = line("basic");
    expect(sup.j).toBeGreaterThan(bas.j);
    expect(sup.y).toBeCloseTo(bas.y, 6);
    expect(sup.exp.byCabin.J!.serviceLevel).toBe("superior");
    expect(sup.exp.score).toBeGreaterThan(bas.exp.score);
  });
});

describe("setServiceLevel command", () => {
  it("sets one cabin, refuses no-change and unknown levels, and leaves the other cabins at standard", () => {
    const s0 = startingScenario(airports, aircraftTypes, 2015);
    const r1 = applyCommand(s0, { kind: "setServiceLevel", cabin: "J", level: "superior" });
    expect(r1.result.ok).toBe(true);
    expect(r1.state.world.serviceLevels).toEqual({ J: "superior" });
    const r2 = applyCommand(r1.state, { kind: "setServiceLevel", cabin: "J", level: "superior" });
    expect(r2.result.ok).toBe(false);
    if (!r2.result.ok) expect(r2.result.error).toBe("no_change");
    const r3 = applyCommand(r1.state, { kind: "setServiceLevel", cabin: "Y", level: "gold" as never });
    expect(r3.result.ok).toBe(false);
    if (!r3.result.ok) expect(r3.result.error).toBe("invalid_service_level");
  });
});
