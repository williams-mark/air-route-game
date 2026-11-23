import { describe, expect, it } from "vitest";
import type { AircraftType, CabinLayout } from "@arg/contracts";
import { aircraftTypes } from "@arg/data";
import { allowedAcross, deckLengths, validateLayout } from "./rules";
import { upperDeckOf } from "./decks";
import { layoutEffects } from "./effects";
import { suggestLayouts } from "./presets";
import { defaultLayout } from "../fleet/layout";

const T = (id: string): AircraftType => aircraftTypes.find((t) => t.id === id)!;
const across = (id: string, cls: "F" | "J" | "W" | "Y", deck: "main" | "upper") => allowedAcross(T(id), cls, deck).map((o) => o.across);
const codes = (id: string, l: CabinLayout) => validateLayout(T(id), l).errors.map((e) => e.code);

describe("upper deck rules (747 family, A380)", () => {
  it("only the 747 family and the A380 have an upper deck", () => {
    for (const id of ["B747-100", "B747-200B", "B747SP", "B747-300", "B747-400", "B747-400ER", "B747-8I", "A380-800"]) expect(upperDeckOf(T(id)), id).not.toBeNull();
    for (const id of ["A320", "B777-300ER", "B767-300ER"]) expect(upperDeckOf(T(id)), id).toBeNull();
  });

  it("the 747 upper deck is single-aisle: business 2-2 or 1-1, economy 3-3, never the main deck's 10 across", () => {
    expect(across("B747-400", "J", "upper")).toEqual([2, 4]);
    expect(across("B747-400", "F", "upper")).toEqual([2]);
    expect(across("B747-400", "Y", "upper")).toEqual([6]);
    expect(across("B747-400", "Y", "main")).toEqual([10]);
  });

  it("the A380 upper deck is twin-aisle with economy eight across (ten on the main deck)", () => {
    expect(across("A380-800", "Y", "upper")).toEqual([8]);
    expect(across("A380-800", "J", "upper")).toEqual([4, 6]);
    expect(across("A380-800", "Y", "main")).toContain(10);
  });

  it("validates each deck on its own: seats across, length, one section per class per deck", () => {
    const l = deckLengths(T("B747-400"))!;
    const upperJRows = Math.floor(l.upper / (60 * 0.0254));
    const ok: CabinLayout = { sections: [{ cls: "J", rows: upperJRows, seatsAcross: 4, pitchIn: 60, deck: "upper" }, { cls: "Y", rows: 40, seatsAcross: 10, pitchIn: 31 }] };
    expect(codes("B747-400", ok)).toEqual([]);
    expect(codes("B747-400", { sections: [{ ...ok.sections[0]!, seatsAcross: 6 }, ok.sections[1]!] })).toContain("bad_across");
    expect(codes("B747-400", { sections: [{ ...ok.sections[0]!, rows: upperJRows + 3 }, ok.sections[1]!] })).toContain("too_long");
    expect(codes("A320", { sections: [{ cls: "Y", rows: 5, seatsAcross: 6, pitchIn: 30, deck: "upper" }] })).toContain("no_upper_deck");
    // Economy on both decks of an A380 is fine; two economy sections on one deck are not.
    const a380: CabinLayout = { sections: [{ cls: "Y", rows: 20, seatsAcross: 8, pitchIn: 31, deck: "upper" }, { cls: "Y", rows: 40, seatsAcross: 10, pitchIn: 31 }] };
    expect(codes("A380-800", a380)).toEqual([]);
    expect(codes("A380-800", { sections: [a380.sections[1]!, { ...a380.sections[1]!, rows: 2 }] })).toContain("duplicate_class");
    expect(validateLayout(T("A380-800"), a380).decks?.upper.availableM).toBeCloseTo(deckLengths(T("A380-800"))!.upper);
  });

  it("an older layout with no upper-deck section keeps the old single-length rule", () => {
    const legacy: CabinLayout = { sections: [{ cls: "J", rows: 6, seatsAcross: 6, pitchIn: 60 }, { cls: "Y", rows: 45, seatsAcross: 10, pitchIn: 31 }] };
    const v = validateLayout(T("B747-400"), legacy);
    expect(v.ok).toBe(true);
    expect(v.decks).toBeUndefined();
  });

  it("economy eight across upstairs on the A380 gives wider seats than ten across below", () => {
    const fx = (deck: "main" | "upper", n: number) => layoutEffects(T("A380-800"), { sections: [{ cls: "Y", rows: 20, seatsAcross: n, pitchIn: 31, ...(deck === "upper" ? { deck } : {}) }] });
    expect(fx("upper", 8).byClass[0]!.seatWidthIn).toBeGreaterThan(fx("main", 10).byClass[0]!.seatWidthIn);
  });

  it("defaults and presets of two-deck types set up the upper deck and are valid", () => {
    for (const id of ["B747-100", "B747-400", "B747-8I", "A380-800"]) {
      const d = defaultLayout(T(id));
      expect(d.sections.some((s) => s.deck === "upper"), id).toBe(true);
      expect(validateLayout(T(id), d).errors, id).toEqual([]);
      for (const p of suggestLayouts(T(id))) expect(validateLayout(T(id), p.layout).errors, `${id} ${p.id}`).toEqual([]);
    }
    expect(defaultLayout(T("B747-400")).sections.find((s) => s.deck === "upper")).toMatchObject({ cls: "J", seatsAcross: 4 });
  });
});
