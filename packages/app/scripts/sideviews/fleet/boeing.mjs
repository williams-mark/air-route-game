// Boeing side views. Overall length, span and height come from aircraftVisualById in packages/data where present;
// otherwise from Boeing airport-planning documents as reproduced in Wikipedia spec tables (RECALLED, see SOURCES.md
// "Aircraft side views"). Fuselage cross-sections: 737/757 3.76 x 4.01 m, 767 5.03 x 5.41 m, 777 6.20 m, 787 5.77 x
// 5.97 m, 747 6.50 m, 707/727 3.76 m. Stations of doors, gear and wing roots are drawing estimates scaled from side
// elevations; body plugs are added ahead of / behind the wing.
import { sDuct, tailNozzle, rearPod } from "../jet.mjs";

const cfm56_7 = { kind: "fan", eta: 0.1, fwd: 3.43, drop: 0.25, len: 4.25, d: 2.1, flat: 0.13, core: { len: 1.15, d0: 1.16, d1: 0.88 }, plug: { len: 0.36, d: 0.6 }, splits: [0.36, 0.65] };
const cfm56_3 = { kind: "fan", eta: 0.1, fwd: 2.75, drop: 0.2, len: 3.55, d: 2.0, flat: 0.24, core: { len: 1.0, d0: 1.05, d1: 0.8 }, plug: { len: 0.3, d: 0.5 }, splits: [0.4, 0.68] };
const leap1b = { kind: "fan", eta: 0.1, fwd: 3.65, drop: 0.12, len: 4.5, d: 2.22, flat: 0.05, core: { len: 1.2, d0: 1.2, d1: 0.9 }, plug: { len: 0.36, d: 0.6 }, chevrons: 9, splits: [0.36, 0.66] };
const jt8dWing = { kind: "fan", eta: 0.06, fwd: 1.75, drop: 0.02, len: 4.6, d: 1.3, mixed: true, buckets: true, pylon: false, stripe: false, splits: [0.25, 0.6], bulge: 0.3 };

function b737(o) {
  const L = o.L, D = 4.12, VB = 1.38, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  const T = (u) => u - 39.47 + L;
  const mid = o.midExit ? [{ u: W(26.1) + (L - 39.47 - fwd) * 0.5, k: "E" }] : [];
  return {
    title: o.title, L, D, VB, belly: { from: W(13.6), to: W(24.6), drop: 0.16 },
    tail: o.tail, cockpit: { eyebrows: o.eyebrows ?? true },
    fin: { teRoot: L - 1.85, h: o.h ?? 12.55, tipChord: 1.57, sweepLE: 43, sweepTE: 16, dorsal: o.dorsal ?? { len: 4.95, h: 1.4 } },
    stab: { k: o.stabK ?? 1 },
    wing: { root: [W(o.rootU ?? 15.6), 2.68], sweep: o.sweep ?? 28.3, semi: o.semi ?? 15.3, dih: 5.75, rootChord: o.rootChord ?? 4.55, tipChord: o.tipChord ?? 1.1, tip: o.tip ?? "plain", wingletH: o.wingletH, fairings: 3 },
    engines: [o.engine ?? cfm56_7],
    gear: { main: [{ u: W(19.54), r: 0.565 }], nose: { u: 4.02, r: 0.335, doorU: 2.4 } },
    doors: [5.07, ...(o.exits ?? [16.83, 17.88]).map((u) => ({ u: W(u), k: "O" })), ...mid, T(31.45), { u: 8.55, k: "C" }, { u: T(28.25), k: "C" }],
    windows: { from: 6.02, to: T(29.85), skip: [[W(13.4), W(13.85)], [W(14.45), W(14.95)]] },
    floor: 0.386, winV: 0.624,
    antennasTop: [[9.0], [W(17.4), 0.33], [T(27.7)]], antennasBot: [[9.4], [W(21.5), 0.22]],
    seams: [4.15, 7.7, W(13.25), W(15.9), W(21.05), T(26.3), T(33.65), T(36.95)],
    beaconU: W(15.3), beaconBotU: W(19.1),
  };
}
const original = { h: 11.28, semi: 12.2, rootChord: 4.4, tipChord: 1.35, sweep: 27, dorsal: { len: 3.0, h: 0.7 }, stabK: 0.86, engine: jt8dWing, rootU: 15.9 };
const classic = { h: 11.13, semi: 12.5, rootChord: 4.5, tipChord: 1.4, sweep: 27, dorsal: { len: 5.2, h: 1.0 }, stabK: 0.89, engine: cfm56_3 };
const maxTail = { len: 3.15, bot: 0.72, top: 0.8 };

function b757(o) {
  const L = o.L, D = 4.12, VB = 2.05, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  return {
    title: o.title, L, D, VB, belly: { from: W(15.5), to: W(26.5), drop: 0.2 },
    nose: { len: 1.8, lenB: 1.42, tip: 0.35 }, cockpit: { a: 0.4, b: 0.82 },
    fin: { teRoot: L - 2.3, h: 13.56, tipChord: 2.2, sweepLE: 40, sweepTE: 15, dorsal: { len: 3.6, h: 0.95 } },
    stab: { k: 1.25, root: 5.9 },
    wing: { root: [W(16.6), VB + 0.32 * D], sweep: 28, semi: 17.0, dih: 5.5, rootChord: 6.8, teRootK: 0.62, tipChord: 1.5, fairings: 3 },
    engines: [{ kind: "fan", eta: 0.3, fwd: 3.6, drop: 0.3, len: 5.3, d: 2.55, mixed: true, splits: [0.3, 0.6], stripeAt: 0.3 }],
    gear: { main: [{ u: W(23.4), r: 0.58, axles: 2, pitch: 1.45 }], nose: { u: 4.9, r: 0.4, doorU: 3.4 } },
    doors: [4.6, W(11.4), { u: W(20.7), k: "O" }, { u: W(21.6), k: "O" }, ...(o.door3 ? [L - 17.0] : []), L - 6.4, { u: 9.0, k: "C" }, { u: L - 13.5, k: "C" }],
    windows: { from: 5.6, to: L - 6.6 },
    antennasTop: [[9.5], [W(19.5), 0.35], [L - 16]], antennasBot: [[10.5], [W(25), 0.24]],
    seams: [4.0, 8.0, W(14.0), W(19.2), W(25.5), L - 12, L - 3.2], beaconU: W(17),
  };
}

function b767(o) {
  const L = o.L, D = 5.41, VB = 2.0, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  return {
    title: o.title, L, D, VB, wide: true, floor: 0.43, winV: 0.62, belly: { from: W(19.5), to: W(31.5), drop: 0.22 },
    nose: { len: 1.75, lenB: 1.4, tip: 0.36 }, cockpit: { a: 0.38, b: 0.8, eyebrows: false },
    fin: { teRoot: L - 2.6, h: o.h ?? 15.85, tipChord: 2.6, sweepLE: 40, sweepTE: 15, dorsal: { len: 4.2, h: 1.1 } },
    stab: { k: 1.38, root: 6.6 },
    wing: { root: [W(20.3), VB + 0.3 * D], sweep: 31, semi: 21.2, dih: 6, rootChord: 9.4, teRootK: 0.64, tipChord: 2.1, tip: o.tip ?? "plain", rake: 2.2, fairings: 3 },
    engines: [{ kind: "fan", eta: 0.3, fwd: 3.4, drop: 0.3, len: 4.6, d: 2.75, core: { len: 1.4, d0: 1.5, d1: 1.05 }, plug: { len: 0.6, d: 0.7 } }],
    gear: { main: [{ u: W(26.6), r: 0.6, axles: 2, pitch: 1.42 }], nose: { u: 5.4, r: 0.5, doorU: 3.9 } },
    doors: o.doors(W, L),
    windows: { from: 7.1, to: L - 8.6 },
    antennasTop: [[11], [W(24), 0.4], [L - 18]], antennasBot: [[12], [W(31), 0.26]],
    seams: [5.0, 9.6, W(17.6), W(23.8), W(31.2), L - 14, L - 4], beaconU: W(19),
  };
}

function b777(o) {
  const L = o.L, D = 6.2, VB = 2.12, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  const ge90 = { kind: "fan", eta: 0.3, fwd: 10.4, drop: -0.81, len: 5.75, d: 3.92, core: { len: 1.9, d0: 2.1, d1: 1.05 }, plug: { len: 1.25, d: 0.68 }, splits: [0.3, 0.6], stripeAt: 0.42 };
  const trent = { ...ge90, fwd: 9.6, drop: -0.55, len: 5.2, d: 3.55, core: { len: 1.8, d0: 1.9, d1: 0.95 }, plug: { len: 1.15, d: 0.62 } };
  const ge9x = { ...ge90, fwd: 10.9, drop: -1.0, len: 6.3, d: 4.25, core: { len: 2.0, d0: 2.2, d1: 1.1 } };
  return {
    title: o.title, L, D, VB, wide: true, floor: 0.435, winV: 0.61, belly: { from: W(28.4), to: W(41.6), drop: 0.48 },
    nose: { len: 1.7, lenB: 1.4, tip: 0.37, tb: 1.55 }, cockpit: { a: 0.34, b: 0.74, bot: 0.6, eyebrows: false },
    tail: { len: 3.45, bot: 0.7, top: 0.8 },
    fin: { teRoot: L - 3.15, h: o.h ?? 18.51, tipChord: 3.6, sweepLE: 37, sweepTE: 8, dorsal: { len: 4.6, h: 1.25 } },
    stab: { k: 1.5, root: 7.0 },
    wing: { root: [W(29.3), 3.22], sweep: 30.3, semi: o.semi ?? 27.4, dih: 6.4, rootChord: 15.6, teRootK: 0.66, tipChord: 2.4, tip: o.raked ? "raked" : "plain", rake: o.rake ?? 2.0, fairings: 4 },
    engines: [o.eng === "ge90" ? ge90 : o.eng === "ge9x" ? ge9x : trent],
    gear: { main: [{ u: W(38.55), r: 0.66, axles: 3, pitch: 1.45 }], nose: { u: 5.45, r: 0.6, doorU: 3.9 } },
    doors: [6.85, W(18.4), W(36.4), ...(o.door4 ? [L - 20.3] : []), L - 11.4, { u: W(13.4), k: "C" }, { u: L - 21.0, k: "C" }],
    windows: { from: 8.6, to: L - 12.6, skip: [[W(31.0), W(31.6)]] },
    antennasTop: [[11.8], [W(27.5), 0.42], [L - 25]], antennasBot: [[15.5], [W(42), 0.3]],
    seams: [6.3, W(16.4), W(24.6), L - 22.6, L - 7.2], beaconU: W(22),
  };
}

function b787(o) {
  const L = o.L, D = 5.97, VB = 2.02, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  return {
    title: o.title, L, D, VB, wide: true, floor: 0.44, winV: 0.62, windows: { from: 8.35, to: L - 14.0, w: 0.29, h: 0.47, pitch: 0.61 },
    belly: { from: W(21.8), to: W(37.2), drop: 0.42 },
    nose: { len: 1.95, lenB: 1.5, tip: 0.36, tb: 1.7 }, cockpit: { a: 0.32, b: 0.8, bot: 0.58, h: 0.11, eyebrows: false },
    fin: { teRoot: L - 2.9, h: 17.02, tipChord: 3.55, sweepLE: 37, sweepTE: 4, dorsal: { len: 5.6, h: 1.4 } },
    stab: { k: 1.36, root: 6.6 },
    wing: { root: [W(26.0), 3.12], sweep: 28.8, semi: 24.7, dih: 7.9, rootChord: 14.5, teRootK: 0.66, tipChord: 2.3, tip: "raked", rake: 2.7, fairings: 4 },
    engines: [{ kind: "fan", eta: 0.28, fwd: 8.2, drop: -0.26, len: 4.9, d: 3.55, core: { len: 1.75, d0: 1.6, d1: 0.95 }, plug: { len: 1.1, d: 0.6 }, chevrons: 9, splits: [0.3, 0.6] }],
    gear: { main: [{ u: W(34.0), r: 0.64, axles: 2, pitch: 1.44 }], nose: { u: 6.55, r: 0.53, doorU: 5.0 } },
    doors: [7.25, W(18.1), W(33.6), L - 12.9, { u: W(12.7), k: "C" }, { u: L - 18.4, k: "C" }],
    antennasTop: [[11.2], [W(24.5), 0.4], [L - 20]], antennasBot: [[14.5], [W(38), 0.3]],
    seams: [6.0, W(15.2), L - 21.5, L - 6.6], beaconU: W(20.5),
  };
}

function b747(o) {
  const L = o.L, D = 6.55, VB = 2.05, VT = VB + D, VH = 10.45, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  const hump = o.hump; // where the upper deck starts to fair down
  const pw = o.genx
    ? { len: 5.0, d: 3.3, core: { len: 1.7, d0: 1.75, d1: 0.9 }, plug: { len: 1.05, d: 0.55 }, chevrons: 9 }
    : { len: 4.6, d: 2.95, core: { len: 1.65, d0: 1.64, d1: 0.82 }, plug: { len: 1.05, d: 0.52 } };
  const upperWin = { v: 9.32, from: 9.4, to: hump - 0.9, skip: o.upperDoor ? [[W(21.0), W(22.2)]] : [] };
  return {
    title: o.title, L, D, VB, wide: true, floor: 0.46, winV: 0.62, crown: VH, VTmax: VH, belly: { from: W(24), to: W(41.8), drop: 0.42 },
    nose: { len: 1.5, lenB: 1.28, tip: 0.38 },
    topCmds: ({ nTop, tailTop }) => [...crN(nTop), ["L", hump, VH], ["C", hump + 2.4, VH - 0.02, hump + 3.5, VT + 0.55, hump + 6.0, VT], ["L", tailTop[0][0], VT]],
    crownAt: (u) => (u < hump + 1 ? VH : VT),
    cockpit: { a: 0.69, b: 1.04, bot: 1.065, h: 0.13, inset: 0.06, eyebrows: !!o.eyebrows },
    fin: { teRoot: L - 3.1, h: o.h ?? 19.41, tipChord: o.tipChord ?? 3.2, sweepLE: 35.6, sweepTE: 3.7, dorsal: { len: 4.8, h: 1.3 } },
    stab: { k: 1.5, root: 7.2 },
    wing: { root: [W(26.4), 3.55], sweep: 35, semi: o.semi ?? 29, dih: 8.5, rootChord: 16, teRootK: 0.875, tipChord: 3.3, tip: o.tip ?? "plain", wingletH: 1.8, rake: 3.0, fairings: 4 },
    engines: [{ kind: "fan", eta: 0.3, fwd: 7.9, drop: 0.23, ...pw }, { kind: "fan", eta: 0.63, fwd: 6.45, drop: -0.1, ...pw }],
    gear: { main: [{ u: W(30.9), r: 0.63, axles: 2, pitch: 1.52 }, { u: W(34.4), r: 0.63, axles: 2, pitch: 1.52 }], nose: { u: 7.55, r: 0.62, doorU: 5.9 } },
    doors: [...o.doors(W, L), ...(o.upperDoor ? [{ u: W(21.6), v: 8.3, w: 0.84, h: 1.55 }] : []), { u: W(13.4), k: "C" }, { u: L - 21.6, k: "C" }],
    windows: { from: 9.05, to: L - 12.3 },
    windowRows: [upperWin],
    antennasTop: [[12.5, 0.42], [W(32.5), 0.42], [L - 22]], antennasBot: [[16.5], [W(40), 0.3]],
    seams: [6.6, W(15.0), W(24.0), L - 23.4, L - 7.0], beaconU: 19.0,
  };
}
import { cr as crN } from "../lib.mjs";

function b707(o) {
  const L = o.L, D = 4.2, VB = 1.62, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  const jt3d = { len: 2.55, d: 1.62, core: { len: 2.55, d0: 1.05, d1: 0.72 }, plug: { len: 0.5, d: 0.42 }, splits: [0.45], bulge: 0.38, lip: 0.16, stripe: false };
  const jt3c = { len: 4.7, d: 1.18, mixed: true, nozzle: 0.62, splits: [0.25, 0.55, 0.8], bulge: 0.3, stripe: false };
  const conway = { ...jt3c, len: 4.4, d: 1.35 };
  const eng = o.eng === "jt3d" ? jt3d : o.eng === "conway" ? conway : jt3c;
  return {
    title: o.title, L, D, VB, belly: { from: W(17.8), to: W(28.2), drop: 0.22 },
    nose: { len: 1.45, lenB: 1.4, tip: 0.4, tb: 1.4 }, cockpit: { a: 0.43, b: 0.9, bot: 0.62, h: 0.1, panels: 4 },
    fin: { teRoot: L - 1.56, h: o.h ?? 12.93, tipChord: 2.25, sweepLE: 47, sweepTE: 3.2, dorsal: { len: 5.2, h: 1.0 } },
    stab: { k: 1.1, root: 7.3 },
    wing: { root: [W(18.4), 2.3], sweep: 34.6, semi: o.semi ?? 20.3, dih: 8.6, rootChord: 8.0, teRootK: 1.15, tipChord: 2.0, fairings: 3 },
    engines: [{ kind: "fan", eta: 0.32, fwd: 8.05 - (eng.len - 2.55) * 0.3, drop: 0.9, pylonTop: true, ...eng }, { kind: "fan", eta: 0.62, fwd: 6.25 - (eng.len - 2.55) * 0.3, drop: 0.55, pylonTop: true, ...eng }],
    gear: { main: [{ u: W(23.35), r: 0.56, axles: 2, pitch: 1.4 }], nose: { u: 5.05, r: 0.42, doorU: 3.8 } },
    doors: [5.85, { u: W(18.9), k: "O" }, { u: W(19.95), k: "O" }, L - 6.2, { u: 9.2, k: "C" }, { u: L - 13.6, k: "C" }],
    windows: { from: 7.0, to: L - 7.7, w: 0.22, h: 0.3 },
    antennasTop: [[8.6], [W(22.5)], [L - 24]], antennasBot: [[12.0]],
    seams: [4.2, 11.2, W(17.8), W(28.2), L - 11.2, L - 4.0], beaconU: 15.5,
    front: [(g) => g.add(`<path d="${g.d([["M", L - 3.4, (o.h ?? 12.93) - 0.07], ["L", L - 5.6, (o.h ?? 12.93) + 0.05]])}" fill="none" stroke="#7b828a" stroke-width="1.6" stroke-linecap="round"/>`)],
  };
}

function b727(o) {
  const L = o.L, D = 4.15, VB = 1.25, VT = VB + D, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  const pod = { u0: L - 11.3, vc: VB + 0.76 * D, len: 5.3, d: 1.42, buckets: true };
  return {
    title: o.title, L, D, VB, belly: { from: W(15), to: W(23.5), drop: 0.1 },
    nose: { len: 1.55, lenB: 1.38, tip: 0.4, tb: 1.45 }, cockpit: { panels: 4, a: 0.4, b: 0.86 },
    tail: { len: 2.6, bot: 0.45, top: 0.88, topLen: 0.3 },
    fin: { teRoot: L - 1.07, rootV: VT + 0.3, down: VB + 0.55 * D, h: 10.36, tipChord: 3.5, sweepLE: 50, sweepTE: 26 },
    stab: { t: true, k: 1.05, dx: 0.1 },
    wing: { root: [W(16.4), VB + 0.3 * D], sweep: 33, semi: 14.6, dih: 3, rootChord: 6.4, teRootK: 0.8, tipChord: 1.6, fairings: 3 },
    gear: { main: [{ u: W(21.0), r: 0.55 }], nose: { u: 3.25, r: 0.38, doorU: 2.1 } },
    doors: [4.7, ...(o.exits ?? [19.5, 20.3]).map((u) => ({ u: W(u), k: "O" })), { u: 8.5, k: "C" }, { u: W(26.5), k: "C" }],
    windows: { from: 6.1, to: L - 12.8 },
    antennasTop: [[8.5], [W(20)]], antennasBot: [[10], [W(24.5), 0.22]], beaconU: W(14),
    seams: [3.9, 8.0, W(15.0), W(24.0), L - 14.0],
    front: [sDuct({ u: L - 11.0, h: 1.0, w: 0.3 }), (g) => rearPod(g, pod), tailNozzle({ r: 0.55 })],
  };
}

export const BOEING = {
  "B737-100": { ...b737({ title: "Boeing 737-100", L: 28.65, fwd: -5.05, exits: [16.83], ...original }) },
  "B737-200": { ...b737({ title: "Boeing 737-200", L: 30.53, fwd: -4.14, ...original }) },
  "B737-200ADV": { ...b737({ title: "Boeing 737-200 Advanced", L: 30.53, fwd: -4.14, ...original }) },
  "B737-300": { ...b737({ title: "Boeing 737-300", L: 33.4, fwd: -3.02, ...classic }) },
  "B737-400": { ...b737({ title: "Boeing 737-400", L: 36.4, fwd: -1.52, ...classic }) },
  "B737-500": { ...b737({ title: "Boeing 737-500", L: 31.0, fwd: -3.9, exits: [17.3], ...classic }) },
  "B737-600": { ...b737({ title: "Boeing 737-600", L: 31.24, fwd: -4.29, exits: [17.3] }) },
  "B737-700": { ...b737({ title: "Boeing 737-700", L: 33.63, fwd: -3.02, exits: [17.3], tip: "blended", wingletH: 2.75 }) },
  "B737-800": { ...b737({ title: "Boeing 737-800", L: 39.47, tip: "blended", wingletH: 2.75 }) },
  "B737-900ER": { ...b737({ title: "Boeing 737-900ER", L: 42.11, fwd: 1.57, tip: "blended", wingletH: 2.75, midExit: true }) },
  "B737-8": { ...b737({ title: "Boeing 737 MAX 8", L: 39.52, tip: "split", wingletH: 2.9, eyebrows: false, engine: leap1b, tail: maxTail, h: 12.3 }) },
  "B737-9": { ...b737({ title: "Boeing 737 MAX 9", L: 42.16, fwd: 1.57, tip: "split", wingletH: 2.9, eyebrows: false, engine: leap1b, tail: maxTail, h: 12.3, midExit: true }) },
  "B757-200": b757({ title: "Boeing 757-200", L: 47.32 }),
  "B757-300": b757({ title: "Boeing 757-300", L: 54.43, fwd: 3.38, door3: true }),
  "B767-200": b767({ title: "Boeing 767-200", L: 48.51, fwd: -3.07, doors: (W, L) => [6.2, { u: W(22.4), k: "O" }, L - 7.7, { u: 11, k: "C" }, { u: L - 13, k: "C" }] }),
  "B767-200ER": b767({ title: "Boeing 767-200ER", L: 48.51, fwd: -3.07, doors: (W, L) => [6.2, { u: W(22.4), k: "O" }, L - 7.7, { u: 11, k: "C" }, { u: L - 13, k: "C" }] }),
  "B767-300": b767({ title: "Boeing 767-300", L: 54.94, doors: (W, L) => [6.2, W(16.4), { u: W(31.4), k: "E" }, L - 7.7, { u: 11, k: "C" }, { u: L - 13, k: "C" }] }),
  "B767-300ER": b767({ title: "Boeing 767-300ER", L: 54.94, doors: (W, L) => [6.2, W(16.4), { u: W(31.4), k: "E" }, L - 7.7, { u: 11, k: "C" }, { u: L - 13, k: "C" }] }),
  "B767-400ER": b767({ title: "Boeing 767-400ER", L: 61.37, fwd: 3.35, h: 16.87, tip: "raked", doors: (W, L) => [6.2, W(16.4), { u: W(31.4), k: "E" }, L - 18.6, L - 7.7, { u: 11, k: "C" }, { u: L - 13, k: "C" }] }),
  "B777-200": b777({ title: "Boeing 777-200", L: 63.73, fwd: -5.3, h: 18.5 }),
  "B777-200ER": b777({ title: "Boeing 777-200ER", L: 63.73, fwd: -5.3, h: 18.5 }),
  "B777-200LR": b777({ title: "Boeing 777-200LR", L: 63.73, fwd: -5.3, h: 18.6, raked: true, eng: "ge90" }),
  "B777-300": b777({ title: "Boeing 777-300", L: 73.86, door4: true }),
  "B777-300ER": b777({ title: "Boeing 777-300ER", L: 73.86, door4: true, raked: true, eng: "ge90" }),
  "B777-9": b777({ title: "Boeing 777-9", L: 76.72, fwd: 1.6, door4: true, raked: true, rake: 3.2, semi: 29.6, eng: "ge9x", h: 19.68 }),
  "B787-8": b787({ title: "Boeing 787-8", L: 56.72, fwd: -3.05 }),
  "B787-9": b787({ title: "Boeing 787-9", L: 62.81 }),
  "B787-10": b787({ title: "Boeing 787-10", L: 68.28, fwd: 3.05 }),
  "B747-100": b747({ title: "Boeing 747-100", L: 70.51, hump: 17.2, semi: 26.6, eyebrows: true, doors: (W, L) => [7.95, W(17.55), W(30.6), L - 26.2, L - 15.4] }),
  "B747-200B": b747({ title: "Boeing 747-200B", L: 70.51, hump: 17.2, semi: 26.6, eyebrows: true, doors: (W, L) => [7.95, W(17.55), W(30.6), L - 26.2, L - 15.4] }),
  "B747-300": b747({ title: "Boeing 747-300", L: 70.51, hump: 24.2, semi: 26.6, eyebrows: true, upperDoor: true, doors: (W, L) => [7.95, W(17.55), W(30.6), L - 26.2, L - 15.4] }),
  "B747-400": b747({ title: "Boeing 747-400", L: 70.66, hump: 24.2, tip: "canted", upperDoor: true, doors: (W, L) => [7.95, W(17.55), W(30.6), L - 26.26, L - 15.46] }),
  "B747-400ER": b747({ title: "Boeing 747-400ER", L: 70.66, hump: 24.2, tip: "canted", upperDoor: true, doors: (W, L) => [7.95, W(17.55), W(30.6), L - 26.26, L - 15.46] }),
  "B747-8I": b747({ title: "Boeing 747-8 Intercontinental", L: 76.25, fwd: 4.1, hump: 28.3, semi: 30.4, tip: "raked", genx: true, h: 19.35, upperDoor: true, doors: (W, L) => [7.95, W(17.55), W(30.6), L - 26.26, L - 15.46] }),
  "B747SP": b747({ title: "Boeing 747SP", L: 56.31, fwd: -6.0, hump: 17.2, semi: 26.6, eyebrows: true, h: 19.94, tipChord: 3.9, doors: (W, L) => [7.95, W(17.55), W(30.6), L - 12.4] }),
  "B707-120": b707({ title: "Boeing 707-120", L: 44.22, fwd: -1.2, semi: 18.0, h: 12.7 }),
  "B707-120B": b707({ title: "Boeing 707-120B", L: 44.22, fwd: -1.2, semi: 18.0, h: 12.7, eng: "jt3d" }),
  "B707-320": b707({ title: "Boeing 707-320", L: 46.61, semi: 19.8 }),
  "B707-420": b707({ title: "Boeing 707-420", L: 46.61, semi: 19.8, eng: "conway" }),
  "B707-320B": b707({ title: "Boeing 707-320B", L: 46.61, eng: "jt3d" }),
  "B707-320C": b707({ title: "Boeing 707-320C", L: 46.61, eng: "jt3d" }),
  "B720": b707({ title: "Boeing 720", L: 41.5, fwd: -2.5, semi: 18.0, h: 12.65 }),
  "B720B": b707({ title: "Boeing 720B", L: 41.5, fwd: -2.5, semi: 18.0, h: 12.65, eng: "jt3d" }),
  "B727-100": b727({ title: "Boeing 727-100", L: 40.59, fwd: -3.05, exits: [19.9] }),
  "B727-100C": b727({ title: "Boeing 727-100C", L: 40.59, fwd: -3.05, exits: [19.9] }),
  "B727-200": b727({ title: "Boeing 727-200", L: 46.69 }),
  "B727-200ADV": b727({ title: "Boeing 727-200 Advanced", L: 46.69 }),
};
