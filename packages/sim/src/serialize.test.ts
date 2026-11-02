import { describe, expect, it } from "vitest";
import { aircraftTypes, airports } from "@arg/data";
import { startingScenario } from "./scenario";
import { stepDay } from "./index";
import { makeSave, parseSave, SAVE_VERSION, stringifySave } from "./serialize";
import { rivalNews, rivalReports } from "./rivals";

const run = (s: ReturnType<typeof startingScenario>, n: number) => { for (let i = 0; i < n; i++) s = stepDay(s); return s; };

describe("save serialization", () => {
  it("save at day 60, load, run 60 more equals 120 straight", () => {
    const start = startingScenario(airports, aircraftTypes, 2015);
    const straight = run(start, 120);
    const mid = run(start, 60);
    const parsed = parseSave(stringifySave(makeSave(mid, { appVersion: "t", savedAt: "2026-01-01T00:00:00Z" })));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(JSON.stringify(parsed.save.state)).toBe(JSON.stringify(mid));
    const resumed = run(parsed.save.state, 60);
    expect(JSON.stringify(resumed)).toBe(JSON.stringify(straight));
    expect(resumed.rivals).toEqual(straight.rivals);
    expect(resumed.offers).toEqual(straight.offers);
    expect(rivalReports(resumed)).toEqual(rivalReports(straight));
    expect(rivalNews(resumed)).toEqual(rivalNews(straight));
  });

  it("rejects bad input with friendly errors", () => {
    expect(parseSave("{nope")).toMatchObject({ ok: false, code: "not_json" });
    expect(parseSave("{}")).toMatchObject({ ok: false, code: "not_a_save" });
    const st = startingScenario(airports, aircraftTypes, 7);
    const good = makeSave(st, { appVersion: "t" });
    expect(parseSave(JSON.stringify({ ...good, version: SAVE_VERSION + 1 }))).toMatchObject({ ok: false, code: "version_mismatch" });
    expect(parseSave(JSON.stringify({ ...good, state: { world: {} } }))).toMatchObject({ ok: false, code: "corrupt" });
  });
});
