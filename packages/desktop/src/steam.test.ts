import { describe, expect, it, vi } from "vitest";
import { SteamService, isValidAchievementId, resolveAppId, type SteamClient, type SteamModule } from "./steam";

const none = () => null;

function fakeModule(over: Partial<SteamModule> = {}, client?: Partial<SteamClient["achievement"]>) {
  const done = new Set<string>();
  const ach = {
    isActivated: vi.fn((id: string) => done.has(id)),
    activate: vi.fn((id: string) => {
      done.add(id);
      return true;
    }),
    ...client,
  };
  const mod: SteamModule = {
    init: vi.fn(() => ({ achievement: ach })),
    restartAppIfNecessary: vi.fn(() => false),
    electronEnableSteamOverlay: vi.fn(),
    ...over,
  };
  return { mod, ach };
}

describe("resolveAppId", () => {
  it("prefers the env var over the file", () => {
    const r = resolveAppId({ ARG_STEAM_APP_ID: "123" }, "/x", () => "456");
    expect(r).toMatchObject({ appId: 123, source: "ARG_STEAM_APP_ID" });
  });
  it("reads steam_appid.txt", () => {
    const r = resolveAppId({}, "/x", () => "789\r\n");
    expect(r.appId).toBe(789);
  });
  it("is null with neither", () => {
    expect(resolveAppId({}, "/x", none)).toEqual({ appId: null, reason: "no app id configured" });
  });
  it("rejects junk and zero", () => {
    expect(resolveAppId({ ARG_STEAM_APP_ID: "abc" }, "/x", none).appId).toBeNull();
    expect(resolveAppId({ ARG_STEAM_APP_ID: "0" }, "/x", none).appId).toBeNull();
    expect(resolveAppId({}, "/x", () => "12 34").appId).toBeNull();
  });
  it("treats an empty env var as unset and survives read errors", () => {
    expect(resolveAppId({ ARG_STEAM_APP_ID: " " }, "/x", () => "5").appId).toBe(5);
    expect(
      resolveAppId({}, "/x", () => {
        throw new Error("eacces");
      }).appId,
    ).toBeNull();
  });
});

describe("SteamService.init", () => {
  it("does not load the module without an app id", () => {
    const loadModule = vi.fn();
    const log = vi.fn();
    const s = new SteamService({ env: {}, packaged: true, appidDir: "/x", readFile: none, loadModule, log });
    expect(s.init()).toBe("disabled");
    expect(loadModule).not.toHaveBeenCalled();
    expect(s.available()).toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toContain("[steam] disabled");
  });
  it("never throws when the factory or init throws", () => {
    const log = vi.fn();
    const a = new SteamService({
      env: { ARG_STEAM_APP_ID: "1" },
      packaged: false,
      appidDir: "/x",
      readFile: none,
      loadModule: () => {
        throw new Error("no native module");
      },
      log,
    });
    expect(a.init()).toBe("disabled");
    expect(a.available()).toBe(false);
    const { mod } = fakeModule({
      init: () => {
        throw new Error("Steam not running");
      },
    });
    const b = new SteamService({ env: { ARG_STEAM_APP_ID: "1" }, packaged: false, appidDir: "/x", readFile: none, loadModule: () => mod, log });
    expect(b.init()).toBe("disabled");
    expect(log.mock.calls.at(-1)![0]).toContain("Steam not running");
  });
  it("initialises with the id and enables the overlay", () => {
    const { mod } = fakeModule();
    const s = new SteamService({ env: { ARG_STEAM_APP_ID: "42" }, packaged: false, appidDir: "/x", readFile: none, loadModule: () => mod, log: () => {} });
    expect(s.init()).toBe("ready");
    expect(mod.init).toHaveBeenCalledWith(42);
    expect(mod.electronEnableSteamOverlay).toHaveBeenCalledTimes(1);
    expect(mod.restartAppIfNecessary).not.toHaveBeenCalled(); // dev build
    expect(s.available()).toBe(true);
  });
  it("only checks restart-through-Steam when packaged, and stops if it relaunches", () => {
    const { mod } = fakeModule({ restartAppIfNecessary: vi.fn(() => true) });
    const s = new SteamService({ env: { ARG_STEAM_APP_ID: "42" }, packaged: true, appidDir: "/x", readFile: none, loadModule: () => mod, log: () => {} });
    expect(s.init()).toBe("restarting");
    expect(mod.restartAppIfNecessary).toHaveBeenCalledWith(42);
    expect(mod.init).not.toHaveBeenCalled();
    expect(s.available()).toBe(false);
  });
});

describe("SteamService.unlockAchievement", () => {
  const make = (client?: Partial<SteamClient["achievement"]>) => {
    const { mod, ach } = fakeModule({}, client);
    const s = new SteamService({ env: { ARG_STEAM_APP_ID: "42" }, packaged: false, appidDir: "/x", readFile: none, loadModule: () => mod, log: () => {} });
    s.init();
    return { s, ach };
  };
  it("is false when unavailable", () => {
    const s = new SteamService({ env: {}, packaged: false, appidDir: "/x", readFile: none, log: () => {} });
    s.init();
    expect(s.unlockAchievement("FIRST_ROUTE")).toBe(false);
  });
  it("validates ids", () => {
    const { s, ach } = make();
    for (const bad of ["", "lower", "HAS SPACE", "A".repeat(65), "X-Y", "../x"]) expect(s.unlockAchievement(bad)).toBe(false);
    expect(ach.activate).not.toHaveBeenCalled();
    expect(isValidAchievementId("A".repeat(64))).toBe(true);
    expect(isValidAchievementId(5)).toBe(false);
  });
  it("activates once, then reports already achieved", () => {
    const { s, ach } = make();
    expect(s.unlockAchievement("FIRST_ROUTE")).toBe(true);
    expect(s.unlockAchievement("FIRST_ROUTE")).toBe(true);
    expect(ach.activate).toHaveBeenCalledTimes(1);
  });
  it("is false when Steam refuses or throws", () => {
    expect(make({ activate: () => false }).s.unlockAchievement("NOPE")).toBe(false);
    expect(
      make({
        activate: () => {
          throw new Error("boom");
        },
      }).s.unlockAchievement("NOPE"),
    ).toBe(false);
  });
  it("is false after shutdown", () => {
    const { s } = make();
    s.shutdown();
    expect(s.available()).toBe(false);
    expect(s.unlockAchievement("FIRST_ROUTE")).toBe(false);
  });
});
