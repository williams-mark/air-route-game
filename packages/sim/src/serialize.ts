// Save-file envelope for SimState. SimState is plain JSON (no Map/Set/undefined/NaN), so serialization is JSON.stringify
// with a versioned wrapper; `extras` carries opaque UI-side data (feed, ledger, pending decisions) that the app restores.
import { airports as dataAirports } from "@arg/data";
import type { SimState } from "./state";
import { stampAircraftHubs } from "./fleet/hubs";

/**
 * Save format history. 1: the California/Hawaii/Oregon/Washington game (airports without country and landmass, five West Coast
 * rivals). 2: whole US and Europe (lane/world-sim): airports carry country and landmass, rivals may carry scope, type preferences and a
 * route cap. A version 1 save is migrated on load (`migrateV1`) and plays on in the larger world; nothing is lost.
 */
export const SAVE_VERSION = 2;
const OLDEST_READABLE_VERSION = 1;
export const SAVE_FORMAT = "air-route-game-save";

export interface SaveFile<X = unknown> {
  format: typeof SAVE_FORMAT;
  version: number;
  /** ISO timestamp. */
  savedAt: string;
  appVersion: string;
  seed: number;
  state: SimState;
  extras?: X;
}

export type ParseResult<X = unknown> =
  | { ok: true; save: SaveFile<X> }
  | { ok: false; code: "not_json" | "not_a_save" | "version_mismatch" | "corrupt"; message: string };

export function makeSave<X>(state: SimState, opts: { appVersion: string; savedAt?: string; extras?: X }): SaveFile<X> {
  return {
    format: SAVE_FORMAT, version: SAVE_VERSION, savedAt: opts.savedAt ?? new Date().toISOString(), appVersion: opts.appVersion,
    seed: state.world.seed, state, ...(opts.extras !== undefined ? { extras: opts.extras } : {}),
  };
}

export function stringifySave(save: SaveFile): string {
  return JSON.stringify(save);
}

/** Validate and parse save text. Never throws; returns a friendly message on failure. */
export function parseSave<X = unknown>(text: string): ParseResult<X> {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, code: "not_json", message: "This file is not a valid save (it could not be read as JSON)." }; }
  if (!raw || typeof raw !== "object" || (raw as { format?: unknown }).format !== SAVE_FORMAT) {
    return { ok: false, code: "not_a_save", message: "This file is not an Air Route Game save." };
  }
  const f = raw as Partial<SaveFile<X>>;
  if (typeof f.version !== "number" || !Number.isInteger(f.version) || f.version < OLDEST_READABLE_VERSION || f.version > SAVE_VERSION) {
    return {
      ok: false, code: "version_mismatch",
      message: `This save was made by a different version of the game (save format ${String(f.version)}, this build reads formats ${OLDEST_READABLE_VERSION} to ${SAVE_VERSION}). It cannot be loaded.`,
    };
  }
  const problems = validateSimState(f.state);
  if (problems.length > 0) {
    return { ok: false, code: "corrupt", message: `This save file is damaged or incomplete (${problems[0]}${problems.length > 1 ? `; ${problems.length - 1} more problem${problems.length > 2 ? "s" : ""}` : ""}).` };
  }
  // Aircraft without a hubId (saves before hubs) are stamped with the home hub. No version bump: the field is optional.
  if (f.version < SAVE_VERSION) return { ok: true, save: { ...(f as SaveFile<X>), version: SAVE_VERSION, state: stampAircraftHubs(migrateV1(f.state as SimState)) } };
  return { ok: true, save: { ...(f as SaveFile<X>), state: stampAircraftHubs(f.state as SimState) } };
}

/**
 * Version 1 to 2. Old airports lack `country` and `landmass` (the sim treats a missing country as Europe, so they must be filled):
 * US, with the landmass from the state. The airports the save did not know (the rest of the US and Europe) are appended from the
 * data package so the player can open routes there; airports already in the save keep their saved values. Rival airlines need
 * nothing: their scope, type list and route cap are optional and derived from their bases.
 */
export function migrateV1(state: SimState): SimState {
  const have = new Set(state.airports.map((a) => a.id));
  const fixed = state.airports.map((a) => {
    const old = a as unknown as { country?: string; landmass?: string; region?: string };
    if (old.country && old.landmass) return a;
    return { ...a, country: old.country ?? "US", landmass: old.landmass ?? (old.region === "HI" ? "US-HI" : old.region === "AK" ? "US-AK" : "US-CONUS") };
  });
  return { ...state, airports: [...fixed, ...dataAirports.filter((a) => !have.has(a.id))] };
}

// ---------------------------------------------------------------------------
// Structural validation of a loaded SimState: types of every field the sim reads, and references between them.
// ---------------------------------------------------------------------------
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const CLASSES = ["F", "J", "W", "Y"];
const STATUSES = ["active", "maintenance", "delivery", "stored"];
const CHECKS = ["A", "B", "C", "D"];

/** Problems with a cabin layout's structure (not the cabin rules: older saves may hold layouts newer rules would refuse). */
function layoutProblems(l: unknown, where: string): string[] {
  if (!isObj(l) || !Array.isArray(l.sections) || l.sections.length === 0) return [`${where} has no cabin sections`];
  for (const s of l.sections) {
    if (!isObj(s) || !CLASSES.includes(s.cls as string) || !isInt(s.rows) || s.rows < 1 || !isInt(s.seatsAcross) || s.seatsAcross < 1 || !isNum(s.pitchIn) || s.pitchIn <= 0) {
      return [`${where} has a damaged cabin section`];
    }
  }
  return [];
}

/**
 * Check a parsed save's state for the shapes and references the sim relies on. Returns human-readable problems (empty
 * when the state looks loadable). Never throws, whatever it is given.
 */
export function validateSimState(raw: unknown): string[] {
  const out: string[] = [];
  const add = (m: string) => { if (out.length < 20) out.push(m); };
  try {
    if (!isObj(raw)) return ["the game state is missing"];
    const s = raw;
    for (const k of ["airports", "aircraftTypes", "snapshots", "events", "pendingEvents", "orders", "offers", "bankruptcies"]) {
      if (!Array.isArray(s[k])) add(`"${k}" is missing or not a list`);
    }
    for (const k of ["params", "routeReports", "fleetMeta", "offerLog", "counters"]) {
      if (!isObj(s[k])) add(`"${k}" is missing or damaged`);
    }
    if (!isObj(s.world)) { add("the world is missing"); return out; }
    const w = s.world;
    if (!isInt(w.day) || w.day < 0) add("the day is invalid");
    if (!isNum(w.cash)) add("cash is invalid");
    if (!isNum(w.seed)) add("the seed is invalid");
    if (!Array.isArray(w.routes)) add("the route list is missing");
    if (!Array.isArray(w.fleet)) add("the fleet list is missing");
    if (!isStr(s.airlineName)) add("the airline name is missing");
    if (![0, 1, 2, 3, 4, 5].includes(s.speed as number)) add("the speed is invalid");
    if (s.rivals !== null && s.rivals !== undefined && (!isObj(s.rivals) || !Array.isArray(s.rivals.airlines) || !Array.isArray(s.rivals.news))) add("the rivals data is damaged");
    if (out.length > 0) return out; // the reference checks below need the shapes above

    const airports = s.airports as Array<Record<string, unknown>>;
    const types = s.aircraftTypes as Array<Record<string, unknown>>;
    const airportIds = new Set(airports.map((a) => a?.id));
    const typeIds = new Set(types.map((t) => t?.id));
    if (airports.some((a) => !isObj(a) || !isStr(a.id))) add("an airport entry is damaged");
    if (types.some((t) => !isObj(t) || !isStr(t.id) || !isNum(t.maxSeats) || !isNum(t.listPriceUsdM))) add("an aircraft type entry is damaged");
    const c = s.counters as Record<string, unknown>;
    for (const k of ["route", "aircraft", "order"]) if (!isNum(c[k])) add(`the ${k} counter is invalid`);
    const prm = s.params as Record<string, unknown>;
    for (const k of ["corporateOverheadPerDay", "overheadPerAircraftPerDay", "snapshotHistory", "eventQueueLimit"]) if (!isNum(prm[k])) add(`parameter "${k}" is invalid`);
    if (s.baseAirport !== null && s.baseAirport !== undefined && !airportIds.has(s.baseAirport)) add(`the home airport "${String(s.baseAirport)}" does not exist`);
    if (out.length > 0) return out;

    const fleet = w.fleet as unknown[];
    const fleetIds = new Set<unknown>();
    for (const a of fleet) {
      if (!isObj(a) || !isStr(a.id) || !isStr(a.tailNumber)) { add("an aircraft entry is damaged"); continue; }
      if (fleetIds.has(a.id)) add(`aircraft "${a.id}" appears twice`);
      fleetIds.add(a.id);
      if (!typeIds.has(a.typeId)) add(`aircraft "${a.id}" has unknown type "${String(a.typeId)}"`);
      if (!STATUSES.includes(a.status as string)) add(`aircraft "${a.id}" has an invalid status`);
      if (!isNum(a.ageDays)) add(`aircraft "${a.id}" has an invalid age`);
      if (!isObj(a.hoursSinceCheck) || CHECKS.some((k) => !isNum((a.hoursSinceCheck as Record<string, unknown>)[k]))) add(`aircraft "${a.id}" has invalid check hours`);
      for (const p of layoutProblems(a.layout, `aircraft "${a.id}"`)) add(p);
    }

    const meta = s.fleetMeta as Record<string, unknown>;
    const orderIds = new Set((s.orders as unknown[]).map((o) => (isObj(o) ? o.id : undefined)));
    for (const id of fleetIds as Set<string>) {
      const m = meta[id];
      if (!isObj(m)) { add(`aircraft "${id}" has no bookkeeping record`); continue; }
      if (!isNum(m.flightHours) || !isNum(m.cycles) || !isNum(m.deferredDays)) add(`aircraft "${id}" has invalid hours or cycles`);
      for (const k of ["daysSince", "intervals"]) {
        const r = m[k];
        if (!isObj(r) || CHECKS.some((ck) => !isNum(r[ck]))) add(`aircraft "${id}" has an invalid ${k} record`);
      }
      if (m.deliveryDay !== null && !isNum(m.deliveryDay)) add(`aircraft "${id}" has an invalid delivery day`);
      if (m.orderId !== null && m.orderId !== undefined && !orderIds.has(m.orderId)) add(`aircraft "${id}" refers to missing order "${String(m.orderId)}"`);
      const mm = m.maintenance;
      if (mm !== null && mm !== undefined && (!isObj(mm) || !CHECKS.includes(mm.check as string) || !isNum(mm.startDay) || !isNum(mm.endDay) || !isNum(mm.cost))) add(`aircraft "${id}" has a damaged maintenance record`);
    }

    const routeIds = new Set<unknown>();
    for (const r of w.routes as unknown[]) {
      if (!isObj(r) || !isStr(r.id)) { add("a route entry is damaged"); continue; }
      if (routeIds.has(r.id)) add(`route "${r.id}" appears twice`);
      routeIds.add(r.id);
      if (!airportIds.has(r.origin) || !airportIds.has(r.destination)) add(`route "${r.id}" uses an unknown airport`);
      if (!typeIds.has(r.typeId)) add(`route "${r.id}" uses unknown aircraft type "${String(r.typeId)}"`);
      if (!isNum(r.weeklyFrequency) || r.weeklyFrequency < 0) add(`route "${r.id}" has an invalid frequency`);
      if (!isObj(r.fares) || !isNum(r.fares.Y)) add(`route "${r.id}" has invalid fares`);
    }
    for (const k of Object.keys(s.routeReports as object)) if (!routeIds.has(k)) add(`a route report refers to missing route "${k}"`);

    for (const o of s.orders as unknown[]) {
      if (!isObj(o) || !isStr(o.id)) { add("an order entry is damaged"); continue; }
      if (!typeIds.has(o.typeId)) add(`order "${o.id}" has unknown type "${String(o.typeId)}"`);
      if (!isInt(o.count) || o.count < 1) add(`order "${o.id}" has an invalid count`);
      for (const k of ["orderDay", "discount", "unitPriceUsd", "depositUsd"]) if (!isNum(o[k])) add(`order "${o.id}" has an invalid ${k}`);
      for (const p of layoutProblems(o.layout, `order "${o.id}"`)) add(p);
      if (!Array.isArray(o.aircraftIds) || !Array.isArray(o.deliveryDays) || o.aircraftIds.length !== o.deliveryDays.length) { add(`order "${o.id}" has damaged delivery lists`); continue; }
      for (const id of o.aircraftIds) if (!fleetIds.has(id)) add(`order "${o.id}" refers to missing aircraft "${String(id)}"`);
      if (o.deliveryDays.some((d) => !isNum(d))) add(`order "${o.id}" has an invalid delivery day`);
      if (o.ownershipFactor !== undefined && (!isNum(o.ownershipFactor) || o.ownershipFactor <= 0)) add(`order "${o.id}" has an invalid ownership factor`);
    }

    for (const o of s.offers as unknown[]) {
      if (!isObj(o) || !isStr(o.id) || !typeIds.has(o.typeId) || !isNum(o.quantity) || !isNum(o.unitPriceUsd) || !isNum(o.listPriceUsd) || !isNum(o.expiresDay)) add("an offer entry is damaged");
      else if (o.layout !== null && o.layout !== undefined) for (const p of layoutProblems(o.layout, `offer "${o.id}"`)) add(p);
    }
    for (const snap of s.snapshots as unknown[]) {
      if (!isObj(snap) || !isNum(snap.day) || !isNum(snap.cash) || !isNum(snap.revenue) || !isNum(snap.costs) || !isNum(snap.profit)) { add("a finance snapshot is damaged"); break; }
    }
  } catch (e) {
    add(`unreadable state (${e instanceof Error ? e.message : String(e)})`);
  }
  return out;
}
