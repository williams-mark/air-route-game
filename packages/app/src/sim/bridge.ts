// UI <-> sim boundary. The UI only talks to a SimBridge; swap `createBridge` to plug in the real sim.
import type { Command, Day, WorldState } from "@arg/contracts";
import { newWorld, stepDay } from "@arg/sim";

export type Speed = 0 | 1 | 2 | 3 | 4 | 5;
export type Severity = "info" | "good" | "warn" | "alert";

export interface Notice { id: number; day: Day; severity: Severity; text: string }
export interface DecisionOption { id: string; label: string; effect: string }
export interface Decision { id: string; day: Day; title: string; context: string; options: DecisionOption[] }

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
  airline: { name: string; hub: string };
}

export interface SimBridge {
  getState(): SimSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(cmd: Command): void;
  setSpeed(speed: Speed): void;
  /** Resolve a pending decision card by choosing one of its options. */
  decide(decisionId: string, optionId: string): void;
}

export const DAYS_PER_SECOND: Record<Speed, number> = { 0: 0, 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };

const SAMPLE_DECISIONS: Decision[] = [
  {
    id: "kestrel-fares", day: 0, title: "Kestrel Air cut LAX–SAN fares 12%",
    context: "A competitor undercut you on your busiest short-haul route. Load factor has dipped 4 points this week.",
    options: [
      { id: "match", label: "Match the cut", effect: "Hold share, −$38K/wk profit" },
      { id: "partial", label: "Cut 6% and add a frequency", effect: "Lose ~3% share, −$14K/wk" },
      { id: "hold", label: "Hold fares", effect: "Lose ~9% share, +$6K/wk margin" },
    ],
  },
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

  constructor(opts: { startPaused?: boolean } = {}) {
    this.cash = this.world.cash;
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

  dispatch(cmd: Command): void {
    if (cmd.kind === "setSpeed") this.setSpeed(cmd.speed);
    // Other commands are accepted and ignored by the mock.
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
      notices: this.notices, decisions: this.pending,
      airline: { name: "Skybridge Pacific", hub: "LAX" },
    };
  }
  private emit() {
    this.snap = this.build();
    for (const l of this.listeners) l();
  }
}

/** The one place to swap the mock for the real sim bridge. */
export function createBridge(): SimBridge & { start?: () => void } {
  const b = new MockSimBridge();
  b.start();
  return b;
}
