import type { Day } from "@arg/contracts";
import { fractionalYear } from "../time/calendar";
import { localFuelPrice, type FuelPlace } from "../world/regions";

/**
 * Jet-A price series, USD per US gallon, delivered to the aircraft on the US West Coast (excluding Hawaii premium).
 * Anchors are (calendar year as fraction, price); values between anchors are linearly interpolated, values before the
 * first are clamped, values after the last grow at FUEL_LONG_RUN_GROWTH per year (below).
 *
 * SOURCED (annual level), 2015-2025: annual means equal the FRED/EIA series AJFUELUSGULF (US Gulf Coast kerosene-type jet
 * fuel spot, USD/gal: 2015 1.522, 2016 1.252, 2017 1.558, 2018 2.027, 2019 1.879, 2020 1.099, 2021 1.858, 2022 3.374,
 * 2023 2.699, 2024 2.338, 2025 2.114) plus a flat 0.30 USD/gal West Coast into-plane premium. The 0.30 premium is an
 * APPROXIMATION (typical Gulf-to-LAX spread), not a sourced figure. The within-year SHAPE (2016 slump, 2020 collapse,
 * 2022 spike) is the older hand-drawn curve, rescaled so each calendar year averages to the sourced level; it is not
 * monthly data.
 *
 * SOURCED (monthly points), 2026: BTS "US airlines fuel cost per gallon", scheduled-service total (airline-paid): Dec 2025 2.32,
 * Mar 2026 about 3.17 (derived from the April release: April 4.11 was +29.6% on March), Apr 4.11, Jun 3.59, Jul 3.40, Aug 3.72;
 * Argus US average jet fuel 4.90 on 22 Oct 2026 (record; a single-day spot, taken here as about 4.60 for the late-October anchor).
 * 2026.10 (2.45, pre-spike), May and Sep (interpolated) are ASSUMPTIONS. BTS airline-paid cost is treated as comparable to the
 * West Coast delivered series above (their annual means differ by under 0.1 USD/gal in 2015-2025).
 *
 * ASSUMPTION, after Oct 2026 (no data exists): the spike eases over 2027 to a normalised 2.65 USD/gal by mid-2028, then grows
 * at FUEL_LONG_RUN_GROWTH (2% a year, about flat in real terms) without limit, so the series covers any campaign length.
 */
export const JET_A_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [2015.0, 1.99],
  [2015.5, 1.93],
  [2016.0, 1.43],
  [2016.2, 1.38],
  [2016.8, 1.71],
  [2017.5, 1.8],
  [2018.0, 2.09],
  [2018.8, 2.55],
  [2019.0, 2.15],
  [2019.6, 2.2],
  [2020.0, 2.16],
  [2020.3, 1.06],
  [2020.7, 1.29],
  [2021.2, 1.93],
  [2021.9, 2.47],
  [2022.4, 3.94],
  [2022.5, 4.45],
  [2022.9, 3.44],
  [2023.4, 2.83],
  [2023.9, 3.04],
  [2024.4, 2.65],
  [2024.9, 2.44],
  [2025.5, 2.41],
  [2026.0, 2.35],
  [2026.1, 2.45],
  [2026.2, 3.17],
  [2026.29, 4.11],
  [2026.38, 3.85],
  [2026.46, 3.59],
  [2026.54, 3.4],
  [2026.62, 3.72],
  [2026.71, 4.0],
  [2026.81, 4.6],
  [2027.3, 3.8],
  [2027.8, 3.2],
  [2028.5, 2.65],
];

/** ASSUMPTION: nominal growth per year of the Jet-A price after the last anchor (about 2% inflation, flat in real terms). */
export const FUEL_LONG_RUN_GROWTH = 0.02;

/** Extra USD/gal for fuel delivered in Hawaii (shipped in). Regional multipliers for the rest of the world: world/regions.ts. */
export const HAWAII_FUEL_PREMIUM = 0.35;
/** Jet-A kilograms per US gallon (density ~0.804 kg/L x 3.785 L). */
export const KG_PER_GALLON = 3.04;

/** West Coast base series, USD/gal (no regional adjustment). */
export function baseJetAPriceUsdPerGallon(day: Day): number {
  const y = fractionalYear(day);
  const a = JET_A_ANCHORS;
  const [yLast, pLast] = a[a.length - 1]!;
  let price = pLast * Math.pow(1 + FUEL_LONG_RUN_GROWTH, Math.max(0, y - yLast));
  if (y <= a[0]![0]) price = a[0]![1];
  else {
    for (let i = 1; i < a.length; i++) {
      const [y1, p1] = a[i]!;
      if (y <= y1) {
        const [y0, p0] = a[i - 1]!;
        price = p0 + ((p1 - p0) * (y - y0)) / (y1 - y0);
        break;
      }
    }
  }
  return price;
}

/**
 * Jet-A price at a place on a day. `place` is an airport (US state or European country rules of world/regions.ts) or a bare state code
 * ("CA", "HI"). CA, OR, WA and unknown places are the base series; HI adds 0.35 USD/gal exactly as before.
 */
export function jetAPriceUsdPerGallon(day: Day, place: FuelPlace = "CA"): number {
  return localFuelPrice(baseJetAPriceUsdPerGallon(day), day, place);
}

export function jetAPriceUsdPerKg(day: Day, place: FuelPlace = "CA"): number {
  return jetAPriceUsdPerGallon(day, place) / KG_PER_GALLON;
}
