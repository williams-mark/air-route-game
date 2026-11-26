// Airbus side views. Length/span from aircraftVisualById where present, else Airbus "Aircraft Characteristics -
// Airport and Maintenance Planning" documents as reproduced in Wikipedia spec tables (RECALLED, see SOURCES.md
// "Aircraft side views"). Fuselage heights: A220 3.7 m, A320 family 4.14 m, A300/A310/A330/A340 5.64 m,
// A350 6.09 m, A380 8.41 m. Door, gear and wing-root stations are drawing estimates; plugs ahead of / behind the wing.
import { cockpitMask } from "../jet.mjs";

const cfm56_5b = { kind: "fan", eta: 0.19, fwd: 4.55, drop: 0.02, len: 3.75, d: 2.3, core: { len: 1.25, d0: 1.15, d1: 0.66 }, plug: { len: 0.72, d: 0.42 }, stripeAt: 0.4 };
const leap1a = { kind: "fan", eta: 0.19, fwd: 5.0, drop: -0.15, len: 4.3, d: 2.55, core: { len: 1.3, d0: 1.3, d1: 0.8 }, plug: { len: 0.72, d: 0.45 }, stripeAt: 0.38 };

function a320(o) {
  const L = o.L, D = 4.14, VB = 1.92, fwd = o.fwd ?? 0, neo = !!o.neo;
  const W = (u) => u + fwd;
  return {
    title: o.title, L, D, VB, floor: 0.36, winV: 0.61,
    nose: { len: 1.55, lenB: 1.21, tip: 0.425, tb: 1.65 }, cockpit: { a: 0.36, b: 0.89, bot: 0.69, h: 0.14, inset: 0.06, eyebrows: false, slope: 0 },
    tail: { len: 3.5, bot: 0.65, top: 0.76, topLen: 2.0 },
    belly: { from: W(12.6), to: W(21.4), drop: 0.26 },
    fin: { teRoot: L - 1.25, h: o.h ?? 11.76, tipChord: 2.25, sweepLE: 43.8, sweepTE: 8.8, dorsal: { len: 3.0, h: 0.75 } },
    stab: { k: 0.87, root: 5.3, rootV: 0.79, lowV: 0.7 },
    wing: { root: [W(14.7), 2.6], sweep: 22.9, semi: 15.05, dih: 5.9, rootChord: 6.2, teRootK: 0.9, teDrop: 0.74, tipChord: 1.5, tip: neo ? "sharklet" : "fence", wingletH: neo ? 2.43 : 0.85, fairings: 3 },
    engines: [neo ? leap1a : cfm56_5b],
    gear: { main: [{ u: W(17.55), r: 0.6 }], nose: { u: 5.07, r: 0.38, doorU: 3.6 } },
    doors: [5.25, ...o.doors(W, L), L - 6.75, { u: 8.9, k: "C" }, { u: L - 11.6, k: "C" }],
    windows: { from: 6.25, to: L - 7.6, skip: [[W(13.1), W(13.5)]] },
    antennasTop: [[10.5], [W(18.6)], [L - 13]], antennasBot: [[11.5], [W(21.5), 0.22]],
    seams: [4.6, 7.6, W(12.6), W(21.4), L - 12.6, L - 4.4], beaconU: W(13.9), beaconBotU: W(19.5),
  };
}
const ow2 = (W) => [{ u: W(16.26), k: "O" }, { u: W(17.0), k: "O" }];
const ow1 = (W) => [{ u: W(16.6), k: "O" }];
const a321doors = (W) => [W(12.3), W(22.6)];
const acf = (W) => [W(12.3), { u: W(16.3), k: "O" }, { u: W(17.05), k: "O" }];

function a220(o) {
  const L = o.L, D = 3.7, VB = 1.3, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  return {
    title: o.title, L, D, VB, floor: 0.38, winV: 0.6,
    nose: { len: 1.75, lenB: 1.35, tip: 0.4, tb: 1.6 }, cockpit: { a: 0.37, b: 0.85, bot: 0.63, h: 0.13, eyebrows: false },
    belly: { from: W(12.6), to: W(21.0), drop: 0.15 },
    fin: { teRoot: L - 1.6, h: 11.5, tipChord: 2.0, sweepLE: 40, sweepTE: 18, dorsal: { len: 3.5, h: 0.9 } },
    stab: { k: 0.9 },
    wing: { root: [W(14.4), VB + 0.33 * D], sweep: 25, semi: 15.75, dih: 5, rootChord: 5.6, teRootK: 0.75, tipChord: 1.3, fairings: 3 },
    engines: [{ kind: "fan", eta: 0.28, fwd: 3.2, drop: 0.08, len: 4.1, d: 2.05, core: { len: 1.2, d0: 1.1, d1: 0.7 }, plug: { len: 0.5, d: 0.4 } }],
    gear: { main: [{ u: W(18.8), r: 0.55 }], nose: { u: 4.6, r: 0.33, doorU: 3.2 } },
    doors: [5.0, ...o.exits.map((u) => ({ u: W(u), k: "O" })), L - 6.2, { u: 8.4, k: "C" }, { u: L - 11, k: "C" }],
    windows: { from: 5.9, to: L - 7.2, w: 0.26, h: 0.4, pitch: 0.56 },
    antennasTop: [[9.5], [W(18)]], antennasBot: [[10.5]], beaconU: W(13.5),
    seams: [4.2, 7.6, W(12.4), W(21.0), L - 11, L - 4.2],
  };
}

function a300(o) {
  const L = o.L, D = 5.64, VB = 1.95, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  return {
    title: o.title, L, D, VB, wide: true, floor: 0.43, winV: 0.62,
    nose: { len: 1.55, lenB: 1.25, tip: 0.4, tb: 1.55 }, cockpit: { a: 0.37, b: 0.86, bot: 0.64, h: 0.1, eyebrows: !!o.eyebrows },
    tail: { len: 3.0, bot: 0.68, top: 0.78, topLen: 0.9 },
    belly: { from: W(18.5), to: W(30.5), drop: 0.25 },
    fin: { teRoot: L - 2.4, h: o.h ?? 16.53, tipChord: 2.6, sweepLE: 42, sweepTE: 15, dorsal: { len: 4.0, h: 1.1 } },
    stab: { k: 1.25, root: 6.8 },
    wing: { root: [W(19.5), VB + 0.32 * D], sweep: 29, semi: o.semi ?? 19.6, dih: 5.5, rootChord: 9.0, teRootK: 0.7, tipChord: 2.3, tip: o.fence ? "fence" : "plain", wingletH: 1.0, fairings: 3 },
    engines: [{ kind: "fan", eta: 0.32, fwd: 3.4, drop: 0.35, len: 4.5, d: 2.75, core: { len: 1.4, d0: 1.5, d1: 1.0 }, plug: { len: 0.6, d: 0.7 } }],
    gear: { main: [{ u: W(25.3), r: 0.62, axles: 2, pitch: 1.4 }], nose: { u: 5.6, r: 0.48, doorU: 4.1 } },
    doors: [6.0, W(13.4), { u: W(29.8), k: "E" }, L - 9.0, { u: 10.5, k: "C" }, { u: L - 14, k: "C" }],
    windows: { from: 7.4, to: L - 10.2 },
    antennasTop: [[11], [W(24)], [L - 17]], antennasBot: [[12], [W(31), 0.26]], beaconU: W(19),
    seams: [5.0, 9.6, W(17.6), W(23.8), W(31.2), L - 13.5, L - 4],
  };
}

function a330(o) {
  const L = o.L, D = 5.64, VB = 2.05, fwd = o.fwd ?? 0, quad = !!o.quad;
  const W = (u) => u + fwd;
  const e = o.eng;
  const engines = quad ? [{ ...e, eta: 0.3, fwd: e.fwdI }, { ...e, eta: 0.62, fwd: e.fwdO, drop: e.drop - 0.12 }] : [{ ...e, eta: 0.32, fwd: e.fwdI }];
  const main = [{ u: W(31.0), r: 0.64, axles: 2, pitch: 1.4 }];
  return {
    title: o.title, L, D, VB, wide: true, floor: 0.43, winV: 0.62,
    nose: { len: 1.6, lenB: 1.25, tip: 0.4, tb: 1.6 }, cockpit: { a: 0.36, b: 0.86, bot: 0.64, h: 0.12, eyebrows: false },
    tail: { len: 3.3, bot: 0.7, top: 0.78, topLen: 1.0 },
    belly: { from: W(22), to: W(36), drop: 0.35 },
    fin: { teRoot: L - 2.4, h: o.h ?? 16.83, tipChord: 3.0, sweepLE: 41, sweepTE: 13, dorsal: { len: 4.2, h: 1.2 } },
    stab: { k: 1.45, root: 7.4 },
    wing: { root: [W(23.5), VB + 0.3 * D], sweep: 31, semi: o.semi ?? 27.3, dih: 5.5, rootChord: 11, teRootK: 0.7, tipChord: 2.3, tip: o.neo ? "sharklet" : "canted", wingletH: o.neo ? 3.6 : 2.74, fairings: 4 },
    engines,
    gear: { main: o.centre ? [...main, { u: W(32.6), r: 0.6, axles: o.centre }] : main, nose: { u: 6.0, r: 0.55, doorU: 4.4 } },
    doors: [6.4, W(17.6), W(37.0), ...(o.extraDoor ? [L - 20] : []), L - 8.6, { u: W(12.5), k: "C" }, { u: L - 16, k: "C" }],
    windows: { from: 7.8, to: L - 9.8 },
    antennasTop: [[11.5], [W(28)], [L - 20]], antennasBot: [[13], [W(37), 0.28]], beaconU: W(21),
    seams: [5.2, W(15.4), W(22.2), W(35.8), L - 16, L - 4.2],
  };
}
const trent700 = { kind: "fan", fwdI: 4.0, fwdO: 3.6, drop: 0.3, len: 5.6, d: 2.95, mixed: true, splits: [0.3, 0.6], stripeAt: 0.3 };
const trent7000 = { kind: "fan", fwdI: 4.6, fwdO: 4.2, drop: 0.1, len: 5.9, d: 3.45, core: { len: 1.7, d0: 1.75, d1: 1.0 }, plug: { len: 0.8, d: 0.6 } };
const cfm56_5c = { kind: "fan", fwdI: 3.6, fwdO: 3.3, drop: 0.35, len: 5.0, d: 2.25, mixed: true, splits: [0.3, 0.62], stripeAt: 0.3 };
const trent500 = { kind: "fan", fwdI: 4.2, fwdO: 3.8, drop: 0.3, len: 5.6, d: 2.95, mixed: true, splits: [0.3, 0.6], stripeAt: 0.3 };

function a350(o) {
  const L = o.L, D = 6.09, VB = 2.1, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  return {
    title: o.title, L, D, VB, wide: true, floor: 0.44, winV: 0.61,
    nose: { len: 1.95, lenB: 1.45, tip: 0.37, tb: 1.7 }, cockpit: { a: 0.33, b: 0.8, bot: 0.6, h: 0.12, eyebrows: false },
    beforeCockpit: [cockpitMask({ u0: 0.3 * D, u1: 0.84 * D, v0: VB + 0.56 * D, v1: VB + 0.755 * D })],
    tail: { len: 3.6, bot: 0.7, top: 0.78, topLen: 0.8 },
    belly: { from: W(23), to: W(38), drop: 0.4 },
    fin: { teRoot: L - 2.8, h: 17.05, tipChord: 3.0, sweepLE: 42, sweepTE: 18, dorsal: { len: 5.0, h: 1.3 } },
    stab: { k: 1.45, root: 7.6 },
    wing: { root: [W(26.5), VB + 0.28 * D], sweep: 31.9, semi: 28.6, dih: 6.5, rootChord: 14, teRootK: 0.68, tipChord: 2.2, tip: "a350", wingletH: 2.9, fairings: 4 },
    engines: [{ kind: "fan", eta: 0.3, fwd: 8.2, drop: -0.3, len: 5.6, d: 3.6, core: { len: 1.8, d0: 1.8, d1: 1.0 }, plug: { len: 1.0, d: 0.6 } }],
    gear: { main: [{ u: W(34.5), r: 0.64, axles: o.axles ?? 2, pitch: 1.45 }], nose: { u: 6.8, r: 0.55, doorU: 5.2 } },
    doors: [7.2, W(18.0), W(37.2), L - 11.6, { u: W(13), k: "C" }, { u: L - 18, k: "C" }],
    windows: { from: 8.5, to: L - 13.0, w: 0.28, h: 0.44, pitch: 0.55 },
    antennasTop: [[12], [W(27)], [L - 22]], antennasBot: [[15], [W(40), 0.3]], beaconU: W(22),
    seams: [6.0, W(16.0), W(23.0), L - 20, L - 6.0],
  };
}

const a380 = () => {
  const L = 72.72, D = 8.41, VB = 1.95;
  return {
    title: "Airbus A380-800", L, D, VB, wide: true, floor: 0.363, winV: 0.488,
    nose: { len: 1.33, lenB: 1.02, tip: 0.325, tb: 1.6 }, cockpit: { a: 0.35, b: 0.65, bot: 0.645, h: 0.12, eyebrows: false },
    tail: { len: 2.97, bot: 0.58, top: 0.63, topLen: 2.56 },
    belly: { from: 20.8, to: 46.0, drop: 0.6 },
    fin: { teRoot: L - 2.6, h: 24.09, tipChord: 5.3, sweepLE: 35, sweepTE: 5, dorsal: { len: 6.0, h: 1.4 } },
    stab: { k: 2.0, root: 14.4, rootV: 0.7 },
    wing: { root: [25.2, 3.75], sweep: 34.3, semi: 36.3, dih: 7.4, rootChord: 22, teRootK: 0.89, tipChord: 4.1, tip: "fence", wingletH: 1.8, fairings: 4 },
    engines: [
      { kind: "fan", eta: 0.3, fwd: 8.74, drop: -0.03, len: 5.2, d: 3.45, core: { len: 1.85, d0: 1.8, d1: 0.9 }, plug: { len: 1.15, d: 0.6 } },
      { kind: "fan", eta: 0.63, fwd: 7.8, drop: -0.41, len: 5.2, d: 3.45, core: { len: 1.85, d0: 1.8, d1: 0.9 }, plug: { len: 1.15, d: 0.6 } },
    ],
    gear: { main: [{ u: 33.0, r: 0.7, axles: 2, pitch: 1.68 }, { u: 38.3, r: 0.7, axles: 3, pitch: 1.6 }], nose: { u: 6.0, r: 0.66, doorU: 4.3 } },
    doors: [8.1, 18.4, 31.6, 47.6, 60.6, ...[15.0, 39.6, 57.8].map((u) => ({ u, v: 7.98 })), { u: 14, k: "C" }, { u: L - 23, k: "C" }],
    windows: { from: 9.3, to: L - 10.8, skip: [[25.0, 25.5], [53.9, 54.4]] },
    windowRows: [{ v: 8.98, w: 0.27, h: 0.39, pitch: 0.533, from: 12.6, to: L - 14.2, skip: [15.0, 39.6, 57.8].map((u) => [u - 0.65, u + 0.65]) }],
    antennasTop: [[14, 0.45], [33, 0.45]], antennasBot: [[17, 0.4]], beaconU: 24, beaconBotU: 36,
    seams: [7.0, 20.8, 46.0, L - 8.6],
  };
};

export const AIRBUS = {
  A318: a320({ title: "Airbus A318", L: 31.44, fwd: -3.07, h: 12.56, doors: ow1 }),
  A319: a320({ title: "Airbus A319", L: 33.84, fwd: -1.87, doors: ow1 }),
  A320: a320({ title: "Airbus A320", L: 37.57, doors: ow2 }),
  A321: a320({ title: "Airbus A321", L: 44.51, fwd: 4.27, doors: a321doors }),
  A320N: a320({ title: "Airbus A320neo", L: 37.57, neo: true, doors: ow2 }),
  A321N: a320({ title: "Airbus A321neo", L: 44.51, fwd: 4.27, neo: true, doors: a321doors }),
  A321LR: a320({ title: "Airbus A321LR", L: 44.51, fwd: 4.27, neo: true, doors: acf }),
  A321XLR: a320({ title: "Airbus A321XLR", L: 44.51, fwd: 4.27, neo: true, doors: acf }),
  "A220-100": a220({ title: "Airbus A220-100", L: 35.0, exits: [16.4] }),
  "A220-300": a220({ title: "Airbus A220-300", L: 38.7, fwd: 2.0, exits: [16.0, 16.8] }),
  A300B2: a300({ title: "Airbus A300B2", L: 53.61, eyebrows: true }),
  "A300B4-100": a300({ title: "Airbus A300B4-100", L: 53.61, eyebrows: true }),
  "A300B4-200": a300({ title: "Airbus A300B4-200", L: 53.61, eyebrows: true }),
  "A300-600": a300({ title: "Airbus A300-600", L: 54.08 }),
  "A300-600R": a300({ title: "Airbus A300-600R", L: 54.08, fence: true }),
  "A310-200": a300({ title: "Airbus A310-200", L: 46.66, fwd: -3.6, h: 15.8, semi: 19.1 }),
  "A310-300": a300({ title: "Airbus A310-300", L: 46.66, fwd: -3.6, h: 15.8, semi: 19.1, fence: true }),
  "A330-200": a330({ title: "Airbus A330-200", L: 58.82, fwd: -2.4, h: 17.39, eng: trent700 }),
  "A330-300": a330({ title: "Airbus A330-300", L: 63.66, eng: trent700 }),
  "A330-800": a330({ title: "Airbus A330-800", L: 58.82, fwd: -2.4, h: 17.39, eng: trent7000, neo: true, semi: 29.0 }),
  "A330-900": a330({ title: "Airbus A330-900", L: 63.69, eng: trent7000, neo: true, semi: 29.0 }),
  "A340-200": a330({ title: "Airbus A340-200", L: 59.4, fwd: -2.13, h: 17.0, eng: cfm56_5c, quad: true, centre: 1 }),
  "A340-300": a330({ title: "Airbus A340-300", L: 63.69, eng: cfm56_5c, quad: true, centre: 1 }),
  "A340-500": a330({ title: "Airbus A340-500", L: 67.93, fwd: 2.1, h: 17.1, eng: trent500, quad: true, centre: 2, semi: 28.9 }),
  "A340-600": a330({ title: "Airbus A340-600", L: 75.36, fwd: 6.4, h: 17.22, eng: trent500, quad: true, centre: 2, semi: 28.9, extraDoor: true }),
  "A350-900": a350({ title: "Airbus A350-900", L: 66.8 }),
  "A350-1000": a350({ title: "Airbus A350-1000", L: 73.79, fwd: 4.0, axles: 3 }),
  "A380-800": a380(),
};
