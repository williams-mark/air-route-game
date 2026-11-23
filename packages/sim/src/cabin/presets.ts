import type { AircraftType, CabinClass, CabinLayout, CabinSection } from "@arg/contracts";
import { cabinGeometry } from "./geometry";
import { allowedAcross, deckLengths, layoutLengthM, rowsFitting, SECTION_DIVIDER_M, INCH_M } from "./rules";
import { fillDeckSection, upperDeckOf } from "./decks";
import { defaultLayout } from "../fleet/layout";

export interface LayoutPreset { id: "highDensity" | "standard" | "premium"; label: string; description: string; layout: CabinLayout }

const sec = (cls: CabinClass, rows: number, seatsAcross: number, pitchIn: number): CabinSection => ({ cls, rows, seatsAcross, pitchIn });

/** Fill the remaining usable length with economy rows, capped by maxSeats. */
function withEconomy(type: AircraftType, front: CabinSection[], across: number, pitch: number): CabinLayout {
  const geo = cabinGeometry(type);
  const used = layoutLengthM({ sections: front }) + (front.length > 0 ? SECTION_DIVIDER_M : 0);
  const byLength = rowsFitting(geo.usableLengthM - used, pitch);
  const frontSeats = front.reduce((n, s) => n + s.rows * s.seatsAcross, 0);
  const bySeats = Math.floor((type.maxSeats - frontSeats) / across);
  const rows = Math.max(1, Math.min(byLength, bySeats));
  return { sections: [...front, sec("Y", rows, across, pitch)] };
}

function pickAcross(type: AircraftType, cls: CabinClass, prefer: number): number | null {
  const opts = allowedAcross(type, cls).map((o) => o.across);
  if (opts.length === 0) return null;
  return opts.reduce((best, n) => (Math.abs(n - prefer) < Math.abs(best - prefer) ? n : best), opts[0]!);
}

/** Seats in a list of sections. */
const seatsIn = (secs: readonly CabinSection[]) => secs.reduce((n, s) => n + s.rows * s.seatsAcross, 0);

/** Presets for the 747 and A380 with the upper deck set up (its own seats across: cabin/decks.ts). */
function twoDeckPresets(type: AircraftType): LayoutPreset[] | null {
  const up = upperDeckOf(type), lengths = deckLengths(type);
  if (!up || !lengths) return null;
  const geo = cabinGeometry(type);
  const yMax = geo.maxAbreast, a380 = up.aisles === 2;
  const upY = up.across.Y[up.across.Y.length - 1]!.across;
  const build = (upper: (CabinSection | null)[], main: (CabinSection | null)[]): CabinLayout => ({ sections: [...upper, ...main].filter((s): s is CabinSection => s !== null) });

  // High density: economy on both decks at 28 in, within the certified maximum.
  const dUp: CabinSection[] = [];
  const dy = fillDeckSection(dUp, lengths.upper, "Y", upY, 28, "upper", Infinity, type.maxSeats);
  if (dy) dUp.push(dy);
  const dense = build(dUp, [fillDeckSection([], lengths.main, "Y", yMax, 28, "main", Infinity, type.maxSeats - seatsIn(dUp))]);

  // Premium: first on the main deck nose, business upstairs (A380: plus premium economy), premium economy and economy below.
  const pUp: CabinSection[] = [];
  const pj = fillDeckSection(pUp, lengths.upper, "J", 4, 62, "upper", a380 ? 14 : Infinity);
  if (pj) pUp.push(pj);
  if (a380) { const pw = fillDeckSection(pUp, lengths.upper, "W", 7, 38, "upper"); if (pw) pUp.push(pw); }
  const pMain: CabinSection[] = [];
  if (type.maxSeats >= 380) pMain.push(sec("F", 2, 4, 80));
  pMain.push(sec("W", a380 ? 4 : 5, 7, 38));
  const yMid = geo.yAbreast[Math.floor((geo.yAbreast.length - 1) / 2)]!;
  const py = fillDeckSection(pMain, lengths.main, "Y", yMid, 32, "main", Infinity, type.maxSeats - seatsIn(pUp) - seatsIn(pMain));
  if (py) pMain.push(py);
  const premium = build(pUp, pMain);
  return [
    { id: "highDensity", label: "High density", description: `All economy at minimum pitch on both decks (${upY} across upstairs): most seats, lowest comfort.`, layout: dense },
    { id: "standard", label: "Standard", description: a380 ? "Business 1-2-1 and economy 2-4-2 upstairs, economy 3-4-3 on the main deck." : "Business 2-2 on the upper deck, premium economy and economy on the main deck.", layout: defaultLayout(type) },
    { id: "premium", label: "Premium", description: "First in the nose, roomier business upstairs, premium economy and roomier economy below.", layout: premium },
  ];
}

/** Three starting points: high-density low-cost, standard two-class, premium three/four-class. */
export function suggestLayouts(type: AircraftType): LayoutPreset[] {
  const twoDeck = twoDeckPresets(type);
  if (twoDeck) return twoDeck;
  const geo = cabinGeometry(type);
  const wide = geo.bodyClass === "widebody";
  const yMax = geo.maxAbreast;
  const yMid = geo.yAbreast[Math.floor((geo.yAbreast.length - 1) / 2)]!;
  const jAcross = pickAcross(type, "J", wide ? 4 : 4);
  const wAcross = pickAcross(type, "W", wide ? 7 : 6);
  const fAcross = pickAcross(type, "F", wide ? 4 : 2);

  const dense = withEconomy(type, [], yMax, 28);
  const standardFront: CabinSection[] = jAcross ? [sec("J", wide ? 5 : 3, jAcross, wide ? 60 : 37)] : [];
  const standard = withEconomy(type, standardFront, yMid, 31);
  const premFront: CabinSection[] = [];
  if (fAcross && wide && type.maxSeats >= 380) premFront.push(sec("F", 2, fAcross, 80));
  if (jAcross) premFront.push(sec("J", wide ? 7 : 4, jAcross, wide ? 62 : 38));
  if (wAcross && type.maxSeats >= 150) premFront.push(sec("W", wide ? 5 : 3, wAcross, 38));
  const premium = withEconomy(type, premFront, yMid, wide ? 32 : 32);
  return [
    { id: "highDensity", label: "High density", description: "All economy at minimum pitch: most seats, lowest comfort. Low-cost style.", layout: dense },
    { id: "standard", label: "Standard", description: "Two classes: a small business cabin and economy at normal pitch.", layout: standard },
    { id: "premium", label: "Premium", description: wide ? "Four classes with generous pitch; relies on strong business and premium demand." : "Business and premium economy up front with roomier economy.", layout: premium },
  ];
}
void INCH_M;
