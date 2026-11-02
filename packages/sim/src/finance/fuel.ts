import type { Airport, Day } from "@arg/contracts";
import { fractionalYear } from "../time/calendar";

/**
 * Jet-A price series, USD per US gallon, 2015-2025, delivered to the aircraft on the US West Coast
 * (excluding Hawaii premium). HARD-CODED APPROXIMATION of the shape of public jet-fuel price history
 * (EIA US Gulf Coast kerosene-type jet fuel spot plus a typical West Coast into-plane premium). Anchors are
 * (calendar year as fraction, price); values between anchors are linearly interpolated, values outside the
 * range are clamped. These are NOT sourced data points; they are a plausible curve capturing the 2015-16
 * slump, 2018 rise, 2020 collapse, 2022 spike, and 2023-25 normalisation.
 */
export const JET_A_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [2015.0, 1.8],
  [2015.5, 1.75],
  [2016.0, 1.3],
  [2016.2, 1.25],
  [2016.8, 1.55],
  [2017.5, 1.65],
  [2018.0, 1.9],
  [2018.8, 2.3],
  [2019.0, 1.95],
  [2019.6, 2.0],
  [2020.0, 1.95],
  [2020.3, 0.95],
  [2020.7, 1.15],
  [2021.2, 1.8],
  [2021.9, 2.3],
  [2022.4, 3.9],
  [2022.5, 4.4],
  [2022.9, 3.4],
  [2023.4, 2.7],
  [2023.9, 2.9],
  [2024.4, 2.55],
  [2024.9, 2.35],
  [2025.5, 2.3],
  [2026.0, 2.25],
];

/** Extra USD/gal for fuel delivered in Hawaii (shipped in). */
export const HAWAII_FUEL_PREMIUM = 0.35;
/** Jet-A kilograms per US gallon (density ~0.804 kg/L x 3.785 L). */
export const KG_PER_GALLON = 3.04;

export function jetAPriceUsdPerGallon(day: Day, region: Airport["region"] = "CA"): number {
  const y = fractionalYear(day);
  const a = JET_A_ANCHORS;
  let price = a[a.length - 1]![1];
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
  return price + (region === "HI" ? HAWAII_FUEL_PREMIUM : 0);
}

export function jetAPriceUsdPerKg(day: Day, region: Airport["region"] = "CA"): number {
  return jetAPriceUsdPerGallon(day, region) / KG_PER_GALLON;
}
