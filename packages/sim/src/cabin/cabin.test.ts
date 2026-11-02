import { aircraftTypes, airports as airportsData } from "@arg/data";
import type { AircraftType, CabinLayout } from "@arg/contracts";
import { describe, expect, it } from "vitest";
import { defaultLayout, layoutSeats } from "../fleet/layout";
import { applyCommand } from "../commands";
import { startingScenario } from "../scenario";
import { stepDay } from "../index";
import { simulateRouteWeek } from "../route/routeModel";
import { cabinGeometry } from "./geometry";
import { allowedAcross, validateLayout } from "./rules";
import { allocateByDemand, cabinFillRatios, classDemandShares, layoutEffects } from "./effects";
import { suggestLayouts } from "./presets";
import { refitQuote } from "./refit";

const T = (id: string) => aircraftTypes.find((t) => t.id === id)!;
const a350 = T("A350-900"), a320 = T("A320"), b777 = T("B777-300ER");
const lay = (...s: [CabinLayout["sections"][number]["cls"], number, number, number][]): CabinLayout => ({ sections: s.map(([cls, rows, seatsAcross, pitchIn]) => ({ cls, rows, seatsAcross, pitchIn })) });

describe("geometry", () => {
  it("is wider and longer for widebodies and deterministic", () => {
    expect(cabinGeometry(a350).cabinWidthM).toBeGreaterThan(cabinGeometry(a320).cabinWidthM);
    expect(cabinGeometry(a350).usableLengthM).toBeGreaterThan(cabinGeometry(a320).usableLengthM);
    expect(cabinGeometry(a350)).toEqual(cabinGeometry(a350));
  });
  it("derives a geometry for unknown ids", () => {
    const g = cabinGeometry({ id: "X", widebody: false, maxSeats: 150 });
    expect(g.bodyClass).toBe("narrow");
    expect(g.usableLengthM).toBeGreaterThan(10);
  });
  it("lets the certified maximum fit as all-economy at 28 in for every type", () => {
    for (const t of aircraftTypes) {
      const g = cabinGeometry(t);
      expect(g.usableLengthM, t.id).toBeGreaterThanOrEqual((t.maxSeats / g.maxAbreast) * 28 * 0.0254 * 0.99);
    }
  });
});

describe("validateLayout", () => {
  it("accepts every preset for every type", () => {
    for (const t of aircraftTypes) for (const p of suggestLayouts(t)) {
      const v = validateLayout(t, p.layout);
      expect(v.errors.map((e) => e.message), `${t.id} ${p.id}`).toEqual([]);
    }
  });
  it("rejects too many seats", () => {
    const v = validateLayout(a320, lay(["Y", 40, 6, 28]));
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.code === "too_many_seats")).toBe(true);
  });
  it("rejects rows that do not fit the cabin length", () => {
    const v = validateLayout(a320, lay(["J", 6, 4, 44], ["Y", 24, 6, 36]));
    expect(v.errors.some((e) => e.code === "too_long")).toBe(true);
  });
  it("restricts seats across per class and body", () => {
    expect(allowedAcross(a350, "J").map((o) => o.label)).toEqual(["1-2-1", "2-2-2"]);
    expect(allowedAcross(a320, "J").map((o) => o.across)).toEqual([4, 6]);
    expect(allowedAcross(a320, "Y").map((o) => o.across)).toEqual([6]);
    expect(allowedAcross(a350, "Y").map((o) => o.label)).toEqual(["2-4-2", "3-3-3"]);
    expect(allowedAcross(b777, "Y").map((o) => o.across)).toEqual([9, 10]);
    expect(allowedAcross(T("E175"), "F")).toEqual([]);
    expect(validateLayout(a320, lay(["Y", 30, 8, 31])).errors.some((e) => e.code === "bad_across")).toBe(true);
    expect(validateLayout(b777, lay(["Y", 40, 11, 31])).errors.some((e) => e.code === "bad_across")).toBe(true);
    expect(validateLayout(a320, lay(["F", 2, 2, 60], ["Y", 22, 6, 31])).ok).toBe(true);
    expect(validateLayout(T("E175"), lay(["F", 1, 2, 40], ["Y", 20, 4, 31])).errors.some((e) => e.code === "class_unavailable")).toBe(true);
  });
  it("rejects bad pitch, duplicates and empty layouts", () => {
    expect(validateLayout(a320, lay(["Y", 20, 6, 24])).errors.some((e) => e.code === "bad_pitch")).toBe(true);
    expect(validateLayout(a320, lay(["Y", 10, 6, 31], ["Y", 10, 6, 31])).errors.some((e) => e.code === "duplicate_class")).toBe(true);
    expect(validateLayout(a320, { sections: [] }).errors[0]!.code).toBe("empty_layout");
  });
  it("accepts the game's default layouts for all types except those flagged", () => {
    const bad = aircraftTypes.filter((t) => !validateLayout(t, defaultLayout(t)).ok).map((t) => t.id);
    expect(bad).toEqual(["A220-100", "A220-300", "A350-1000"]); // default uses 6-abreast on the A220 and 10-abreast on the A350-1000 (known issues)
  });
});

describe("layoutEffects", () => {
  const ref = (t: AircraftType) => layoutEffects(t, defaultLayout(t));
  it("is neutral for the default layout", () => {
    for (const t of aircraftTypes) {
      const e = ref(t);
      expect(e.qualityIndex).toBe(0.5);
      expect(e.serviceCostMultiplier).toBeCloseTo(1, 10);
      expect(e.satisfactionDelta).toBe(0);
      expect(e.totalSeats).toBe(layoutSeats(defaultLayout(t)));
      const r = cabinFillRatios(t, defaultLayout(t), 120, { shares: { business: 0.5, leisure: 0.3, vfr: 0.1, budget: 0.1 }, routeKm: 800 });
      expect(Object.values(r).every((x) => x === 1)).toBe(true);
    }
  });
  it("cramming raises seats and lowers comfort, satisfaction and quality", () => {
    const base = defaultLayout(a320);
    const y = base.sections.find((s) => s.cls === "Y")!;
    const tight: CabinLayout = { sections: base.sections.map((s) => (s.cls === "Y" ? { ...s, pitchIn: 28, rows: s.rows + 3 } : s)) };
    const e0 = layoutEffects(a320, base), e1 = layoutEffects(a320, tight);
    expect(y.pitchIn).toBe(31);
    expect(e1.totalSeats).toBeGreaterThan(e0.totalSeats);
    expect(e1.comfortScore).toBeLessThan(e0.comfortScore);
    expect(e1.satisfaction).toBeLessThan(e0.satisfaction);
    expect(e1.qualityIndex).toBeLessThan(e0.qualityIndex);
    expect(e1.costPerSeatIndex).toBeLessThan(1);
  });
  it("more legroom and more premium raise quality and service cost", () => {
    const [dense, std, prem] = suggestLayouts(a350).map((p) => layoutEffects(a350, p.layout));
    expect(dense!.qualityIndex).toBeLessThan(std!.qualityIndex);
    expect(std!.qualityIndex).toBeLessThan(prem!.qualityIndex);
    expect(prem!.premiumShare).toBeGreaterThan(std!.premiumShare);
    expect(prem!.serviceCostMultiplier).toBeGreaterThan(std!.serviceCostMultiplier);
    expect(dense!.totalSeats).toBeGreaterThan(prem!.totalSeats);
  });
  it("is deterministic", () => {
    const l = suggestLayouts(a350)[2]!.layout;
    expect(layoutEffects(a350, l)).toEqual(layoutEffects(a350, l));
  });
  it("over-premium cabins load worse on leisure than on business markets", () => {
    const leisure = { business: 0.1, leisure: 0.7, vfr: 0.1, budget: 0.1 };
    const biz = { business: 0.6, leisure: 0.2, vfr: 0.1, budget: 0.1 };
    const seats = { F: 0, J: 56, W: 0, Y: 200 };
    const served = (sh: typeof biz) => { const d = classDemandShares(sh, 5000); return allocateByDemand(seats, { F: d.F * 250, J: d.J * 250, W: d.W * 250, Y: d.Y * 250 }); };
    expect(served(leisure).J / seats.J).toBeLessThan(served(biz).J / seats.J);
    expect(served(leisure).J / seats.J).toBeLessThan(0.5);
    expect(classDemandShares(biz, 5000).J).toBeGreaterThan(classDemandShares(leisure, 5000).J);
  });
});

describe("route integration", () => {
  const sim = startingScenario(airportsData, aircraftTypes, 1);
  const types = new Map(sim.aircraftTypes.map((t) => [t.id, t]));
  const ap = new Map(sim.airports.map((a) => [a.id, a]));
  const route = sim.world.routes.find((r) => r.origin === "LAX" && r.destination === "HNL")!;
  const ac = sim.world.fleet.find((a) => a.typeId === route.typeId)!;
  const type = types.get(ac.typeId)!;
  const jLoad = (layout: CabinLayout) => {
    const w = simulateRouteWeek(route, ap, types, 100, { fleetAircraft: [{ ...ac, layout }], demandScale: 0.5 })!;
    const j = w.evaluation.lines.find((l) => l.key === "fare_J")!;
    const fare = route.fares.J ?? route.fares.Y * 3.2;
    const seatsJ = layout.sections.find((s) => s.cls === "J")!;
    return j.weekly / fare / (seatsJ.rows * seatsJ.seatsAcross * w.evaluation.flightsPerWeek);
  };
  it("default layout is neutral: quality 0.5 and the ledger's static cabin split", () => {
    expect(layoutEffects(type, ac.layout).qualityIndex).toBe(0.5);
    expect(Object.values(cabinFillRatios(type, ac.layout, 100, { routeKm: 4100 })).every((x) => x === 1)).toBe(true);
  });
  it("an over-premium cabin fills worse than the default business cabin on a leisure route", () => {
    const heavy: CabinLayout = { sections: [{ cls: "J", rows: 12, seatsAcross: 6, pitchIn: 60 }, { cls: "Y", rows: 25, seatsAcross: 9, pitchIn: 31 }] };
    expect(validateLayout(type, heavy).ok).toBe(true);
    expect(jLoad(heavy)).toBeLessThan(jLoad(ac.layout));
  });
});

describe("refit", () => {
  it("quotes per seat with longer downtime for widebodies", () => {
    expect(refitQuote(a320, defaultLayout(a320)).downtimeDays).toBe(5);
    expect(refitQuote(a350, defaultLayout(a350)).downtimeDays).toBe(14);
    expect(refitQuote(a350, suggestLayouts(a350)[2]!.layout).costUsd).toBeGreaterThan(refitQuote(a350, suggestLayouts(a350)[0]!.layout).costUsd);
  });
  it("takes the aircraft out of service, charges cash, installs the layout and returns it", () => {
    const s0 = startingScenario(airportsData, aircraftTypes, 1);
    const ac = s0.world.fleet.find((a) => a.typeId === "A320")!;
    const layout = suggestLayouts(T("A320"))[0]!.layout;
    const { state, result } = applyCommand(s0, { kind: "refitAircraft", aircraftId: ac.id, layout });
    expect(result.ok).toBe(true);
    const after = state.world.fleet.find((a) => a.id === ac.id)!;
    expect(after.status).toBe("maintenance");
    expect(after.layout).toEqual(layout);
    expect(state.world.cash).toBeLessThan(s0.world.cash);
    let s = state;
    for (let i = 0; i < 6; i++) s = stepDay(s);
    expect(s.world.fleet.find((a) => a.id === ac.id)!.status).toBe("active");
    const bad = applyCommand(s0, { kind: "refitAircraft", aircraftId: ac.id, layout: { sections: [] } });
    expect(bad.result.ok).toBe(false);
    expect(applyCommand(s0, { kind: "refitAircraft", aircraftId: "nope", layout }).result.ok).toBe(false);
  });
});
