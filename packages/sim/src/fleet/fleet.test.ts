import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import type { Aircraft, Route } from "@arg/contracts";
import { assign, defaultLayout, MAINTENANCE_PARAMS, newSim, runDays, SCHEDULER_PARAMS, stepDay, type SimState } from "../index";

const A = new Map(airports.map((a) => [a.id, a]));
const T = new Map(aircraftTypes.map((t) => [t.id, t]));
const ctx = { airports: A, types: T };
const ac = (id: string, typeId: string, over: Partial<Aircraft> = {}): Aircraft => ({
  id, typeId, tailNumber: `N${id}`, layout: defaultLayout(T.get(typeId)!), status: "active", ageDays: 1000,
  hoursSinceCheck: { A: 0, B: 0, C: 0, D: 0 }, ...over,
});
const route = (id: string, o: string, d: string, freq: number, typeId: string): Route => ({
  id, origin: o, destination: d, weeklyFrequency: freq, fares: { Y: 150 }, typeId,
});
const fleetOf = (typeId: string, n: number, prefix = typeId) => Array.from({ length: n }, (_, i) => ac(`${prefix}-${i + 1}`, typeId));
const sched = (routes: Route[], fleet: Aircraft[]) => assign(routes, fleet, ctx);

describe("scheduler", () => {
  it("covers a route fully when the fleet is big enough, using whole round trips", () => {
    const r = sched([route("r1", "LAX", "SFO", 42, "B737-800")], fleetOf("B737-800", 3));
    expect(r.routes["r1"]).toMatchObject({ scheduledFrequency: 42, underSupplied: 0, substitutedFrequency: 0 });
    expect(r.routes["r1"]!.aircraftIds.length).toBeLessThanOrEqual(2);
  });

  it("never exceeds the planned block hours per day (narrow 9.5, wide 12.5)", () => {
    const routes = [route("a", "LAX", "SFO", 70, "B737-800"), route("b", "LAX", "HNL", 21, "B777-200ER"), route("c", "LAX", "SAN", 56, "B737-800")];
    const fleet = [...fleetOf("B737-800", 3), ...fleetOf("B777-200ER", 2)];
    const r = sched(routes, fleet);
    for (const a of fleet) {
      const cap = SCHEDULER_PARAMS.blockHoursPerDay[T.get(a.typeId)!.widebody ? "wide" : "narrow"] * 7;
      expect(r.aircraft[a.id]!.blockHoursPerWeek).toBeLessThanOrEqual(cap + 1e-9);
    }
    // a fully loaded widebody flies about 12-13 block hours a day
    const wideHours = fleet.filter((x) => x.typeId === "B777-200ER").map((x) => r.aircraft[x.id]!.blockHoursPerWeek / 7);
    for (const h of wideHours) expect(h).toBeGreaterThan(9);
    expect(Math.max(...wideHours)).toBeLessThanOrEqual(12.5);
  });

  it("reports frequencies it cannot fly as under-supplied", () => {
    const r = sched([route("r1", "LAX", "HNL", 14, "B777-200ER")], fleetOf("B777-200ER", 1));
    expect(r.routes["r1"]!.scheduledFrequency).toBe(7);
    expect(r.routes["r1"]!.underSupplied).toBe(7);
    expect(sched([route("r1", "LAX", "HNL", 14, "B777-200ER")], []).routes["r1"]!.underSupplied).toBe(14);
  });

  it("respects aircraft range and runway: a regional jet cannot take LAX-HNL, a 737-800 cannot serve OGG", () => {
    expect(sched([route("r1", "LAX", "HNL", 7, "E175")], fleetOf("E175", 4)).routes["r1"]!.scheduledFrequency).toBe(0);
    expect(sched([route("r1", "LAX", "OGG", 7, "B737-800")], fleetOf("B737-800", 4)).routes["r1"]!.scheduledFrequency).toBe(0);
  });

  it("substitutes another feasible type of the same size class when the requested type is not available", () => {
    const r = sched([route("r1", "LAX", "HNL", 7, "B777-200ER")], fleetOf("B767-300ER", 2));
    expect(r.routes["r1"]).toMatchObject({ scheduledFrequency: 7, underSupplied: 0, substitutedFrequency: 7 });
    // but never a narrowbody for a widebody route
    expect(sched([route("r1", "LAX", "SFO", 7, "B777-200ER")], fleetOf("B737-800", 2)).routes["r1"]!.scheduledFrequency).toBe(0);
  });

  it("prefers the requested type over substitutes", () => {
    const fleet = [...fleetOf("B767-300ER", 1), ...fleetOf("B777-200ER", 1)];
    const r = sched([route("r1", "LAX", "HNL", 7, "B777-200ER")], fleet);
    expect(r.routes["r1"]!.aircraftIds).toEqual(["B777-200ER-1"]);
    expect(r.routes["r1"]!.substitutedFrequency).toBe(0);
  });

  it("ignores aircraft that are in maintenance, on order or stored", () => {
    const fleet = [ac("a", "B737-800", { status: "maintenance" }), ac("b", "B737-800", { status: "delivery" }), ac("c", "B737-800", { status: "stored" })];
    expect(sched([route("r1", "LAX", "SFO", 7, "B737-800")], fleet).routes["r1"]!.scheduledFrequency).toBe(0);
  });

  it("is deterministic and does not depend on fleet order", () => {
    const routes = [route("a", "LAX", "SFO", 40, "B737-800"), route("b", "LAX", "SAN", 20, "B737-800")];
    const fleet = fleetOf("B737-800", 3);
    expect(JSON.stringify(sched(routes, fleet))).toBe(JSON.stringify(sched(routes, [...fleet].reverse())));
  });
});

// ---------------------------------------------------------------------------
function sim(fleet: Aircraft[], routes: Route[], tweak?: (s: SimState) => void): SimState {
  const s = newSim(11, airports, aircraftTypes, { notionalFleet: false, demandNoise: 0 }, { fleet, routes, cash: 1e9 });
  for (const m of Object.values(s.fleetMeta)) {
    // park every counter far from any due date unless a test sets it
    m.daysSince = { A: 0, B: 0, C: 0, D: 0 };
    m.intervals = { A: 500, B: 180, C: 600, D: 3000 };
  }
  tweak?.(s);
  return s;
}
const status = (s: SimState, id: string) => s.world.fleet.find((a) => a.id === id)!.status;
const notices = (s: SimState) => s.pendingEvents.flatMap((e) => (e.kind === "notice" ? [e.text] : []));

describe("flight hours and cycles", () => {
  it("accumulate from the schedule", () => {
    const fleet = fleetOf("B737-800", 2);
    const s = runDays(sim(fleet, [route("r1", "LAX", "SFO", 42, "B737-800")]), 14);
    const total = s.world.fleet.reduce((sum, a) => sum + a.hoursSinceCheck.A, 0);
    expect(total).toBeCloseTo((s.routeReports["r1"]!.scheduling!.blockHoursPerWeek / 7) * 14, 6);
    const cyc = Object.values(s.fleetMeta).reduce((sum, m) => sum + m.cycles, 0);
    expect(cyc - 2 * 1000 * 4).toBeCloseTo(2 * 42 * 2, 6); // 84 flights a week for two weeks... per week 84 flights x 2 weeks = 168
  });
});

describe("maintenance checks", () => {
  it("A check: after ~500 flight hours it costs money, resets the counter and takes no aircraft out of service", () => {
    const fleet = fleetOf("B737-800", 2);
    let s = sim(fleet, [route("r1", "LAX", "SFO", 42, "B737-800")], (x) => {
      x.world.fleet[0]!.hoursSinceCheck.A = 495;
    });
    let sawA = false;
    for (let d = 0; d < 20 && !sawA; d++) {
      s = stepDay(s);
      if (notices(s).some((t) => t.includes("A check"))) sawA = true;
      expect(s.world.fleet.every((a) => a.status === "active")).toBe(true);
      expect(s.routeReports["r1"]!.scheduling!.underSupplied).toBe(0);
    }
    expect(sawA).toBe(true);
    expect(Math.min(...s.world.fleet.map((a) => a.hoursSinceCheck.A))).toBeLessThan(40);
  });

  it("B check takes the aircraft out for 3 days and a spare covers it", () => {
    const fleet = fleetOf("B737-800", 3);
    let s = sim(fleet, [route("r1", "LAX", "SFO", 42, "B737-800")], (x) => {
      x.fleetMeta["B737-800-1"]!.daysSince.B = 180;
    });
    s = stepDay(s);
    expect(status(s, "B737-800-1")).toBe("maintenance");
    expect(notices(s).some((t) => t.includes("enters B check for 3 days"))).toBe(true);
    expect(s.routeReports["r1"]!.scheduling!.underSupplied).toBe(0);
    s = runDays(s, 2);
    expect(status(s, "B737-800-1")).toBe("maintenance");
    s = stepDay(s); // check started day 0, ends day 3
    expect(status(s, "B737-800-1")).toBe("active");
    expect(notices(s).some((t) => t.includes("back in service"))).toBe(true);
    expect(s.fleetMeta["B737-800-1"]!.daysSince.B).toBeLessThan(3);
  });

  it("C and D checks take 21 and 60 days and cost far more than a B check", () => {
    const run = (kind: "C" | "D", days: number) => {
      let s = sim(fleetOf("B737-800", 2), [route("r1", "LAX", "SAN", 14, "B737-800")], (x) => {
        x.fleetMeta["B737-800-1"]!.daysSince[kind] = x.fleetMeta["B737-800-1"]!.intervals[kind];
      });
      s = stepDay(s);
      expect(status(s, "B737-800-1")).toBe("maintenance");
      const m = s.fleetMeta["B737-800-1"]!.maintenance!;
      expect(m.check).toBe(kind);
      expect(m.endDay - m.startDay).toBe(days);
      s = runDays(s, days - 1);
      expect(status(s, "B737-800-1")).toBe("maintenance");
      s = stepDay(s);
      expect(status(s, "B737-800-1")).toBe("active");
      return m.cost;
    };
    const c = run("C", 21);
    const d = run("D", 60);
    expect(MAINTENANCE_PARAMS.downtimeDays).toEqual({ A: 0, B: 3, C: 21, D: 60 });
    expect(d).toBeGreaterThan(c);
    expect(c).toBeGreaterThan(500_000);
  });

  it("a heavy check resets the lighter ones", () => {
    let s = sim(fleetOf("B737-800", 2), [route("r1", "LAX", "SAN", 14, "B737-800")], (x) => {
      const m = x.fleetMeta["B737-800-1"]!;
      m.daysSince = { A: 0, B: 150, C: 600, D: 100 };
    });
    s = stepDay(s);
    expect(s.fleetMeta["B737-800-1"]!.daysSince).toMatchObject({ B: 0, C: 0 });
    expect(s.fleetMeta["B737-800-1"]!.daysSince.D).toBeGreaterThan(90);
  });

  it("without a spare the check is deferred (flights kept) up to the grace period, then forced with a notice", () => {
    let s = sim(fleetOf("B777-200ER", 2), [route("r1", "LAX", "HNL", 14, "B777-200ER")], (x) => {
      x.fleetMeta["B777-200ER-1"]!.daysSince.B = 180;
    });
    for (let d = 0; d < MAINTENANCE_PARAMS.graceDays; d++) {
      s = stepDay(s);
      expect(status(s, "B777-200ER-1")).toBe("active");
      expect(s.routeReports["r1"]!.scheduling!.underSupplied).toBe(0);
    }
    expect(notices(s).some((t) => t.includes("deferring"))).toBe(true);
    s = stepDay(s);
    expect(status(s, "B777-200ER-1")).toBe("maintenance");
    expect(s.routeReports["r1"]!.scheduling!.underSupplied).toBeGreaterThan(0);
    expect(notices(s).some((t) => t.includes("under-supplied"))).toBe(true);
  });

  it("a substitute type covers a widebody check when its own sister ship is out", () => {
    let s = sim([...fleetOf("B777-200ER", 2), ...fleetOf("B767-300ER", 1)], [route("r1", "LAX", "HNL", 14, "B777-200ER")], (x) => {
      x.fleetMeta["B777-200ER-1"]!.daysSince.B = 180;
    });
    s = stepDay(s);
    expect(status(s, "B777-200ER-1")).toBe("maintenance");
    expect(s.routeReports["r1"]!.scheduling!.underSupplied).toBe(0);
    expect(s.routeReports["r1"]!.scheduling!.substitutedFrequency).toBeGreaterThan(0);
  });

  it("intervals are in the documented ranges for a seeded fleet", () => {
    const s = newSim(3, airports, aircraftTypes, {}, { fleet: fleetOf("B737-800", 20) });
    for (const m of Object.values(s.fleetMeta)) {
      expect(m.intervals.A).toBe(500);
      expect(m.intervals.B).toBe(180);
      expect(m.intervals.C).toBeGreaterThanOrEqual(540);
      expect(m.intervals.C).toBeLessThanOrEqual(720);
      expect(m.intervals.D).toBeGreaterThanOrEqual(6 * 365);
      expect(m.intervals.D).toBeLessThanOrEqual(10 * 365);
    }
  });
});
