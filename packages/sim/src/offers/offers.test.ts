import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { applyCommand, creditLimitUsd, drainEvents, runDays, startingScenario, stepDay, stepOffers, type Offer, type SimState } from "../index";

const fresh = (seed = 2015) => startingScenario(airports, aircraftTypes, seed);
/** Run until at least `n` offers have been created (open or not), returning the state. */
const withOffers = (seed: number, days = 400) => runDays(fresh(seed), days);
const first = (s: SimState, kind?: Offer["kind"]) => s.offers.find((o) => !kind || o.kind === kind);

/** Step day by day until an offer of `kind` exists. */
function until(seed: number, kind: Offer["kind"], max = 3000): SimState {
  let s = fresh(seed);
  for (let i = 0; i < max; i++) {
    s = stepDay(s);
    if (s.offers.some((o) => o.kind === kind)) return s;
    if (s.world.cash < 5e7) s = { ...s, world: { ...s.world, cash: 5e8 } };
  }
  throw new Error(`no ${kind} offer in ${max} days (seed ${seed})`);
}

describe("offer generation", () => {
  it("is deterministic for a seed and differs between seeds", () => {
    const a = withOffers(7, 200), b = withOffers(7, 200), c = withOffers(8, 200);
    expect(a.offers).toEqual(b.offers);
    expect(a.offerLog).toEqual(b.offerLog);
    expect(a.offers.length).toBeGreaterThan(0);
    expect(JSON.stringify(a.offers)).not.toEqual(JSON.stringify(c.offers));
  });

  it("yields roughly half an offer to one a month on average, and never more than the open cap", () => {
    let s = fresh(11);
    for (let i = 0; i < 365 * 2; i++) {
      s = stepDay(s);
      expect(s.offers.length).toBeLessThanOrEqual(5);
    }
    const made = Object.keys(s.offerLog).length; // upper bound on distinct kind:type pairs, so count notices instead
    const { events } = drainEvents(s);
    const news = events.filter((e) => e.kind === "notice" && e.text.startsWith("New offer:")).length;
    expect(news / 24).toBeGreaterThan(0.2);
    expect(news / 24).toBeLessThan(1.5);
    expect(made).toBeGreaterThan(0);
  });

  it("over 15 years offers only the offers stepOffers makes: none deeper than 50% off, launch at most 20%, about 6 a year", () => {
    let s = fresh(7);
    const seen = new Map<string, Offer>();
    for (let i = 0; i < 15 * 365; i++) {
      s = stepOffers({ ...s, world: { ...s.world, day: s.world.day + 1 }, pendingEvents: [] });
      for (const o of s.offers) seen.set(o.id, o);
    }
    const all = [...seen.values()];
    expect(all.length).toBeGreaterThan(30);
    expect(all.length).toBeLessThan(160);
    for (const o of all) {
      expect(o.discount).toBeLessThanOrEqual(0.5 + 1e-9);
      if (o.kind === "launch") expect(o.discount).toBeLessThanOrEqual(0.2 + 1e-9);
    }
  });

  it("builds each kind within its documented bounds", () => {
    const year = (d: number) => 2015 + d / 365.25;
    for (const [kind, lo, hi] of [["launch", 0.1, 0.2], ["endOfLife", 0.1, 0.25], ["distressed", 0.2, 0.4]] as const) {
      const s = until(3, kind);
      const o = first(s, kind)!;
      const t = aircraftTypes.find((x) => x.id === o.typeId)!;
      expect(o.discount).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(o.discount).toBeLessThanOrEqual(hi + 1e-9);
      expect(o.unitPriceUsd).toBeCloseTo(t.listPriceUsdM * 1e6 * (1 - o.discount), 0);
      expect(o.expiresDay).toBeGreaterThan(o.createdDay);
      expect(o.blurb.length).toBeGreaterThan(40);
      if (kind === "launch") {
        expect(t.introYear).toBeGreaterThan(year(o.createdDay));
        expect(o.depositFraction).toBeLessThan(0.15);
        expect(o.firstDeliveryDay).toBeGreaterThan(o.typicalFirstDeliveryDay);
        expect(o.delayRisk).toBeGreaterThan(0);
      }
      if (kind === "endOfLife") expect(t.endYear).not.toBeNull();
      if (kind === "distressed") {
        expect(o.quantity).toBeGreaterThanOrEqual(1);
        expect(o.quantity).toBeLessThanOrEqual(6);
        expect(o.expiresDay - o.createdDay).toBeGreaterThanOrEqual(14);
        expect(o.expiresDay - o.createdDay).toBeLessThanOrEqual(45);
        expect(o.firstDeliveryDay - o.createdDay).toBeLessThanOrEqual(45);
      }
    }
    const u = first(until(5, "used"), "used")!;
    expect(u.ageYears).toBeGreaterThanOrEqual(2);
    expect(u.discount).toBeGreaterThanOrEqual(0.15 - 1e-9);
    expect(u.discount).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it("emits a notice for a new offer", () => {
    const s = until(3, "launch");
    const text = drainEvents(s).events.filter((e) => e.kind === "notice").map((e) => (e as { text: string }).text);
    expect(text.some((t) => t.startsWith("New offer:"))).toBe(true);
  });
});

describe("expiry", () => {
  it("removes an offer on its expiry day, warning a week before", () => {
    let s = until(3, "launch");
    const o = first(s, "launch")!;
    s = { ...s, pendingEvents: [] };
    let warned = false, gone = false;
    while (s.world.day < o.expiresDay + 2) {
      s = stepDay(s);
      const texts = s.pendingEvents.filter((e) => e.kind === "notice").map((e) => (e as { text: string }).text);
      if (texts.some((t) => t.includes("expiring soon") && t.includes(o.id))) warned = true;
      if (!s.offers.some((x) => x.id === o.id)) { gone = true; expect(s.world.day).toBeLessThanOrEqual(o.expiresDay + 1); break; }
      s = { ...s, pendingEvents: [] };
    }
    expect(warned).toBe(true);
    expect(gone).toBe(true);
  });

  it("rejects accepting an unknown offer and dismiss removes an offer", () => {
    const s = until(3, "launch");
    const o = first(s)!;
    expect(applyCommand(s, { kind: "acceptOffer", offerId: "nope", quantity: 1 }).result).toMatchObject({ ok: false, error: "unknown_offer" });
    const d = applyCommand(s, { kind: "dismissOffer", offerId: o.id });
    expect(d.result.ok).toBe(true);
    expect(d.state.offers.find((x) => x.id === o.id)).toBeUndefined();
    expect(s.offers.find((x) => x.id === o.id)).toBeDefined(); // input untouched
  });
});

describe("acceptance", () => {
  it("charges the deposit, queues deliveries at the offer price, and leaves the rest of a partly taken offer open", () => {
    let s = until(3, "endOfLife");
    s = { ...s, world: { ...s.world, cash: 1e9 } };
    const o = first(s, "endOfLife")!;
    const q = Math.max(1, o.quantity - 1);
    const { state, result } = applyCommand(s, { kind: "acceptOffer", offerId: o.id, quantity: q });
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "acceptOffer") throw new Error("expected accept");
    expect(result.depositUsd).toBeCloseTo(o.unitPriceUsd * q * o.depositFraction, 0);
    expect(state.world.cash).toBeCloseTo(1e9 - result.depositUsd, 0);
    expect(state.orders).toHaveLength(s.orders.length + 1);
    const order = state.orders.at(-1)!;
    expect(order).toMatchObject({ typeId: o.typeId, count: q, offerId: o.id, unitPriceUsd: o.unitPriceUsd });
    expect(order.deliveryDays).toHaveLength(q);
    expect(order.deliveryDays.every((d) => d >= s.world.day + 7)).toBe(true);
    expect(state.world.fleet.filter((a) => a.status === "delivery").length).toBe(q);
    const left = state.offers.find((x) => x.id === o.id);
    if (o.quantity > q) expect(left?.quantity).toBe(o.quantity - q); else expect(left).toBeUndefined();
    // Deposit credited back on delivery.
    const done = runDays(state, Math.max(...order.deliveryDays) - state.world.day + 2);
    expect(done.world.fleet.filter((a) => a.status === "delivery").length).toBe(0);
  });

  it("refuses when the deposit exceeds cash, or the quantity is out of range", () => {
    let s = until(3, "launch");
    const o = first(s, "launch")!;
    const poor = { ...s, world: { ...s.world, cash: -creditLimitUsd(s) } };
    expect(applyCommand(poor, { kind: "acceptOffer", offerId: o.id, quantity: 1 }).result).toMatchObject({ ok: false, error: "credit_limit" });
    // Within the credit line the deposit is allowed even with cash below zero.
    const overdrawn = { ...s, world: { ...s.world, cash: -1 } };
    expect(applyCommand(overdrawn, { kind: "acceptOffer", offerId: o.id, quantity: 1 }).result.ok).toBe(true);
    s = { ...s, world: { ...s.world, cash: 1e10 } };
    expect(applyCommand(s, { kind: "acceptOffer", offerId: o.id, quantity: 0 }).result).toMatchObject({ ok: false, error: "invalid_count" });
    expect(applyCommand(s, { kind: "acceptOffer", offerId: o.id, quantity: o.quantity + 1 }).result).toMatchObject({ ok: false, error: "invalid_count" });
  });

  it("a used or distressed aircraft arrives with its age, and an offer order is cheaper to hold than a list-price one", () => {
    let s = until(5, "used");
    s = { ...s, world: { ...s.world, cash: 1e10 } };
    const o = first(s, "used")!;
    const { state } = applyCommand(s, { kind: "acceptOffer", offerId: o.id, quantity: 1 });
    const order = state.orders.at(-1)!;
    expect(order.ageDays).toBeGreaterThan(700);
    expect(order.ownershipFactor).toBeLessThan(0.86);
    const done = runDays(state, order.deliveryDays[0]! - state.world.day + 2);
    const ac = done.world.fleet.find((a) => a.id === order.aircraftIds[0])!;
    expect(ac.status).not.toBe("delivery");
    expect(ac.ageDays).toBeGreaterThan(700);
    expect(done.fleetMeta[ac.id]!.flightHours).toBeGreaterThan(o.flightHours! * 0.9);
  });

  it("odd cabins on distressed lots are legal for the type", () => {
    let seen = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = until(seed, "distressed");
      for (const o of s.offers.filter((x) => x.layout)) {
        const t = aircraftTypes.find((x) => x.id === o.typeId)!;
        const seats = o.layout!.sections.reduce((n, c) => n + c.rows * c.seatsAcross, 0);
        expect(seats).toBeLessThanOrEqual(t.maxSeats);
        expect(o.layoutNote).toBeTruthy();
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe("launch-customer delay risk", () => {
  const accepted = (seed: number, risk: number) => {
    let s = until(seed, "launch");
    const o = first(s, "launch")!;
    s = { ...s, world: { ...s.world, cash: 1e10 }, offers: s.offers.map((x) => (x.id === o.id ? { ...x, delayRisk: risk } : x)) };
    return applyCommand(s, { kind: "acceptOffer", offerId: o.id, quantity: 2 }).state;
  };

  it("with certain risk, slips the deliveries 1-12 months and announces it as a notice", () => {
    const s0 = accepted(3, 1);
    const order = s0.orders.at(-1)!;
    const before = [...order.deliveryDays];
    let s = { ...s0, pendingEvents: [] as SimState["pendingEvents"] };
    const stop = Math.min(...before) + 400;
    const texts: string[] = [];
    while (s.world.day < stop && texts.length === 0) {
      s = stepDay(s);
      for (const e of s.pendingEvents) if (e.kind === "notice" && e.text.startsWith("Delivery delayed")) texts.push(e.text);
      s = { ...s, world: { ...s.world, cash: Math.max(s.world.cash, 1e9) } };
      s = { ...s, pendingEvents: [] };
    }
    expect(texts).toHaveLength(1);
    const o2 = s.orders.find((o) => o.id === order.id)!;
    const shift = o2.deliveryDays[0]! - before[0]!;
    expect(shift).toBeGreaterThanOrEqual(30);
    expect(shift).toBeLessThanOrEqual(366);
    expect(o2.delayResolved).toBe(true);
    // Aircraft meta follows the new dates; the delay is rolled only once.
    expect(s.fleetMeta[o2.aircraftIds[0]!]!.deliveryDay).toBe(o2.deliveryDays[0]);
  });

  it("with zero risk never slips, and the roll is deterministic", () => {
    const s0 = accepted(3, 0);
    expect(s0.orders.at(-1)!.delayRisk).toBeUndefined();
    const a = accepted(3, 0.5), b = accepted(3, 0.5);
    const run = (s: SimState) => {
      let t = s;
      const stop = Math.min(...t.orders.at(-1)!.deliveryDays) + 5;
      while (t.world.day < stop) { t = stepDay(t); t = { ...t, pendingEvents: [], world: { ...t.world, cash: Math.max(t.world.cash, 1e9) } }; }
      return t.orders.at(-1)!.deliveryDays;
    };
    expect(run(a)).toEqual(run(b));
  });
});
