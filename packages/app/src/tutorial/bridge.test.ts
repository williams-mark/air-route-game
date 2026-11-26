import { describe, expect, it } from "vitest";
import { jan1Day } from "@arg/sim";
import { RealSimBridge } from "../sim/realBridge";
import { AWARDS, DEREGULATION_DAY, initialTutorial, TUTORIAL_FLEET, TUTORIAL_HUB, TUTORIAL_SEED, TUTORIAL_YEAR, withAwards } from "./script";

const tutorialGame = () => {
  const b = new RealSimBridge({ startPaused: true });
  b.newGame(TUTORIAL_SEED, { hub: TUTORIAL_HUB, startYear: TUTORIAL_YEAR, presentYear: 2026, campaignYears: null, difficulty: "easy", startFleet: TUTORIAL_FLEET, tutorial: initialTutorial(jan1Day(TUTORIAL_YEAR)) });
  b.setSpeed(0);
  return b;
};
const draft = (to: string, typeId = "DC9-30") => ({ origin: TUTORIAL_HUB, destination: to, weeklyFrequency: 14, fares: { Y: 120 }, typeId });

describe("tutorial mode in the bridge", () => {
  it("starts in January 1978 with four aircraft, no routes and regulation on", () => {
    const s = tutorialGame().getState();
    expect(s.day).toBe(jan1Day(TUTORIAL_YEAR));
    expect(s.routes).toHaveLength(0);
    expect(s.fleet).toHaveLength(4);
    expect(s.tutorial).toMatchObject({ step: "intro", deregulated: false, finished: false });
  });

  it("refuses routes the Board has not awarded, and opens awarded ones", () => {
    const b = tutorialGame();
    const refused = b.dispatch({ kind: "openRoute", route: draft("SFO") });
    expect(refused).toMatchObject({ ok: false, error: { code: "regulated" } });
    expect(b.getState().routes).toHaveLength(0);
    b.setTutorial(withAwards(b.getState().tutorial!, AWARDS.award1));
    expect(b.dispatch({ kind: "openRoute", route: draft("PHX") })).toMatchObject({ ok: true });
    expect(b.getState().routes).toHaveLength(1);
  }, 30_000);

  it("pauses on deregulation day when the clock runs into it, then lets any route open", () => {
    const b = tutorialGame();
    b.stepDays(DEREGULATION_DAY - b.getState().day - 3);
    expect(b.getState().tutorial!.deregulated).toBe(false);
    b.setSpeed(5);
    for (let i = 0; i < 10 && b.getState().speed > 0; i++) b.advance(500);
    const s = b.getState();
    expect(s.day).toBe(DEREGULATION_DAY);
    expect(s.speed).toBe(0);
    expect(s.tutorial!.deregulated).toBe(true);
    expect(s.notices.some((n) => /Deregulation Act signed/.test(n.text))).toBe(true);
    expect(b.dispatch({ kind: "openRoute", route: draft("SFO") })).toMatchObject({ ok: true });
  }, 120_000);

  it("keeps the tutorial through a save and load, and a normal game has none", () => {
    const b = tutorialGame();
    b.setTutorial({ ...withAwards(b.getState().tutorial!, AWARDS.award1), step: "clock" });
    const save = b.serialize();
    const other = new RealSimBridge({ startPaused: true });
    expect(other.getState().tutorial).toBeNull();
    other.loadGame(save);
    expect(other.getState().tutorial).toMatchObject({ step: "clock", awarded: ["LAX-PHX"] });
    expect(other.dispatch({ kind: "openRoute", route: draft("SFO") })).toMatchObject({ ok: false });
    other.newGame(5);
    expect(other.getState().tutorial).toBeNull();
  }, 60_000);
});
