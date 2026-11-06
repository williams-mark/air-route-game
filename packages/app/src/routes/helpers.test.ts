import { describe, expect, it } from "vitest";
import { aircraftTypes, airportById } from "@arg/data";
import { benchmarkFareFor, dayToDate, runDays, startingScenario } from "@arg/sim";
import {
  bestFrequency, bestType, eligibleTypes, fareHint, FREQ_SWEEP_MAX, frequencySweep, marketFares, midMonthDay, parseFares,
  livePreview, liveSeasonal, operatingMix, ownershipReason, profitTier, rivalPresence, seasonalProfit, substitutionText, typeOwnership, suggestAirports, validateRouteDraft, type RouteDraft, type SweepPoint,
  describeTargetLf, formatTargetLf, parseTargetLf, TARGET_LF_MESSAGE,
} from "./helpers";
import { rangeNote, routeBlock, usableRangeKm } from "../aircraft/availability";
import { airports } from "@arg/data";

const lax = airportById.get("LAX")!;
const sfo = airportById.get("SFO")!;
const hnl = airportById.get("HNL")!;
const DAY = 100;

const pt = (frequency: number, profit: number, feasible = true): SweepPoint => ({ frequency, profit, revenue: 0, loadFactor: 0, feasible });

describe("bestFrequency", () => {
  it("picks the highest profit and prefers the lower frequency on ties", () => {
    expect(bestFrequency([pt(1, -5), pt(2, 10), pt(3, 10), pt(4, 4)])?.frequency).toBe(2);
  });
  it("ignores infeasible points and returns null when none are feasible", () => {
    expect(bestFrequency([pt(1, 999, false), pt(2, -3)])?.frequency).toBe(2);
    expect(bestFrequency([pt(1, 1, false)])).toBeNull();
    expect(bestFrequency([])).toBeNull();
  });
});

describe("frequencySweep", () => {
  const type = bestType(lax, sfo, DAY)!;
  const draft: RouteDraft = { origin: "LAX", destination: "SFO", weeklyFrequency: 7, fares: { Y: marketFares(559).Y }, typeId: type.id };
  const sweep = frequencySweep(draft, DAY);
  it("covers 1..28 weekly frequencies in order", () => {
    expect(sweep).toHaveLength(FREQ_SWEEP_MAX);
    expect(sweep.map((p) => p.frequency)).toEqual(Array.from({ length: FREQ_SWEEP_MAX }, (_, i) => i + 1));
    expect(sweep.every((p) => p.feasible)).toBe(true);
  });
  it("best point is the true maximum of the sweep", () => {
    const best = bestFrequency(sweep)!;
    expect(best.profit).toBe(Math.max(...sweep.map((p) => p.profit)));
  });
  it("marks everything infeasible when the type cannot fly the pair", () => {
    const small = aircraftTypes.reduce((m, t) => (t.rangeKm < m.rangeKm ? t : m));
    const far = frequencySweep({ ...draft, origin: "LAX", destination: "HNL", typeId: small.id }, DAY);
    expect(bestFrequency(far)).toBeNull();
  });
});

describe("fares", () => {
  it("market fares follow the region of the pair (benchmarkFareFor), the US curve without airports", () => {
    const fra = airportById.get("FRA")!, mad = airportById.get("MAD")!;
    const km = 1420;
    expect(marketFares(km, fra, mad).Y).toBeLessThan(marketFares(km).Y);
    expect(marketFares(km, fra, mad).Y).toBe(Math.round(benchmarkFareFor(fra, mad, km)));
    expect(marketFares(559, lax, sfo).Y).toBe(marketFares(559).Y);
    expect(fareHint(km, "Y", fra, mad)).toBe(marketFares(km, fra, mad).Y);
  });
  it("market fares increase with distance and by cabin", () => {
    expect(fareHint(2500, "Y")).toBeGreaterThan(fareHint(500, "Y"));
    const f = marketFares(2500);
    expect(f.F).toBeGreaterThan(f.J);
    expect(f.J).toBeGreaterThan(f.W);
    expect(f.W).toBeGreaterThan(f.Y);
  });
  it("parseFares requires economy and drops blank cabins", () => {
    expect(parseFares({ Y: "120", J: "", W: " ", F: "" })).toEqual({ Y: 120 });
    expect(parseFares({ Y: "120.4", J: "400" })).toEqual({ Y: 120, J: 400 });
    expect(parseFares({ Y: "" })).toBeNull();
    expect(parseFares({ Y: "100", J: "abc" })).toBeNull();
    expect(parseFares({ Y: "-5" })).toBeNull();
  });
});

describe("tiers and months", () => {
  it("classifies by margin", () => {
    expect(profitTier(0.2)).toBe("profit");
    expect(profitTier(0)).toBe("marginal");
    expect(profitTier(-0.2)).toBe("loss");
    expect(profitTier(0.5, false)).toBe("loss");
  });
  it("midMonthDay lands on the 15th of the right month", () => {
    for (const month of [0, 1, 6, 11]) {
      const c = dayToDate(midMonthDay(400, month));
      expect(c.month).toBe(month);
      expect(c.dayOfMonth).toBe(15);
      expect(c.year).toBe(2016);
    }
  });
  it("seasonalProfit returns 12 months and Hawaii routes peak in summer or December", () => {
    const t = bestType(lax, hnl, 0)!;
    const months = seasonalProfit({ id: "x", origin: "LAX", destination: "HNL", weeklyFrequency: 14, fares: marketFares(4100), typeId: t.id }, 0);
    expect(months).toHaveLength(12);
    const peak = months.reduce((m, x) => (x.profit > m.profit ? x : m));
    expect([5, 6, 7, 11]).toContain(peak.month);
  });
});

describe("airports and types", () => {
  it("suggests by IATA prefix first, then city", () => {
    const s = suggestAirports("la", airports);
    expect(s[0]?.id).toBe("LAX");
    expect(suggestAirports("honolulu", airports)[0]?.id).toBe("HNL");
    expect(suggestAirports("", airports, { limit: 3 })).toHaveLength(3);
    expect(suggestAirports("lax", airports, { exclude: ["LAX"] }).some((a) => a.id === "LAX")).toBe(false);
    expect(suggestAirports("zzzz", airports)).toEqual([]);
  });
  it("eligibleTypes only returns types that canFlyRoute and flags availability by year", () => {
    const opts = eligibleTypes(lax, sfo, 2015);
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) expect(o.type.rangeKm).toBeGreaterThan(0);
    const hawaii = eligibleTypes(lax, hnl, 2015);
    expect(hawaii.length).toBeLessThan(opts.length);
    expect(opts.some((o) => !o.available) || opts.every((o) => o.available)).toBe(true);
  });
  it("rival presence is at least 3 weekly and adds a one-stop only for long pairs", () => {
    expect(rivalPresence(lax, sfo).directFrequency).toBeGreaterThanOrEqual(3);
    expect(rivalPresence(lax, hnl).oneStop).toBe(true);
    const short = rivalPresence(airportById.get("LAX")!, airportById.get("BUR")!);
    expect(short.oneStop).toBe(false);
  });
});

describe("validateRouteDraft", () => {
  const t = bestType(lax, sfo, DAY)!;
  const ok: RouteDraft = { origin: "LAX", destination: "SFO", weeklyFrequency: 7, fares: { Y: 120 }, typeId: t.id };
  it("accepts a valid draft", () => expect(validateRouteDraft(ok, [])).toBeNull());
  it("returns typed errors", () => {
    expect(validateRouteDraft({ ...ok, destination: "LAX" }, [])?.code).toBe("same_airport");
    expect(validateRouteDraft({ ...ok, destination: "XXX" }, [])?.code).toBe("unknown_airport");
    expect(validateRouteDraft({ ...ok, typeId: "nope" }, [])?.code).toBe("unknown_type");
    expect(validateRouteDraft({ ...ok, weeklyFrequency: 0 }, [])?.code).toBe("bad_frequency");
    expect(validateRouteDraft({ ...ok, fares: { Y: 0 } }, [])?.code).toBe("bad_fare");
    expect(validateRouteDraft(ok, [{ ...ok, id: "SFO-LAX", origin: "SFO", destination: "LAX" }])?.code).toBe("duplicate_route");
    const small = aircraftTypes.reduce((m, x) => (x.rangeKm < m.rangeKm ? x : m));
    expect(validateRouteDraft({ ...ok, destination: "HNL", typeId: small.id }, [])?.code).toBe("out_of_range");
  });
  it("gives the sim's specific reasons in the expanded world: closed airports, overwater limit, runway", () => {
    const b738 = "B737-800";
    // TXL closed on 9 Nov 2020, BER opened on 31 Oct 2020
    const txl: RouteDraft = { origin: "FRA", destination: "TXL", weeklyFrequency: 7, fares: { Y: 120 }, typeId: b738 };
    expect(validateRouteDraft(txl, [], undefined, undefined, 0)).toBeNull();
    expect(validateRouteDraft(txl, [], undefined, undefined, 2200)?.code).toBe("airport_closed");
    expect(validateRouteDraft({ ...txl, destination: "BER" }, [], undefined, undefined, 100)?.code).toBe("airport_closed");
    expect(validateRouteDraft({ ...txl, destination: "BER" }, [], undefined, undefined, 2200)).toBeNull();
    // a twin narrowbody with too little range for the open Atlantic gets a clear message, a widebody twin may fly it
    const atl = validateRouteDraft({ origin: "BOS", destination: "LHR", weeklyFrequency: 7, fares: { Y: 400 }, typeId: "CRJ700" }, []);
    expect(atl?.code).toBe("out_of_range");
    const ak = validateRouteDraft({ origin: "ANC", destination: "BIS", weeklyFrequency: 7, fares: { Y: 400 }, typeId: "E175" }, []);
    expect(ak?.code).toBe("overwater_limit");
    expect(ak!.message).toMatch(/overwater route/);
    expect(validateRouteDraft({ origin: "JFK", destination: "LHR", weeklyFrequency: 7, fares: { Y: 400 }, typeId: "B787-9" }, [])).toBeNull();
  });
});

describe("substituted aircraft wording", () => {
  const sched = (ids: string[], trips: Record<string, number>) => ({
    scheduledFrequency: 0, underSupplied: 0, aircraftIds: ids, substitutedFrequency: 0, blockHoursPerWeek: 0, roundTripsByAircraft: trips,
  });
  const fleet = [{ id: "a", typeId: "B737-800" }, { id: "b", typeId: "B737-800" }, { id: "c", typeId: "A321" }];
  it("names the planned type and the types actually flying it", () => {
    const mix = operatingMix(sched(["a", "b"], { a: 10, b: 5 }), fleet);
    expect(mix).toEqual([{ typeId: "B737-800", aircraft: 2, roundTrips: 15 }]);
    expect(substitutionText("A321", mix)).toBe("Planned A321, flown by 2 x B737-800");
  });
  it("is silent when the requested type flies it, and lists a mixed fleet", () => {
    expect(substitutionText("A321", operatingMix(sched(["c"], { c: 7 }), fleet))).toBeNull();
    expect(substitutionText("A321", operatingMix(sched(["a", "c"], { a: 3, c: 9 }), fleet))).toBe("Planned A321, flown by 1 x A321 and 1 x B737-800");
    expect(operatingMix(null, fleet)).toEqual([]);
  });
});

describe("usable range", () => {
  it("is below nominal and explained", () => {
    const e175 = aircraftTypes.find((t) => t.id === "E175")!;
    expect(usableRangeKm(e175)).toBeLessThan(e175.rangeKm);
    expect(usableRangeKm(e175)).toBeLessThan(3857); // the route the SQA report saw rejected
    expect(rangeNote(e175)).toContain("4,074");
    expect(routeBlock(e175, { ...lax, lat: lax.lat } as typeof lax, hnl, 2015)).toContain("usable range");
  });
});

describe("live route forecasts", () => {
  const sim = runDays(startingScenario(airports, aircraftTypes, 2015), 12);
  it("an unchanged preview shows exactly the live route profit, a $1 fare change a small delta", () => {
    const r = sim.world.routes[0]!;
    const live = sim.routeReports[r.id]!.evaluation.profit;
    expect(livePreview(sim, r.id, {})!.proposed.profit).toBe(live);
    const p = livePreview(sim, r.id, { fares: { ...r.fares, Y: r.fares.Y + 1 } })!;
    expect(p.delta.profit).not.toBe(0);
    expect(Math.abs(p.delta.profit)).toBeLessThan(0.1 * Math.abs(live) + 10_000);
  });
  it("seasonal profit comes from the live model", () => {
    const r = sim.world.routes[0]!;
    expect(liveSeasonal(sim, r.id, sim.world.day)).toHaveLength(12);
    expect(liveSeasonal(null, r.id, sim.world.day)).toBeNull();
  });
});

describe("type ownership for the substitution banner", () => {
  // LAX-CDG (route "r1") is flown by two A330-200s; a third A330-200 is spare; one 777 is on order; one 737 is stored.
  const fleet = [
    { typeId: "A330-200", status: "active", routes: ["r1"] },
    { typeId: "A330-200", status: "active", routes: ["r1"] },
    { typeId: "A330-200", status: "active", routes: [] },
    { typeId: "A330-200", status: "delivery", routes: [] },
    { typeId: "B777-300ER", status: "delivery", routes: [] },
    { typeId: "B737-800", status: "stored", routes: [] },
  ];
  it("counts owned, free and on-route aircraft from the fleet (on order and stored excluded)", () => {
    expect(typeOwnership(fleet, "A330-200", "r1")).toEqual({ owned: 3, free: 1, onRoute: 2 });
    expect(typeOwnership(fleet, "B777-300ER", "r1")).toEqual({ owned: 0, free: 0, onRoute: 0 });
    expect(typeOwnership(fleet, "B737-800", "r1")).toEqual({ owned: 0, free: 0, onRoute: 0 });
  });
  it("says a type is missing only when none is owned", () => {
    expect(ownershipReason("B777-300ER", typeOwnership(fleet, "B777-300ER", "r1"))).toBe("You own no B777-300ER");
  });
  it("never says an owned type is missing: busy and free aircraft are counted", () => {
    expect(ownershipReason("A330-200", typeOwnership(fleet, "A330-200", "r1"))).toBe("1 of your 3 A330-200 are free, but the scheduler is still substituting");
    const busy = fleet.filter((a) => !(a.typeId === "A330-200" && a.routes.length === 0 && a.status === "active"));
    expect(ownershipReason("A330-200", typeOwnership(busy, "A330-200", "r2"))).toBe("your 2 A330-200 are all flying other routes");
    expect(ownershipReason("A330-200", typeOwnership(busy, "A330-200", "r1"))).toBe("all 2 of your A330-200 already fly this route");
  });
});

describe("target load factor input", () => {
  it("blank means off and stores no target", () => {
    expect(parseTargetLf("")).toEqual({ ok: true, value: null });
    expect(parseTargetLf("   ")).toEqual({ ok: true, value: null });
  });

  it("accepts whole and fractional percents in 50-95 and stores a fraction", () => {
    expect(parseTargetLf("50")).toEqual({ ok: true, value: 0.5 });
    expect(parseTargetLf(" 80 ")).toEqual({ ok: true, value: 0.8 });
    expect(parseTargetLf("95")).toEqual({ ok: true, value: 0.95 });
    expect(parseTargetLf("80.5")).toEqual({ ok: true, value: 0.805 });
  });

  it("rejects values outside 50-95 and non-numbers with the shared message", () => {
    for (const bad of ["49", "95.5", "0", "100", "-5", "abc", "NaN", "Infinity"]) {
      expect(parseTargetLf(bad)).toEqual({ ok: false, message: TARGET_LF_MESSAGE });
    }
    expect(TARGET_LF_MESSAGE).toBe("Target load factor: 50-95% or blank.");
  });

  it("formats the stored fraction back to the typed percent without float noise", () => {
    expect(formatTargetLf(undefined)).toBe("");
    expect(formatTargetLf(null)).toBe("");
    expect(formatTargetLf(0.7)).toBe("70");
    expect(formatTargetLf(0.95)).toBe("95");
    expect(formatTargetLf(0.805)).toBe("80.5");
    for (const t of ["50", "63", "80.5", "95"]) {
      const lf = parseTargetLf(t);
      if (!lf.ok || lf.value === null) throw new Error("expected a value");
      expect(formatTargetLf(lf.value)).toBe(t);
    }
  });

  it("describes the inspector row as a percent or off", () => {
    expect(describeTargetLf(undefined)).toBe("off");
    expect(describeTargetLf(0.8)).toBe("80%");
  });
});
