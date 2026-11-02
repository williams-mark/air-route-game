import type { SimState } from "../state";
import { typeCanServe } from "../fleet/scheduler";

/** Deep-scan any value for NaN / +-Infinity. Returns paths of offenders (capped). */
export function findNonFinite(value: unknown, limit = 10): string[] {
  const out: string[] = [];
  const seen = new Set<object>();
  const walk = (v: unknown, path: string) => {
    if (out.length >= limit) return;
    if (typeof v === "number") { if (!Number.isFinite(v)) out.push(`${path}=${v}`); return; }
    if (v === null || typeof v !== "object") return;
    if (seen.has(v as object)) return;
    seen.add(v as object);
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) walk(v[i], `${path}[${i}]`); return; }
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, `${path}.${k}`);
  };
  walk(value, "state");
  return out;
}

/** Structural invariants that must hold on any state. Returns human-readable violations. */
export function checkState(s: SimState): string[] {
  const v: string[] = [];
  const day = s.world.day;
  v.push(...findNonFinite(s).map((p) => `non-finite ${p}`));

  const ids = new Set<string>();
  for (const a of s.world.fleet) {
    if (ids.has(a.id)) v.push(`duplicate aircraft id ${a.id}`);
    ids.add(a.id);
    if (!s.aircraftTypes.some((t) => t.id === a.typeId)) v.push(`aircraft ${a.id} has unknown type ${a.typeId}`);
  }
  const tails = new Set<string>();
  for (const a of s.world.fleet) { if (tails.has(a.tailNumber)) v.push(`duplicate tail ${a.tailNumber}`); tails.add(a.tailNumber); }
  const routeIds = new Set<string>();
  for (const r of s.world.routes) { if (routeIds.has(r.id)) v.push(`duplicate route id ${r.id}`); routeIds.add(r.id); }
  const orderIds = new Set<string>();
  for (const o of s.orders) { if (orderIds.has(o.id)) v.push(`duplicate order id ${o.id}`); orderIds.add(o.id); }

  const apById = new Map(s.airports.map((a) => [a.id, a]));
  const typeById = new Map(s.aircraftTypes.map((t) => [t.id, t]));
  const acById = new Map(s.world.fleet.map((a) => [a.id, a]));

  for (const r of s.world.routes) {
    const a = apById.get(r.origin), b = apById.get(r.destination);
    if (!a || !b) { v.push(`route ${r.id} has unknown airport`); continue; }
    if (r.weeklyFrequency < 1 || !Number.isInteger(r.weeklyFrequency)) v.push(`route ${r.id} frequency ${r.weeklyFrequency}`);
    if (!(r.fares.Y > 0)) v.push(`route ${r.id} non-positive Y fare`);
    const rep = s.routeReports[r.id];
    if (rep?.scheduling) {
      for (const id of rep.scheduling.aircraftIds) {
        const ac = acById.get(id);
        const t = ac && typeById.get(ac.typeId);
        if (!ac || !t) { v.push(`route ${r.id} scheduled unknown aircraft ${id}`); continue; }
        if (!typeCanServe(a, b, t)) v.push(`route ${r.id} (${r.origin}-${r.destination}) flown by ${ac.typeId} ${id} which cannot fly it`);
        if (ac.status === "delivery") v.push(`route ${r.id} scheduled an undelivered aircraft ${id}`);
      }
    }
  }
  for (const id of Object.keys(s.routeReports)) if (!routeIds.has(id)) v.push(`stale route report ${id}`);

  for (const o of s.orders) {
    if (o.aircraftIds.length !== o.count || o.deliveryDays.length !== o.count) v.push(`order ${o.id} count mismatch`);
    for (const d of o.deliveryDays) if (d < o.orderDay) v.push(`order ${o.id} delivers day ${d} before order day ${o.orderDay}`);
    for (const id of o.aircraftIds) {
      const ac = acById.get(id);
      const m = s.fleetMeta[id];
      if (!ac) { v.push(`order ${o.id} aircraft ${id} missing from fleet`); continue; }
      if (m?.deliveryDay != null && ac.status !== "delivery" && m.deliveryDay > day) v.push(`aircraft ${id} in service before delivery day ${m.deliveryDay}`);
    }
  }
  if (s.rivals) {
    for (const r of s.rivals.airlines) {
      if (r.fleet.length < 0) v.push(`rival ${r.id} negative fleet`);
      for (const rt of r.routes) if (rt.frequency < 0) v.push(`rival ${r.id} negative frequency`);
      if (r.status === "bankrupt" && r.fleet.length > 0) v.push(`bankrupt rival ${r.id} still has ${r.fleet.length} aircraft`);
    }
  }
  if (s.pendingEvents.length > s.params.eventQueueLimit) v.push("event queue over limit");
  if (s.snapshots.length > s.params.snapshotHistory) v.push("snapshot history over limit");
  return v;
}
