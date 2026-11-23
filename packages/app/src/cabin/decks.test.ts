import { describe, expect, it } from "vitest";
import type { CabinLayout } from "@arg/contracts";
import { deckSpecFor, layoutByDeck, splitLayout } from "./decks";

const seats = (l: CabinLayout) => l.sections.reduce((n, s) => n + s.rows * s.seatsAcross, 0);
const layout: CabinLayout = { sections: [
  { cls: "F", rows: 3, seatsAcross: 4, pitchIn: 80 }, { cls: "J", rows: 8, seatsAcross: 6, pitchIn: 60 }, { cls: "Y", rows: 40, seatsAcross: 10, pitchIn: 31 },
] };

describe("two-deck seat map split", () => {
  it("only the 747 family and the A380 have two decks", () => {
    for (const id of ["B747-100", "B747-200B", "B747SP", "B747-300", "B747-400", "B747-400ER", "B747-8I", "A380-800"]) expect(deckSpecFor(id), id).not.toBeNull();
    for (const id of ["A320", "B777-300ER", "B767-300ER", "DC-10-30"]) expect(deckSpecFor(id), id).toBeNull();
    expect(deckSpecFor("B747-400")!.upperShare).toBeGreaterThan(deckSpecFor("B747-200B")!.upperShare);
  });
  it("every seat is drawn exactly once, front rows upstairs, within the upper deck's length", () => {
    for (const len of [0, 5, 12, 30, 500]) {
      const { upper, main } = splitLayout(layout, len);
      expect(seats(upper) + seats(main)).toBe(seats(layout));
      const used = upper.sections.reduce((m, s) => m + s.rows * s.pitchIn * 0.0254, 0);
      expect(used).toBeLessThanOrEqual(len + 1e-9);
    }
    const { upper, main } = splitLayout(layout, 12);
    expect(upper.sections[0]!.cls).toBe("F");
    expect(main.sections[main.sections.length - 1]!.cls).toBe("Y");
    expect(splitLayout(layout, 0).upper.sections).toEqual([]);
    expect(splitLayout(layout, 500).main.sections).toEqual([]);
  });
});

describe("layout by deck", () => {
  it("draws upper-deck sections upstairs and an older single-list layout entirely on the main deck", () => {
    const explicit: CabinLayout = { sections: [{ cls: "J", rows: 6, seatsAcross: 4, pitchIn: 60, deck: "upper" }, { cls: "Y", rows: 40, seatsAcross: 10, pitchIn: 31 }] };
    const e = layoutByDeck(explicit);
    expect(e.legacy).toBe(false);
    expect(e.upper.sections.map((s) => s.cls)).toEqual(["J"]);
    expect(e.main.sections.map((s) => s.cls)).toEqual(["Y"]);
    const old = layoutByDeck(layout);
    expect(old.legacy).toBe(true);
    expect(old.upper.sections).toEqual([]);
    expect(seats(old.main)).toBe(seats(layout));
  });
  it("the 747 upper deck is drawn narrower than the A380 upper deck", () => {
    expect(deckSpecFor("B747-400")!.upperWidth).toBeLessThan(deckSpecFor("A380-800")!.upperWidth);
    expect(deckSpecFor("B747-400")!.upperWidth).toBeLessThan(0.7);
  });
});
