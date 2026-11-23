// Land polygons that cross the 180th meridian in one ring (Chukotka, Fiji in Natural Earth) jump from +180 to -180. On the
// globe MapLibre fills such a ring the long way round, which shades a band of ocean around the north as land. Each such
// polygon is split at 180 into an eastern and a western part, each with continuous longitudes.
type Pos = number[];
type Ring = Pos[];
type Poly = Ring[];

const crosses = (ring: Ring): boolean => ring.some((p, i) => i > 0 && Math.abs(p[0]! - ring[i - 1]![0]!) > 180);

/** Longitudes made continuous (a jump of more than 180 degrees is taken as a wrap), then shifted so the ring starts within -180..180. */
function unwrap(ring: Ring): Ring {
  let offset = 0;
  const out: Ring = ring.map((p, i) => {
    if (i > 0) {
      const d = p[0]! - ring[i - 1]![0]!;
      if (d > 180) offset -= 360; else if (d < -180) offset += 360;
    }
    return [p[0]! + offset, ...p.slice(1)];
  });
  const min = Math.min(...out.map((p) => p[0]!));
  return min < -180 ? out.map((p) => [p[0]! + 360, ...p.slice(1)]) : out;
}

/** Sutherland-Hodgman clip of a closed ring to lon <= x (keep = "west") or lon >= x ("east"). */
function clip(ring: Ring, x: number, keep: "west" | "east"): Ring {
  const inside = (p: Pos) => (keep === "west" ? p[0]! <= x : p[0]! >= x);
  const cut = (a: Pos, b: Pos): Pos => { const t = (x - a[0]!) / (b[0]! - a[0]!); return [x, a[1]! + t * (b[1]! - a[1]!)]; };
  const pts = ring.slice(0, -1);
  const out: Ring = [];
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i]!, prev = pts[(i + pts.length - 1) % pts.length]!;
    if (inside(cur)) { if (!inside(prev)) out.push(cut(prev, cur)); out.push(cur); }
    else if (inside(prev)) out.push(cut(prev, cur));
  }
  if (out.length < 3) return [];
  return [...out, out[0]!];
}

/** One polygon split at the 180th meridian: unchanged when no ring crosses it, else up to two polygons. */
export function splitPolygon(poly: Poly): Poly[] {
  if (!poly.some(crosses)) return [poly];
  const rings = poly.map(unwrap);
  const west = rings.map((r) => clip(r, 180, "west"));
  const east = rings.map((r) => clip(r, 180, "east").map((p) => [p[0]! - 360, ...p.slice(1)]));
  const parts: Poly[] = [];
  for (const side of [west, east]) {
    const [outer, ...holes] = side;
    if (outer && outer.length) parts.push([outer, ...holes.filter((h) => h.length)]);
  }
  return parts;
}

interface Feature { type: string; properties: unknown; geometry: { type: string; coordinates: unknown } }

/** A FeatureCollection with every crossing polygon split (features with nothing to split are returned as they are). */
export function splitAtAntimeridian<T extends { features: Feature[] }>(fc: T): T {
  const features = fc.features.map((f) => {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates as Poly] : g.type === "MultiPolygon" ? (g.coordinates as Poly[]) : null;
    if (!polys || !polys.some((p) => p.some(crosses))) return f;
    return { ...f, geometry: { type: "MultiPolygon", coordinates: polys.flatMap(splitPolygon) } };
  });
  return { ...fc, features };
}
