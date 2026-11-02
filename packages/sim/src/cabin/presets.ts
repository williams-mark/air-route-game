import type { AircraftType, CabinClass, CabinLayout, CabinSection } from "@arg/contracts";
import { cabinGeometry } from "./geometry";
import { allowedAcross, layoutLengthM, rowsFitting, SECTION_DIVIDER_M, INCH_M } from "./rules";

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

/** Three starting points: high-density low-cost, standard two-class, premium three/four-class. */
export function suggestLayouts(type: AircraftType): LayoutPreset[] {
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
