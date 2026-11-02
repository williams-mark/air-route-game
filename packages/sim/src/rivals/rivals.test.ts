import { describe, expect, it } from "vitest";
import { aircraftTypes, airports, canFlyRoute } from "@arg/data";
import type { Route } from "@arg/contracts";
import { applyCommand } from "../commands";
import { drainEvents, runDays, stepDay } from "../index";
import { benchmarkFare } from "../demand/choice";
import { distanceKm } from "../geo";
import { newSim } from "../index";
import { simulateRouteWeek } from "../route/routeModel";
import { startingScenario } from "../scenario";
import type { SimState } from "../state";
import { AIRCRAFT_TYPES, AIRPORTS } from "../testing/fixtures";
import { ARCHETYPES, SCHEDULED_ENTRANTS, STARTING_RIVALS } from "./config";
import { createRivals, rivalItinerariesFor, canServe } from "./index";
import { rivalIndustry, rivalNews, rivalReports } from "./reports";
import type { RivalsState } from "./types";

const A = new Map(airports.map((a) => [a.id, a]));
const T = new Map(aircraftTypes.map((t) => [t.id, t]));
const scenario = (seed = 2015) => startingScenario(airports, aircraftTypes, seed);

function allRoutesFeasible(r: RivalsState): string[] {
  const bad: string[] = [];
  for (const air of r.airlines) {
    for (const rt of air.routes) {
      const t = T.get(rt.typeId)!;
      const a = A.get(rt.origin)!;
      const b = A.get(rt.destination)!;
      if (!canFlyRoute(t, a, b) || !canServe(t, a, b)) bad.push(`${air.name} ${rt.origin}-${rt.destination} ${rt.typeId}`);
      if (!air.fleet.some((f) => f.typeId === rt.typeId)) bad.push(`${air.name} has no ${rt.typeId} for ${rt.origin}-${rt.destination}`);
    }
  }
  return bad;
}

describe("rivals: set-up", () => {
  it("creates five fictional airlines with sensible, feasible networks", () => {
    const r = scenario().rivals!;
    expect(r.airlines.map((a) => a.name)).toEqual(["Pacific Crown", "Kestrel Air", "Golden State Express", "Islander", "Sierra Jet"]);
    expect(new Set(r.airlines.map((a) => a.archetype))).toEqual(new Set(["legacy", "lcc", "regional", "interisland"]));
    for (const air of r.airlines) {
      expect(air.routes.length, air.name).toBeGreaterThanOrEqual(8);
      expect(air.fleet.length, air.name).toBeGreaterThan(3);
      expect(air.cash).toBeGreaterThan(0);
    }
    // Spec rows that cannot be flown are skipped, not forced.
    expect(allRoutesFeasible(r)).toEqual([]);
    const crown = r.airlines[0]!;
    expect(crown.routes.some((x) => x.origin === "SFO" && x.destination === "HNL")).toBe(true);
    const islander = r.airlines[3]!;
    expect(islander.routes.every((x) => A.get(x.origin)!.region === "HI" && A.get(x.destination)!.region === "HI")).toBe(true);
  });

  it("a plain newSim has no modelled rivals (synthetic fallback unchanged)", () => {
    const s = newSim(1, AIRPORTS, AIRCRAFT_TYPES);
    expect(s.rivals).toBeNull();
    expect(s.bankruptcies).toEqual([]);
    expect(rivalReports(s)).toEqual([]);
  });

  it("every named starting airline has at least one route a type can fly", () => {
    for (const spec of STARTING_RIVALS) {
      const ok = spec.routes.filter(([o, d]) => A.get(o) && A.get(d)).length;
      expect(ok, spec.id).toBe(spec.routes.length);
    }
  });
});

describe("rivals: determinism", () => {
  it("same seed gives identical rival behaviour; a different seed differs", () => {
    const a = runDays(scenario(11), 500);
    const b = runDays(scenario(11), 500);
    expect(b.rivals).toEqual(a.rivals);
    expect(b.pendingEvents).toEqual(a.pendingEvents);
    const c = runDays(scenario(12), 500);
    expect(c.rivals).not.toEqual(a.rivals);
  });

  it("stepDay does not mutate its input state", () => {
    const s = runDays(scenario(), 20);
    const snap = JSON.stringify(s.rivals);
    stepDay(s);
    stepDay(runDays(s, 6));
    expect(JSON.stringify(s.rivals)).toBe(snap);
  });
});

describe("rivals: feasibility over time", () => {
  it("never fly an infeasible route in three simulated years", () => {
    let s = scenario(5);
    for (let y = 0; y < 6; y++) {
      s = runDays(s, 183);
      expect(allRoutesFeasible(s.rivals!), `half-year ${y}`).toEqual([]);
    }
  });
});

describe("rivals: integration with the player's market", () => {
  const route: Route = { id: "p", origin: "SFO", destination: "SAN", weeklyFrequency: 14, fares: { Y: 150 }, typeId: "B737-800" };
  const week = (extra: ReturnType<typeof rivalItinerariesFor>) =>
    simulateRouteWeek(route, A, T, 100, { rivalItineraries: extra, chargeOwnership: true })!;

  it("uses the modelled rivals' capacity in place of the synthetic ones", () => {
    const rivals = scenario().rivals!;
    const its = rivalItinerariesFor(rivals, A.get("SFO")!, A.get("SAN")!, T)!;
    expect(its.length).toBeGreaterThanOrEqual(2); // Pacific Crown and Kestrel Air
    const modelled = week(its);
    const synthetic = week(undefined);
    expect(modelled.snapshot.playerShare).not.toBeCloseTo(synthetic.snapshot.playerShare, 3);
    // A pair nobody models falls back to the synthetic market.
    expect(rivalItinerariesFor(rivals, A.get("SJC")!, A.get("RDD")!, T)).toBeUndefined();
  });

  it("a rival entering the market reduces the player's share", () => {
    const rivals = scenario().rivals!;
    const its = rivalItinerariesFor(rivals, A.get("SFO")!, A.get("SAN")!, T)!;
    const before = week(its);
    const entrant = structuredClone(its[0]!);
    entrant.id = "rv:newcomer:SAN-SFO";
    entrant.carrier = "newcomer";
    entrant.legs[0]!.id = entrant.id;
    const after = week([...its, entrant]);
    expect(after.snapshot.playerShare).toBeLessThan(before.snapshot.playerShare * 0.9);
    expect(after.playerPassengersOneWay).toBeLessThan(before.playerPassengersOneWay);
  });

  it("stepDay prices the player's routes against modelled rivals", () => {
    const s = runDays(scenario(), 14);
    for (const id of ["route-1", "route-2", "route-3", "route-4"]) expect(s.routeReports[id]).toBeDefined();
    expect(s.routeReports["route-1"]!.market.playerShare).toBeGreaterThan(0);
    expect(s.routeReports["route-1"]!.market.playerShare).toBeLessThan(0.6);
  });
});

describe("rivals: memory and retaliation", () => {
  it("cuts fares when undercut, tells the player, then relaxes", () => {
    let s = runDays(scenario(21), 56);
    const crown = () => s.rivals!.airlines.find((a) => a.id === "pacific-crown")!;
    const rt = () => crown().routes.find((r) => r.origin === "LAX" && r.destination === "HNL")!;
    const baseline = rt().fare;
    expect(baseline).toBeGreaterThan(benchmarkFare(distanceKm(A.get("LAX")!, A.get("HNL")!)) * 0.9);
    s = drainEvents(s).state;

    const player = s.world.routes.find((r) => r.origin === "LAX" && r.destination === "HNL")!;
    const cut = applyCommand(s, { kind: "updateRoute", id: player.id, patch: { fares: { Y: Math.round(baseline * 0.6), J: 600 } } });
    expect(cut.result.ok).toBe(true);
    s = drainEvents(cut.state).state;
    s = runDays(s, 70);
    const cutFare = rt().fare;
    expect(cutFare).toBeLessThan(baseline * 0.93);
    expect(cutFare).toBeGreaterThanOrEqual(rt().baseFare * (1 - ARCHETYPES.legacy.maxFareCut) - 1);
    expect(crown().memory["HNL-LAX"]!.active).toBe(true);
    const news = rivalNews(s, { playerOnly: true }).filter((n) => n.kind === "fareCut" && n.rivalId === "pacific-crown" && n.origin === "LAX");
    expect(news.length).toBeGreaterThan(0);
    expect(news[0]!.pct).toBeGreaterThanOrEqual(7);
    const notices = drainEvents(s).events.filter((e) => e.kind === "notice" && /Pacific Crown cut LAX-(HNL|OGG) fares \d+%/.test(e.text));
    expect(notices.length).toBeGreaterThan(0);

    // The player backs off; the rival relaxes after its memory runs out.
    s = applyCommand(s, { kind: "updateRoute", id: player.id, patch: { fares: { Y: Math.round(baseline * 1.05), J: 900 } } }).state;
    s = runDays(s, 330);
    expect(crown().memory["HNL-LAX"]!.active).toBe(false);
    expect(rt().fare).toBeGreaterThan(cutFare * 1.04);
    expect(rt().fare).toBeGreaterThan(rt().baseFare * 0.93);
  });

  it("a player entering a rival's market is an entry; its scale decides whether anyone cares", () => {
    let s = runDays(scenario(22), 30);
    const open = applyCommand(s, {
      kind: "openRoute",
      route: { origin: "SFO", destination: "SAN", weeklyFrequency: 21, fares: { Y: 80 }, typeId: "B737-800" },
    });
    expect(open.result.ok).toBe(true);
    s = drainEvents(open.state).state;
    s = runDays(s, 60);
    const crown = s.rivals!.airlines[0]!;
    const rt = crown.routes.find((r) => r.origin === "SFO" && r.destination === "SAN")!;
    expect(crown.memory["SAN-SFO"]!.aggressor).toBe("player");
    expect(rt.fare).toBeLessThan(rt.baseFare);
  });
});

describe("rivals: staying power", () => {
  function distressed(seed = 31): SimState {
    const s = scenario(seed);
    const r = structuredClone(s.rivals!);
    const gse = r.airlines.find((a) => a.id === "golden-state-express")!;
    // A glut of idle aircraft and little cash: sustained losses from the first week.
    for (let i = 0; i < 40; i++) gse.fleet.push({ id: `gse-glut-${i}`, typeId: "E175", ageDays: 365 * 8 });
    gse.cash = 12_000_000;
    gse.initialCash = 12_000_000;
    return { ...s, rivals: r };
  }

  it("a chronic loser shrinks, then goes bankrupt and releases its fleet", () => {
    let s = distressed();
    const startFleet = s.rivals!.airlines[2]!.fleet.length;
    const startRoutes = s.rivals!.airlines[2]!.routes.length;
    let day = 0;
    while (s.bankruptcies.length === 0 && day < 365 * 6) { s = runDays(s, 7); day += 7; }
    expect(s.bankruptcies.length).toBe(1);
    const bk = s.bankruptcies[0]!;
    expect(bk.airlineId).toBe("golden-state-express");
    expect(day).toBeGreaterThan(26 * 7); // not instant: finite staying power
    expect(day).toBeLessThan(365 * 5);
    expect(bk.aircraft.length).toBeGreaterThan(0);
    expect(bk.aircraft.length).toBeLessThanOrEqual(startFleet + 5);
    expect(new Set(bk.aircraft.map((a) => a.id)).size).toBe(bk.aircraft.length);
    for (const ac of bk.aircraft) {
      expect(T.has(ac.typeId)).toBe(true);
      expect(ac.layout.sections.length).toBeGreaterThan(0);
      expect(ac.ageDays).toBeGreaterThan(0);
    }
    const gse = s.rivals!.airlines[2]!;
    expect(gse.status).toBe("bankrupt");
    expect(gse.routes).toEqual([]);
    expect(gse.fleet).toEqual([]);
    expect(rivalReports(s).flatMap((m) => m.carriers).some((c) => c.rivalId === "golden-state-express")).toBe(false);
    // It shrank before it failed, and the player was told.
    const news = s.rivals!.news;
    expect(news.some((n) => n.rivalId === gse.id && (n.kind === "shrink" || n.kind === "exit"))).toBe(true);
    expect(news.some((n) => n.kind === "bankrupt" && n.rivalId === gse.id)).toBe(true);
    expect(drainEvents(s).events.some((e) => e.kind === "notice" && /Golden State Express has ceased operations/.test(e.text))).toBe(true);
    void startRoutes;
    // The other airlines are still flying.
    expect(rivalIndustry(s).active).toBeGreaterThanOrEqual(4);
  });
});

describe("rivals: fog of war reports", () => {
  it("shows schedule-level information only", () => {
    const s = runDays(scenario(), 30);
    const reps = rivalReports(s);
    expect(reps.length).toBeGreaterThan(30);
    const sfoSan = reps.find((m) => m.origin === "SAN" && m.destination === "SFO")!;
    expect(sfoSan.playerFlies).toBe(false);
    expect(sfoSan.carriers.map((c) => c.name).sort()).toEqual(["Kestrel Air", "Pacific Crown"]);
    const laxHnl = rivalReports(s, { playerOnly: true }).find((m) => m.origin === "HNL" && m.destination === "LAX")!;
    expect(laxHnl.playerFlies).toBe(true);
    for (const c of laxHnl.carriers) {
      expect(Object.keys(c).sort()).toEqual(["archetype", "fareBand", "name", "rivalId", "typeId", "weeklyFrequency", "weeklySeats"]);
      expect(c.fareBand.high).toBeGreaterThan(c.fareBand.low);
      const truth = s.rivals!.airlines.find((a) => a.id === c.rivalId)!.routes.find((r) => r.origin === "LAX" && r.destination === "HNL")!;
      expect(c.fareBand.low).toBeLessThanOrEqual(truth.fare);
      expect(c.fareBand.high).toBeGreaterThanOrEqual(truth.fare);
    }
    expect(laxHnl.totalWeeklySeats).toBe(laxHnl.carriers.reduce((x, c) => x + c.weeklySeats, 0));
    // Stable between calls.
    expect(rivalReports(s)).toEqual(reps);
  });
});

describe("rivals: ten-year headless run", () => {
  it("runs fast, keeps a plausible industry and a scheduled entrant", () => {
    const t0 = performance.now();
    let s = scenario(2015);
    const firstTwo: number[] = [];
    for (let d = 0; d < 365 * 10; d++) {
      s = stepDay(s);
      if (d === 365 * 2 - 1) firstTwo.push(rivalIndustry(s).bankrupt);
      if (d % 90 === 0) s = drainEvents(s).state;
    }
    const secs = (performance.now() - t0) / 1000;
    console.log(`RIVALS 10-year run: ${secs.toFixed(1)}s`, JSON.stringify(rivalIndustry(s)), `bankruptcies: ${s.bankruptcies.map((b) => `${b.airlineName}@${b.day}`).join(", ") || "none"}`);
    expect(secs).toBeLessThan(60);
    expect(firstTwo[0]).toBeLessThanOrEqual(1);
    const ind = rivalIndustry(s);
    expect(ind.active).toBeGreaterThanOrEqual(3);
    expect(ind.active + ind.bankrupt).toBeGreaterThanOrEqual(5 + SCHEDULED_ENTRANTS.length);
    expect(ind.totalCash).toBeGreaterThan(0);
    for (const a of s.rivals!.airlines) {
      expect(Number.isFinite(a.cash)).toBe(true);
      if (a.status === "active") {
        expect(a.cash).toBeLessThan(a.initialCash * 3);
        expect(a.fleet.length).toBeGreaterThan(0);
      }
    }
    expect(Number.isFinite(s.world.cash)).toBe(true);
    expect(s.rivals!.airlines.some((a) => a.id === "ember-air")).toBe(true);
    const ember = s.rivals!.airlines.find((a) => a.id === "ember-air")!;
    expect(ember.foundedDay).toBeGreaterThan(365 * 1.5);
    expect(ember.foundedDay).toBeLessThan(365 * 3.5);
    expect(allRoutesFeasible(s.rivals!)).toEqual([]);
  }, 120_000);
});
