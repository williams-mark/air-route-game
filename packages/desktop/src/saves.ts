import { promises as fs } from "node:fs";
import path from "node:path";

export interface SaveInfo {
  key: string;
  bytes: number;
  modifiedMs: number;
}

const KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidKey(key: unknown): key is string {
  return typeof key === "string" && KEY_RE.test(key);
}

function assertKey(key: unknown): asserts key is string {
  if (!isValidKey(key)) throw new Error("Invalid save key");
}

function fileFor(dir: string, key: string): string {
  return path.join(dir, `${key}.json`);
}

export async function listSaves(dir: string): Promise<SaveInfo[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: SaveInfo[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const key = name.slice(0, -5);
    if (!isValidKey(key)) continue;
    try {
      const st = await fs.stat(path.join(dir, name));
      if (st.isFile()) out.push({ key, bytes: st.size, modifiedMs: st.mtimeMs });
    } catch {
      // file vanished between readdir and stat
    }
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export async function readSave(dir: string, key: string): Promise<string | null> {
  assertKey(key);
  try {
    return await fs.readFile(fileFor(dir, key), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export async function writeSave(dir: string, key: string, text: string): Promise<void> {
  assertKey(key);
  if (typeof text !== "string") throw new Error("Save text must be a string");
  await fs.mkdir(dir, { recursive: true });
  const target = fileFor(dir, key);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tmp, text, "utf8");
    await fs.rename(tmp, target);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}

export async function removeSave(dir: string, key: string): Promise<void> {
  assertKey(key);
  await fs.rm(fileFor(dir, key), { force: true });
}
