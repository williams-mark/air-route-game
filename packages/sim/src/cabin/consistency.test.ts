import { aircraftTypes, airports } from "@arg/data";
import { describe, expect, it } from "vitest";
import { applyCommand } from "../commands";
import { defaultLayout, layoutSeats, validateLayout as legacyValidate } from "../fleet/layout";
import { startingScenario } from "../scenario";
import { stepDay } from "../index";
import { validateLayout } from "./rules";
import { sameLayout } from "./refit";

const rich = () => ({ ...startingScenario(airports, aircraftTypes, 3) });
const withCash = (cash: number) => { const s = rich(); return { ...s, world: { ...s.world, cash } }; };

describe("one set of cabin rules", () => {
  it("every default layout validates under the designer rules and the legacy entry point", () => {
    for (const t of aircraftTypes) {
      const l = defaultLayout(t);
      expect(validateLayout(t, l).errors, t.id).toEqual([]);
      expect(legacyValidate(t, l), t.id).toBeNull();
    }
  });

  it("the order command accepts the default for every type and stores exactly that layout", () => {
    for (const t of aircraftTypes) {
      const s = { ...withCash(1e12), world: { ...withCash(1e12).world, day: 365 * 8 } };
      const r = applyCommand(s, { kind: "orderAircraft", typeId: t.id, count: 1, layout: defaultLayout(t) });
      if (!r.result.ok) { expect(r.result.error, t.id).toBe("type_unavailable"); continue; }
      const order = r.state.orders.at(-1)!;
      expect(order.layout, t.id).toEqual(defaultLayout(t));
    }
  });

  it("the order command refuses a layout the designer refuses (six-abreast A220, ten-abreast A350-1000)", () => {
    const a220 = aircraftTypes.find((t) => t.id === "A220-100")!;
    const a350 = aircraftTypes.find((t) => t.id === "A350-1000")!;
    for (const [t, across] of [[a220, 6], [a350, 10]] as const) {
      const layout = { sections: [{ cls: "Y" as const, rows: 10, seatsAcross: across, pitchIn: 30 }] };
      expect(validateLayout(t, layout).ok).toBe(false);
      const s = { ...withCash(1e12), world: { ...withCash(1e12).world, day: 365 * 8 } };
      const r = applyCommand(s, { kind: "orderAircraft", typeId: t.id, count: 1, layout });
      expect(r.result.ok, t.id).toBe(false);
      expect(r.result.ok ? "" : r.result.error).toBe("invalid_layout");
    }
  });
});

describe("refit with an unchanged layout", () => {
  it("is rejected without charging money or grounding the aircraft", () => {
    const s = rich();
    const ac = s.world.fleet.find((a) => a.status === "active")!;
    const r = applyCommand(s, { kind: "refitAircraft", aircraftId: ac.id, layout: structuredClone(ac.layout) });
    expect(r.result.ok).toBe(false);
    expect(r.result.ok ? "" : r.result.error).toBe("no_change");
    expect(r.state).toBe(s);
    expect(sameLayout(ac.layout, structuredClone(ac.layout))).toBe(true);
  });
  it("a changed layout still goes ahead", () => {
    const s = rich();
    const ac = s.world.fleet.find((a) => a.status === "active")!;
    const l = structuredClone(ac.layout);
    l.sections[l.sections.length - 1]!.rows -= 1;
    const r = applyCommand(s, { kind: "refitAircraft", aircraftId: ac.id, layout: l });
    expect(r.result.ok).toBe(true);
    expect(layoutSeats(l)).toBeLessThan(layoutSeats(ac.layout));
  });
});

describe("order discount has a lasting effect", () => {
  it("sets ownershipFactor to net / list and a cheaper order yields a lower daily cost after delivery", () => {
    const base = withCash(1e10);
    const mk = (count: number) => {
      const r = applyCommand(base, { kind: "orderAircraft", typeId: "A320", count, layout: defaultLayout(aircraftTypes.find((t) => t.id === "A320")!) });
      expect(r.result.ok).toBe(true);
      return r.state;
    };
    const one = mk(1);
    const big = mk(20); // larger orders get a bigger volume discount
    const o1 = one.orders.at(-1)!, o20 = big.orders.at(-1)!;
    expect(o20.discount).toBeGreaterThan(o1.discount);
    expect(o1.ownershipFactor).toBeCloseTo(1 - o1.discount, 10);
    expect(o20.ownershipFactor).toBeCloseTo(1 - o20.discount, 10);

    // Paired run: identical single aircraft, one with the list price (factor 1) and one at the discounted factor.
    const full = { ...one, orders: one.orders.map((o) => ({ ...o, ownershipFactor: 1 })) };
    const cheap = { ...one, orders: one.orders.map((o) => ({ ...o, ownershipFactor: 0.7 })) };
    const advance = (st: typeof one) => { for (let i = 0; i < 1200 && st.world.fleet.some((a) => a.status === "delivery"); i++) st = stepDay(st); return st; };
    let a = advance(full), b = advance(cheap);
    expect(a.world.day).toBe(b.world.day);
    expect(a.world.fleet.every((x) => x.status !== "delivery")).toBe(true);
    a = stepDay(a); b = stepDay(b);
    const costA = a.snapshots.at(-1)!.costs, costB = b.snapshots.at(-1)!.costs;
    expect(costB).toBeLessThan(costA);
  });
});
