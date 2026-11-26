// Tutorial game mode: an airline in 1978, before US airline deregulation. Until the Airline Deregulation Act the
// government's Civil Aeronautics Board (CAB) decided which interstate routes an airline could fly; here the Board "awards"
// the player routes step by step, and the player can open routes of their own only once the Act is signed.
// Pure: state in, state out. The bridge stores the state in the save file and enforces `regulationBlock`; the coach card
// (TutorialCoach.tsx) shows the steps and advances them with `advance`.
import type { Day, Id, Route } from "@arg/contracts";
import { jan1Day } from "@arg/sim";

export const TUTORIAL_YEAR = 1978;
export const TUTORIAL_HUB = "LAX";
export const TUTORIAL_SEED = 1978;
/** Two Boeing 727-200 Advanced for the longer routes and two DC-9-30 for the short ones, both in production in 1978. */
export const TUTORIAL_FLEET: ReadonlyArray<readonly [string, number]> = [["B727-200ADV", 2], ["DC9-30", 2]];
/** The Airline Deregulation Act was signed on 24 October 1978 (day 296 of a non-leap year, counting 1 January as 0). */
export const DEREGULATION_DAY: Day = jan1Day(TUTORIAL_YEAR) + 296;
export const DEREGULATION_LABEL = "24 October 1978";

/** A route the Board awards: from the hub, on a type and at a weekly frequency the player may later change. */
export interface Award { to: Id; typeId: Id; frequency: number }

/** Route awards, by the step that hands them out. All interstate: intrastate routes (LAX to SFO) were outside the Board's reach. */
export const AWARDS: Readonly<Record<"award1" | "award2", readonly Award[]>> = {
  award1: [{ to: "PHX", typeId: "DC9-30", frequency: 14 }],
  award2: [{ to: "SEA", typeId: "B727-200ADV", frequency: 14 }, { to: "LAS", typeId: "DC9-30", frequency: 14 }],
};
/** The awarded route the player is asked to change the frequency of. */
export const FREQUENCY_ROUTE = AWARDS.award1[0]!;

export type StepId =
  | "intro" | "fleet" | "award1" | "clock" | "routes" | "inspect" | "frequency" | "award2"
  | "finance" | "competitors" | "orders" | "deregulation" | "freeRoute" | "done";
export const STEPS: readonly StepId[] = [
  "intro", "fleet", "award1", "clock", "routes", "inspect", "frequency", "award2",
  "finance", "competitors", "orders", "deregulation", "freeRoute", "done",
];

export interface TutorialState {
  step: StepId;
  /** Day the current step began (the clock step waits for two weeks to pass). */
  stepDay: Day;
  /** Unordered airport pairs the Board has awarded ("LAX-PHX", ids sorted). */
  awarded: string[];
  /** True once the Act is signed: route creation is open to the player. */
  deregulated: boolean;
  /** The player finished or skipped the tutorial; the coach card is gone and nothing is regulated. */
  finished: boolean;
}

export const pairKey = (a: Id, b: Id): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function initialTutorial(day: Day): TutorialState {
  return { step: "intro", stepDay: day, awarded: [], deregulated: false, finished: false };
}

/** Whether route creation is still regulated (the Board picks the routes). */
export const regulated = (t: TutorialState | null | undefined): boolean => !!t && !t.deregulated && !t.finished;

export const REGULATED_MESSAGE = `Routes are regulated: the Civil Aeronautics Board decides which routes you may fly. You can open routes of your own after deregulation on ${DEREGULATION_LABEL}.`;

/** Why a route-opening command is refused under regulation, or null when it may go ahead. */
export function regulationBlock(t: TutorialState | null | undefined, cmd: { kind: string; route?: { origin: Id; destination: Id }; origin?: Id; destination?: Id }): string | null {
  if (!regulated(t)) return null;
  if (cmd.kind !== "openRoute" && cmd.kind !== "openCategoryRoute") return null;
  const a = cmd.route?.origin ?? cmd.origin, b = cmd.route?.destination ?? cmd.destination;
  if (a && b && t!.awarded.includes(pairKey(a, b))) return null;
  return REGULATED_MESSAGE;
}

/** Add awards to the state (before the routes are opened, so the bridge lets them through). */
export function withAwards(t: TutorialState, awards: readonly Award[], hub: Id = TUTORIAL_HUB): TutorialState {
  const keys = awards.map((w) => pairKey(hub, w.to)).filter((k) => !t.awarded.includes(k));
  return keys.length === 0 ? t : { ...t, awarded: [...t.awarded, ...keys] };
}

/** Deregulation: the Act is signed on its date (checked every simulated day). */
export function deregulateIfDue(t: TutorialState, day: Day): TutorialState {
  return !t.deregulated && day >= DEREGULATION_DAY ? { ...t, deregulated: true } : t;
}

/** What the coach needs to know to decide whether the current step is done. */
export interface Progress {
  day: Day;
  speed: number;
  view: string;
  selectedRouteId: Id | null;
  routes: readonly Route[];
}

const hasRoute = (routes: readonly Route[], a: Id, b: Id) => routes.find((r) => pairKey(r.origin, r.destination) === pairKey(a, b));

/** True when the player has done what the step asks. Steps with a button ("intro", "done") never finish on their own. */
export function stepDone(t: TutorialState, p: Progress): boolean {
  switch (t.step) {
    case "intro": case "done": return false;
    case "fleet": return p.view === "fleet";
    case "award1": case "award2": return AWARDS[t.step].every((w) => !!hasRoute(p.routes, TUTORIAL_HUB, w.to));
    case "clock": return p.day - t.stepDay >= 14;
    case "routes": return p.view === "routes";
    case "inspect": {
      const r = hasRoute(p.routes, TUTORIAL_HUB, FREQUENCY_ROUTE.to);
      return !!r && p.selectedRouteId === r.id;
    }
    case "frequency": {
      const r = hasRoute(p.routes, TUTORIAL_HUB, FREQUENCY_ROUTE.to);
      return !!r && r.weeklyFrequency !== FREQUENCY_ROUTE.frequency;
    }
    case "finance": return p.view === "finance";
    case "competitors": return p.view === "rivals";
    case "orders": return p.view === "orders";
    case "deregulation": return t.deregulated;
    case "freeRoute": return p.routes.some((r) => !t.awarded.includes(pairKey(r.origin, r.destination)));
  }
}

/** The next step (the last one stays put). */
export function nextStep(t: TutorialState, day: Day): TutorialState {
  const i = STEPS.indexOf(t.step);
  const step = STEPS[Math.min(STEPS.length - 1, i + 1)]!;
  return step === t.step ? t : { ...t, step, stepDay: day };
}

/** Advance past every step that is already done (deregulation can arrive before the player reaches its step). */
export function advance(t: TutorialState, p: Progress): TutorialState {
  let cur = t;
  for (let guard = 0; guard < STEPS.length && !cur.finished && stepDone(cur, p); guard++) cur = nextStep(cur, p.day);
  return cur;
}

/** Skip or finish: nothing is regulated any more and the coach goes away. */
export const finishTutorial = (t: TutorialState): TutorialState => ({ ...t, deregulated: true, finished: true, step: "done" });

const STEP_IDS = new Set<string>(STEPS);
/** Validation of a saved tutorial state; null when absent or usable, else the problem. */
export function tutorialProblem(x: unknown): string | null {
  if (x === undefined || x === null) return null;
  const o = x as Record<string, unknown>;
  if (typeof o !== "object" || Array.isArray(o)) return "the saved tutorial is damaged";
  if (typeof o.step !== "string" || !STEP_IDS.has(o.step) || typeof o.stepDay !== "number" || !Number.isFinite(o.stepDay)
    || !Array.isArray(o.awarded) || o.awarded.some((k) => typeof k !== "string")
    || typeof o.deregulated !== "boolean" || typeof o.finished !== "boolean") return "the saved tutorial is damaged";
  return null;
}
