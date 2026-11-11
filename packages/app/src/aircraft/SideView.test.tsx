import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Visual } from "@arg/data";
import { GENERIC_VISUAL, SideView } from "./SideView";

// Temporary visuals for the test only; not data.
const V: Record<string, Visual> = {
  twin: { lengthM: 40, wingspanM: 35, layout: "wing2", tail: "conventional" },
  jumbo: { lengthM: 70, wingspanM: 64, layout: "wing4", tail: "conventional", winglets: true, upperDeck: "stretched" },
  rear: { lengthM: 31, wingspanM: 28, layout: "rear2", tail: "t" },
  tri: { lengthM: 46, wingspanM: 33, layout: "rear3", tail: "t" },
  dc10: { lengthM: 55, wingspanM: 50, layout: "wing2+tail", tail: "conventional" },
  turbo: { lengthM: 27, wingspanM: 27, layout: "wing2", tail: "t", prop: true },
};
const render = (visual: Visual | undefined, name = "X", widebody = false) => renderToStaticMarkup(<SideView visual={visual} name={name} widebody={widebody} />);
const count = (html: string, part: string) => (html.match(new RegExp(`data-part="${part}"`, "g")) ?? []).length;
const fuselageLen = (html: string) => Number(/data-length="([\d.]+)"/.exec(html)![1]);

describe("SideView", () => {
  it("is pure: same props, same markup", () => { expect(render(V.twin)).toBe(render(V.twin)); });
  it("draws one engine pair, a conventional white tail and no extras for a wing2 twin", () => {
    const h = render(V.twin);
    expect(count(h, "pod") + count(h, "pod-far")).toBe(2);
    expect(h).toContain('data-tail="conventional"');
    expect(h).toContain('class="sv-tail"');
    for (const p of ["upper-deck", "winglet", "prop"]) expect(count(h, p)).toBe(0);
  });
  it("engine count follows the layout", () => {
    const n = (v: Visual) => { const h = render(v); return count(h, "pod") + count(h, "pod-far"); };
    expect(n(V.jumbo!)).toBe(4);
    expect(n(V.rear!)).toBe(2);
    expect(n(V.tri!)).toBe(3);
    expect(n(V.dc10!)).toBe(3);
    expect(n({ ...V.turbo!, layout: "wing4" })).toBe(4);
  });
  it("draws winglets, upper deck, T-tail and propellers only when asked", () => {
    const j = render(V.jumbo);
    expect(count(j, "winglet")).toBe(1);
    expect(j).toContain('data-deck="stretched"');
    expect(render({ ...V.jumbo!, upperDeck: "short" })).toContain('data-deck="short"');
    expect(render(V.rear)).toContain('data-tail="t"');
    expect(count(render(V.turbo), "prop")).toBe(1);
  });
  it("scales fuselage by length on a shared scale and clamps types longer than the canvas", () => {
    expect(fuselageLen(render(V.jumbo))).toBeGreaterThan(fuselageLen(render(V.twin)));
    expect(fuselageLen(render(V.twin))).toBeCloseTo(40 * 3, 0);
    expect(fuselageLen(render({ ...V.jumbo!, lengthM: 120 }))).toBeLessThanOrEqual(240);
  });
  it("falls back to a generic twin-jet and labels it", () => {
    const h = render(undefined, "B737-800");
    expect(h).toContain('aria-label="Generic twin-jet silhouette for B737-800"');
    expect(h).toContain('data-generic="1"');
    expect(fuselageLen(h)).toBeCloseTo(GENERIC_VISUAL.lengthM * 3, 0);
  });
  it("has a short aria-label with the length for real data", () => {
    expect(render(V.twin, "B737-800")).toContain('aria-label="Side view of B737-800, 40 m long"');
  });
});
