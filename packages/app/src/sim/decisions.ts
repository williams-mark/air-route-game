// Rule-based decision cards generated from sim state. The only card kind left is an aircraft delivery (the owner removed the
// rival fare-cut, low-load and heavy-check cards). Pure apart from the engine's own counters, which are a function of the
// sequence of states it has seen.
import type { Command, Day, Route } from "@arg/contracts";
import { COMMAND_PARAMS, typeCanServe, type PlannerCommand, type SimState } from "@arg/sim";
import { projectRoute, routeName } from "../routes/helpers";
import type { Decision } from "./bridge";
import { formatMoney } from "./format";

export interface PendingDecision extends Decision {
  /** Subject key; the id is `${key}@${day}`. */
  key: string;
  /** Command to dispatch for each option id (null: just acknowledge). */
  commands: Record<string, Command | PlannerCommand | null>;
  expiresDay: Day;
}

export const DECISION_PARAMS = {
  /** Days a card waits before it is dropped unanswered. */
  expiryDays: 45,
  /** Days before the same subject can raise another card. */
  cooldownDays: 120,
  maxPending: 3,
} as const;

type Card = Omit<PendingDecision, "id" | "day" | "expiresDay">;
interface Raised { key: string; card: Card }

const money = (v: number) => formatMoney(v, { sign: true });

export interface EngineState {
  cooldown: Array<[string, Day]>;
  status: Array<[string, string]>;
  primed: boolean;
}

export class DecisionEngine {
  private cooldown = new Map<string, Day>();
  private status = new Map<string, string>();
  private primed = false;

  /** Plain-JSON state for save files. */
  toJSON(): EngineState {
    return { cooldown: [...this.cooldown], status: [...this.status], primed: this.primed };
  }
  static fromJSON(j: EngineState): DecisionEngine {
    const e = new DecisionEngine();
    e.cooldown = new Map(j.cooldown); e.status = new Map(j.status); e.primed = j.primed;
    return e;
  }

  /** Call after every simulated day with the new state. Returns cards raised by this day (deliveries only). */
  onDay(sim: SimState, pending: readonly PendingDecision[]): PendingDecision[] {
    const day = sim.world.day;
    const out: PendingDecision[] = [];
    const room = () => DECISION_PARAMS.maxPending - pending.length - out.length > 0;
    const free = (key: string) => (this.cooldown.get(key) ?? -1) <= day && !pending.some((p) => p.id.startsWith(key + "@")) && !out.some((p) => p.id.startsWith(key + "@"));
    const raise = (key: string, d: Card) => {
      this.cooldown.set(key, day + DECISION_PARAMS.cooldownDays);
      out.push({ ...d, id: `${key}@${day}`, day, expiresDay: day + DECISION_PARAMS.expiryDays });
    };

    const delivered = sim.world.fleet.filter((ac) => ac.status === "active" && this.status.get(ac.id) === "delivery");
    for (const ac of sim.world.fleet) this.status.set(ac.id, ac.status);
    if (!this.primed) { this.primed = true; return out; }

    if (delivered.length > 0 && room()) {
      const d = this.deliveryCard(sim, delivered.map((a) => a.id));
      if (d && free(d.key)) raise(d.key, d.card);
    }
    return out;
  }

  /** The player answered or dismissed a card: the subject stays quiet for a while. */
  resolved(decisionId: string, day: Day): void {
    const key = decisionId.split("@")[0]!;
    this.cooldown.set(key, day + DECISION_PARAMS.cooldownDays);
  }

  // --- Cards ---------------------------------------------------------------

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
      const reqType = sim.aircraftTypes.find((t) => t.id === r.typeId);
      // A different size class only flies the route through an explicit extra-type entry, which only makes sense for missing flights.
      if (under === 0 && reqType && reqType.widebody !== type.widebody) continue;
      const roundTrip = 2 * rep.evaluation.blockHours;
      const capacity = (type.widebody ? 12.5 : 9.5) * 7;
      const room = Math.max(1, Math.floor(capacity / roundTrip));
      // Missing flights are covered by the aircraft itself; frequency only goes up when the route is already fully flown,
      // and then by a measured step (at most half again), never a jump that swamps a short route.
      const extra = under > 0 ? Math.min(under, room) : Math.min(room, Math.max(1, Math.ceil(r.weeklyFrequency * 0.5)));
      if (under === 0) {
        if (r.weeklyFrequency + extra > COMMAND_PARAMS.maxWeeklyFrequency) continue;
        // Never offer a frequency increase the route's own forecast says loses money.
        const after = projectRoute({ ...r, weeklyFrequency: r.weeklyFrequency + extra }, day)?.evaluation;
        if (!after || after.profit - rep.evaluation.profit <= 0) continue;
      }
      const score = under * 10 + lf;
      if (!best || score > best.score) best = { r, score, lf, extra };
    }
    const options: Decision["options"] = [];
    const commands: PendingDecision["commands"] = {};
    if (best) {
      const missing = sim.routeReports[best.r.id]?.scheduling?.underSupplied ?? 0;
      const sameType = best.r.typeId === type.id;
      if (missing > 0) {
        const prefs = sim.planner?.routeTypes?.[best.r.id] ?? [];
        options.push({
          id: "fly", label: `Fly it on ${routeName(best.r)}${sameType ? "" : ` alongside the ${best.r.typeId}`}`,
          effect: `Covers about ${best.extra} of the ${missing} weekly flights the route cannot staff; frequency stays ${best.r.weeklyFrequency} a week`,
        });
        commands.fly = sameType || prefs.includes(type.id) ? null : { kind: "setRouteTypes", routeId: best.r.id, preferredTypeIds: [...prefs, type.id] };
      } else {
        const newFreq = best.r.weeklyFrequency + best.extra;
        const now = sim.routeReports[best.r.id]?.evaluation.profit ?? 0;
        const proj = projectRoute({ ...best.r, weeklyFrequency: newFreq }, day)?.evaluation;
        options.push({
          id: "fly", label: `Add ${best.extra} a week on ${routeName(best.r)}`,
          effect: proj ? `Load ${Math.round(proj.loadFactor * 100)}%, ${money(proj.profit - now)}/wk before fleet costs` : `To ${newFreq} a week`,
        });
        commands.fly = { kind: "updateRoute", id: best.r.id, patch: { weeklyFrequency: newFreq } };
      }
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
        options, commands, ...(best ? { routeId: best.r.id } : {}),
      },
    };
  }
}
