import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import {
  applyCommand, defaultLayout, campaignReview, campaignReviewDue, continueEndless, gradeFor, jan1Day, markCampaignReview, parseSave, makeSave,
  recordCampaignDay, runDays, scoreOf, startCampaign, startingScenario, stepDay, type SimState,
} from "../index";

const fresh = (seed = 1, options: Parameters<typeof startingScenario>[3] = {}): SimState => startingScenario(airports, aircraftTypes, seed, options);

/** A game whose campaign ends `days` days from now (the real 15-year end would take thousands of steps). */
const endingIn = (days: number, years: number | null = 15): SimState => {
  const s = fresh(1, { campaignYears: years });
  return { ...s, campaign: { ...s.campaign!, endDay: s.world.day + days } };
};

describe("campaign length", () => {
  it("ends on 1 January of the start year plus the length", () => {
    const c = startCampaign(2015, 15, 150e6)!;
    expect(c.startDay).toBe(0);
    expect(c.endDay).toBe(jan1Day(2030));
    expect(c.reviewDay).toBeNull();
    expect(c.peakCashUsd).toBe(150e6);
  });

  it("is absent for an endless game (null or not given)", () => {
    expect(startCampaign(2015, null, 1)).toBeUndefined();
    expect(startCampaign(2015, undefined, 1)).toBeUndefined();
    expect(fresh(1, { campaignYears: null }).campaign).toBeUndefined();
    expect(fresh(1).campaign).toBeUndefined();
  });

  it("refuses a length that is not a whole number of years in range", () => {
    expect(() => startCampaign(2015, 0, 1)).toThrow(/campaignYears/);
    expect(() => startCampaign(2015, 2.5, 1)).toThrow(/campaignYears/);
    expect(() => startCampaign(2015, 51, 1)).toThrow(/campaignYears/);
  });

  it("a new game with a length carries it through a save", () => {
    const s = fresh(1, { campaignYears: 10 });
    const back = parseSave(JSON.stringify(makeSave(s, { appVersion: "t" })));
    expect(back.ok && back.save.state.campaign?.endDay).toBe(jan1Day(2025));
  });
});

describe("end detection", () => {
  it("reaches the end date exactly once: the sim pauses on that day and the review day is recorded", () => {
    let s = endingIn(3);
    const end = s.campaign!.endDay!;
    expect(campaignReviewDue(s)).toBe(false);
    s = stepDay(s); s = stepDay(s);
    expect(s.world.day).toBe(end - 1);
    expect(s.campaign!.reviewDay).toBeNull();
    s = stepDay(s);
    expect(s.world.day).toBe(end);
    expect(s.campaign!.reviewDay).toBe(end);
    expect(s.speed).toBe(0);
    expect(campaignReviewDue(s)).toBe(true);
  });

  it("stays frozen once the review is due: further steps change nothing and the review day never moves", () => {
    const reached = runDays(endingIn(2), 2);
    const after = stepDay(reached);
    expect(after).toBe(reached);
    expect(stepDay(after)).toBe(reached);
    expect(markCampaignReview(reached)).toBe(reached);
    expect(reached.campaign!.reviewDay).toBe(reached.world.day);
  });

  it("an endless game never triggers a review, however far it runs", () => {
    const s = runDays(fresh(1, { campaignYears: null }), 20);
    expect(s.world.day).toBe(20);
    expect(s.campaign).toBeUndefined();
    expect(campaignReviewDue(s)).toBe(false);
    expect(campaignReview(s)).toBeNull();
  });

  it("an old save (no campaign field) loads as endless and never reviews", () => {
    const old = fresh();
    const { campaign: _c, ...legacy } = old;
    const loaded = parseSave(JSON.stringify(makeSave(legacy as SimState, { appVersion: "old" })));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const s = runDays(loaded.save.state, 3);
    expect(s.campaign).toBeUndefined();
    expect(campaignReviewDue(s)).toBe(false);
  });

  it("a bankrupt game never shows the review even past its end date", () => {
    const s = endingIn(0);
    const bankrupt = { ...s, world: { ...s.world, day: s.campaign!.endDay! + 1 }, credit: { distressSinceDay: null, lastReminderDay: null, lastInterestUsd: 0, interestPaidUsd: 0, bankrupt: { day: s.campaign!.endDay! + 1 } } };
    expect(campaignReviewDue(bankrupt)).toBe(false);
    expect(markCampaignReview(bankrupt)).toBe(bankrupt);
  });

  it("a save loaded on or after its end date is frozen at once, with the review recorded", () => {
    const s = endingIn(0);
    const late = { ...s, world: { ...s.world, day: s.campaign!.endDay! + 5 } };
    const frozen = stepDay(late);
    expect(frozen.world.day).toBe(late.world.day);
    expect(frozen.campaign!.reviewDay).toBe(late.world.day);
  });
});

describe("Keep playing", () => {
  it("dismisses the review: the game goes on, no second review, the first review day is kept", () => {
    const reached = runDays(endingIn(2), 2);
    const endless = continueEndless(reached);
    expect(campaignReviewDue(endless)).toBe(false);
    const next = runDays(endless, 3);
    expect(next.world.day).toBe(reached.world.day + 3);
    expect(next.campaign!.endDay).toBeNull();
    expect(next.campaign!.reviewDay).toBe(reached.world.day);
  });

  it("is a command that works on an endless game too (a no-op)", () => {
    const s = fresh(1, { campaignYears: null });
    expect(continueEndless(s)).toBe(s);
    const r = applyCommand(s, { kind: "continueEndless" });
    expect(r.result).toMatchObject({ ok: true, kind: "continueEndless" });
  });
});

describe("profit and peak cash", () => {
  it("adds each day's profit to its calendar year and keeps the peak cash", () => {
    let s = fresh(1, { campaignYears: 15 });
    s = recordCampaignDay({ ...s, world: { ...s.world, cash: 200e6 } }, 1e6);
    s = recordCampaignDay({ ...s, world: { ...s.world, cash: 180e6 } }, -2e6);
    expect(s.campaign!.profitByYear["2015"]).toBe(-1e6);
    expect(s.campaign!.peakCashUsd).toBe(200e6);
  });

  it("leaves an endless game untouched", () => {
    const s = fresh();
    expect(recordCampaignDay(s, 5e6)).toBe(s);
  });
});

describe("score and grade", () => {
  it("equity is cash plus owned aircraft minus owed balances", () => {
    const sc = scoreOf({ cashUsd: 100e6, aircraftUsd: 80e6, owedUsd: 30e6, startCashUsd: 150e6 });
    expect(sc.equityUsd).toBe(150e6);
    expect(sc.multiple).toBeCloseTo(1);
    expect(sc.grade).toBe("C");
  });

  it("cash below zero is already debt and counts once", () => {
    const sc = scoreOf({ cashUsd: -20e6, aircraftUsd: 0, owedUsd: 0, startCashUsd: 150e6 });
    expect(sc.equityUsd).toBe(-20e6);
    expect(sc.grade).toBe("F");
  });

  it("grade boundaries: A at 3x, B at 2x, C at 1x, D at zero, F below zero", () => {
    const start = 150e6;
    expect(gradeFor(3 * start, start)).toBe("A");
    expect(gradeFor(3 * start - 1, start)).toBe("B");
    expect(gradeFor(2 * start, start)).toBe("B");
    expect(gradeFor(start, start)).toBe("C");
    expect(gradeFor(0, start)).toBe("D");
    expect(gradeFor(-1, start)).toBe("F");
  });

  it("an undelivered purchase order counts at the price paid against its balance, so it nets to the deposit", () => {
    const sc = scoreOf({ cashUsd: 304e6, aircraftUsd: 100e6, orderedUsd: 500e6, owedUsd: 400e6, startCashUsd: 150e6 });
    expect(sc.equityUsd).toBe(504e6);
    expect(sc.grade).toBe("A");
  });

  it("two widebodies ordered shortly before the end do not collapse the grade", () => {
    const base = fresh(1, { campaignYears: 15 });
    const rich: SimState = { ...base, world: { ...base.world, cash: 304e6 } };
    const before = campaignReview(rich)!.score;
    const ordered = applyCommand(rich, { kind: "orderAircraft", typeId: "B787-9", count: 2, layout: defaultLayout(aircraftTypes.find((t) => t.id === "B787-9")!), financing: "purchase" });
    expect(ordered.result.ok).toBe(true);
    const after = campaignReview(ordered.state)!.score;
    expect(after.owedUsd).toBeGreaterThan(100e6);
    expect(after.orderedUsd).toBeGreaterThan(after.owedUsd);
    // Equity moves only by the (small) difference between the deposit and the price-paid value: it is not reduced by the balance owed.
    expect(after.equityUsd).toBeGreaterThanOrEqual(before.equityUsd - 1);
    expect(after.grade).toBe(before.grade);
  });

  it("a lease order adds nothing to the score: the down payment is spent and there is no equity", () => {
    const base = fresh(1, { campaignYears: 15 });
    const before = campaignReview(base)!.score;
    const r = applyCommand(base, { kind: "orderAircraft", typeId: "A320", count: 1, layout: defaultLayout(aircraftTypes.find((t) => t.id === "A320")!), financing: "lease" });
    expect(r.result.ok).toBe(true);
    const after = campaignReview(r.state)!.score;
    expect(after.orderedUsd).toBe(0);
    expect(after.owedUsd).toBe(0);
    expect(after.equityUsd).toBeLessThan(before.equityUsd);
  });

  it("the review reports the score and its parts for a game at its end", () => {
    const r = campaignReview(runDays(fresh(1, { campaignYears: 15 }), 2))!;
    expect(r.score.equityUsd).toBe(r.score.cashUsd + r.score.aircraftUsd + r.score.orderedUsd - r.score.owedUsd);
    expect(r.yearsPlayed).toBe(15);
    expect(r.profitByYear).toHaveLength(15);
    expect(r.endYear - r.startYear).toBe(r.yearsPlayed);
    expect(["A", "B", "C", "D", "F"]).toContain(r.score.grade);
    expect(r.routes).toBe(4);
    expect(r.rivals).not.toBeNull();
  });
});
