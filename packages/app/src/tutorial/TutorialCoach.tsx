import { useEffect, useState, type ReactNode } from "react";
import { aircraftTypes, airportById } from "@arg/data";
import { distanceKm } from "@arg/sim";
import { typeShortName } from "../aircraft/names";
import { bridge, useSim } from "../sim/useSim";
import { useUi } from "../store";
import { useCreation, useToasts } from "../routes/store";
import { marketFares } from "../routes/helpers";
import {
  advance, AWARDS, DEREGULATION_LABEL, finishTutorial, FREQUENCY_ROUTE, nextStep, STEPS, TUTORIAL_HUB, withAwards,
  type Award, type StepId, type TutorialState,
} from "./script";
import "./tutorial.css";

const typeName = (id: string) => { const t = aircraftTypes.find((x) => x.id === id); return t ? typeShortName(t) : id; };
const city = (id: string) => airportById.get(id)?.city ?? id;
const awardText = (w: Award) => `${TUTORIAL_HUB} to ${w.to} (${city(w.to)}), ${w.frequency} round trips a week on the ${typeName(w.typeId)}`;

/** Open the Board's awarded routes at the benchmark fare (the Board set fares too). Returns the first error, if any. */
function acceptAwards(t: TutorialState, awards: readonly Award[]): string | null {
  const next = withAwards(t, awards);
  bridge.setTutorial?.(next); // the bridge lets awarded pairs through
  const routes = bridge.getState().routes;
  for (const w of awards) {
    if (routes.some((r) => (r.origin === TUTORIAL_HUB && r.destination === w.to) || (r.origin === w.to && r.destination === TUTORIAL_HUB))) continue;
    const a = airportById.get(TUTORIAL_HUB), b = airportById.get(w.to);
    if (!a || !b) return `Unknown airport ${w.to}.`;
    const res = bridge.dispatch({ kind: "openRoute", route: { origin: TUTORIAL_HUB, destination: w.to, weeklyFrequency: w.frequency, fares: { Y: marketFares(distanceKm(a, b), a, b).Y }, typeId: w.typeId } });
    if (res && !res.ok) return res.error.message;
  }
  return null;
}

interface StepCopy {
  title: string;
  body: ReactNode;
  /** Element to highlight (CSS selector). */
  target?: string;
  /** What to do, shown under the body. */
  todo?: string;
}

function copy(step: StepId): StepCopy {
  switch (step) {
    case "intro": return {
      title: "Welcome to 1978",
      body: <>
        <p>It is January 1978 and you run a small airline at Los Angeles (LAX). US air travel is <b>regulated</b>: the government's Civil Aeronautics Board (CAB) decides which airlines may fly which interstate routes, and it sets the fares.</p>
        <p>You cannot pick your own routes yet. The Board will award them to you, and this tutorial shows you how to run them. Deregulation is coming: the Airline Deregulation Act will be signed on {DEREGULATION_LABEL}.</p>
      </>,
    };
    case "fleet": return {
      title: "Meet your fleet",
      target: '.toolbar button[aria-label="Fleet"]',
      todo: "Open the Fleet screen.",
      body: <p>You own two Boeing 727-200 Advanced for longer routes and two McDonnell Douglas DC-9-30 for short ones. An aircraft costs money every day whether it flies or not, so idle aircraft are a loss.</p>,
    };
    case "award1": return {
      title: "Your first route certificate",
      body: <>
        <p>The Board has awarded you <b>{awardText(AWARDS.award1[0]!)}</b>. The fare is the one the Board sets.</p>
        <p className="hint">Routes inside one state, such as Los Angeles to San Francisco, were outside the Board's reach; that is why the awards here cross state lines.</p>
      </>,
      todo: "Accept the certificate to start flying it.",
    };
    case "clock": return {
      title: "Start the clock",
      target: ".time-pill",
      todo: "Press Space, or the play button, and let two weeks pass. Keys 1 to 5 change the speed.",
      body: <p>The game is paused. Time runs in days; every day your aircraft fly, passengers buy tickets and costs are paid.</p>,
    };
    case "routes": return {
      title: "How is the route doing?",
      target: '.toolbar button[aria-label="Routes"]',
      todo: "Open the Routes screen.",
      body: <p>The Routes screen lists every route you fly with its weekly profit and how full the flights are (load factor).</p>,
    };
    case "inspect": return {
      title: "Inspect a route",
      target: `button.row-link[aria-label^="Inspect ${TUTORIAL_HUB}–${FREQUENCY_ROUTE.to}"], button.row-link[aria-label^="Inspect ${FREQUENCY_ROUTE.to}–${TUTORIAL_HUB}"]`,
      todo: `Click the ${TUTORIAL_HUB}–${FREQUENCY_ROUTE.to} row.`,
      body: <p>The route inspector shows where the money comes from: revenue, fuel, crew, airport fees and aircraft costs.</p>,
    };
    case "frequency": return {
      title: "Compete on frequency",
      target: ".route-panel",
      todo: `In the route panel, change Flights / wk to 21 and press Apply changes.`,
      body: <p>With fares fixed by the Board, airlines competed on how often they flew. You may change the frequency of a route you hold. More flights carry more passengers, but each one costs fuel and crew, and needs aircraft time (block hours).</p>,
    };
    case "award2": return {
      title: "Two more certificates",
      body: <>
        <p>The Board has awarded you:</p>
        <ul>{AWARDS.award2.map((w) => <li key={w.to}>{awardText(w)}</li>)}</ul>
      </>,
      todo: "Accept them.",
    };
    case "finance": return {
      title: "Follow the money",
      target: '.toolbar button[aria-label="Finance"]',
      todo: "Open the Finance screen.",
      body: <p>Finance adds your routes up and takes off the costs that belong to no single route: head office, sales and idle aircraft. Cash below zero uses your credit line; stay beyond it too long and the airline goes bankrupt.</p>,
    };
    case "competitors": return {
      title: "Other airlines",
      target: '.toolbar button[aria-label="Competitors"]',
      todo: "Open the Competitors screen.",
      body: <p>Other airlines hold certificates too. Competitors shows where they fly, how often and on what. Their finances are hidden.</p>,
    };
    case "orders": return {
      title: "Ordering aircraft",
      target: '.toolbar button[aria-label="Orders / Offers"]',
      todo: "Open Orders / Offers. You do not need to buy anything.",
      body: <p>New aircraft are ordered from the manufacturers and arrive later. A purchase needs a deposit now and the rest on delivery; a lease costs less up front and more each month.</p>,
    };
    case "deregulation": return {
      title: "Wait for deregulation",
      target: ".time-pill",
      todo: `Run the clock to ${DEREGULATION_LABEL}. Speed 5 is the fastest; the game pauses on the day.`,
      body: <p>Until then the Board picks your routes and the route planner stays locked. Intrastate airlines in California and Texas, outside the Board's control, had shown that lower fares could fill aircraft, and that helped persuade Congress.</p>,
    };
    case "freeRoute": return {
      title: "Deregulation: choose your own route",
      target: ".hud-btn, .view .page-head button.primary",
      todo: "Press Plan a route from LAX, pick a destination (type a code or click the map), and press Open route.",
      body: <>
        <p>The Act is signed. You may now fly any route you have aircraft for. The planner shows the market, rivals and a profit projection before you commit. Your 727s have spare time for a longer route.</p>
        <p className="hint">In reality the Board's route controls were phased out over the next few years; here they end on the day the Act is signed.</p>
      </>,
    };
    case "done": return {
      title: "Tutorial complete",
      body: <p>You have run a regulated airline and opened your first route of your own. Keep playing this airline, or start a full game from the main menu: any year from 1965, any hub, with harder competitors.</p>,
    };
  }
}

/** Highlight `selector` while the step is shown (outline pulse; first match only). Re-applied on every render, as views come and go. */
function useHighlight(selector: string | undefined) {
  useEffect(() => {
    if (!selector) return;
    const el = document.querySelector(selector);
    el?.classList.add("tut-target");
    return () => { el?.classList.remove("tut-target"); };
  });
}

/** The coach card of the tutorial mode: one step at a time, advanced by what the player does in the game. */
export function TutorialCoach() {
  const sim = useSim();
  const view = useUi((s) => s.view);
  const selection = useUi((s) => s.selection);
  const startOpen = useUi((s) => s.startOpen);
  const push = useToasts((s) => s.push);
  const [min, setMin] = useState(false);
  const t = sim.tutorial;

  // Advance whenever the game or the UI shows the current step is done.
  useEffect(() => {
    if (!t || t.finished) return;
    const next = advance(t, { day: sim.day, speed: sim.speed, view, selectedRouteId: selection?.kind === "route" ? selection.id : null, routes: sim.routes });
    if (next !== t) { bridge.setTutorial?.(next); setMin(false); }
  }, [t, sim.day, sim.speed, sim.routes, view, selection]);

  const c = t && !t.finished ? copy(t.step) : null;
  useHighlight(!min && !startOpen ? c?.target : undefined);
  if (!t || t.finished || !c || startOpen) return null;

  const n = STEPS.indexOf(t.step) + 1;
  const accept = (awards: readonly Award[]) => {
    const err = acceptAwards(t, awards);
    if (err) push("alert", err); else push("good", `Certificate accepted: ${awards.map((w) => `${TUTORIAL_HUB}–${w.to}`).join(", ")}.`);
  };
  const skip = () => { bridge.setTutorial?.(finishTutorial(t)); push("info", "Tutorial closed. Routes are open to you now."); };

  if (min) {
    return (
      <button className="tut-pill" onClick={() => setMin(false)} aria-label={`Show tutorial, step ${n} of ${STEPS.length}: ${c.title}`}>
        Tutorial {n}/{STEPS.length}: {c.title}
      </button>
    );
  }
  return (
    <section className="tut-card" role="region" aria-label="Tutorial" aria-live="polite">
      <header className="tut-head">
        <span className="tut-step">Tutorial {"·"} step {n} of {STEPS.length}{t.deregulated ? "" : " · regulated era"}</span>
        <button className="icon-btn" aria-label="Minimize tutorial" title="Minimize" onClick={() => setMin(true)}>{"–"}</button>
      </header>
      <h2>{c.title}</h2>
      <div className="tut-body">{c.body}</div>
      {c.todo && <p className="tut-todo"><span aria-hidden="true">{"→ "}</span>{c.todo}</p>}
      <div className="tut-actions">
        {t.step === "intro" && <button className="primary" onClick={() => bridge.setTutorial?.(nextStep(t, sim.day))}>Start</button>}
        {(t.step === "award1" || t.step === "award2") && <button className="primary" onClick={() => accept(AWARDS[t.step as "award1" | "award2"])}>Accept {AWARDS[t.step as "award1" | "award2"].length > 1 ? "certificates" : "certificate"}</button>}
        {t.step === "freeRoute" && <button className="primary" onClick={() => { setMin(true); useCreation.getState().begin(TUTORIAL_HUB); }}>Plan a route from {TUTORIAL_HUB}</button>}
        {t.step === "done" && <>
          <button className="primary" onClick={() => bridge.setTutorial?.(finishTutorial(t))}>Keep playing</button>
          <button onClick={() => { bridge.setTutorial?.(finishTutorial(t)); useUi.getState().setStartOpen(true); }}>Main menu</button>
        </>}
        {t.step !== "done" && <button className="link-btn" onClick={skip}>Skip tutorial</button>}
      </div>
    </section>
  );
}
