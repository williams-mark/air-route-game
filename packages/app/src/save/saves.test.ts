import { describe, expect, it } from "vitest";
import { stringifySave } from "@arg/sim";
import { RealSimBridge } from "../sim/realBridge";
import { autosaveDue, latestSlot, loadFromSlot, loadText, monthIndex, parseSeed, saveToSlot, startScreenWanted } from "./saves";
import { MemoryStore } from "./store";

const mk = (seed = 2015) => new RealSimBridge({ seed, startPaused: true, autoPause: false });

describe("save / load", () => {
  it("round-trips through a slot and resumes identically to an uninterrupted run", async () => {
    const a = mk();
    a.stepDays(60);
    const store = new MemoryStore();
    expect((await saveToSlot(a, "2", store)).ok).toBe(true);
    const metas = await store.list();
    expect(metas).toHaveLength(1);
    expect(metas[0]).toMatchObject({ slot: "2", day: 60, seed: 2015 });

    const b = mk(999); // different seed: loading must replace everything
    expect((await loadFromSlot(b, "2", store)).ok).toBe(true);
    expect(JSON.stringify(b.simState)).toBe(JSON.stringify({ ...a.simState, pendingEvents: [], events: [] }));
    expect(b.getState().day).toBe(60);
    expect(b.getState().speed).toBe(0);
    expect(b.getState().decisions.map((d) => d.id)).toEqual(a.getState().decisions.map((d) => d.id));
    expect(b.getState().rivals.list.length).toBe(a.getState().rivals.list.length);
    expect(b.getState().offers).toEqual(a.getState().offers);

    a.stepDays(60); b.stepDays(60);
    expect(JSON.stringify(b.simState)).toBe(JSON.stringify(a.simState));
    expect(b.getState().ledger.length).toBe(a.getState().ledger.length);
    expect(b.getState().rivals.markets).toEqual(a.getState().rivals.markets);
  });

  it("reports friendly errors for bad files and empty slots", async () => {
    const b = mk();
    expect(loadText(b, "nope")).toMatchObject({ ok: false });
    const save = b.serialize();
    const r = loadText(b, JSON.stringify({ ...save, version: 99 }));
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/different version/);
    expect((await loadFromSlot(b, "5", new MemoryStore())).ok).toBe(false);
    expect(loadText(b, stringifySave(save)).ok).toBe(true);
  });

  it("autosaves on month change only during continuous play", () => {
    expect(monthIndex(0)).toBe(0);
    expect(autosaveDue(29, 31)).toBe(true); // 31 Jan -> 1 Feb
    expect(autosaveDue(10, 11)).toBe(false);
    expect(autosaveDue(10, 900)).toBe(false); // a load or jump
    expect(autosaveDue(31, 31)).toBe(false);
  });

  it("picks the latest slot, parses seeds and the start-screen query rules", () => {
    const m = (slot: "1" | "auto", savedAt: string) => ({ slot, savedAt, day: 0, cash: 0, airline: "x", seed: 1, appVersion: "t", bytes: 1 });
    expect(latestSlot([m("1", "2026-01-01T00:00:00Z"), m("auto", "2026-02-01T00:00:00Z")])?.slot).toBe("auto");
    expect(latestSlot([])).toBeNull();
    expect([parseSeed("2015"), parseSeed(" 7 "), parseSeed("-1"), parseSeed("abc"), parseSeed("")]).toEqual([2015, 7, null, null, null]);
    expect(startScreenWanted("")).toBe(true);
    for (const q of ["?newgame=1", "?seed=5", "?nostart=1", "?ff=30", "?mock=1", "?paused=1", "?theme=light&nostart=1"]) expect(startScreenWanted(q)).toBe(false);
    expect(startScreenWanted("?theme=light")).toBe(true);
  });
});

describe("damaged saves never break the running game", () => {
  const damaged = (b: RealSimBridge, mutate: (save: any) => void) => {
    const save = JSON.parse(stringifySave(b.serialize()));
    mutate(save);
    return JSON.stringify(save);
  };
  const cases: Array<[string, (s: any) => void]> = [
    ["missing orders", (s) => { delete s.state.orders; }],
    ["route to an unknown airport", (s) => { s.state.world.routes[0].origin = "ZZZ"; }],
    ["fleet aircraft with wrong-typed layout", (s) => { s.state.world.fleet[0].layout = "wide"; }],
    ["order referring to missing aircraft", (s) => { s.state.orders = [{ id: "o", typeId: "A320", count: 1, layout: s.state.world.fleet[0].layout, orderDay: 0, discount: 0, unitPriceUsd: 1, depositUsd: 1, aircraftIds: ["nope"], deliveryDays: [5] }]; }],
    ["missing engine extras", (s) => { delete s.extras.engine; }],
    ["notices of the wrong type", (s) => { s.extras.notices = "hello"; }],
    ["pending cards without commands", (s) => { s.extras.pending = [{ id: "x@1", key: "x", day: 1, expiresDay: 9, title: "t", options: [] }]; }],
    ["ledger rows damaged", (s) => { s.extras.ledger = [{ day: "1" }]; }],
    ["extras not an object", (s) => { s.extras = 7; }],
  ];
  for (const [name, mutate] of cases) {
    it(`rejects "${name}" and leaves the current game usable`, () => {
      const target = mk(2015);
      target.stepDays(30);
      const before = JSON.stringify(target.simState);
      const noticesBefore = target.getState().notices;
      const source = mk(77);
      source.stepDays(30);
      const r = loadText(target, damaged(source, mutate));
      expect(r.ok).toBe(false);
      expect(r.message.length).toBeGreaterThan(10);
      expect(JSON.stringify(target.simState)).toBe(before);
      expect(target.getState().notices).toBe(noticesBefore);
      expect(() => target.stepDays(10)).not.toThrow();
      expect(target.getState().day).toBe(40);
    });
  }

  describe("bad files (text level)", () => {
    const fileCases: Array<[string, (good: string) => string]> = [
      ["corrupt JSON", () => "{not json at all"],
      ["empty file", () => ""],
      ["truncated file", (g) => g.slice(0, Math.floor(g.length / 2))],
      ["wrong version (future)", (g) => JSON.stringify({ ...JSON.parse(g), version: 999 })],
      ["wrong version (string)", (g) => JSON.stringify({ ...JSON.parse(g), version: "1" })],
      ["wrong format tag", (g) => JSON.stringify({ ...JSON.parse(g), format: "other" })],
      ["missing state", (g) => { const o = JSON.parse(g); delete o.state; return JSON.stringify(o); }],
      ["missing world", (g) => { const o = JSON.parse(g); delete o.state.world; return JSON.stringify(o); }],
      ["cash null (NaN serialised)", (g) => { const o = JSON.parse(g); o.state.world.cash = null; return JSON.stringify(o); }],
      ["day negative", (g) => { const o = JSON.parse(g); o.state.world.day = -3; return JSON.stringify(o); }],
    ];
    for (const [name, make] of fileCases) {
      it(`rejects ${name} and keeps the running game`, () => {
        const target = mk(2015);
        target.stepDays(12);
        const before = JSON.stringify(target.simState);
        const src = mk(77);
        src.stepDays(12);
        const r = loadText(target, make(stringifySave(src.serialize())));
        expect(r.ok).toBe(false);
        expect(r.message.length).toBeGreaterThan(10);
        expect(JSON.stringify(target.simState)).toBe(before);
        target.stepDays(3);
        expect(target.getState().day).toBe(15);
      });
    }

    it("loadGame refuses a NaN or Infinity cash passed directly (no JSON round trip) and keeps the game", () => {
      for (const bad of [NaN, Infinity]) {
        const target = mk(2015);
        target.stepDays(5);
        const before = target.getState();
        const save = mk(77).serialize();
        (save.state.world as any).cash = bad;
        expect(() => target.loadGame(save)).toThrow(/damaged/);
        expect(target.getState()).toBe(before);
        target.stepDays(2);
        expect(target.getState().day).toBe(7);
      }
    });
  });

  it("rolls back if initialisation itself throws", () => {
    const target = mk(2015);
    target.stepDays(5);
    const source = mk(77);
    source.stepDays(5);
    const save = source.serialize();
    const before = target.getState();
    // Fail inside initialisation (reset) on the instance; the instance property is removed again below.
    (target as any).reset = () => { throw new Error("boom"); };
    expect(loadText(target, stringifySave(save)).ok).toBe(false);
    expect(target.getState()).toBe(before);
    delete (target as any).reset;
    expect(() => target.stepDays(3)).not.toThrow();
    expect(target.getState().day).toBe(8);
  });

  it("an undamaged save still loads after a failed attempt", () => {
    const target = mk(2015);
    const good = mk(77);
    good.stepDays(20);
    expect(loadText(target, damaged(good, (s) => { delete s.state.orders; })).ok).toBe(false);
    expect(loadText(target, stringifySave(good.serialize())).ok).toBe(true);
    expect(target.getState().day).toBe(20);
  });
});

describe("rival fare-cut decision cards", () => {
  // The fare-cut cards were removed by owner request: rivals no longer raise a card, so the old match/partial/hold flow is gone.
  it("raises no fare-cut card in a game where rivals cut fares", () => {
    const b = mk();
    b.stepDays(40);
    expect(b.getState().decisions.find((d) => /cut .* fares/.test(d.title))).toBeUndefined();
    expect(b.getState().decisions.some((d) => d.id.startsWith("rivalcut-"))).toBe(false);
  });
});
