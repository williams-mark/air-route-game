import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { startingScenario, type SimState } from "@arg/sim";
import { buildOrders } from "./realBridge";

const base = startingScenario(airports, aircraftTypes, 1);
const withOrder = (order: SimState["orders"][number], fleet = base.world.fleet): SimState => ({ ...base, orders: [order], world: { ...base.world, fleet } });
const order = (o: Partial<SimState["orders"][number]>): SimState["orders"][number] => ({
  id: "order-7", typeId: "A330-300", count: 1, orderDay: 700, unitPriceUsd: 132.1e6, discount: 0, depositUsd: 1e7,
  aircraftIds: [], deliveryDays: [], layout: { sections: [] }, ...o,
} as SimState["orders"][number]);

describe("order list", () => {
  it("an old save whose only aircraft has since retired reads as fully delivered, with no NaN dates", () => {
    // Saves from before the fix keep count 1 after the retired aircraft left the order's lists.
    const [o] = buildOrders(withOrder(order({})));
    expect(o!.delivered).toBe(1);
    expect(o!.delivered >= o!.count).toBe(true);
    expect(Number.isFinite(o!.firstDelivery) && Number.isFinite(o!.lastDelivery)).toBe(true);
  });
  it("counts only aircraft still waiting as undelivered", () => {
    const ac = base.world.fleet[0]!;
    const waiting = { ...ac, id: "w1", status: "delivery" as const };
    const [o] = buildOrders(withOrder(order({ count: 3, aircraftIds: [ac.id, "w1"], deliveryDays: [800, 900] }), [...base.world.fleet, waiting]));
    expect(o!.delivered).toBe(2); // one in service, one retired or sold since, one still to come
    expect(o!.firstDelivery).toBe(800);
    expect(o!.lastDelivery).toBe(900);
  });
});
