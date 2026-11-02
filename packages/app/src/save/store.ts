// Tiny IndexedDB wrapper (no dependency). A SaveStore keeps one record per slot: small metadata plus the save text.
export type SlotId = "auto" | "1" | "2" | "3" | "4" | "5";
export const MANUAL_SLOTS: SlotId[] = ["1", "2", "3", "4", "5"];
export const ALL_SLOTS: SlotId[] = ["auto", ...MANUAL_SLOTS];

export interface SlotMeta {
  slot: SlotId;
  savedAt: string;
  day: number;
  cash: number;
  airline: string;
  seed: number;
  appVersion: string;
  bytes: number;
}

export interface SaveStore {
  list(): Promise<SlotMeta[]>;
  read(slot: SlotId): Promise<string | null>;
  write(meta: SlotMeta, text: string): Promise<void>;
  remove(slot: SlotId): Promise<void>;
}

export class MemoryStore implements SaveStore {
  private m = new Map<SlotId, { meta: SlotMeta; text: string }>();
  async list() { return [...this.m.values()].map((x) => x.meta); }
  async read(slot: SlotId) { return this.m.get(slot)?.text ?? null; }
  async write(meta: SlotMeta, text: string) { this.m.set(meta.slot, { meta, text }); }
  async remove(slot: SlotId) { this.m.delete(slot); }
}

const DB = "air-route-game";
const META = "meta";
const DATA = "data";

const req = <T,>(r: IDBRequest<T>): Promise<T> => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export class IdbStore implements SaveStore {
  private db: Promise<IDBDatabase> | null = null;
  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((res, rej) => {
      const o = indexedDB.open(DB, 1);
      o.onupgradeneeded = () => { o.result.createObjectStore(META); o.result.createObjectStore(DATA); };
      o.onsuccess = () => res(o.result);
      o.onerror = () => rej(o.error);
      o.onblocked = () => rej(new Error("Database is blocked by another tab."));
    });
    return this.db;
  }
  async list(): Promise<SlotMeta[]> {
    const db = await this.open();
    return (await req(db.transaction(META).objectStore(META).getAll())) as SlotMeta[];
  }
  async read(slot: SlotId): Promise<string | null> {
    const db = await this.open();
    return ((await req(db.transaction(DATA).objectStore(DATA).get(slot))) as string | undefined) ?? null;
  }
  async write(meta: SlotMeta, text: string): Promise<void> {
    const db = await this.open();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction([META, DATA], "readwrite");
      tx.objectStore(META).put(meta, meta.slot);
      tx.objectStore(DATA).put(text, meta.slot);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  }
  async remove(slot: SlotId): Promise<void> {
    const db = await this.open();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction([META, DATA], "readwrite");
      tx.objectStore(META).delete(slot);
      tx.objectStore(DATA).delete(slot);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
}

let shared: SaveStore | null = null;
/** The browser store; falls back to memory (saves lost on reload) when IndexedDB is unavailable. */
export function getStore(): SaveStore {
  shared ??= typeof indexedDB !== "undefined" ? new IdbStore() : new MemoryStore();
  return shared;
}
