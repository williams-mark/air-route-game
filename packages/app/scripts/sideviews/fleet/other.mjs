// Other manufacturers. Length/span from aircraftVisualById where present; heights, cross-sections and the rest from
// manufacturer data as reproduced in Wikipedia spec tables (RECALLED, see SOURCES.md "Aircraft side views").
// E-Jet 3.35 m, CRJ 2.7 m, ATR 72 2.67 m, BAe 146 3.5 m, One-Eleven 3.3 m, Caravelle 3.2 m, Convair 880/990 3.6 m,
// Trident 3.6 m, F28/F100 3.3 m, L-1011 6.0 m, Concorde 3.3 m fuselage heights. Stations are drawing estimates.
import { rearPod, sDuct, tailNozzle, sponson, triWindows, nacelle, OUT, OUT_D } from "../jet.mjs";
import { st, f, S } from "../lib.mjs";

const pth = (g, cmds, attrs) => g.add(`<path d="${g.d(cmds)}" ${attrs}/>`);
/** Split tail-cone airbrake seams (F28, BAe 146). */
const airbrake = (len) => (g) => {
  const { L, tail } = g.geo;
  const vm = (tail.tailBot[0][1] + tail.tailTop[3][1]) / 2;
  g.add(`<g clip-path="${g.geo.clip}" fill="none" ${st(0.55, "#8d939a")}><path d="${g.d([["M", L - len, vm + 0.05], ["L", L + 0.2, vm]])}"/><path d="${g.d([["M", L - len, vm + 0.9], ["L", L - len, vm - 0.8]])}"/></g>`);
};

function ejet(o) {
  const L = o.L, D = 3.35, VB = 1.1, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  const e2 = !!o.e2;
  return {
    title: o.title, L, D, VB, floor: 0.32, winV: 0.6,
    nose: { len: 1.55, lenB: 1.3, tip: 0.42, tb: 1.6 }, cockpit: { a: 0.38, b: 0.87, bot: 0.65, h: 0.13, eyebrows: false },
    belly: { from: W(10.8), to: W(18.2), drop: 0.14 },
    fin: { teRoot: L - 1.4, h: o.h, tipChord: 1.8, sweepLE: 42, sweepTE: 22, dorsal: { len: 3.0, h: 0.7 } },
    stab: { k: 0.82 },
    wing: { root: [W(12.3), VB + 0.34 * D], sweep: 26, semi: o.semi, dih: 5, rootChord: 5.0, teRootK: 0.75, tipChord: 1.2, tip: e2 ? "plain" : "canted", wingletH: 1.3, fairings: 3 },
    engines: [e2
      ? { kind: "fan", eta: 0.3, fwd: 3.0, drop: -0.05, len: 4.1, d: 2.2, core: { len: 1.1, d0: 1.1, d1: 0.7 }, plug: { len: 0.4, d: 0.4 } }
      : { kind: "fan", eta: 0.3, fwd: 2.4, drop: 0.1, len: 3.4, d: 1.55, core: { len: 0.9, d0: 0.85, d1: 0.55 }, plug: { len: 0.35, d: 0.35 } }],
    gear: { main: [{ u: W(16.1), r: 0.48 }], nose: { u: 3.6, r: 0.3, doorU: 2.4 } },
    doors: [4.4, ...o.exits.map((u) => ({ u: W(u), k: "O" })), L - 5.4, { u: 7.6, k: "C" }, { u: L - 10, k: "C" }],
    windows: { from: 5.4, to: L - 6.4 },
    antennasTop: [[8.5, 0.28], [W(15), 0.28]], antennasBot: [[9.5, 0.22]], beaconU: W(11.5),
    seams: [3.6, 6.6, W(10.8), W(18.2), L - 9, L - 3.4],
  };
}

function crj(o) {
  const L = o.L, D = 2.7, VB = 0.95, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  return {
    title: o.title, L, D, VB, floor: 0.2, winV: 0.62, windows: { from: 4.6, to: L - 8.2, w: 0.22, h: 0.32 },
    nose: { len: 1.7, lenB: 1.4, tip: 0.45, tb: 1.5 }, cockpit: { a: 0.48, b: 1.05, bot: 0.68, h: 0.15, eyebrows: false },
    tail: { len: 3.5, bot: 0.6, top: 0.8, topLen: 1.6 },
    belly: { from: W(13.4), to: W(20.0), drop: 0.1 },
    fin: { teRoot: L - 0.6, h: o.h, tipChord: 2.7, sweepLE: 45, sweepTE: 25, dorsal: { len: 2.5, h: 0.5 } },
    stab: { t: true, k: 0.85 },
    wing: { root: [W(14.6), VB + 0.25 * D], sweep: 26.5, semi: o.semi, dih: 4, rootChord: 4.6, teRootK: 0.8, tipChord: 1.1, tip: "canted", wingletH: 0.9, fairings: 2 },
    gear: { main: [{ u: W(19.0), r: 0.42 }], nose: { u: 3.2, r: 0.28, doorU: 2.0 } },
    doors: [{ u: 3.6, w: 0.8, h: 1.75 }, ...o.exits.map((u) => ({ u: W(u), k: "O" })), { u: L - 7.6, k: "E" }, { u: 7.0, k: "C", w: 1.0 }],
    antennasTop: [[7.5, 0.26], [W(16), 0.26]], antennasBot: [[8.5, 0.2]], beaconU: W(12),
    seams: [3.0, 6.5, W(13.4), W(20.0), L - 9],
    front: [(g) => rearPod(g, { u0: L - 9.6, vc: VB + 0.92 * D, len: 3.6, d: 1.45, buckets: false })],
  };
}

function atr72() {
  const L = 27.17, D = 2.67, VB = 0.88, VT = VB + D;
  return {
    title: "ATR 72-600", L, D, VB, floor: 0.14, winV: 0.61,
    nose: { len: 1.3, lenB: 1.25, tip: 0.39, tb: 1.5 }, cockpit: { a: 0.38, b: 0.99, bot: 0.64, h: 0.14, eyebrows: false },
    tail: { len: 3.6, bot: 0.69, top: 0.8, topLen: 2.8 },
    fin: { teRoot: 25.55, h: 7.3, tipChord: 1.6, sweepLE: 44.5, sweepTE: -5, dorsal: { len: 4.9, h: 0.6 } },
    stab: { t: true, k: 0.9, bullet: { fwd: 0.4, aft: 0.3, h: 0.22 } },
    wing: { high: true, root: [10.15, VT], rootChord: 2.6, semi: 12.2, sweep: 2, dih: 2, tipChord: 1.4 },
    engines: [{ kind: "prop", u: 7.55, v: 3.28, len: 7.4, h: 1.3, r: 1.965 }],
    beforeWing: [sponson({ u0: 10.35, u1: 15.75, top: 1.75, bot: 0.78 })],
    gear: { main: [{ u: 12.8, r: 0.45, top: 0.9 }], nose: { u: 2.1, r: 0.3, doorU: 1.3, doorLen: 0.8 } },
    doors: [{ u: 4.35, k: "C", w: 1.27, h: 1.53 }, { u: 21.65, v: 1.25, w: 0.72, h: 1.75 }],
    windows: { from: 5.9, to: 20.6, pitch: 0.762, w: 0.27, h: 0.33 },
    antennasTop: [[6.0, 0.26], [16.8, 0.26]], antennasBot: [[7.5, 0.22]], beaconU: 18, beaconBotU: 9,
    seams: [3.5, 8.6, 16.2, 22.6],
  };
}

function bae146(o) {
  const L = o.L, D = 3.5, VB = 0.85, VT = VB + D, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  const pods = (g) => {
    const hw = g.geo.highWing;
    for (const [u0, dv] of [[W(11.5), 0.62], [W(9.6), 0.42]]) {
      const vc = hw.v - dv - 0.25;
      pth(g, [["M", u0 + 0.9, vc + 0.6], ["L", u0 + 1.6, hw.v - 0.05], ["L", u0 + 2.9, hw.v - 0.05], ["L", u0 + 2.6, vc + 0.5], ["Z"]], `fill="${g.vgrad(hw.v, vc, [[0, "#eef0f2"], [1, "#b9bfc5"]])}" ${st(0.5, OUT)}`);
      nacelle(g, { u0, vc, len: 3.3, d: 1.3, mixed: true, stripe: false, splits: [0.3, 0.65] });
    }
  };
  return {
    title: o.title, L, D, VB, floor: 0.12, winV: 0.6,
    nose: { len: 1.25, lenB: 1.15, tip: 0.42, tb: 1.45 }, cockpit: { a: 0.36, b: 0.9, bot: 0.63, h: 0.14, panels: 4 },
    tail: { len: 3.0, bot: 0.55, top: 0.82, topLen: 1.0 },
    fin: { teRoot: L - 1.1, h: 8.61, tipChord: 2.6, sweepLE: 40, sweepTE: 18, dorsal: { len: 3.5, h: 0.8 } },
    stab: { t: true, k: 1.0, bullet: { fwd: 0.5, aft: 0.4, h: 0.26 } },
    wing: { high: true, root: [W(11.0), VT], rootChord: 3.6, semi: 11.4, sweep: 15, dih: -3, tipChord: 1.2 },
    engines: [{ kind: "custom", draw: pods }],
    beforeWing: [sponson({ u0: W(12.4), u1: W(17.2), top: 1.65, bot: 0.72 })],
    gear: { main: [{ u: W(14.7), r: 0.43, top: 0.85 }], nose: { u: 2.9, r: 0.28, doorU: 1.9, doorLen: 0.8 } },
    doors: [{ u: 3.6, w: 0.8, h: 1.8 }, L - 6.4, { u: 6.2, k: "C", w: 1.0 }],
    windows: { from: 4.6, to: L - 7.3, pitch: 0.53 },
    antennasTop: [[6.5, 0.26]], antennasBot: [[7.5, 0.22]], beaconU: W(16), beaconBotU: W(9),
    seams: [3.0, 6.6, W(11.2), W(17.2), L - 8.5],
    front: [airbrake(1.6)],
  };
}

function bac111(o) {
  const L = o.L, D = 3.3, VB = 0.95, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  return {
    title: o.title, L, D, VB, floor: 0.2, winV: 0.64,
    nose: { len: 1.35, lenB: 1.3, tip: 0.45, tb: 1.35 }, cockpit: { a: 0.46, b: 1.0, bot: 0.72, h: 0.13, panels: 4 },
    tail: { len: 3.0, bot: 0.6, top: 0.78, topLen: 1.6 },
    belly: { from: W(10.6), to: W(17.0), drop: 0.08 },
    fin: { teRoot: L - 0.9, h: 7.47, tipChord: 2.8, sweepLE: 42, sweepTE: 15, dorsal: { len: 3.0, h: 0.5 } },
    stab: { t: true, k: 1.0, bullet: { fwd: 0.9, aft: 0.4, h: 0.4 } },
    wing: { root: [W(11.6), VB + 0.25 * D], sweep: 22, semi: o.semi, dih: 3, rootChord: 5.2, teRootK: 0.85, tipChord: 1.3, fairings: 2 },
    gear: { main: [{ u: W(15.8), r: 0.45 }], nose: { u: 2.7, r: 0.3, doorU: 1.7 } },
    doors: [{ u: 3.5, w: 0.8, h: 1.75 }, ...o.exits.map((u) => ({ u: W(u), k: "O" })), { u: L - 6.0, k: "E" }, { u: 6.3, k: "C", w: 1.0 }],
    windows: { from: 4.6, to: L - 7.0 },
    antennasTop: [[6.8, 0.26], [W(14), 0.26]], antennasBot: [[8, 0.22]], beaconU: W(10),
    seams: [3.0, 7.0, W(10.6), W(17), L - 9],
    front: [(g) => rearPod(g, { u0: L - 8.6, vc: VB + 0.86 * D, len: 4.6, d: 1.4, buckets: true })],
  };
}

function caravelle(o) {
  const L = o.L, D = 3.2, VB = 1.1, VT = VB + D, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  return {
    title: o.title, L, D, VB, floor: 0.25, winV: 0.62,
    nose: { len: 1.6, lenB: 1.4, tip: 0.44, tb: 1.4 }, cockpit: { a: 0.43, b: 1.0, bot: 0.7, h: 0.12, panels: 4 },
    tail: { len: 3.0, bot: 0.6, top: 0.82, topLen: 1.2 },
    belly: { from: W(10.4), to: W(18.2), drop: 0.1 },
    fin: { teRoot: L - 1.4, h: 8.72, tipChord: 1.6, sweepLE: 38, sweepTE: 10, dorsal: { len: 4.0, h: 0.8 } },
    stab: { t: true, atV: VT + 1.45, k: 0.95, dx: 0.3 },
    wing: { root: [W(10.9), VB + 0.28 * D], sweep: 20, semi: 15.5, dih: 3, rootChord: 6.0, teRootK: 0.8, tipChord: 1.8, fairings: 2 },
    gear: { main: [{ u: W(16.0), r: 0.45, axles: 2, pitch: 0.95 }], nose: { u: 3.0, r: 0.3, doorU: 1.9 } },
    doors: [{ u: 4.3, w: 0.75, h: 1.7 }, { u: L - 7.5, k: "E" }, { u: 7.4, k: "C", w: 1.0 }],
    windows: { from: 99, to: 0 },
    onBody: [triWindows({ v: VB + 0.6 * D, from: 5.6, to: L - 9.0, pitch: 0.95, size: 0.52 })],
    antennasTop: [[7.5, 0.26], [W(15), 0.26]], antennasBot: [[8.5, 0.22]], beaconU: W(11),
    seams: [3.6, 7.6, W(10.6), W(18.0), L - 9.6],
    front: [(g) => rearPod(g, { u0: L - 10.6, vc: VB + 0.78 * D, len: o.jt8d ? 5.8 : 5.6, d: o.jt8d ? 1.42 : 1.32, buckets: true })],
  };
}

function convair(o) {
  const L = o.L, D = 3.6, VB = 1.4, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  const e = o.aftFan ? { len: 4.8, d: 1.4, mixed: true, nozzle: 0.7, splits: [0.25, 0.7], bulge: 0.72, stripe: false } : { len: 4.4, d: 1.1, mixed: true, nozzle: 0.6, splits: [0.25, 0.55, 0.8], bulge: 0.3, stripe: false };
  const carrots = (g) => {
    for (const [eta, s] of [[0.33, 1], [0.62, 0.85]]) {
      const k = g.geo; // anti-shock bodies along the trailing edge
      const u = W(15.2) + eta * 16.5 * Math.tan((35 * Math.PI) / 180) + 4.8 * s, v = VB + 0.28 * D + eta * 16.5 * 0.104 - 0.35;
      pth(g, [["M", u, v + 0.25], ["C", u + 1.5 * s, v + 0.28, u + 3.0 * s, v + 0.12, u + 3.8 * s, v - 0.05], ["C", u + 3.0 * s, v - 0.2, u + 1.5 * s, v - 0.3, u, v - 0.3], ["Z"]], `fill="${g.vgrad(v + 0.28, v - 0.3, [[0, "#eceef0"], [1, "#a9afb5"]])}" ${st(0.5, OUT_D)}`);
    }
  };
  return {
    title: o.title, L, D, VB, floor: 0.32, winV: 0.63,
    nose: { len: 1.6, lenB: 1.5, tip: 0.45, tb: 1.3 }, cockpit: { a: 0.43, b: 0.92, bot: 0.64, h: 0.1, panels: 4 },
    belly: { from: W(14.6), to: W(24.4), drop: 0.15 },
    fin: { teRoot: L - 1.2, h: o.h, tipChord: 2.0, sweepLE: 45, sweepTE: 10, dorsal: { len: 3.8, h: 0.8 } },
    stab: { k: 1.0 },
    wing: { root: [W(15.2), VB + 0.28 * D], sweep: 35, semi: 16.5, dih: 7, rootChord: 7.5, teRootK: 1.0, tipChord: 2.0, fairings: o.aftFan ? 0 : 3 },
    engines: [{ kind: "fan", eta: 0.3, fwd: 4.6, drop: 0.75, pylonTop: true, ...e }, { kind: "fan", eta: 0.6, fwd: 3.8, drop: 0.5, pylonTop: true, ...e }],
    gear: { main: [{ u: W(20.4), r: 0.5, axles: 2, pitch: 1.2 }], nose: { u: 4.0, r: 0.4, doorU: 2.9 } },
    doors: [4.8, { u: W(16.4), k: "O" }, L - 6.0, { u: 8.0, k: "C" }, { u: L - 12, k: "C" }],
    windows: { from: 6.0, to: L - 7.2 },
    antennasTop: [[8, 0.3], [W(19), 0.3]], antennasBot: [[10, 0.24]], beaconU: W(13),
    seams: [4.0, 9.5, W(14.6), W(24.4), L - 10],
    front: [...(o.aftFan ? [carrots] : []), (g) => g.add(`<path d="${g.d([["M", L - 2.2, o.h - 0.07], ["L", L - 4.4, o.h + 0.05]])}" fill="none" stroke="#7b828a" stroke-width="1.6" stroke-linecap="round"/>`)],
  };
}

function trident(o) {
  const L = o.L, D = 3.6, VB = 0.95, VT = VB + D, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  return {
    title: o.title, L, D, VB, floor: 0.2, winV: 0.64,
    nose: { len: 1.45, lenB: 1.35, tip: 0.44, tb: 1.4 }, cockpit: { a: 0.42, b: 0.96, bot: 0.7, h: 0.12, panels: 4 },
    tail: { len: 2.8, bot: 0.5, top: 0.88, topLen: 0.35 },
    belly: { from: W(12.2), to: W(19.6), drop: 0.1 },
    fin: { teRoot: L - 0.6, rootV: VT + 0.8, down: VB + 0.5 * D, h: o.h, tipChord: 2.9, sweepLE: 48, sweepTE: 22 },
    stab: { t: true, k: 1.15, bullet: { fwd: 0.4, aft: 0.3, h: 0.22 } },
    wing: { root: [W(13.2), VB + 0.25 * D], sweep: 33, semi: o.semi, dih: 3, rootChord: 6.0, teRootK: 0.85, tipChord: 1.4, fairings: 2 },
    gear: { main: [{ u: W(17.6), r: 0.45 }], nose: { u: 3.0, r: 0.3, doorU: 1.9 } },
    doors: [{ u: 3.9, w: 0.8, h: 1.75 }, { u: W(15.2), k: "O" }, ...(o.extraDoor ? [{ u: W(9.5), k: "E" }] : []), { u: L - 6.4, k: "E" }, { u: 7.0, k: "C", w: 1.0 }],
    windows: { from: 5.0, to: L - 7.6 },
    antennasTop: [[7.5, 0.26], [W(16), 0.26]], antennasBot: [[9, 0.22]], beaconU: W(12),
    seams: [3.4, 7.6, W(12.2), W(19.6), L - 9.5],
    front: [sDuct({ u: L - 10.4, len: 4.6, h: 0.85 }), (g) => rearPod(g, { u0: L - 9.4, vc: VB + 0.8 * D, len: 4.6, d: 1.3, buckets: true }), tailNozzle({ r: 0.5 })],
  };
}

function fokker(o) {
  const L = o.L, D = 3.3, VB = 0.95, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  return {
    title: o.title, L, D, VB, floor: 0.2, winV: 0.64,
    nose: { len: 1.4, lenB: 1.3, tip: 0.44, tb: 1.45 }, cockpit: { a: 0.44, b: 0.98, bot: 0.7, h: 0.13, panels: 4, eyebrows: !o.f100 },
    tail: { len: 3.0, bot: 0.55, top: 0.85, topLen: 0.6 },
    belly: { from: W(10.0), to: W(16.6), drop: 0.08 },
    fin: { teRoot: L - 1.3, h: o.h ?? 8.47, tipChord: 2.6, sweepLE: 43, sweepTE: 12, dorsal: { len: 3.2, h: 0.6 } },
    stab: { t: true, k: 1.0 },
    wing: { root: [W(11.0), VB + 0.25 * D], sweep: 18, semi: o.semi, dih: 2.5, rootChord: 5.0, teRootK: 0.8, tipChord: 1.3, fairings: 2 },
    gear: { main: [{ u: W(14.9), r: 0.45 }], nose: { u: 2.6, r: 0.3, doorU: 1.6 } },
    doors: [{ u: 3.2, w: 0.8, h: 1.75 }, ...o.exits.map((u) => ({ u: W(u), k: "O" })), { u: L - 6.4, k: "E" }, { u: 6.0, k: "C", w: 1.0 }],
    windows: { from: 4.3, to: L - 7.6 },
    antennasTop: [[6.5, 0.26], [W(14), 0.26]], antennasBot: [[8, 0.22]], beaconU: W(10),
    seams: [2.8, 6.6, W(10), W(16.6), L - 9],
    front: [(g) => rearPod(g, o.f100 ? { u0: L - 9.6, vc: VB + 0.86 * D, len: 4.8, d: 1.5, buckets: true } : { u0: L - 9.0, vc: VB + 0.86 * D, len: 4.3, d: 1.35 }), airbrake(1.9)],
  };
}

function l1011(o) {
  const L = o.L, D = 6.0, VB = 2.0, VT = VB + D, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  const e = o.dash500 ? { len: 5.6, d: 2.9, mixed: true, splits: [0.3, 0.6], stripeAt: 0.3 } : { len: 5.0, d: 2.85, core: { len: 1.6, d0: 1.6, d1: 1.0 }, plug: { len: 0.6, d: 0.65 } };
  return {
    title: o.title, L, D, VB, wide: true, floor: 0.45, winV: 0.64,
    nose: { len: 1.3, lenB: 1.15, tip: 0.42, tb: 1.55 }, cockpit: { a: 0.33, b: 0.74, bot: 0.64, h: 0.12 },
    tail: { len: 2.6, bot: 0.5, top: 0.88, topLen: 0.45 },
    belly: { from: W(17.5), to: W(31.0), drop: 0.35 },
    fin: { teRoot: L - 1.2, rootV: VT + 1.1, down: VB + 0.6 * D, h: 16.87, tipChord: 2.8, sweepLE: 38, sweepTE: 20 },
    stab: { k: 1.5, root: 9.0, rootV: 0.62 },
    wing: { root: [W(20.0), VB + 0.3 * D], sweep: 35, semi: o.semi, dih: 7, rootChord: 10, teRootK: 0.85, tipChord: 2.4, fairings: 3 },
    engines: [{ kind: "fan", eta: 0.3, fwd: 5.0, drop: 0.15, ...e }],
    gear: { main: [{ u: W(25.5), r: 0.63, axles: 2, pitch: 1.5 }], nose: { u: 4.7, r: 0.5, doorU: 3.4 } },
    doors: [6.3, W(15.6), ...(o.dash500 ? [{ u: W(30.0), k: "E" }] : [W(30.0)]), L - 11.0, { u: W(11), k: "C" }, { u: L - 15, k: "C" }],
    windows: { from: 7.6, to: L - 12.2 },
    antennasTop: [[10.5], [W(24)]], antennasBot: [[12], [W(31), 0.3]], beaconU: W(17),
    seams: [5.4, W(13), W(17.5), L - 16, L - 5],
    front: [sDuct({ u: L - 14.5, len: 7.8, h: 1.25, ring: 1.2 }), tailNozzle({ r: 0.85 })],
  };
}

function concorde() {
  const L = 61.66, D = 3.3, VB = 2.2, VT = VB + D;
  const deltaWing = (g) => {
    pth(g, [["M", 14.5, VB + 0.55], ["C", 20, VB + 0.95, 28, VB + 1.1, 36, VB + 1.0], ["C", 44, VB + 0.9, 52, VB + 0.62, 59.8, VB + 0.42], ["L", 59.8, VB + 0.12], ["L", 46, VB - 0.02], ["C", 36, VB - 0.08, 26, VB + 0.02, 14.5, VB + 0.35], ["Z"]],
      `fill="${g.vgrad(VB + 1.1, VB - 0.08, [[0, "#c9cdd1"], [0.3, "#6d7379"], [1, "#4b5056"]])}" ${st(0.6, OUT_D)}`);
    pth(g, [["M", 14.6, VB + 0.53], ["C", 20, VB + 0.93, 28, VB + 1.08, 36, VB + 0.98], ["C", 44, VB + 0.88, 52, VB + 0.6, 59.7, VB + 0.4]], `fill="none" ${st(1.6, "#e4e7ea")}`);
    g.add(`<g fill="none" ${st(0.45, "#3f444a")}>${[52.6, 56.0].map((u) => `<path d="${g.d([["M", u, VB + 0.62], ["L", u, VB + 0.05]])}"/>`).join("")}</g>`);
    pth(g, [["M", 0.05, VB + 0.45 * D], ["L", -1.6, VB + 0.45 * D]], `fill="none" ${st(1.4, "#8d949b")}`); // nose probe
    g.add(`<path d="${g.d([["M", 6.2, VB + 0.95 * D], ["C", 6.1, VB + 0.6 * D, 6.1, VB + 0.3 * D, 6.25, VB + 0.05 * D]])}" fill="none" ${st(0.5, "#b4b9be")}/>`); // droop-nose joint
  };
  const nacelles = (g) => {
    const t = VB - 0.02, b = VB - 1.3;
    pth(g, [["M", 37.6, t], ["L", 55.6, t], ["L", 56.2, b + 0.25], ["L", 55.6, b + 0.1], ["L", 43.0, b], ["L", 40.4, b + 0.05], ["L", 37.2, t - 0.35], ["Z"]],
      `fill="${g.vgrad(t, b, [[0, "#eef0f2"], [0.45, "#d5d9dd"], [1, "#8d939a"]])}" ${st(0.6, OUT_D)}`);
    pth(g, [["M", 37.2, t - 0.35], ["L", 40.4, b + 0.05], ["L", 40.0, b + 0.05], ["L", 36.95, t - 0.32], ["Z"]], `fill="#30353a"`);
    pth(g, [["M", 55.6, t], ["L", 57.4, t - 0.15], ["L", 57.4, b + 0.35], ["L", 55.6, b + 0.1], ["Z"]], `fill="${g.vgrad(t, b, [[0, "#9ba1a7"], [1, "#4b5056"]])}" ${st(0.5, OUT_D)}`);
    g.add(`<g fill="none" ${st(0.4, "#b9bec3")}>${[42.5, 47.5, 52.0].map((u) => `<path d="${g.d([["M", u, t], ["L", u, b + 0.03]])}"/>`).join("")}</g>`);
  };
  return {
    title: "Aérospatiale/BAC Concorde", L, D, VB, floor: 0.25, winV: 0.6,
    nose: { len: 4.0, lenB: 3.2, tip: 0.45, ta: 1.6, tb: 1.25, ba: 1.8, bb: 1.5 },
    cockpit: { a: 2.15, b: 2.75, bot: 0.66, h: 0.09, inset: 0.04, eyebrows: false, panels: 3 },
    tail: { len: 5.0, bot: 0.42, top: 0.62, topLen: 2.4 },
    belly: { from: 20, to: 40, drop: 0.05 },
    fin: { teRoot: L - 0.2, h: 12.19, tipChord: 1.5, sweepLE: 55, sweepTE: 30, dorsal: { len: 8.0, h: 1.0 }, rudder: 0.35 },
    beforeWing: [deltaWing],
    engines: [{ kind: "custom", draw: nacelles }],
    gear: { main: [{ u: 33.8, r: 0.48, axles: 2, pitch: 1.1, top: VB + 0.1 }], nose: { u: 13.4, r: 0.42, doorU: 12.0, top: VB + 0.05 } },
    doors: [{ u: 11.0, w: 0.75, h: 1.68 }, { u: 30.0, w: 0.75, h: 1.68 }, { u: 45.5, w: 0.75, h: 1.68 }],
    windows: { from: 13.0, to: 46.8, w: 0.16, h: 0.24, pitch: 0.53 },
    antennasTop: [[17, 0.25]], antennasBot: [[19, 0.2]], beaconU: 24, beaconBotU: 28,
    seams: [5.0, 9.4, 15.5, 30.6, 48.0],
    canoe: false,
  };
}

export const OTHER = {
  E175: ejet({ title: "Embraer E175", L: 31.68, h: 9.86, semi: 12.4, exits: [13.6] }),
  "E190-E2": ejet({ title: "Embraer E190-E2", L: 36.25, fwd: 2.4, h: 10.95, semi: 15.3, exits: [13.6], e2: true }),
  "E195-E2": ejet({ title: "Embraer E195-E2", L: 41.51, fwd: 5.0, h: 10.9, semi: 16.0, exits: [13.2, 14.0], e2: true }),
  CRJ700: crj({ title: "Bombardier CRJ700", L: 32.51, h: 7.57, semi: 10.3, exits: [15.0] }),
  CRJ900: crj({ title: "Bombardier CRJ900", L: 36.4, fwd: 2.2, h: 7.51, semi: 11.1, exits: [14.6, 15.4] }),
  "ATR72-600": atr72(),
  "BAE146-100": bae146({ title: "BAe 146-100", L: 26.19 }),
  "BAE146-200": bae146({ title: "BAe 146-200", L: 28.55, fwd: 1.2 }),
  "BAE146-300": bae146({ title: "BAe 146-300", L: 30.99, fwd: 2.4 }),
  "BAC111-200": bac111({ title: "BAC One-Eleven 200", L: 28.5, semi: 11.8, exits: [13.0] }),
  "BAC111-500": bac111({ title: "BAC One-Eleven 500", L: 32.61, fwd: 2.5, semi: 12.6, exits: [12.6, 13.4] }),
  "CARAVELLE-6R": caravelle({ title: "Sud Aviation Caravelle VI-R", L: 32.01 }),
  "CARAVELLE-12": caravelle({ title: "Sud Aviation Caravelle 12", L: 36.24, fwd: 1.6, jt8d: true }),
  CV880: convair({ title: "Convair 880", L: 39.42, h: 11.0 }),
  CV990: convair({ title: "Convair 990 Coronado", L: 42.6, fwd: 1.6, h: 12.04, aftFan: true }),
  "TRIDENT-1C": trident({ title: "Hawker Siddeley Trident 1C", L: 34.98, h: 8.23, semi: 11.9 }),
  "TRIDENT-2E": trident({ title: "Hawker Siddeley Trident 2E", L: 34.98, h: 8.23, semi: 13.1 }),
  "TRIDENT-3B": trident({ title: "Hawker Siddeley Trident 3B", L: 39.98, fwd: 2.5, h: 8.61, semi: 13.1, extraDoor: true }),
  "F28-1000": fokker({ title: "Fokker F28-1000", L: 27.4, semi: 10.2, exits: [12.4] }),
  "F28-3000": fokker({ title: "Fokker F28-3000", L: 27.4, semi: 10.9, exits: [12.4] }),
  "F28-4000": fokker({ title: "Fokker F28-4000", L: 29.61, fwd: 1.1, semi: 10.9, exits: [12.0, 12.8] }),
  F100: fokker({ title: "Fokker 100", L: 35.53, fwd: 4.0, semi: 12.4, h: 8.5, exits: [11.8, 12.6], f100: true }),
  "L1011-1": l1011({ title: "Lockheed L-1011-1 TriStar", L: 54.17, semi: 20.7 }),
  "L1011-100": l1011({ title: "Lockheed L-1011-100 TriStar", L: 54.17, semi: 20.7 }),
  "L1011-200": l1011({ title: "Lockheed L-1011-200 TriStar", L: 54.17, semi: 20.7 }),
  "L1011-500": l1011({ title: "Lockheed L-1011-500 TriStar", L: 50.05, fwd: -2.1, semi: 22.0, dash500: true }),
  CONCORDE: concorde(),
};
