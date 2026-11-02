// Rule-based, deterministic decision cards generated from sim state. Pure apart from the engine's own counters,
// which are a function of the sequence of states it has seen.
import type { AircraftType, Command, Day, Route } from "@arg/contracts";
import { COMMAND_PARAMS, dayToDate, orderDiscount, typeCanServe, type SimState } from "@arg/sim";
import { bestFrequency, frequencySweep, projectRoute, routeName, dataWorld } from "../routes/helpers";
import type { Decision } from "./bridge";
import { formatMoney } from "./format";

export interface PendingDecision extends Decision {
  /** Subject key; the id is `${key}@${day}`. */
  key: string;
  /** Command to dispatch for each option id (null: just acknowledge). */
  commands: Record<string, Command | null>;
  expiresDay: Day;
}

export const DECISION_PARAMS = {
  lowLoadFactor: 0.55,
  lowWeeksNeeded: 4,
  /** Days before a heavy check falls due that we raise a card. */
  checkLeadDays: 28,
  /** Days a card waits before it is dropped unanswered. */
  expiryDays: 45,
  /** Days before the same subject can raise another card. */
  cooldownDays: 120,
  maxPending: 3,
} as const;

type Card = Omit<PendingDecision, "id" | "day" | "expiresDay">;
interface Raised { key: string; card: Card }

const money = (v: number) => formatMoney(v, { sign: true });

function orderable(t: AircraftType, year: number): boolean {
  return (t.endYear === null || t.endYear >= year) && t.introYear <= year + COMMAND_PARAMS.orderLeadYears;
}

/** A type we can order today that stands in for `t` (itself if possible, else the closest seat count in the same class). */
export function orderableSubstitute(t: AircraftType, types: readonly AircraftType[], year: number): AircraftType | null {
  if (orderable(t, year)) return t;
  let best: AircraftType | null = null;
  for (const c of types) {
    if (c.widebody !== t.widebody || !orderable(c, year) || c.introYear > year) continue;
    if (!best || Math.abs(c.maxSeats - t.maxSeats) < Math.abs(best.maxSeats - t.maxSeats)) best = c;
  }
  return best;
}

export class DecisionEngine {
  private lfSum: Record<string, { sum: number; n: number }> = {};
  private lowWeeks: Record<string, number> = {};
  private cooldown = new Map<string, Day>();
  private status = new Map<string, string>();
  private primed = false;

  /** Call after every simulated day with the new state. Returns cards raised by this day. */
  onDay(sim: SimState, pending: readonly PendingDecision[]): PendingDecision[] {
    const day = sim.world.day;
    const out: PendingDecision[] = [];
    const room = () => DECISION_PARAMS.maxPending - pending.length - out.length > 0;
    const free = (key: string) => (this.cooldown.get(key) ?? -1) <= day && !pending.some((p) => p.id.startsWith(key + "@")) && !out.some((p) => p.id.startsWith(key + "@"));
    const raise = (key: string, d: Card) => {
      this.cooldown.set(key, day + DECISION_PARAMS.cooldownDays);
      out.push({ ...d, id: `${key}@${day}`, day, expiresDay: day + DECISION_PARAMS.expiryDays });
    };

    // Daily bookkeeping: load factor accumulation and delivery detection.
    const reports = sim.routeReports;
    for (const r of sim.world.routes) {
      const rep = reports[r.id];
      if (!rep || !rep.evaluation.feasible) continue;
      const a = (this.lfSum[r.id] ??= { sum: 0, n: 0 });
      a.sum += rep.evaluation.loadFactor;
      a.n++;
    }
    const delivered = sim.world.fleet.filter((ac) => ac.status === "active" && this.status.get(ac.id) === "delivery");
    for (const ac of sim.world.fleet) this.status.set(ac.id, ac.status);
    if (!this.primed) { this.primed = true; return out; }

    if (delivered.length > 0 && room()) {
      const d = this.deliveryCard(sim, delivered.map((a) => a.id));
      if (d && free(d.key)) raise(d.key, d.card);
    }

    // Weekly rules.
    if (day % 7 === 0) {
      const live = new Set(sim.world.routes.map((r) => r.id));
      for (const r of sim.world.routes) {
        const a = this.lfSum[r.id];
        if (!a || a.n === 0) continue;
        const lf = a.sum / a.n;
        this.lfSum[r.id] = { sum: 0, n: 0 };
        this.lowWeeks[r.id] = lf < DECISION_PARAMS.lowLoadFactor ? (this.lowWeeks[r.id] ?? 0) + 1 : 0;
        if ((this.lowWeeks[r.id] ?? 0) >= DECISION_PARAMS.lowWeeksNeeded && room()) {
          const key = `lowlf-${r.id}`;
          if (free(key)) {
            const card = this.lowLoadCard(sim, r, lf);
            if (card) { raise(key, card.card); this.lowWeeks[r.id] = 0; }
          }
        }
      }
      for (const id of Object.keys(this.lowWeeks)) if (!live.has(id)) { delete this.lowWeeks[id]; delete this.lfSum[id]; }

      if (room()) {
        const c = this.checkCard(sim);
        if (c && free(c.key)) raise(c.key, c.card);
      }
    }
    return out;
  }

  /** The player answered or dismissed a card: the subject stays quiet for a while. */
  resolved(decisionId: string, day: Day): void {
    const key = decisionId.split("@")[0]!;
    this.cooldown.set(key, day + DECISION_PARAMS.cooldownDays);
  }

  // --- Cards ---------------------------------------------------------------

  private lowLoadCard(sim: SimState, route: Route, lf: number): Raised | null {
    const name = routeName(route);
    const day = sim.world.day;
    const rep = sim.routeReports[route.id];
    const here = rep?.evaluation.profit ?? 0;
    const sweep = frequencySweep(route, day, dataWorld, Math.max(1, route.weeklyFrequency));
    const best = bestFrequency(sweep.filter((p) => p.frequency < route.weeklyFrequency));
    const cut = best?.frequency ?? Math.max(1, Math.floor(route.weeklyFrequency / 2));
    if (cut >= route.weeklyFrequency) return null;
    const after = sweep.find((p) => p.frequency === cut);
    const options: Decision["options"] = [];
    const commands: PendingDecision["commands"] = {};
    options.push({
      id: "cut", label: `Cut to ${cut} a week`,
      effect: after ? `Load ${Math.round(after.loadFactor * 100)}%, ${money(after.profit - here)}/wk before fleet costs` : `From ${route.weeklyFrequency} to ${cut} a week`,
    });
    commands.cut = { kind: "updateRoute", id: route.id, patch: { weeklyFrequency: cut } };
    options.push({ id: "close", label: "Close the route", effect: `Stops ${money(here)}/wk before fleet costs` });
    commands.close = { kind: "closeRoute", id: route.id };
    options.push({ id: "keep", label: "Keep it as is", effect: "Review again in four months" });
    commands.keep = null;
    const key = `lowlf-${route.id}`;
    return {
      key,
      card: {
        key,
        title: `${name} is running mostly empty`,
        context: `Load factor has averaged ${Math.round(lf * 100)}% for ${DECISION_PARAMS.lowWeeksNeeded} weeks on ${route.weeklyFrequency} weekly round trips with ${route.typeId}.`,
        options, commands,
      },
    };
  }

  private checkCard(sim: SimState): Raised | null {
    const day = sim.world.day;
    const year = dayToDate(day).year;
    const busy = new Set<string>();
    for (const rep of Object.values(sim.routeReports)) for (const id of rep.scheduling?.aircraftIds ?? []) busy.add(id);
    for (const ac of sim.world.fleet) {
      if (ac.status !== "active") continue;
      const meta = sim.fleetMeta[ac.id];
      const type = sim.aircraftTypes.find((t) => t.id === ac.typeId);
      if (!meta || !type || !busy.has(ac.id)) continue;
      for (const kind of ["D", "C"] as const) {
        const left = meta.intervals[kind] - meta.daysSince[kind];
        if (left > DECISION_PARAMS.checkLeadDays || left < 0) continue;
        const key = `check-${ac.id}-${kind}`;
        if ((this.cooldown.get(key) ?? -1) > day) continue;
        const spare = sim.world.fleet.some((o) => o.id !== ac.id && o.status === "active" && !busy.has(o.id) && sim.aircraftTypes.find((t) => t.id === o.typeId)?.widebody === type.widebody);
        if (spare) { this.cooldown.set(key, day + DECISION_PARAMS.cooldownDays); continue; }
        const downtime = kind === "C" ? 21 : 60;
        const sub = orderableSubstitute(type, sim.aircraftTypes, year);
        const options: Decision["options"] = [];
        const commands: PendingDecision["commands"] = {};
        if (sub) {
          const unit = sub.listPriceUsdM * 1e6 * (1 - orderDiscount(1));
          options.push({ id: "spare", label: `Order a spare ${sub.id}`, effect: `Deposit ${formatMoney(unit * COMMAND_PARAMS.depositFraction)}, delivery in 6 to 30 months` });
          commands.spare = { kind: "orderAircraft", typeId: sub.id, count: 1, layout: { sections: [] } };
        }
        options.push({ id: "accept", label: "Accept the downtime", effect: `Flights may be dropped for up to ${downtime} days` });
        commands.accept = null;
        return {
          key,
          card: {
            key,
            title: `${ac.tailNumber} needs a ${kind} check in ${Math.max(0, left)} days`,
            context: `No spare ${type.widebody ? "widebody" : "narrowbody"} is free to cover it, so the routes it flies lose capacity for about ${downtime} days while it is in the hangar.`,
            options, commands,
          },
        };
      }
    }
    return null;
  }

  private deliveryCard(sim: SimState, ids: string[]): Raised | null {
    const day = sim.world.day;
    const ac = sim.world.fleet.find((a) => a.id === ids[0]);
    const type = ac && sim.aircraftTypes.find((t) => t.id === ac.typeId);
    if (!ac || !type) return null;
    const apById = new Map(sim.airports.map((a) => [a.id, a]));
    let best: { r: Route; score: number; lf: number; extra: number } | null = null;
    for (const r of sim.world.routes) {
      const rep = sim.routeReports[r.id];
      const a = apById.get(r.origin), b = apById.get(r.destination);
      if (!rep || !a || !b || !rep.evaluation.feasible || !typeCanServe(a, b, type)) continue;
      const under = rep.scheduling?.underSupplied ?? 0;
      const lf = rep.evaluation.loadFactor;
      if (under === 0 && lf < 0.8) continue;
      const roundTrip = 2 * rep.evaluation.blockHours;
      const capacity = (type.widebody ? 12.5 : 9.5) * 7;
      const extra = under > 0 ? under : Math.max(1, Math.floor(capacity / roundTrip));
      if (r.weeklyFrequency + extra > COMMAND_PARAMS.maxWeeklyFrequency) continue;
      const score = under * 10 + lf;
      if (!best || score > best.score) best = { r, score, lf, extra };
    }
    const options: Decision["options"] = [];
    const commands: PendingDecision["commands"] = {};
    if (best) {
      const newFreq = best.r.weeklyFrequency + best.extra;
      const now = sim.routeReports[best.r.id]?.evaluation.profit ?? 0;
      const proj = projectRoute({ ...best.r, weeklyFrequency: newFreq }, day)?.evaluation;
      options.push({
        id: "fly", label: `Add ${best.extra} a week on ${routeName(best.r)}`,
        effect: proj ? `Load ${Math.round(proj.loadFactor * 100)}%, ${money(proj.profit - now)}/wk before fleet costs` : `To ${newFreq} a week`,
      });
      commands.fly = { kind: "updateRoute", id: best.r.id, patch: { weeklyFrequency: newFreq } };
    }
    options.push({ id: "spare", label: "Keep it as a spare", effect: "Covers heavy checks; costs lease while idle" });
    commands.spare = null;
    const n = ids.length;
    return {
      key: `delivery-${ac.id}`,
      card: {
        key: `delivery-${ac.id}`,
        title: n > 1 ? `${n} aircraft delivered` : `${ac.tailNumber} (${type.id}) delivered`,
        context: best
          ? `${routeName(best.r)} is running at ${Math.round(best.lf * 100)}% load${(sim.routeReports[best.r.id]?.scheduling?.underSupplied ?? 0) > 0 ? " and cannot fly its full schedule" : ""}. The new aircraft could add flights there.`
          : "No route needs the extra capacity right now. It can sit as a spare until you open or expand a route.",
        options, commands,
      },
    };
  }
}
