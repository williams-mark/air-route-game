import { describe, expect, it } from "vitest";
import { clampPos, cornerPos, parseSaved, sortDecisions, unresolvedCount, visibleNotices } from "./dockLogic";

describe("sortDecisions", () => {
  const ds = [{ id: "a", day: 1 }, { id: "b", day: 5 }, { id: "c", day: 3 }];
  it("puts decisions to answer now first, newest first, and snoozed ones last", () => {
    expect(sortDecisions(ds, []).map((d) => d.id)).toEqual(["b", "c", "a"]);
    expect(sortDecisions(ds, ["b"]).map((d) => d.id)).toEqual(["c", "a", "b"]);
  });
  it("does not mutate its input", () => {
    const copy = [...ds];
    sortDecisions(ds, ["a"]);
    expect(ds).toEqual(copy);
  });
});

const bounds = { left: 68, top: 56, right: 1440, bottom: 900 };
const size = { w: 360, h: 300 };

describe("clampPos", () => {
  it("keeps the dock inside the free area, never under the top bar or toolbar", () => {
    expect(clampPos({ x: -50, y: -50 }, size, bounds)).toEqual({ x: 68, y: 56 });
    expect(clampPos({ x: 5000, y: 5000 }, size, bounds)).toEqual({ x: 1080, y: 600 });
    expect(clampPos({ x: 200, y: 200 }, size, bounds)).toEqual({ x: 200, y: 200 });
  });
  it("shrinks gracefully when the dock is larger than the area", () => {
    expect(clampPos({ x: 300, y: 300 }, { w: 2000, h: 2000 }, bounds)).toEqual({ x: 68, y: 56 });
  });
  it("moves out of the way of the time pill", () => {
    const pill = { left: 1000, top: 840, right: 1420, bottom: 880 };
    const p = clampPos({ x: 1070, y: 590 }, size, bounds, [pill]);
    expect(p.y + size.h).toBeLessThanOrEqual(pill.top);
    expect(p.x).toBe(1070);
  });
  it("goes below an obstacle when there is no room above", () => {
    const tall = { w: 300, h: 100 };
    const obstacle = { left: 0, top: 60, right: 2000, bottom: 120 };
    const p = clampPos({ x: 100, y: 70 }, tall, bounds, [obstacle]);
    expect(p.y).toBeGreaterThanOrEqual(obstacle.bottom);
  });
});

describe("cornerPos", () => {
  it("anchors to each corner with a margin", () => {
    expect(cornerPos("bottom-left", size, bounds)).toEqual({ x: 82, y: 586 });
    expect(cornerPos("top-right", size, bounds)).toEqual({ x: 1066, y: 70 });
  });
});

describe("badge and notices", () => {
  it("counts decisions plus unseen offers", () => { expect(unresolvedCount(2, 3)).toBe(5); });
  it("hides cleared notices but not newer ones", () => {
    const ns = [{ id: 9 }, { id: 8 }, { id: 7 }, { id: 3 }];
    expect(visibleNotices(ns, 7).map((n) => n.id)).toEqual([9, 8]);
    expect(visibleNotices(ns, 0, 2).map((n) => n.id)).toEqual([9, 8]);
  });
});

describe("parseSaved", () => {
  it("falls back to defaults on bad input", () => {
    expect(parseSaved(null)).toEqual({ minimized: false, corner: "bottom-left", pos: null });
    expect(parseSaved("not json")).toEqual({ minimized: false, corner: "bottom-left", pos: null });
    expect(parseSaved('{"corner":"nowhere","pos":{"x":"a"}}').corner).toBe("bottom-left");
  });
  it("restores a saved layout", () => {
    expect(parseSaved('{"minimized":true,"corner":"top-right","pos":{"x":10,"y":20}}')).toEqual({ minimized: true, corner: "top-right", pos: { x: 10, y: 20 } });
  });
});
