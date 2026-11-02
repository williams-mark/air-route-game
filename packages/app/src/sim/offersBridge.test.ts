import { describe, expect, it } from "vitest";
import { RealSimBridge } from "./realBridge";

const make = () => new RealSimBridge({ startPaused: true, autoPause: false });
/** Step until the snapshot lists an offer. */
function withOffer(kind?: string) {
  const b = make();
  for (let i = 0; i < 40 && !b.getState().offers.some((o) => !kind || o.kind === kind); i++) b.stepDays(30);
  return b;
}

describe("RealSimBridge offers", () => {
  it("exposes open offers in the snapshot and raises feed notices for them", () => {
    const b = withOffer();
    const s = b.getState();
    expect(s.offers.length).toBeGreaterThan(0);
    const o = s.offers[0]!;
    expect(o.typeName).toBeTruthy();
    expect(o.seats).toBeGreaterThan(0);
    expect(s.notices.some((n) => n.text.startsWith("New offer:"))).toBe(true);
  });

  it("acceptOffer dispatches through the sim: deposit charged, order and aircraft appear, feed says Ordered", () => {
    const b = withOffer("endOfLife");
    const o = b.getState().offers.find((x) => x.kind === "endOfLife")!;
    const cash0 = b.getState().cash;
    const orders0 = b.getState().orders.length;
    const res = b.dispatch({ kind: "acceptOffer", offerId: o.id, quantity: 1 });
    expect(res).toMatchObject({ ok: true, offerId: o.id });
    const s = b.getState();
    expect(s.orders).toHaveLength(orders0 + 1);
    expect(s.cash).toBeCloseTo(cash0 - o.unitPriceUsd * o.depositFraction, 0);
    expect(s.fleet.filter((f) => f.status === "delivery").some((f) => f.typeId === o.typeId)).toBe(true);
    expect(s.notices[0]!.text).toMatch(/^Ordered 1 x /);
    expect(s.notices[0]!.severity).toBe("good");
    expect(s.offers.find((x) => x.id === o.id)?.quantity ?? 0).toBe(o.quantity - 1);
  });

  it("returns typed errors and supports dismissOffer", () => {
    const b = withOffer();
    const o = b.getState().offers[0]!;
    expect(b.dispatch({ kind: "acceptOffer", offerId: o.id, quantity: 0 })).toMatchObject({ ok: false, error: { code: "invalid_count" } });
    expect(b.dispatch({ kind: "acceptOffer", offerId: "offer-nope", quantity: 1 })).toMatchObject({ ok: false, error: { code: "unknown_offer" } });
    expect(b.dispatch({ kind: "dismissOffer", offerId: o.id })).toMatchObject({ ok: true });
    expect(b.getState().offers.find((x) => x.id === o.id)).toBeUndefined();
  });

  it("classifies offer and delay notices", async () => {
    const { classifyNotice } = await import("./realBridge");
    expect(classifyNotice("Delivery delayed: order order-3 (B737-8) slips 4 months")).toBe("warn");
    expect(classifyNotice("Offer expiring soon: 3 x A320N closes in 7 days.")).toBe("warn");
    expect(classifyNotice("New offer: Flash sale ...")).toBe("info");
  });
});
