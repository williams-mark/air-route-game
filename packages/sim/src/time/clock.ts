import type { Day } from "@arg/contracts";

export type Speed = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Simulated days per real second at each speed.
 * 0 paused; 1 = 1 day / 2 s; 2 = 1 day / s; 3 = 3 days / s; 4 = 1 week / s; 5 = ~1 month / s.
 */
export const DAYS_PER_SECOND: Readonly<Record<Speed, number>> = {
  0: 0,
  1: 0.5,
  2: 1,
  3: 3,
  4: 7,
  5: 30,
};

/** An event asking the clock to slow down (e.g. a bankruptcy warning or a new aircraft delivery). */
export interface AutoSlowRequest {
  /** Speed is clamped to at most this value (0 pauses). */
  maxSpeed: Speed;
  reason: string;
}

/**
 * Hook implemented by whoever knows about upcoming events. Called once for every day the clock
 * grants, with that day number (the day about to be simulated). Return a request to slow/pause
 * the clock; the granted batch ends on that day so the caller can react before more days run.
 */
export interface AutoSlowHook {
  check(day: Day, speed: Speed): AutoSlowRequest | null;
}

export interface ClockOptions {
  startDay?: Day;
  speed?: Speed;
  hook?: AutoSlowHook;
  /** Real-time delta is clamped to this (ms) so a backgrounded tab cannot trigger a huge catch-up. */
  maxDtMs?: number;
}

export interface Clock {
  readonly day: Day;
  readonly speed: Speed;
  /** Fractional real-time progress towards the next day, in days (0 <= x < 1). */
  readonly accumulator: number;
  /** The most recent auto-slow that fired, until cleared by `setSpeed`. */
  readonly lastAutoSlow: AutoSlowRequest | null;
  setSpeed(speed: Speed): void;
  setHook(hook: AutoSlowHook | undefined): void;
  /**
   * Feed real elapsed milliseconds. Returns the number of whole days the caller must now step the
   * simulation (each step advances sim day by 1). The clock's `day` is advanced by the same amount.
   */
  advance(dtMs: number): number;
}

export function createClock(opts: ClockOptions = {}): Clock {
  let day = opts.startDay ?? 0;
  let speed: Speed = opts.speed ?? 0;
  let acc = 0;
  let hook = opts.hook;
  let lastAutoSlow: AutoSlowRequest | null = null;
  const maxDt = opts.maxDtMs ?? 1000;

  return {
    get day() { return day; },
    get speed() { return speed; },
    get accumulator() { return acc; },
    get lastAutoSlow() { return lastAutoSlow; },
    setSpeed(s) {
      speed = s;
      lastAutoSlow = null;
      if (s === 0) acc = 0;
    },
    setHook(h) { hook = h; },
    advance(dtMs) {
      if (speed === 0 || !(dtMs > 0)) return 0;
      acc += (Math.min(dtMs, maxDt) / 1000) * DAYS_PER_SECOND[speed];
      const whole = Math.floor(acc);
      acc -= whole;
      let granted = 0;
      while (granted < whole) {
        day += 1;
        granted += 1;
        const req = hook?.check(day, speed);
        if (req) {
          lastAutoSlow = req;
          if (req.maxSpeed < speed) speed = req.maxSpeed;
          acc = 0;
          break;
        }
      }
      return granted;
    },
  };
}
