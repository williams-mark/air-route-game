import type { Airport } from "@arg/contracts";

const EARTH_RADIUS_KM = 6371;

/** Great-circle (haversine) distance between two lat/lon points in km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function distanceKm(a: Airport, b: Airport): number {
  return haversineKm(a.lat, a.lon, b.lat, b.lon);
}
