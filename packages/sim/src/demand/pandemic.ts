import type { Airport, Day } from "@arg/contracts";
import { dayToDate, fractionalYear } from "../time/calendar";
import { regionGroupOf } from "../world/regions";

/**
 * Scripted COVID-19 demand shock, tied to the calendar (not to the start year, so any campaign passing through 2020 meets it).
 * `pandemicFactor` multiplies the demand of a pair on a day: 1 = no shock. Pure function of (day, airports, params).
 *
 * Shape (fractional calendar year, multiplier on what demand would have been). Two curves: DOMESTIC-LIKE (both ends in the same region
 * group of world/regions.ts, so US + territories, or Europe as one block; Hawaii is domestic) and INTERNATIONAL (anything else).
 *
 * SOURCED anchor statistics the curves are fitted to (the intra-year path is an APPROXIMATION drawn through them, not monthly data):
 * - BTS preliminary April 2020 vs April 2019, 24 US airlines: total -96.1% (3.0M vs 76.1M passengers), domestic -95.7%, international -98.6%.
 *   BTS May 2020 total about -89% vs May 2019.
 * - IATA full-year 2020 global RPK -65.8% vs 2019; full-year 2021 -58.4% vs 2019, of which domestic -28.2% and international -75.5%;
 *   December 2021 total -45.1% vs December 2019.
 * - Recovery beyond 2021 is an ASSUMPTION: domestic back to about 95% by mid-2022 and 100% in early 2023, international about 70% by
 *   mid-2022 and 100% in 2024 (IATA reported global RPK at roughly 2019 level during 2024; the sim's own 2.5%/yr market growth continues underneath).
 * Fit check (annual mean of the curves): domestic 2020 0.44, 2021 0.72; international 2020 0.29, 2021 0.27. The fares/yield side of 2020-21
 * and business-versus-leisure differences are NOT modelled (one multiplier for all segments).
 *
 * The user-facing switch is `SimParams.pandemic` (false = off; a custom start year or sandbox can disable it).
 */
export type PandemicAnchors = ReadonlyArray<readonly [year: number, multiplier: number]>;

export const PANDEMIC_DOMESTIC: PandemicAnchors = [
  [2020.0, 1], [2020.19, 1], [2020.22, 0.85], [2020.25, 0.2], [2020.29, 0.05], [2020.37, 0.12], [2020.46, 0.27],
  [2020.54, 0.37], [2020.7, 0.37], [2020.8, 0.4], [2020.95, 0.38],
  [2021.04, 0.42], [2021.12, 0.45], [2021.21, 0.55], [2021.29, 0.65], [2021.37, 0.74], [2021.46, 0.82], [2021.54, 0.88],
  [2021.62, 0.83], [2021.71, 0.8], [2021.79, 0.84], [2021.87, 0.86], [2021.96, 0.85],
  [2022.2, 0.9], [2022.5, 0.95], [2023.0, 1],
];

export const PANDEMIC_INTERNATIONAL: PandemicAnchors = [
  [2020.0, 1], [2020.19, 1], [2020.22, 0.7], [2020.25, 0.1], [2020.29, 0.015], [2020.37, 0.02], [2020.46, 0.05],
  [2020.54, 0.08], [2020.7, 0.1], [2020.8, 0.12], [2020.95, 0.14],
  [2021.04, 0.12], [2021.12, 0.13], [2021.21, 0.15], [2021.29, 0.17], [2021.37, 0.2], [2021.46, 0.25],
  [2021.54, 0.3], [2021.7, 0.33], [2021.79, 0.38], [2021.9, 0.42], [2021.96, 0.45],
  [2022.5, 0.7], [2022.96, 0.85], [2023.5, 0.95], [2024.0, 1],
];

function interp(a: PandemicAnchors, y: number): number {
  if (y <= a[0]![0]) return a[0]![1];
  for (let i = 1; i < a.length; i++) {
    const [y1, p1] = a[i]!;
    if (y <= y1) {
      const [y0, p0] = a[i - 1]!;
      return p0 + ((p1 - p0) * (y - y0)) / (y1 - y0);
    }
  }
  return a[a.length - 1]![1];
}

/** Demand multiplier for a pair on a day (1 outside 2020-2023, or when the shock is off). Domestic-like pairs: same region group. */
export function pandemicFactor(day: Day, a: Airport, b: Airport, enabled = true): number {
  if (!enabled) return 1;
  const y = fractionalYear(day);
  if (y < 2020 || y >= 2024) return 1;
  return interp(regionGroupOf(a.country) === regionGroupOf(b.country) ? PANDEMIC_DOMESTIC : PANDEMIC_INTERNATIONAL, y);
}

/** Calendar days (year, month 1-12, day) of the player-facing news items. */
export const PANDEMIC_NEWS: ReadonlyArray<{ year: number; month: number; day: number; text: string }> = [
  { year: 2020, month: 3, day: 11, text: "News: the WHO declares COVID-19 a pandemic. Travel restrictions are spreading and bookings are collapsing; expect demand to fall sharply over the coming weeks." },
  { year: 2020, month: 4, day: 15, text: "News: air travel has all but stopped. US airline passengers are down about 96% on last year and international travel about 99%. Cut capacity, protect cash and use your credit line carefully." },
  { year: 2020, month: 6, day: 15, text: "News: demand is slowly returning, led by domestic leisure travel. International and business travel will recover much more slowly." },
  { year: 2021, month: 6, day: 15, text: "News: vaccination is lifting domestic demand towards 80% of normal. International travel is still under 30% of normal." },
  { year: 2022, month: 6, day: 15, text: "News: the pandemic downturn is ending. Domestic demand is back to about 95% of normal and international about 70%." },
];

/** News texts that fall on `day`. */
export function pandemicNewsOn(day: Day): string[] {
  const d = dayToDate(day);
  if (d.year < 2020 || d.year > 2022) return [];
  return PANDEMIC_NEWS.filter((n) => n.year === d.year && n.month === d.month + 1 && n.day === d.dayOfMonth).map((n) => n.text);
}
