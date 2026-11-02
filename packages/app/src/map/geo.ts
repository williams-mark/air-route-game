const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function distanceKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Great-circle sample points [lon, lat], n >= 2 points inclusive of both ends. */
export function greatCircle(lon1: number, lat1: number, lon2: number, lat2: number, n: number): [number, number][] {
  const φ1 = rad(lat1), λ1 = rad(lon1), φ2 = rad(lat2), λ2 = rad(lon2);
  const d = distanceKm(lon1, lat1, lon2, lat2) / R;
  const out: [number, number][] = [];
  if (d < 1e-9) return [[lon1, lat1], [lon2, lat2]];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const a = Math.sin((1 - f) * d) / Math.sin(d), b = Math.sin(f * d) / Math.sin(d);
    const x = a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2);
    const y = a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2);
    const z = a * Math.sin(φ1) + b * Math.sin(φ2);
    out.push([deg(Math.atan2(y, x)), deg(Math.atan2(z, Math.hypot(x, y)))]);
  }
  return out;
}

/** Bearing in degrees clockwise from north, in lon/lat plane scaled for latitude (matches Mercator look). */
export function screenBearing(a: [number, number], b: [number, number]): number {
  const lat = rad((a[1] + b[1]) / 2);
  const dx = (b[0] - a[0]) * Math.cos(lat);
  // Mercator screen ratio is dLon : dLat/cos(lat), i.e. dLon*cos : dLat.
  const dy = b[1] - a[1];
  return (deg(Math.atan2(dx, dy)) + 360) % 360;
}
