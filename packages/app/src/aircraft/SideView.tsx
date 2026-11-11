import type { Visual } from "@arg/data";

/** Generic twin-jet drawn when a type has no entry in aircraftVisualById (a drawing fallback, not data). */
export const GENERIC_VISUAL: Visual = { lengthM: 38, wingspanM: 34, layout: "wing2", tail: "conventional" };

/** Every tile uses the same scale (units per metre) so lengths compare; types longer than the canvas shrink to fit. */
export const SIDE_VIEW_W = 240;
export const SIDE_VIEW_H = 68;
const UNITS_PER_M = 3;
const r = (n: number) => Math.round(n * 10) / 10;
const pts = (p: Array<[number, number]>) => p.map(([x, y]) => `${r(x)},${r(y)}`).join(" ");

export interface SideViewProps {
  /** Drawing data for the type; omit for the generic twin-jet. */
  visual?: Visual;
  /** Fatter fuselage and engines for widebodies (the type's own flag; Visual does not carry it). */
  widebody?: boolean;
  /** Type name, for the accessible label. */
  name: string;
  className?: string;
}

/**
 * White-tail side view (nose to the right) as inline SVG. Pure: output depends only on the props.
 * Colours come from CSS classes (.sv-*) that read theme variables, so it works in light and dark.
 * Proportions other than length and wingspan are drawing approximations.
 */
export function SideView({ visual, widebody = false, name, className }: SideViewProps) {
  const generic = !visual;
  const v = visual ?? GENERIC_VISUAL;
  const u = Math.min(UNITS_PER_M, (SIDE_VIEW_W - 4) / v.lengthM);
  const L = v.lengthM * u;
  const D = (widebody ? 6.5 : Math.min(4.6, Math.max(3.2, v.lengthM * 0.115))) * u; // fuselage diameter
  const cy = 41, top = cy - D / 2, bot = cy + D / 2;
  const x0 = (SIDE_VIEW_W - L) / 2, xe = x0 + L;
  const at = (f: number) => x0 + f * L; // x at a fraction of the length measured from the tail
  const tTail = v.tail === "t";
  const finH = D * 1.55;
  const prop = !!v.prop;

  const fuselage = `M${r(x0)},${r(cy - 0.28 * D)} L${r(at(0.17))},${r(top)} L${r(at(0.9))},${r(top)} C${r(at(0.97))},${r(top)} ${r(xe)},${r(cy - 0.28 * D)} ${r(xe)},${r(cy + 0.05 * D)} C${r(xe)},${r(cy + 0.3 * D)} ${r(at(0.96))},${r(bot)} ${r(at(0.9))},${r(bot)} L${r(at(0.17))},${r(bot)} L${r(x0)},${r(cy - 0.02 * D)} Z`;
  const fin: Array<[number, number]> = [[at(0.19), top + 1], [at(0.11), top - finH], [at(0.045), top - finH], [at(0.012), cy - 0.26 * D]];
  const stab: Array<[number, number]> = tTail
    ? [[at(0.115), top - finH], [at(0.035), top - finH - 0.5], [at(0.0), top - finH + 0.2 * D], [at(0.06), top - finH + 0.2 * D]]
    : [[at(0.17), cy - 0.14 * D], [at(0.02), cy - 0.2 * D], [at(0.0), cy - 0.1 * D], [at(0.12), cy - 0.02 * D]];

  // Wing: root leading edge at 52% from the tail (high wing for props), swept back and down towards the far tip.
  const chord = 0.15 * L, half = (v.wingspanM / 2) * u;
  const sweep = Math.min(half * 0.55, 0.3 * L), drop = Math.min(half * 0.1, 7);
  const rootX = at(prop ? 0.6 : 0.56);
  const rootY = prop ? cy - 0.3 * D : cy + 0.22 * D;
  const tipC = chord * 0.4;
  const wing: Array<[number, number]> = [[rootX, rootY], [rootX - sweep, rootY + drop], [rootX - sweep - tipC, rootY + drop], [rootX - chord, rootY]];
  const winglet: Array<[number, number]> = [[rootX - sweep, rootY + drop], [rootX - sweep - tipC, rootY + drop], [rootX - sweep - tipC * 0.5, rootY + drop - 2.2 * u]];
  const wingPt = (s: number): [number, number] => [rootX - sweep * s, rootY + drop * s];

  const podLen = (widebody ? 7.5 : prop ? 4 : 4.6) * u, podD = (widebody ? 3.4 : prop ? 1.4 : 2.3) * u;
  type Pod = { x: number; y: number; far?: boolean; py?: number };
  const pods: Pod[] = [];
  const wingPod = (s: number) => {
    const [wx, wy] = wingPt(s);
    const y = prop ? wy - podD * 0.1 : wy + podD * 0.75;
    pods.push({ x: wx - podLen * 0.1, y, far: true, py: wy }, { x: wx + podLen * 0.1 + 3, y: y + 2.5, py: wy });
  };
  if (v.layout === "wing2" || v.layout === "wing2+tail") wingPod(0.35);
  if (v.layout === "wing4") { wingPod(0.28); wingPod(0.62); }
  if (v.layout === "rear2" || v.layout === "rear3") {
    const y = cy - 0.3 * D;
    pods.push({ x: at(0.1) + podLen * 0.4, y: y - 1.5, far: true, py: top }, { x: at(0.1) + podLen * 0.4 + 2, y, py: top + 1 });
  }
  const tailPod: Pod | null = v.layout === "rear3" ? { x: at(0.13), y: top - podD * 0.25, py: top }
    : v.layout === "wing2+tail" ? { x: at(0.14), y: top - finH * 0.42 - podD * 0.3, py: top - finH * 0.42 + podD * 0.2 } : null;
  if (tailPod) pods.push(tailPod);

  // 747-style hump on the upper fuselage, from the nose side.
  const deck = v.upperDeck;
  const dw = (deck === "stretched" ? 0.26 : 0.11) * L, dh = 0.36 * D;
  const dxf = at(0.86), dxa = dxf - dw;
  const deckFill = `M${r(dxa)},${r(top + 1)} L${r(dxa)},${r(top)} C${r(dxa + dw * 0.2)},${r(top - dh)} ${r(dxa + dw * 0.3)},${r(top - dh)} ${r(dxa + dw * 0.55)},${r(top - dh)} C${r(dxa + dw * 0.8)},${r(top - dh)} ${r(dxa + dw * 0.9)},${r(top - dh * 0.3)} ${r(dxf)},${r(top)} L${r(dxf)},${r(top + 1)} Z`;
  const deckLine = `M${r(dxa)},${r(top)} C${r(dxa + dw * 0.2)},${r(top - dh)} ${r(dxa + dw * 0.3)},${r(top - dh)} ${r(dxa + dw * 0.55)},${r(top - dh)} C${r(dxa + dw * 0.8)},${r(top - dh)} ${r(dxa + dw * 0.9)},${r(top - dh * 0.3)} ${r(dxf)},${r(top)}`;

  const label = generic ? `Generic twin-jet silhouette for ${name}` : `Side view of ${name}, ${v.lengthM} m long`;
  const px = (p: Pod) => (
    <g key={`${p.x}-${p.y}-${p.far ? "f" : "n"}`} data-part={p.far ? "pod-far" : "pod"}>
      {p.py !== undefined && !prop && <rect className="sv-engine" data-part="pylon" x={r(p.x - podLen * 0.12)} y={r(Math.min(p.py, p.y))} width={r(podLen * 0.24)} height={r(Math.abs(p.y - p.py) + 1)} />}
      <rect className={p.far ? "sv-engine far" : "sv-engine"} x={r(p.x - podLen / 2)} y={r(p.y - podD / 2)} width={r(podLen)} height={r(podD)} rx={r(podD * 0.45)} />
      {prop && !p.far && <rect className="sv-prop" data-part="prop" x={r(p.x + podLen / 2 - 0.2)} y={r(p.y - 0.5 * Math.max(2.2, 0.1 * v.lengthM) * u)} width="1.6" height={r(Math.max(2.2, 0.1 * v.lengthM) * u)} rx="0.8" />}
    </g>
  );

  return (
    <svg className={`sv ${className ?? ""}`} viewBox={`0 0 ${SIDE_VIEW_W} ${SIDE_VIEW_H}`} role="img" aria-label={label} data-generic={generic ? "1" : undefined}>
      <title>{label}</title>
      {pods.filter((p) => p.far).map(px)}
      <polygon className="sv-wing" data-part="wing" points={pts(wing)} />
      {v.winglets && <polygon className="sv-wing" data-part="winglet" points={pts(winglet)} />}
      <polygon className="sv-wing" data-part="stabilizer" points={pts(stab)} />
      <path className="sv-body" data-part="fuselage" data-length={r(L)} d={fuselage} />
      <polygon className="sv-tail" data-part="fin" data-tail={tTail ? "t" : "conventional"} points={pts(fin)} />
      {deck && <><path className="sv-body-fill" data-part="upper-deck" data-deck={deck} d={deckFill} /><path className="sv-line" d={deckLine} /></>}
      <line className="sv-windows" data-part="windows" x1={r(at(0.22))} x2={r(at(0.84))} y1={r(cy - 0.14 * D)} y2={r(cy - 0.14 * D)} />
      <path className="sv-window-cockpit" d={`M${r(at(0.925))},${r(cy - 0.2 * D)} L${r(at(0.955))},${r(cy - 0.2 * D)} L${r(at(0.965))},${r(cy - 0.08 * D)} L${r(at(0.925))},${r(cy - 0.08 * D)} Z`} />
      {pods.filter((p) => !p.far).map(px)}
    </svg>
  );
}
