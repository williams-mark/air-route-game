// RealSimBridge: drives the real @arg/sim through the SimBridge interface.
// The clock accumulates real time (rAF dt, clamped) into whole simulated days; days are stepped in a batch and the UI gets
// exactly one snapshot per batch.
import type { Command, Day, Id, SimEvent } from "@arg/contracts";
import { aircraftTypes as dataTypes, airports as dataAirports } from "@arg/data";
import {
  applyCommand, createClock, makeSave, type SaveFile, defaultLayout, drainEvents, layoutSeats, maintenanceEnabled, type CabinCommand, type OfferCommand, type PlannerCommand, startingScenario, stepDay,
  validateSimState, type AutoSlowHook, type Clock, type SimState,
} from "@arg/sim";
import type {
  CommandResult, Decision, FleetItem, Notice, OfferItem, OrderItem, Severity, SimBridge, SimSnapshot, Speed,
} from "./bridge";
import { DecisionEngine, type EngineState, type PendingDecision } from "./decisions";
import { buildRivalsView, type RivalsView } from "../rivals/helpers";
import { dayRecord, type DayRecord } from "./finance";

export interface RealBridgeOptions {
  seed?: number;
  /** Start at speed 0. Default is speed 1 (running). */
  startPaused?: boolean;
  autoPause?: boolean;
  /** Real-time delta is clamped to this, which bounds the days stepped per frame (max speed 30 days/s). Default 250 ms = 7 days. */
  maxDtMs?: number;
  initial?: SimState;
}

export const NOTICE_LIMIT = 60;
export const APP_VERSION = "0.1.0";

/** Bridge-side state stored beside the SimState in a save file. */
export interface BridgeExtras {
  notices: Notice[];
  nextNotice: number;
  ledger: DayRecord[];
  pending: PendingDecision[];
  engine: EngineState;
  lowCash: boolean;
}
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Problems with the saved UI extras (feed, ledger, pending decision cards, decision engine). Empty when usable. */
export function validateExtras(x: unknown): string[] {
  if (!isObj(x)) return ["the saved interface data is damaged"];
  const out: string[] = [];
  if (!Array.isArray(x.notices) || x.notices.some((n) => !isObj(n) || !isNum(n.id) || !isNum(n.day) || typeof n.text !== "string" || typeof n.severity !== "string")) out.push("the saved notices are damaged");
  if (!isNum(x.nextNotice)) out.push("the notice counter is invalid");
  if (!Array.isArray(x.ledger) || x.ledger.some((r) => !isObj(r) || !isNum(r.day) || !isNum(r.cash) || !isNum(r.revenue) || !isNum(r.costs) || !isNum(r.profit) || !isObj(r.by))) out.push("the saved finance ledger is damaged");
  if (!Array.isArray(x.pending) || x.pending.some((p) => !isObj(p) || typeof p.id !== "string" || typeof p.key !== "string" || !isNum(p.day) || !isNum(p.expiresDay) || typeof p.title !== "string" || !Array.isArray(p.options) || !isObj(p.commands))) out.push("the saved decision cards are damaged");
  const e = x.engine;
  if (!isObj(e) || !isObj(e.lfSum) || !isObj(e.lowWeeks) || !Array.isArray(e.cooldown) || !Array.isArray(e.status) || typeof e.primed !== "boolean" || !isNum(e.newsSeen)
    || e.cooldown.some((c) => !Array.isArray(c) || c.length !== 2) || e.status.some((c) => !Array.isArray(c) || c.length !== 2)) out.push("the saved decision engine is damaged");
  if (typeof x.lowCash !== "boolean") out.push("the low-cash flag is invalid");
  return out;
}

/** Cash at which a bankruptcy warning is raised (once, until cash recovers). */
export const LOW_CASH_USD = 15_000_000;

/** Severity from the text of a sim notice. Sim notices are plain strings; keep this list in step with the sim wording. */
export function classifyNotice(text: string): Severity {
  if (/under-supplied|forced|no spare aircraft can cover|deferring|Delivery delayed|Offer expiring soon/i.test(text)) return "warn";
  if (/cut .* fares|bankrupt|collapsed|ceased/i.test(text)) return "warn";
  if (/Delivered|back in service|back to its full|Opened|Ordered|is on schedule/i.test(text)) return "good";
  if (/enters [A-D] check|Closed/i.test(text)) return "warn";
  return "info";
}

/** Notices that are only noise in the feed. */
const QUIET = /A check done overnight/;

export class RealSimBridge implements SimBridge {
  private sim!: SimState;
  private clock!: Clock;
  private listeners = new Set<() => void>();
  private snap!: SimSnapshot;
  private notices: Notice[] = [];
  private nextNotice = 1;
  private ledger: DayRecord[] = [];
  private pending: PendingDecision[] = [];
  private engine = new DecisionEngine();
  private autoPause!: boolean;
  private deliveryDays = new Set<Day>();
  private lowCash = false;
  private reportedSlow: object | null = null;
  private raf: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  private opts: RealBridgeOptions;

  constructor(opts: RealBridgeOptions = {}) {
    this.opts = opts;
    this.reset(opts.initial ?? startingScenario(dataAirports, dataTypes, opts.seed ?? 2015), opts.startPaused ? 0 : 1, true);
  }

  /** (Re)initialise all bridge state around `sim`. Used by the constructor, newGame and loadGame. */
  private reset(sim: SimState, speed: Speed, welcome: boolean, extras?: BridgeExtras): void {
    this.sim = sim;
    this.notices = []; this.nextNotice = 1; this.ledger = []; this.pending = []; this.engine = new DecisionEngine();
    this.lowCash = false; this.reportedSlow = null; this.offersOf = null; this.viewOf = null; this.rivalsOf = null;
    const hook: AutoSlowHook = {
      check: (day) => {
        // `day` is the day number after the step the clock is granting, so the sim day being run is day - 1.
        if (this.autoPause && this.deliveryDays.has(day - 1)) return { maxSpeed: 2, reason: "An aircraft is being delivered." };
        return null;
      },
    };
    this.autoPause = this.autoPause ?? this.opts.autoPause ?? true;
    this.clock = createClock({ startDay: this.sim.world.day, speed, hook, maxDtMs: this.opts.maxDtMs ?? 250 });
    this.sim = { ...this.sim, speed: this.clock.speed };
    this.refreshDeliveryDays();
    if (extras) {
      this.notices = extras.notices; this.nextNotice = extras.nextNotice; this.ledger = extras.ledger; this.pending = extras.pending;
      this.engine = DecisionEngine.fromJSON(extras.engine); this.lowCash = extras.lowCash;
    }
    if (welcome) this.say(0, "info", `Welcome to ${this.sim.airlineName}. Your fleet is waiting at ${this.sim.baseAirport ?? "your base"}.`);
    this.snap = this.build();
    if (this.listeners.size) for (const l of this.listeners) l();
  }

  // --- Save / load ---------------------------------------------------------

  /** Snapshot of the whole game for a save file. */
  serialize(): SaveFile<BridgeExtras> {
    const { state } = drainEvents(this.sim); // keep queued events out of the file; they are already shown in the feed
    return makeSave<BridgeExtras>({ ...state, pendingEvents: [], events: [] }, {
      appVersion: APP_VERSION,
      extras: { notices: this.notices, nextNotice: this.nextNotice, ledger: this.ledger, pending: this.pending, engine: this.engine.toJSON(), lowCash: this.lowCash },
    });
  }

  /**
   * Replace the running game with a loaded one (paused). The save is fully validated first (state, references and UI
   * extras) and one day is trial-run on a copy; if anything fails this throws and the running game is left untouched.
   */
  loadGame(save: SaveFile): void {
    const problems = [...validateSimState(save?.state), ...(save?.extras === undefined ? [] : validateExtras(save.extras))];
    if (problems.length > 0) throw new Error(`the save is damaged (${problems[0]})`);
    const extras = save.extras as BridgeExtras | undefined;
    // Trial: the sim must be able to step the loaded state (pure, so this leaves `save.state` unchanged).
    stepDay(save.state);
    const keep = this.captureFields();
    try {
      this.reset(save.state, 0, false, extras);
      this.say(this.sim.world.day, "info", "Game loaded. Press Space to resume.");
      this.emit();
    } catch (e) {
      this.restoreFields(keep);
      throw e;
    }
  }

  private static readonly FIELDS = [
    "sim", "clock", "snap", "notices", "nextNotice", "ledger", "pending", "engine", "deliveryDays", "lowCash", "reportedSlow",
    "offersOf", "offersCache", "viewOf", "rivalsOf", "rivalsCache",
  ] as const;
  private captureFields(): Record<string, unknown> {
    const self = this as unknown as Record<string, unknown>;
    return Object.fromEntries(RealSimBridge.FIELDS.map((k) => [k, self[k]]));
  }
  private restoreFields(saved: Record<string, unknown>): void {
    Object.assign(this as unknown as Record<string, unknown>, saved);
  }

  /** Start a fresh game with `seed`, optionally at another home airport and under another airline name (see sim `startingScenario`). */
  newGame(seed: number, options: { hub?: string; name?: string } = {}): void {
    this.reset(startingScenario(dataAirports, dataTypes, seed, options), 1, true);
  }

  // --- Driver --------------------------------------------------------------

  /** Real-time driver (requestAnimationFrame). Not started by default so tests stay deterministic. */
  start(): void {
    if (this.raf !== null || this.timer !== null) return;
    let last = performance.now();
    const frame = (now: number) => {
      this.advance(now - last);
      last = now;
      this.raf = requestAnimationFrame(frame);
    };
    if (typeof requestAnimationFrame === "function") this.raf = requestAnimationFrame(frame);
    else this.timer = setInterval(() => { const n = performance.now(); this.advance(n - last); last = n; }, 50);
  }
  stop(): void {
    if (this.raf !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.raf);
    if (this.timer) clearInterval(this.timer);
    this.raf = null; this.timer = null;
  }

  /** Advance by `ms` of real time at the current speed; one snapshot per call. Returns days stepped. */
  advance(ms: number): number {
    const days = this.clock.advance(ms);
    if (days > 0) {
      const slow = this.clock.lastAutoSlow; // read before stepping: pausing for a decision resets it
      if (slow && slow !== this.reportedSlow) {
        this.reportedSlow = slow;
        this.say(this.sim.world.day + days, "info", `${slow.maxSpeed === 0 ? "Paused" : `Slowed to speed ${slow.maxSpeed}`}: ${slow.reason}`);
      }
      for (let i = 0; i < days; i++) this.stepOne();
      this.syncSpeed();
      this.collect();
      this.emit();
    }
    return days;
  }

  /** Step exactly `n` days regardless of speed (tests, fast-forward). */
  stepDays(n: number): void {
    for (let i = 0; i < n; i++) this.stepOne();
    if (n > 0) { this.collect(); this.emit(); }
  }

  private stepOne(): void {
    this.sim = stepDay(this.sim);
    if (this.sim.orders.some((o) => o.delayDays)) this.refreshDeliveryDays();
    const snap = this.sim.events.find((e): e is Extract<SimEvent, { kind: "finance" }> => e.kind === "finance");
    if (snap) this.ledger.push(dayRecord(snap.snapshot, this.sim.routeReports));
    const raised = this.engine.onDay(this.sim, this.pending);
    if (raised.length) {
      this.pending = [...this.pending, ...raised];
        if (this.autoPause) this.slowTo(0, "A decision needs your attention.");
    }
    // Drain regularly so the sim queue (cap 2000) never drops events at high speed.
    if (this.sim.pendingEvents.length > 400) this.collect();
    const expired = this.pending.filter((p) => p.expiresDay <= this.sim.world.day);
    if (expired.length) {
      for (const p of expired) this.engine.resolved(p.id, this.sim.world.day);
      this.pending = this.pending.filter((p) => !expired.includes(p));
      }
  }

  /** Turn queued sim events into feed notices. */
  private collect(): void {
    const { state, events } = drainEvents(this.sim);
    this.sim = state;
    let pause = false;
    for (const e of events) {
      if (e.kind !== "notice" || QUIET.test(e.text)) continue;
      const sev = classifyNotice(e.text);
      this.say(e.day, sev, e.text);
    }
    const cash = this.sim.world.cash;
    if (cash < LOW_CASH_USD && !this.lowCash) {
      this.lowCash = true;
      this.say(this.sim.world.day, "alert", `Cash is down to ${(cash / 1e6).toFixed(1)}M. Cut costs or the airline cannot pay its bills.`);
      pause = true;
    } else if (cash >= LOW_CASH_USD * 1.5) this.lowCash = false;
    if (pause && this.autoPause) this.slowTo(0, "Cash is critically low.");
  }

  private say(day: Day, severity: Severity, text: string): void {
    this.notices = [{ id: this.nextNotice++, day, severity, text }, ...this.notices].slice(0, NOTICE_LIMIT);
  }

  private slowTo(max: Speed, reason: string): void {
    if (this.clock.speed <= max) return;
    this.clock.setSpeed(max);
    this.syncSpeed();
    this.say(this.sim.world.day, "info", `${max === 0 ? "Paused" : `Slowed to speed ${max}`}: ${reason}`);
  }

  private syncSpeed(): void {
    if (this.sim.speed !== this.clock.speed) this.sim = { ...this.sim, speed: this.clock.speed };
  }

  private refreshDeliveryDays(): void {
    this.deliveryDays = new Set(
      Object.values(this.sim.fleetMeta).map((m) => m.deliveryDay).filter((d): d is Day => d !== null),
    );
  }

  // --- SimBridge -----------------------------------------------------------

  getState = (): SimSnapshot => this.snap;
  subscribe = (l: () => void): (() => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };

  /** Direct read access for tests and debugging. */
  get simState(): SimState { return this.sim; }

  setAutoPause(on: boolean): void { this.autoPause = on; }

  setSpeed(speed: Speed): void {
    if (speed === this.clock.speed) return;
    this.clock.setSpeed(speed);
    this.syncSpeed();
    this.emit();
  }

  getSim = (): SimState => this.sim;

  dispatch(cmd: Command | OfferCommand | CabinCommand | PlannerCommand): CommandResult | void {
    if (cmd.kind === "setSpeed") {
      if (![0, 1, 2, 3, 4, 5].includes(cmd.speed)) return { ok: false, error: { code: "invalid_speed", message: "Speed must be 0 to 5." } };
      this.setSpeed(cmd.speed);
      return { ok: true };
    }
    const { state, result } = applyCommand(this.sim, cmd);
    this.sim = state;
    this.collect();
    if (!result.ok) {
      this.emit();
      return { ok: false, error: { code: result.error, message: result.message } };
    }
    if (result.kind === "orderAircraft" || result.kind === "acceptOffer") this.refreshDeliveryDays();
    this.emit();
    switch (result.kind) {
      case "openRoute": return { ok: true, routeId: result.routeId, warnings: result.warnings };
      case "updateRoute": return { ok: true, routeId: result.routeId, warnings: result.warnings };
      case "closeRoute": return { ok: true, routeId: result.routeId };
      case "orderAircraft": return { ok: true, orderId: result.orderId };
      case "acceptOffer": return { ok: true, orderId: result.orderId, offerId: result.offerId };
      case "dismissOffer": return { ok: true, offerId: result.offerId };
      default: return { ok: true };
    }
  }

  decide(decisionId: string, optionId: string): void {
    const d = this.pending.find((x) => x.id === decisionId);
    if (!d) return;
    this.pending = this.pending.filter((x) => x !== d);
    this.engine.resolved(d.id, this.sim.world.day);
    const opt = d.options.find((o) => o.id === optionId);
    const cmd = d.commands[optionId];
    if (cmd) {
      const res = this.dispatch(cmd);
      if (res && !res.ok) {
        this.say(this.sim.world.day, "alert", `Could not carry out "${opt?.label ?? optionId}": ${res.error.message}`);
      }
    } else if (opt) {
      this.say(this.sim.world.day, "info", `Decision: ${opt.label} (${d.title}).`);
    }
    this.emit();
  }

  // --- Snapshot ------------------------------------------------------------

  private build(): SimSnapshot {
    const sim = this.sim;
    const recent = this.ledger.slice(-30);
    const profitSeries = recent.map((r) => r.profit);
    return {
      day: sim.world.day,
      speed: this.clock.speed as Speed,
      cash: sim.world.cash,
      profit30: profitSeries.reduce((a, b) => a + b, 0),
      profitSeries,
      notices: this.notices,
      decisions: this.decisionsView(),
      routes: sim.world.routes,
      airline: { name: sim.airlineName, hub: sim.baseAirport ?? "" },
      fleet: buildFleet(sim),
      orders: buildOrders(sim),
      offers: this.offersView(),
      rivals: this.rivalsView(),
      reports: sim.routeReports,
      ledger: this.ledger.slice(),
    };
  }

  private offersOf: SimState["offers"] | null = null;
  private offersCache: OfferItem[] = [];
  /** Offer cards for the UI; keeps the same array while the sim's offer list is unchanged. */
  private offersView(): OfferItem[] {
    if (this.offersOf !== this.sim.offers) {
      this.offersOf = this.sim.offers;
      this.offersCache = buildOffers(this.sim);
    }
    return this.offersCache;
  }

  private rivalsOf: object | null = null;
  private rivalsCache!: RivalsView;
  /** Fogged rival view; recomputed when the rival state or the player's route list changes. */
  private rivalsView(): RivalsView {
    const key = this.sim.rivals ?? this.sim.world.routes;
    if (this.rivalsOf !== key || this.rivalsRoutes !== this.sim.world.routes) {
      this.rivalsOf = key; this.rivalsRoutes = this.sim.world.routes;
      this.rivalsCache = buildRivalsView(this.sim);
    }
    return this.rivalsCache;
  }
  private rivalsRoutes: object | null = null;

  private viewOf: PendingDecision[] | null = null;
  private view: Decision[] = [];
  /** Public card list; keeps the same array while the pending set is unchanged so subscribers can skip renders. */
  private decisionsView(): Decision[] {
    if (this.viewOf !== this.pending) {
      this.viewOf = this.pending;
      this.view = this.pending.map(({ commands: _c, expiresDay: _e, key: _k, ...d }): Decision => d);
    }
    return this.view;
  }

  private emit(): void {
    this.snap = this.build();
    for (const l of this.listeners) l();
  }
}

// --- Snapshot helpers ------------------------------------------------------

export function buildFleet(sim: SimState): FleetItem[] {
  const routeName = new Map(sim.world.routes.map((r) => [r.id, `${r.origin}–${r.destination}`]));
  const flies = new Map<Id, string[]>();
  for (const rep of Object.values(sim.routeReports)) {
    const n = routeName.get(rep.routeId);
    if (!n) continue;
    for (const id of rep.scheduling?.aircraftIds ?? []) flies.set(id, [...(flies.get(id) ?? []), n]);
  }
  const types = new Map(sim.aircraftTypes.map((t) => [t.id, t]));
  const day = sim.world.day;
  return sim.world.fleet.map((ac): FleetItem => {
    const meta = sim.fleetMeta[ac.id];
    const item: FleetItem = {
      id: ac.id, tail: ac.tailNumber, typeId: ac.typeId, typeName: types.get(ac.typeId)?.name ?? ac.typeId,
      status: ac.status, ageYears: ac.ageDays / 365.25, seats: layoutSeats(ac.layout), layout: ac.layout, routes: flies.get(ac.id) ?? [],
    };
    if (meta?.maintenance?.refit) item.refit = true;
    if (meta?.maintenance && (meta.maintenance.refit || maintenanceEnabled())) item.check = { kind: meta.maintenance.check, endDay: meta.maintenance.endDay, daysRemaining: Math.max(0, meta.maintenance.endDay - day) };
    if (ac.status === "delivery" && meta?.deliveryDay != null) item.deliveryDay = meta.deliveryDay;
    if (meta?.orderId) item.orderId = meta.orderId;
    if (meta && ac.status !== "delivery" && maintenanceEnabled()) {
      let best: FleetItem["nextCheck"];
      for (const kind of ["B", "C", "D"] as const) {
        const inDays = meta.intervals[kind] - meta.daysSince[kind];
        if (!best || inDays < best.inDays) best = { kind, inDays: Math.max(0, inDays) };
      }
      item.nextCheck = best;
    }
    return item;
  });
}

export function buildOrders(sim: SimState): OrderItem[] {
  const types = new Map(sim.aircraftTypes.map((t) => [t.id, t]));
  const status = new Map(sim.world.fleet.map((a) => [a.id, a.status]));
  return sim.orders.map((o) => ({
    id: o.id, typeId: o.typeId, typeName: types.get(o.typeId)?.name ?? o.typeId, count: o.count,
    delivered: o.aircraftIds.filter((id) => status.get(id) !== "delivery").length,
    orderDay: o.orderDay, deliveryDays: o.deliveryDays,
    firstDelivery: Math.min(...o.deliveryDays), lastDelivery: Math.max(...o.deliveryDays),
    unitPriceUsd: o.unitPriceUsd, discount: o.discount, depositUsd: o.depositUsd, seats: layoutSeats(o.layout),
  }));
}

export function buildOffers(sim: SimState): OfferItem[] {
  const types = new Map(sim.aircraftTypes.map((t) => [t.id, t]));
  return sim.offers.map((o): OfferItem => {
    const t = types.get(o.typeId);
    return {
      ...o,
      typeName: t?.name ?? o.typeId,
      seats: layoutSeats(o.layout ?? (t ? defaultLayout(t) : { sections: [] })),
    };
  });
}
