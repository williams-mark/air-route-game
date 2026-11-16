import { mkdtemp, rm, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isValidKey, listSaves, readSave, removeSave, writeSave } from "./saves";

let dir: string;
beforeEach(async () => {
  dir = path.join(await mkdtemp(path.join(os.tmpdir(), "arg-saves-")), "saves");
});
afterEach(async () => {
  await rm(path.dirname(dir), { recursive: true, force: true });
});

describe("isValidKey", () => {
  it("accepts simple keys", () => {
    for (const k of ["a", "slot-1", "Auto_Save", "x".repeat(64)]) expect(isValidKey(k)).toBe(true);
  });
  it("rejects bad keys", () => {
    const bad: unknown[] = ["", "x".repeat(65), "../x", "a/b", "a\\b", "a.json", "a b", "a\u0000", "..", "é", 5, null, undefined];
    for (const k of bad) expect(isValidKey(k)).toBe(false);
  });
});

describe("save files", () => {
  it("read returns null when missing (and dir missing)", async () => {
    expect(await readSave(dir, "nope")).toBeNull();
  });
  it("round-trips and creates the directory", async () => {
    await writeSave(dir, "slot1", '{"a":1}');
    expect(await readSave(dir, "slot1")).toBe('{"a":1}');
  });
  it("overwrites and leaves no temp files", async () => {
    await writeSave(dir, "slot1", "one");
    await writeSave(dir, "slot1", "two");
    expect(await readSave(dir, "slot1")).toBe("two");
    expect(await readdir(dir)).toEqual(["slot1.json"]);
  });
  it("lists saves with size, ignoring junk", async () => {
    expect(await listSaves(dir)).toEqual([]);
    await writeSave(dir, "b", "123");
    await writeSave(dir, "a", "12");
    await writeFile(path.join(dir, "bad name.json"), "x");
    await writeFile(path.join(dir, "note.txt"), "x");
    const list = await listSaves(dir);
    expect(list.map((s) => [s.key, s.bytes])).toEqual([
      ["a", 2],
      ["b", 3],
    ]);
    expect(list[0]!.modifiedMs).toBeGreaterThan(0);
  });
  it("removes, idempotently", async () => {
    await writeSave(dir, "a", "x");
    await removeSave(dir, "a");
    await removeSave(dir, "a");
    expect(await readSave(dir, "a")).toBeNull();
  });
  it("rejects invalid keys on every operation", async () => {
    await expect(readSave(dir, "../evil")).rejects.toThrow();
    await expect(writeSave(dir, "../evil", "x")).rejects.toThrow();
    await expect(removeSave(dir, "a/b")).rejects.toThrow();
  });
});
