import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { startingScenario } from "../scenario";
import { applyCommand, runDays } from "../index";
import {
  BANDS, DEFAULT_POLICY, LEDGER_ANCILLARY_USD, LEDGER_SERVICES_USD, PRESETS, bandOf, policyError, productEffect, saturateQuality, satisfactionOf, type ProductPolicy,
} from "./product";
import { productReport } from "./report";

const clone = (p: ProductPolicy): ProductPolicy => structuredClone(p);

describe("product policy effects", () => {
  it("the default policy reproduces the ledger's flat figures and changes nothing else", () => {
    for (const b of BANDS) {
      const e = productEffect(DEFAULT_POLICY, b);
      expect(e.servicesUsdPerPax).toBeCloseTo(LEDGER_SERVICES_USD, 9);
      expect(e.ancillaryUsdPerPax).toBeCloseTo(LEDGER_ANCILLARY_USD, 9);
      expect(e.qualityDelta).toBe(0);
      expect(e.perceivedFareUsd).toBe(0);
      expect(e.crewDelta).toBe(0);
    }
  });

  it("more service costs more and scores higher; less service the opposite", () => {
    const full = productEffect(PRESETS.full, "medium"), low = productEffect(PRESETS.lowcost, "medium"), std = productEffect(DEFAULT_POLICY, "medium");
    expect(full.servicesUsdPerPax).toBeGreaterThan(std.servicesUsdPerPax);
    expect(full.qualityDelta).toBeGreaterThan(0);
    expect(low.servicesUsdPerPax).toBeLessThan(std.servicesUsdPerPax);
    expect(low.qualityDelta).toBeLessThan(0);
    expect(low.crewDelta).toBe(-1);
    expect(full.crewDelta).toBe(1);
  });

  it("fees trade revenue against the price passengers compare, with diminishing revenue at high fees", () => {
    const at = (bag: number) => { const p = clone(DEFAULT_POLICY); p.ancillary.short.bagFee = bag; return productEffect(p, "short"); };
    expect(at(0).ancillaryUsdPerPax).toBeLessThan(at(30).ancillaryUsdPerPax);
    expect(at(0).perceivedFareUsd).toBeLessThan(0);
    expect(at(60).perceivedFareUsd).toBeGreaterThan(0);
    // Take-up falls with the fee: past the revenue peak a higher fee earns less.
    expect(at(150).ancillaryUsdPerPax).toBeLessThan(at(55).ancillaryUsdPerPax);
  });

  it("quality far above the best competitor saturates", () => {
    expect(saturateQuality(0.55, 0.6)).toBe(0.55);
    expect(saturateQuality(0.8, 0.5)).toBeCloseTo(0.54 + 0.26 * 0.25, 9);
    expect(saturateQuality(0.8, null)).toBe(0.8);
  });

  it("satisfaction falls with poor service and steep fees", () => {
    const pax = { short: 1000, medium: 500 };
    expect(satisfactionOf(DEFAULT_POLICY, pax)).toBe(0);
    expect(satisfactionOf(PRESETS.lowcost, pax)).toBeLessThan(-0.3);
    expect(satisfactionOf(PRESETS.full, pax)).toBeGreaterThan(0.2);
  });

  it("validates policies", () => {
    expect(policyError(DEFAULT_POLICY)).toBeNull();
    const bad = clone(DEFAULT_POLICY); bad.ancillary.long.bagFee = -5;
    expect(policyError(bad)).toMatch(/Checked bag/);
    const worse = clone(DEFAULT_POLICY); (worse.service.short as { meal: string }).meal = "caviar";
    expect(policyError(worse)).toMatch(/service is invalid/);
    expect(bandOf(500)).toBe("short");
    expect(bandOf(12000)).toBe("ultra");
  });
});

describe("product policy in the game", () => {
  const base = () => runDays(startingScenario(airports, aircraftTypes, 3, { rivalField: "world" }), 8);

  it("setting the default policy leaves the economics unchanged", () => {
    const s = base();
    const withDefault = applyCommand(s, { kind: "setProductPolicy", policy: clone(DEFAULT_POLICY) }).state;
    const a = runDays(s, 7), b = runDays(withDefault, 7);
    expect(b.world.cash).toBeCloseTo(a.world.cash, 0);
  });

  it("a low-cost product earns more extras, spends less on service, and loses reputation over months", () => {
    const s = base();
    const low = applyCommand(s, { kind: "setProductPolicy", policy: clone(PRESETS.lowcost) });
    expect(low.result.ok).toBe(true);
    const after = runDays(low.state, 120);
    const ref = runDays(s, 120);
    const line = (st: typeof s, key: string) => Object.values(st.routeReports).reduce((t, r) => t + (r.evaluation.lines.find((l) => l.key === key)?.weekly ?? 0), 0);
    const perPax = (st: typeof s, key: string) => line(st, key) / Object.values(st.routeReports).reduce((t, r) => t + r.evaluation.passengersPerWeek, 0);
    expect(perPax(after, "paxServices")).toBeLessThan(perPax(ref, "paxServices"));
    expect(perPax(after, "ancillary")).toBeGreaterThan(perPax(ref, "ancillary"));
    expect(after.product!.reputation).toBeLessThan(-0.1);
    expect(after.product!.history.length).toBeGreaterThan(10);
    // The report shows the comparison with competitors per band.
    const rep = productReport(after);
    expect(rep.some((r) => r.routes > 0 && r.playerScore < 50)).toBe(true);
  }, 120_000);

  it("a policy stays in force as time passes (two game years), through every daily step", () => {
    const pol = clone(DEFAULT_POLICY); pol.service.short.meal = "meal"; pol.ancillary.short.bagFee = 25;
    const after = runDays(applyCommand(base(), { kind: "setProductPolicy", policy: pol }).state, 730);
    expect(after.product!.policy.service.short.meal).toBe("meal");
    expect(after.product!.policy.ancillary.short.bagFee).toBe(25);
  }, 240_000);

  it("refuses an invalid policy", () => {
    const bad = clone(DEFAULT_POLICY); bad.ancillary.short.seatFee = 1e6;
    const r = applyCommand(base(), { kind: "setProductPolicy", policy: bad });
    expect(r.result.ok).toBe(false);
  });
});
