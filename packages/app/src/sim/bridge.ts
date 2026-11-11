// UI <-> sim boundary. The UI only talks to a SimBridge; swap `createBridge` to plug in the real sim.
import type { CabinLayout, Command, Day, Id, Route, WorldState } from "@arg/contracts";
import { newWorld, stepDay, type CheckKind, type CreditStatus, type Offer, type CabinCommand, type OfferCommand, type PlannerCommand, type RouteReport, type SimState } from "@arg/sim";
import { routeName, validateRouteDraft, type CommandError } from "../routes/helpers";
import type { DayRecord } from "./finance";
import { EMPTY_RIVALS, type RivalsView } from "../rivals/helpers";
import type { SaveFile, HubCommand, FinanceCommand } from "@arg/sim";

export type Speed = 0 | 1 | 2 | 3 | 4 | 5;
export type Severity = "info" | "good" | "warn" | "alert";

export interface Notice { id: number; day: Day; severity: Severity; text: string }
export interface DecisionOption { id: string; label: string; effect: string }
export interface Decision {
  id: string; day: Day; title: string; context: string; options: DecisionOption[];
  /** The route the card is about (deliveries): the dock links to it in the Routes view. */
  routeId?: Id;
}

/** One aircraft as the Fleet view shows it. */
export interface FleetItem {
  id: Id;
  tail: string;
  typeId: Id;
  typeName: string;
  status: "active" | "maintenance" | "delivery" | "stored";
  ageYears: number;
  seats: number;
  layout?: CabinLayout;
  /** True while the heavy-check slot is a cabin refit. */
  refit?: boolean;
  /** Hub the aircraft is based at (absent in mock data). */
  hub?: Id;
  /** How it was acquired (absent for starting or mock aircraft). */
  financing?: "purchase" | "lease";
  /** Calendar year it reaches the 30-year lifespan cap (absent in mock data). */
  retireYear?: number;
  /** Names of the routes this aircraft flies today (empty when idle). */
  routes: string[];
  /** Heavy check in progress (status maintenance). */
  check?: { kind: CheckKind; endDay: Day; daysRemaining: number };
  /** Delivery date for aircraft on order. */
  deliveryDay?: Day;
  orderId?: Id;
  /** Next heavy (B/C/D) check due, in days. */
  nextCheck?: { kind: CheckKind; inDays: number };
}

/** An aircraft order as the Orders view shows it. */
export interface OrderItem {
  id: Id;
  typeId: Id;
  typeName: string;
  count: number;
  delivered: number;
  orderDay: Day;
  deliveryDays: Day[];
  firstDelivery: Day;
  lastDelivery: Day;
  unitPriceUsd: number;
  discount: number;
  depositUsd: number;
  seats: number;
  financing?: "purchase" | "lease";
}

/** An open offer as the Offers tab, popup and top-bar badge show it. */
export interface OfferItem extends Offer {
  typeName: string;
  /** Seats in the offered cabin (the type's default layout when the offer has none). */
  seats: number;
}

/** Immutable snapshot; a new object is produced whenever anything changes. */
export interface SimSnapshot {
  day: Day;
  speed: Speed;
  cash: number;
  /** Sum of the last 30 days of profit. */
  profit30: number;
  /** Daily profit, oldest first, up to 30 entries. */
  profitSeries: number[];
  notices: Notice[]; // newest first
  decisions: Decision[]; // pending
  /** The player's current route network. */
  routes: Route[];
  airline: { name: string; hub: string };
  /** Real-sim data. The mock bridge leaves these empty and the views fall back to their own projections. */
  fleet: FleetItem[];
  orders: OrderItem[];
  /** Open manufacturer and market offers (empty from the mock bridge). */
  offers: OfferItem[];
  /** Fogged view of the competitors (no finances). Empty from the mock bridge. */
  rivals: RivalsView;
  /** Latest sim report per route id (weekly figures). */
  reports: Record<Id, RouteReport>;
  /** Every simulated day so far, oldest first. */
  ledger: DayRecord[];
  /** Credit line, distress and bankruptcy (real sim only; the mock bridge has none). */
  credit?: CreditStatus;
}

/** Outcome of a command. Bridges that cannot report an outcome return nothing, which the UI treats as accepted. */
export type CommandResult = { ok: true; routeId?: Id; orderId?: Id; warnings?: string[]; offerId?: Id } | { ok: false; error: CommandError };
export type { CommandError };

export interface SimBridge {
  getState(): SimSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(cmd: Command | OfferCommand | CabinCommand | PlannerCommand | HubCommand | FinanceCommand): CommandResult | void;
  /** Read-only sim state for the fleet planner (real bridge only). */
  getSim?(): SimState | null;
  setSpeed(speed: Speed): void;
  /** Resolve a pending decision card by choosing one of its options. */
  decide(decisionId: string, optionId: string): void;
  /** Save/load support (real bridge only). */
  serialize?(): SaveFile;
  loadGame?(save: SaveFile): void;
  newGame?(seed: number, options?: { hub?: string; name?: string; startYear?: number; presentYear?: number }): void;
}

export const DAYS_PER_SECOND: Record<Speed, number> = { 0: 0, 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };

const SAMPLE_DECISIONS: Decision[] = [
  {
    id: "launch-discount", day: 3, title: "Launch customer discount on A321neo",
    context: "The manufacturer offers 6% off list for 4 or more firm orders if you commit this month.",
    options: [
      { id: "order4", label: "Order 4 aircraft", effect: "−$41M cash, −$9.8M vs list" },
      { id: "order2", label: "Order 2 aircraft", effect: "−$20M cash, no discount" },
    ],
  },
];

const FLAVOUR: Array<[Severity, string]> = [
  ["good", "Load factor on LAX–SFO reached 88% this week."],
  ["info", "Heavy fog at SFO; 3 departures delayed."],
  ["warn", "Fuel price up 5% over the last 30 days."],
  ["good", "HNL crew base reached full staffing."],
  ["alert", "Aircraft N512SP failed its A-check inspection."],
  ["info", "Summer schedule submitted to SAN slot coordinator."],
];

/** Deterministic fake daily profit, USD. */
export function fakeDailyProfit(day: number): number {
  return Math.round(190_000 + day * 22 + 70_000 * Math.sin(day / 9) + 40_000 * Math.sin(day / 47));
}

export class MockSimBridge implements SimBridge {
  private world: WorldState = newWorld(1);
  private speed: Speed = 1;
  private cash: number;
  private frac = 0;
  private profits: number[] = [];
  private notices: Notice[] = [];
  private pending: Decision[] = [];
  private nextNotice = 1;
  private listeners = new Set<() => void>();
  private snap: SimSnapshot;
  private timer: ReturnType<typeof setInterval> | null = null;

  private routes: Route[];

  constructor(opts: { startPaused?: boolean; routes?: Route[] } = {}) {
    this.cash = this.world.cash;
    this.routes = opts.routes ?? [];
    if (opts.startPaused) this.speed = 0;
    this.profits = Array.from({ length: 30 }, (_, i) => fakeDailyProfit(i - 30));
    this.pushNotice(0, "info", "Welcome to Skybridge Pacific. Your fleet is waiting at LAX.");
    this.pushNotice(0, "warn", "Kestrel Air filed to start LAX–SAN service.");
    this.pushNotice(0, "good", "Q4 2014 audit closed with no findings.");
    this.release(0);
    this.snap = this.build();
  }

  /** Real-time driver. Not started by default so tests stay deterministic. */
  start(): void {
    if (this.timer) return;
    let last = performance.now();
    this.timer = setInterval(() => {
      const now = performance.now();
      this.advance(Math.min(now - last, 1000));
      last = now;
    }, 100);
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  /** Advance simulated time by `ms` of real time at the current speed. */
  advance(ms: number): void {
    const rate = DAYS_PER_SECOND[this.speed];
    if (rate === 0 || ms <= 0) return;
    this.frac += (ms / 1000) * rate;
    let stepped = 0;
    while (this.frac >= 1) {
      this.frac -= 1;
      this.world = stepDay(this.world);
      const p = fakeDailyProfit(this.world.day);
      this.cash += p;
      this.profits.push(p);
      if (this.profits.length > 30) this.profits.shift();
      this.onDay(this.world.day);
      stepped++;
    }
    if (stepped) this.emit();
  }

  getState = (): SimSnapshot => this.snap;
  subscribe = (l: () => void): (() => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };

  dispatch(cmd: Command | OfferCommand | CabinCommand | PlannerCommand | HubCommand | FinanceCommand): CommandResult | void {
    switch (cmd.kind) {
      case "setSpeed": this.setSpeed(cmd.speed); return;
      case "openRoute": {
        const err = validateRouteDraft(cmd.route, this.routes, undefined, undefined, this.world.day);
        if (err) return { ok: false, error: err };
        const route: Route = { ...cmd.route, id: `${cmd.route.origin}-${cmd.route.destination}` };
        this.routes = [...this.routes, route];
        this.pushNotice(this.world.day, "good", `Opened ${routeName(route)}, ${route.weeklyFrequency}/wk.`);
        this.emit();
        return { ok: true, routeId: route.id };
      }
      case "updateRoute": {
        const cur = this.routes.find((r) => r.id === cmd.id);
        if (!cur) return { ok: false, error: { code: "unknown_route", message: "That route no longer exists." } };
        const { targetLoadFactor: target, ...rest } = cmd.patch;
        const next: Route = { ...cur, ...rest, id: cur.id };
        if (target === null) delete next.targetLoadFactor;
        else if (target !== undefined) next.targetLoadFactor = target;
        const err = validateRouteDraft(next, this.routes, undefined, cur.id, this.world.day);
        if (err) return { ok: false, error: err };
        this.routes = this.routes.map((r) => (r.id === cur.id ? next : r));
        this.pushNotice(this.world.day, "info", `Updated ${routeName(next)}: ${next.weeklyFrequency}/wk, economy $${next.fares.Y}.`);
        this.emit();
        return { ok: true, routeId: cur.id };
      }
      case "closeRoute": {
        const cur = this.routes.find((r) => r.id === cmd.id);
        if (!cur) return { ok: false, error: { code: "unknown_route", message: "That route no longer exists." } };
        this.routes = this.routes.filter((r) => r.id !== cur.id);
        this.pushNotice(this.world.day, "warn", `Closed ${routeName(cur)}.`);
        this.emit();
        return { ok: true, routeId: cur.id };
      }
      default: return; // orderAircraft: accepted and ignored by the mock
    }
  }

  setSpeed(speed: Speed): void {
    if (speed === this.speed) return;
    this.speed = speed;
    this.emit();
  }

  decide(decisionId: string, optionId: string): void {
    const d = this.pending.find((x) => x.id === decisionId);
    if (!d) return;
    this.pending = this.pending.filter((x) => x !== d);
    const opt = d.options.find((o) => o.id === optionId);
    this.pushNotice(this.world.day, "info", `Decision made: ${opt?.label ?? optionId} (${d.title}).`);
    this.emit();
  }

  private onDay(day: number) {
    this.release(day);
    if (day % 6 === 0) {
      const f = FLAVOUR[(day / 6) % FLAVOUR.length]!;
      this.pushNotice(day, f[0], f[1]);
    }
  }
  private release(day: number) {
    for (const d of SAMPLE_DECISIONS) if (d.day === day && !this.pending.some((p) => p.id === d.id)) this.pending.push(d);
  }
  private pushNotice(day: number, severity: Severity, text: string) {
    this.notices = [{ id: this.nextNotice++, day, severity, text }, ...this.notices].slice(0, 50);
  }
  private build(): SimSnapshot {
    const series = this.profits.slice();
    return {
      day: this.world.day, speed: this.speed, cash: this.cash,
      profit30: series.reduce((a, b) => a + b, 0), profitSeries: series,
      notices: this.notices, decisions: this.pending, routes: this.routes,
      airline: { name: "Skybridge Pacific", hub: "LAX" },
      fleet: [], orders: [], offers: [], rivals: EMPTY_RIVALS, reports: {}, ledger: [],
    };
  }
  private emit() {
    this.snap = this.build();
    for (const l of this.listeners) l();
  }
}
