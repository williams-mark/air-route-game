import { describe, expect, it } from "vitest";
import { aircraftTypes } from "@arg/data";
import { dayToDate, jan1Day, startFleetError } from "@arg/sim";
import type { Route } from "@arg/contracts";
import {
  advance, AWARDS, DEREGULATION_DAY, deregulateIfDue, finishTutorial, FREQUENCY_ROUTE, initialTutorial, nextStep, pairKey, regulated,
  regulationBlock, STEPS, stepDone, TUTORIAL_FLEET, TUTORIAL_YEAR, tutorialProblem, withAwards, type Progress, type TutorialState,
} from "./script";

const day0 = jan1Day(TUTORIAL_YEAR);
const route = (to: string, f = 14, id = `r-${to}`): Route => ({ id, origin: "LAX", destination: to, weeklyFrequency: f, fares: { Y: 100 }, typeId: "DC9-30" });
const prog = (o: Partial<Progress> = {}): Progress => ({ day: day0, speed: 0, view: "map", selectedRouteId: null, routes: [], ...o });
const at = (step: TutorialState["step"], o: Partial<TutorialState> = {}): TutorialState => ({ ...initialTutorial(day0), step, ...o });

describe("tutorial script", () => {
  it("deregulation falls on 24 October 1978", () => {
    expect(dayToDate(DEREGULATION_DAY)).toMatchObject({ year: 1978, month: 9, dayOfMonth: 24 });
  });

  it("starts with a fleet that is available new in 1978", () => {
    expect(startFleetError(aircraftTypes, TUTORIAL_FLEET, TUTORIAL_YEAR)).toBeNull();
    for (const w of [...AWARDS.award1, ...AWARDS.award2]) expect(TUTORIAL_FLEET.some(([id]) => id === w.typeId)).toBe(true);
  });

  it("refuses route opening under regulation except for awarded pairs, in either direction", () => {
    const t = withAwards(initialTutorial(day0), AWARDS.award1);
    expect(regulated(t)).toBe(true);
    expect(regulationBlock(t, { kind: "openRoute", route: { origin: "LAX", destination: "SFO" } })).toMatch(/Civil Aeronautics Board/);
    expect(regulationBlock(t, { kind: "openCategoryRoute", origin: "LAX", destination: "SFO" })).not.toBeNull();
    expect(regulationBlock(t, { kind: "openRoute", route: { origin: "LAX", destination: "PHX" } })).toBeNull();
    expect(regulationBlock(t, { kind: "openRoute", route: { origin: "PHX", destination: "LAX" } })).toBeNull();
    expect(regulationBlock(t, { kind: "updateRoute" })).toBeNull();
    expect(regulationBlock(null, { kind: "openRoute", route: { origin: "LAX", destination: "SFO" } })).toBeNull();
    expect(regulationBlock({ ...t, deregulated: true }, { kind: "openRoute", route: { origin: "LAX", destination: "SFO" } })).toBeNull();
    expect(regulationBlock(finishTutorial(t), { kind: "openRoute", route: { origin: "LAX", destination: "SFO" } })).toBeNull();
  });

  it("awards are added once", () => {
    const t = withAwards(withAwards(initialTutorial(day0), AWARDS.award1), AWARDS.award1);
    expect(t.awarded).toEqual([pairKey("LAX", "PHX")]);
  });

  it("deregulates on the Act's date and not before", () => {
    const t = initialTutorial(day0);
    expect(deregulateIfDue(t, DEREGULATION_DAY - 1)).toBe(t);
    expect(deregulateIfDue(t, DEREGULATION_DAY).deregulated).toBe(true);
  });

  it("each step finishes on what the player does", () => {
    expect(stepDone(at("intro"), prog())).toBe(false);
    expect(stepDone(at("fleet"), prog({ view: "fleet" }))).toBe(true);
    expect(stepDone(at("award1"), prog())).toBe(false);
    expect(stepDone(at("award1"), prog({ routes: [route("PHX")] }))).toBe(true);
    expect(stepDone(at("clock", { stepDay: day0 }), prog({ day: day0 + 13 }))).toBe(false);
    expect(stepDone(at("clock", { stepDay: day0 }), prog({ day: day0 + 14 }))).toBe(true);
    expect(stepDone(at("inspect"), prog({ routes: [route("PHX")], selectedRouteId: "r-PHX" }))).toBe(true);
    expect(stepDone(at("frequency"), prog({ routes: [route("PHX", FREQUENCY_ROUTE.frequency)] }))).toBe(false);
    expect(stepDone(at("frequency"), prog({ routes: [route("PHX", 21)] }))).toBe(true);
    expect(stepDone(at("award2"), prog({ routes: [route("PHX"), route("SEA")] }))).toBe(false);
    expect(stepDone(at("award2"), prog({ routes: [route("PHX"), route("SEA"), route("LAS")] }))).toBe(true);
    expect(stepDone(at("competitors"), prog({ view: "rivals" }))).toBe(true);
    expect(stepDone(at("deregulation"), prog())).toBe(false);
    expect(stepDone(at("deregulation", { deregulated: true }), prog())).toBe(true);
    const awarded = withAwards(withAwards(at("freeRoute"), AWARDS.award1), AWARDS.award2);
    expect(stepDone(awarded, prog({ routes: [route("PHX"), route("SEA"), route("LAS")] }))).toBe(false);
    expect(stepDone(awarded, prog({ routes: [route("PHX"), route("DEN")] }))).toBe(true);
    expect(stepDone(at("done"), prog())).toBe(false);
  });

  it("advances through steps that are already done, and stops at the first that is not", () => {
    // Deregulation arrived while the player was still on the Finance step: Finance, then Competitors, then Orders must still be visited.
    const t = at("finance", { deregulated: true });
    expect(advance(t, prog({ view: "finance", day: day0 + 5 }))).toMatchObject({ step: "competitors", stepDay: day0 + 5 });
    // Skipping straight past the deregulation step once it has happened.
    expect(advance(at("orders", { deregulated: true }), prog({ view: "orders" })).step).toBe("freeRoute");
    expect(nextStep(at("done"), day0).step).toBe("done");
    expect(STEPS[0]).toBe("intro");
  });

  it("validates saved state", () => {
    expect(tutorialProblem(undefined)).toBeNull();
    expect(tutorialProblem(initialTutorial(day0))).toBeNull();
    expect(tutorialProblem({ ...initialTutorial(day0), step: "nope" })).not.toBeNull();
    expect(tutorialProblem({ ...initialTutorial(day0), awarded: [1] })).not.toBeNull();
    expect(tutorialProblem([])).not.toBeNull();
  });
});
