// Douglas / McDonnell Douglas (and the Boeing 717, a DC-9 derivative). Length/span from aircraftVisualById, heights
// and cross-sections (DC-9 family 3.34 m wide, DC-8 3.73 m, DC-10/MD-11 6.02 m) from manufacturer data as reproduced
// in Wikipedia spec tables (RECALLED, see SOURCES.md "Aircraft side views"). Stations are drawing estimates.
import { rearPod, throughEngine } from "../jet.mjs";

function dc9(o) {
  const L = o.L, D = 3.4, VB = 1.06, VT = VB + D;
  const R = 0.422 * L;
  const eng = o.eng;
  return {
    title: o.title, L, D, VB, floor: 0.2, winV: 0.64,
    nose: { len: 1.4, lenB: 1.25, tip: 0.45, tb: 1.4 }, cockpit: { a: 0.48, b: 1.02, bot: 0.73, h: 0.13, eyebrows: o.eyebrows ?? true },
    tail: { len: 3.4, bot: 0.58, top: 0.74, topLen: o.longCone ? 2.6 : 2.2 },
    belly: { from: R - 0.6, to: R + 7.5, drop: 0.1 },
    fin: { teRoot: L - 0.8, h: o.h, tipChord: 3.1, sweepLE: 45, sweepTE: 6, dorsal: { len: 3.5, h: 0.63 } },
    stab: { t: true, k: o.stabK ?? 1.17 },
    wing: { root: [R, 1.7], sweep: 23.5, semi: o.semi, dih: 4.5, rootChord: 7, teRootK: 0.94, tipChord: 1.3, fairings: 2 },
    gear: { main: [{ u: R + 5.95, r: o.mainR ?? 0.54 }], nose: { u: 3.0, r: 0.33, doorU: 2.0 } },
    doors: [{ u: 4.85, v: VB + 0.2 * D + 0.5 }, ...o.exits.map((u) => ({ u: R + u, k: "O" })), { u: 8.6, k: "C", w: 1.35 }, { u: R + 10.2, k: "C", w: 1.35 }],
    windows: { from: 5.75, to: L - 8.0, skip: [[10.8, 11.2]] },
    antennasTop: [[9.0, 0.3], [R + 3.0, 0.3]], antennasBot: [[11.5, 0.26]], beaconU: R - 3, beaconBotU: R + 3.5,
    seams: [4.6, 12.0, R - 1.4, R + 7.4, L - 12, L - 3.8],
    front: [(g) => rearPod(g, { u0: L - eng.aft, vc: VB + 0.86 * D, len: eng.len, d: eng.d, buckets: eng.buckets ?? true })],
  };
}
const jt8d7 = { aft: 10.0, len: 5.6, d: 1.45 };
const jt8d200 = { aft: 11.16, len: 6.4, d: 1.72 };
const v2500 = { aft: 12.0, len: 5.6, d: 1.98, buckets: false };
const br715 = { aft: 10.6, len: 5.3, d: 1.75, buckets: false };

function dc10(o) {
  const Lf = o.Lf, D = 6.02, VB = 2.0, VT = VB + D, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  const te = { u0: Lf - 7.0, vc: 9.85, len: o.md11 ? 7.0 : 7.6, d: 2.95, plug: { len: 1.7, d: 1.05 } };
  const wingEng = o.md11
    ? { kind: "fan", eta: 0.3, fwd: 9.2, drop: -0.5, len: 4.4, d: 2.75, core: { len: 1.5, d0: 1.5, d1: 1.0 }, plug: { len: 0.6, d: 0.65 } }
    : { kind: "fan", eta: 0.3, fwd: 8.9, drop: -0.53, len: 3.6, d: 2.75, core: { len: 2.55, d0: 1.6, d1: 0.95 }, plug: { len: 0.9, d: 0.55 }, splits: [0.34, 0.66], bulge: 0.33 };
  const main = [{ u: W(26.25), r: 0.6, axles: 2, pitch: 1.64 }];
  return {
    title: o.title, L: Lf, D, VB, wide: true, floor: 0.46, winV: 0.65,
    nose: { len: 1.25, lenB: 1.13, tip: 0.415 }, cockpit: { a: 0.32, b: 0.73, bot: 0.635, h: 0.13, eyebrows: !o.md11 },
    tail: { len: 2.66, bot: 0.8, top: 0.91, topLen: 1.9 },
    belly: { from: W(18.0), to: W(32.6), drop: 0.42 },
    fin: { teRoot: Lf + 1.2, rootV: 11.0, h: 17.7, tipChord: 3.4, sweepLE: 27, sweepTE: 6.8 },
    stab: { k: o.md11 ? 1.2 : 1.4, sweep: 1.28, root: 7.6, rootV: 0.71 },
    wing: { root: [W(20.4), 3.0], sweep: 33.3, semi: o.semi, dih: 7, rootChord: 10.5, teRootK: 1.0, teDrop: 1.0, tipChord: 2.6, tip: o.md11 ? "split" : "plain", wingletH: 2.4, fairings: 3 },
    engines: [wingEng],
    gear: { main: o.centre ? [...main, { u: W(28.6), r: 0.56, axles: 1 }] : main, nose: { u: 4.15, r: 0.53, doorU: 2.9 } },
    doors: [6.25, W(15.75), W(27.0), Lf - 10.4, { u: W(10.8), k: "C" }, { u: Lf - 13.8, k: "C" }],
    windows: { from: 8.0, to: Lf - 8.8, skip: [[W(21.2), W(21.7)]] },
    antennasTop: [[10.4], [W(24)]], antennasBot: [[12], [W(31), 0.3]], beaconU: W(17),
    seams: [5.4, W(13), W(18), Lf - 17, Lf - 5.6],
    front: [throughEngine(te)],
  };
}

function dc8(o) {
  const L = o.L, D = 4.0, VB = 1.5, fwd = o.fwd ?? 0;
  const W = (u) => u + fwd;
  const jet = { len: 5.0, d: 1.18, mixed: true, nozzle: 0.62, splits: [0.25, 0.55, 0.8], bulge: 0.3, stripe: false };
  const jt3d = { len: 2.6, d: 1.6, core: { len: 2.5, d0: 1.05, d1: 0.72 }, plug: { len: 0.5, d: 0.42 }, splits: [0.45], bulge: 0.38, lip: 0.16, stripe: false };
  const long = { len: 5.3, d: 1.65, mixed: true, splits: [0.3, 0.62], stripe: false };
  const e = o.eng === "jt3d" ? jt3d : o.eng === "long" ? long : jet;
  const k = (e.len - 2.6) * 0.3;
  return {
    title: o.title, L, D, VB, floor: 0.38, winV: 0.63,
    nose: { len: 1.55, lenB: 1.45, tip: 0.42, tb: 1.35 }, cockpit: { a: 0.45, b: 0.95, bot: 0.63, h: 0.11, panels: 4 },
    tail: { len: 3.0, bot: 0.66, top: 0.8, topLen: 0.6 },
    belly: { from: W(16.8), to: W(27.8), drop: 0.2 },
    fin: { teRoot: L - 1.4, h: o.h ?? 12.92, tipChord: 2.6, sweepLE: 38, sweepTE: 8, dorsal: { len: 3.8, h: 0.8 } },
    stab: { k: 1.15, root: 7.0 },
    wing: { root: [W(17.3), VB + 0.28 * D], sweep: 32, semi: o.semi ?? 19.8, dih: 6.5, rootChord: 8.5, teRootK: 1.0, tipChord: 2.6, fairings: 3 },
    engines: [{ kind: "fan", eta: 0.3, fwd: 6.4 - k, drop: 0.8, pylonTop: true, ...e }, { kind: "fan", eta: 0.6, fwd: 5.2 - k, drop: 0.55, pylonTop: true, ...e }],
    gear: { main: [{ u: W(23.0), r: 0.55, axles: 2, pitch: 1.4 }], nose: { u: 4.6, r: 0.45, doorU: 3.4 } },
    doors: [5.4, ...(o.long ? [W(11.3)] : []), { u: W(19.0), k: "O" }, { u: W(20.0), k: "O" }, ...(o.long ? [L - 14.5] : []), L - 7.6, { u: 9.0, k: "C" }, { u: L - 13, k: "C" }],
    windows: { from: 6.8, to: L - 8.8 },
    antennasTop: [[8.5], [W(22)]], antennasBot: [[11.5]], beaconU: W(15),
    seams: [4.3, 10.5, W(16.8), W(27.8), L - 11, L - 4],
  };
}

export const DOUGLAS = {
  "DC9-10": dc9({ title: "Douglas DC-9-10", L: 31.82, h: 8.38, semi: 11.9, eng: jt8d7, exits: [3.0], mainR: 0.5, stabK: 1.0 }),
  "DC9-30": dc9({ title: "McDonnell Douglas DC-9-30", L: 36.36, h: 8.38, semi: 12.5, eng: jt8d7, exits: [2.6, 3.4], mainR: 0.5, stabK: 1.0 }),
  "DC9-40": dc9({ title: "McDonnell Douglas DC-9-40", L: 38.28, h: 8.38, semi: 12.5, eng: jt8d7, exits: [2.6, 3.4], mainR: 0.5, stabK: 1.0 }),
  "DC9-50": dc9({ title: "McDonnell Douglas DC-9-50", L: 40.72, h: 8.38, semi: 12.5, eng: jt8d7, exits: [2.6, 3.4], mainR: 0.5, stabK: 1.0 }),
  MD81: dc9({ title: "McDonnell Douglas MD-81", L: 45.06, h: 9.02, semi: 14.7, eng: jt8d200, exits: [0.68, 1.55] }),
  MD82: dc9({ title: "McDonnell Douglas MD-82", L: 45.06, h: 9.02, semi: 14.7, eng: jt8d200, exits: [0.68, 1.55] }),
  MD83: dc9({ title: "McDonnell Douglas MD-83", L: 45.06, h: 9.02, semi: 14.7, eng: jt8d200, exits: [0.68, 1.55] }),
  MD87: dc9({ title: "McDonnell Douglas MD-87", L: 39.75, h: 9.3, semi: 14.7, eng: jt8d200, exits: [0.68, 1.55], longCone: true }),
  MD88: dc9({ title: "McDonnell Douglas MD-88", L: 45.06, h: 9.02, semi: 14.7, eng: jt8d200, exits: [0.68, 1.55] }),
  "MD90-30": dc9({ title: "McDonnell Douglas MD-90-30", L: 46.51, h: 9.33, semi: 14.7, eng: v2500, exits: [0.68, 1.55], eyebrows: false }),
  "B717-200": dc9({ title: "Boeing 717-200", L: 37.81, h: 8.92, semi: 12.5, eng: br715, exits: [2.6, 3.4], eyebrows: false }),
  "DC10-10": dc10({ title: "McDonnell Douglas DC-10-10", Lf: 51.8, semi: 20.7 }),
  "DC10-30": dc10({ title: "McDonnell Douglas DC-10-30", Lf: 51.6, semi: 22.2, centre: true }),
  "DC10-40": dc10({ title: "McDonnell Douglas DC-10-40", Lf: 51.8, semi: 22.2, centre: true }),
  MD11: dc10({ title: "McDonnell Douglas MD-11", Lf: 57.6, fwd: 2.6, semi: 23.0, centre: true, md11: true }),
  "DC8-10": dc8({ title: "Douglas DC-8-10", L: 45.87, h: 12.92 }),
  "DC8-20": dc8({ title: "Douglas DC-8-20", L: 45.87 }),
  "DC8-30": dc8({ title: "Douglas DC-8-30", L: 45.87 }),
  "DC8-40": dc8({ title: "Douglas DC-8-40", L: 45.87 }),
  "DC8-50": dc8({ title: "Douglas DC-8-50", L: 45.87, eng: "jt3d" }),
  "DC8-61": dc8({ title: "Douglas DC-8-61", L: 57.12, fwd: 6.1, eng: "jt3d", long: true, h: 13.11 }),
  "DC8-62": dc8({ title: "Douglas DC-8-62", L: 47.98, fwd: 1.0, eng: "long", semi: 20.7, h: 13.11 }),
  "DC8-63": dc8({ title: "Douglas DC-8-63", L: 57.12, fwd: 6.1, eng: "long", semi: 20.7, long: true, h: 13.11 }),
};
