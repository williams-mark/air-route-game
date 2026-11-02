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

describe("rival fare-cut decision cards", () => {
  it("offers match / partial / hold and dispatches updateRoute through decide()", () => {
    const b = mk();
    b.stepDays(40);
    const card = b.getState().decisions.find((d) => /cut .* fares/.test(d.title));
    expect(card).toBeTruthy();
    expect(card!.options.map((o) => o.id)).toEqual(["match", "partial", "hold"]);
    const route = b.getState().routes.find((r) => card!.id.startsWith(`rivalcut-${r.id}@`))!;
    expect(route).toBeTruthy();
    b.decide(card!.id, "match");
    const after = b.getState().routes.find((r) => r.id === route.id)!;
    expect(after.fares.Y).toBeLessThan(route.fares.Y);
    expect(b.getState().decisions.find((d) => d.id === card!.id)).toBeUndefined();
  });
});
