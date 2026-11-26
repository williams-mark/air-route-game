// Spec-driven white-tail side view (the technique of types/b737ng.mjs, generalised).
// All values in metres: u runs aft from the nose tip, v up from the ground. Shapes are artwork fitted to published
// dimensions; see SOURCES.md "Aircraft side views".
import { Drawing, cr, innerShade, soft, windowRow, door, antenna, light, propeller, st, f, S } from "./lib.mjs";

export const OUT = "#a3a9af";
export const OUT_D = "#7d848b";

const lerp = (a, b, t) => a + (b - a) * t;
const P = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const tan = (deg) => Math.tan((deg * Math.PI) / 180);
// superellipse ramp 0..1
const ramp = (x, a, b) => Math.pow(Math.max(0, 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), a)), 1 / b);

/** Polyline height at u (piecewise linear, clamped). */
function vOn(line, u) {
  if (u <= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) if (u <= line[i][0]) { const a = line[i - 1], b = line[i]; return a[1] + ((b[1] - a[1]) * (u - a[0])) / (b[0] - a[0]); }
  return line[line.length - 1][1];
}

export function jet(s) {
  const g = new Drawing(s.id);
  const add = (x) => g.add(x);
  const path = (cmds, attrs) => add(`<path d="${g.d(cmds)}" ${attrs}/>`);
  const grad = (v0, v1, stops) => g.vgrad(v0, v1, stops);
  const { L, D, VB } = s;
  const VT = VB + D;

  // ---------------- fuselage outline ----------------
  const n = { len: 1.65, lenB: 1.36, tip: 0.38, ta: 2, tb: 1.5, ba: 2.2, bb: 2, ...(s.nose ?? {}) };
  const nTop = [], nBot = [];
  const crownTop = s.crown ?? VT; // 747/A380-style nose climbs to the upper crown
  for (let i = 0; i <= 12; i++) { const x = (i / 12) ** 1.35; nTop.push([x * n.len * D, VB + n.tip * D + (crownTop - VB - n.tip * D) * ramp(x, n.ta, n.tb)]); }
  for (let i = 12; i >= 0; i--) { const x = (i / 12) ** 1.35; nBot.push([x * n.lenB * D, VB + n.tip * D * (1 - ramp(x, n.ba, n.bb))]); }
  const topAt = (u) => vOn(nTop, u);
  const t = { len: 2.94, bot: 0.7, top: 0.78, topLen: 0.49, ...(s.tail ?? {}) };
  const tailBotN = [[0.09, 0.704], [0.33, 0.607], [0.72, 0.454], [1.09, 0.345], [1.58, 0.228], [2.06, 0.126], [2.55, 0.041], [2.94, 0]];
  const tailTopN = [[0.49, 1], [0.31, 0.961], [0.175, 0.874], [0.085, 0.772]];
  const kL = t.len / 2.94, kB = t.bot / 0.704, kT = (1 - t.top) / (1 - 0.772), kTL = t.topLen / 0.49;
  const tailBot = tailBotN.map(([a, b]) => [L - a * kL * D, VB + b * kB * D]);
  const tailTop = tailTopN.map(([a, b]) => [L - a * kTL * D, VB + (1 - (1 - b) * kT) * D]);
  const tipU = L - 0.0, tipV0 = tailBot[0][1], tipV1 = tailTop[3][1];
  const belly = s.belly ?? { from: 0.33 * L, to: 0.62 * L, drop: 0.04 * D };
  const top = s.topCmds ? s.topCmds({ nTop, VT, tailTop }) : [...cr(nTop).slice(0), ["L", tailTop[0][0], VT]];
  const body = [["M", ...nTop[0]], ...top, ...cr(tailTop), ["C", tipU, lerp(tipV1, tipV0, 0.25), tipU, lerp(tipV1, tipV0, 0.75), tailBot[0][0], tipV0], ...cr(tailBot),
    ["L", belly.to + 1.2, VB], ["C", belly.to, VB - belly.drop, belly.to - 1, VB - belly.drop, belly.to - 2, VB - belly.drop], ["L", belly.from + 1, VB - belly.drop], ["C", belly.from, VB - belly.drop, belly.from - 0.5, VB, belly.from - 1, VB],
    ["L", nBot[0][0], VB], ...cr(nBot), ["Z"]];
  const bd = g.d(body);
  const tail = { tailBot, tailTop };
  g.geo = { L, D, VB, VT, topAt, tail, bd };

  // ---------------- fin (behind fuselage) ----------------
  if (s.fin) fin(g, s, path);
  for (const fn of s.behind ?? []) fn(g, s);

  path(body, `fill="${grad(s.VTmax ?? crownTop, VB, [[0, "#eceef0"], [0.05, "#f8f8f9"], [0.2, "#ffffff"], [0.5, "#fcfcfc"], [0.72, "#f1f2f3"], [1, "#e4e6e8"]])}"`);
  const clip = g.clip(bd);
  g.geo.clip = clip;
  const sc = Math.min(D, 6.2) / 4.12;
  innerShade(g, bd, { dy: -0.72 * sc, blur: 0.62 * sc, opacity: 0.74, color: "#2f3338", mx: 0.06, my: 1.0 });
  innerShade(g, bd, { dy: 0.05, blur: 0.07, opacity: 0.16, color: "#4c5258", my: 0.3 });
  innerShade(g, bd, { dx: 0.18 * sc, dy: -0.1, blur: 0.22 * sc, opacity: 0.22, color: "#3b4046", my: 0.3 });

  // seams
  const seams = (s.seams ?? []).map((u) => `<path d="${g.d([["M", u, (s.VTmax ?? crownTop) + 0.3], ["L", u, VB - 1]])}"/>`).join("");
  add(`<g clip-path="${clip}" fill="none" ${st(0.35, "#d6d9dc")}>${seams}<path d="${g.d([["M", n.lenB * D * 0.7, VB + 0.13 * D], ["L", L - t.len * D * 0.9, VB + 0.13 * D]])}"/></g>`);

  // doors and windows
  const fl = s.floor ?? 0.39, win = s.winV ?? 0.62;
  const big = s.wide;
  const dw = s.doorW ?? (big ? 1.07 : 0.84), dh = s.doorH ?? (big ? 1.93 : 1.88);
  const doors = (s.doors ?? []).map((d) => (typeof d === "number" ? { u: d } : d));
  const skip = [];
  for (const d of doors) {
    const k = d.k ?? "L";
    if (k === "L") { door(g, clip, { u: d.u, vBot: d.v ?? VB + fl * D, w: d.w ?? dw, h: d.h ?? dh, kind: "pax", r: 0.2 }); if (!d.v) skip.push([d.u - dw / 2 - 0.22, d.u + dw / 2 + 0.22]); }
    else if (k === "E") { door(g, clip, { u: d.u, vBot: VB + (fl + 0.04) * D, w: 0.66, h: 1.4, kind: "pax", r: 0.16 }); skip.push([d.u - 0.5, d.u + 0.5]); }
    else if (k === "O") { door(g, clip, { u: d.u, vBot: VB + win * D - 0.56, w: 0.52, h: 1.04, kind: "overwing", r: 0.13 }); skip.push([d.u - 0.34, d.u + 0.34]); }
    else if (k === "C") door(g, clip, { u: d.u, vBot: VB + 0.06 * D, w: d.w ?? (big ? 2.7 : 1.2), h: d.h ?? (big ? 1.7 : 0.86), kind: "cargo", r: 0.1 });
  }
  const wr = s.windows ?? {};
  windowRow(g, clip, { v: VB + win * D, w: wr.w ?? (big ? 0.27 : 0.235), h: wr.h ?? (big ? 0.39 : 0.34), pitch: wr.pitch ?? 0.508, from: wr.from, to: wr.to, skip: [...skip, ...(wr.skip ?? [])] });
  for (const extra of s.windowRows ?? []) windowRow(g, clip, { w: 0.25, h: 0.36, pitch: 0.508, ...extra });

  // cockpit
  for (const fn of s.beforeCockpit ?? []) fn(g, s, clip);
  if (s.cockpit !== false) cockpit(g, s, n, topAt);
  for (const [u, v] of s.dots ?? []) add(`<circle cx="${f(g.X(u))}" cy="${f(g.Y(v))}" r="${f(0.045 * S)}" fill="#9aa1a8"/>`);
  for (const [u, h] of s.antennasTop ?? []) antenna(g, u, (s.crownAt ? s.crownAt(u) : VT) - 0.01, h ?? 0.32, 0.38);
  for (const [u, h] of s.antennasBot ?? []) antenna(g, u, VB + 0.02, -(h ?? 0.25), 0.3);
  if (s.beacons !== false) { const ub = s.beaconU ?? 0.4 * L; light(g, ub, (s.crownAt ? s.crownAt(ub) : VT) + 0.03, "#c4392f", 0.06); light(g, s.beaconBotU ?? 0.5 * L, VB - belly.drop * 0.8, "#c4392f", 0.06); }
  for (const fn of s.onBody ?? []) fn(g, s, clip);

  // conventional stabiliser on the tail cone
  if (s.stab && !s.stab.t) stabCone(g, s, path, clip);

  // gear bay, canoe, gear, wing, engines
  if (s.wing && !s.wing.high) bay(g, s, path, clip);
  for (const gr of s.gear?.main ?? []) mainGear(g, gr);
  if (s.gear?.nose) noseGear(g, s.gear.nose, s);
  for (const fn of s.beforeWing ?? []) fn(g, s);
  const hi = s.wing?.high;
  if (s.wing && !hi) wing(g, s, path);
  if (hi) wing(g, s, path); // computes the high-wing geometry the pods hang from
  const swept = hi && (s.wing.sweep ?? 0) >= 8; // swept high wing sits behind its hung pods
  if (swept) highWingFront(g, s, path);
  for (const e of s.engines ?? []) engine(g, s, e, path);
  if (hi && !swept) highWingFront(g, s, path);
  if (s.stab?.t) stabT(g, s, path);
  for (const fn of s.front ?? []) fn(g, s, clip);
  return g.svg(s.title);
}

// ---------------- cockpit glazing ----------------
function cockpit(g, s, n, topAt) {
  const { D, VB } = g.geo;
  const c = { a: 0.38, b: 0.79, bot: 0.58, inset: 0.075, h: 0.095, panels: 3, eyebrows: true, slope: 0.04, ...(s.cockpit ?? {}) };
  const ua = c.a * D, ub = c.b * D;
  const bot = (u) => VB + (c.bot - c.slope * (u - ua) / (ub - ua)) * D;
  const tp = (u) => Math.max(bot(u) + 0.05 * D, Math.min(topAt(u) - c.inset * D, VB + (c.bot + c.h) * D + 0.01 * D * (u - ua) / (ub - ua)));
  const polys = [];
  const gap = 0.06;
  const edges = c.edges ?? (c.panels === 4 ? [0, 0.22, 0.47, 0.73, 1] : [0, 0.32, 0.64, 1]);
  for (let i = 0; i < edges.length - 1; i++) {
    const u0 = lerp(ua, ub, edges[i]) + (i ? gap / 2 : 0), u1 = lerp(ua, ub, edges[i + 1]) - (i < edges.length - 2 ? gap / 2 : 0);
    if (i === 0) {
      // windscreen: front edge follows the nose
      polys.push([["M", u0, bot(u0) + 0.02 * D], ["C", u0 + 0.03 * D, tp(u0) - 0.02 * D, u0 + 0.06 * D, tp(u0 + 0.06 * D), u0 + 0.1 * D, tp(u0 + 0.1 * D)], ["L", u1, tp(u1)], ["L", u1, bot(u1)], ["Z"]]);
    } else if (i === edges.length - 2) {
      polys.push([["M", u0, bot(u0)], ["L", u0, tp(u0)], ["L", u1 - 0.02 * D, tp(u1)], ["C", u1 + 0.01 * D, tp(u1) - 0.04 * D, u1, bot(u1) + 0.03 * D, u1 - 0.04 * D, bot(u1)], ["Z"]]);
    } else polys.push([["M", u0, bot(u0)], ["L", u0, tp(u0)], ["L", u1, tp(u1)], ["L", u1, bot(u1)], ["Z"]]);
  }
  if (c.eyebrows) {
    for (const [a, b] of [[0.32, 0.5], [0.55, 0.72]]) {
      const u0 = lerp(ua, ub, a), u1 = lerp(ua, ub, b);
      const v0 = tp(u0) + 0.045 * D, v1 = topAt(u0) - 0.03 * D;
      if (v1 - v0 > 0.04 * D) polys.push([["M", u0, v0], ["L", u0 + 0.01, Math.min(v1, v0 + 0.03 * D)], ["L", u1, Math.min(topAt(u1) - 0.03 * D, v0 + 0.035 * D)], ["L", u1, v0], ["Z"]]);
    }
  }
  const vs = [VB + (c.bot - 0.05) * D, topAt(ub)];
  const fill = g.vgrad(vs[1], vs[0], [[0, "#59626b"], [0.4, "#2e353b"], [1, "#1b2025"]]);
  g.add(`<g fill="${fill}" ${st(0.45, "#3a4148")}>${polys.map((p) => `<path d="${g.d(p)}"/>`).join("")}</g>`);
  g.add(`<path d="${g.d([["M", ua + 0.05 * D, VB + (c.bot - 0.12) * D], ["L", ua - 0.0 * D, VB + (c.bot - 0.125) * D]])}" fill="none" ${st(1.0, "#8d949b")}/>`); // pitot
}

// ---------------- fin ----------------
function fin(g, s, path) {
  const { L, VT } = g.geo;
  const fn = s.fin; // { teRoot: u of TE at the crown, h: tip height, tipChord, sweepLE, sweepTE, dorsal: {len, h}, rootV }
  const v0 = fn.rootV ?? VT - 0.03;
  const teRoot = fn.teRoot, h = fn.h;
  const teTip = teRoot + (h - v0) * tan(fn.sweepTE ?? 16);
  const leTip = teTip - fn.tipChord;
  const leAt = (v) => leTip - (h - v) * tan(fn.sweepLE ?? 43);
  const pts = [];
  if (fn.dorsal) {
    const kv = v0 + fn.dorsal.h, ku = leAt(kv);
    const d0 = ku - fn.dorsal.len;
    pts.push(["M", d0, v0], ...cr([[d0, v0], [lerp(d0, ku, 0.4), v0 + fn.dorsal.h * 0.18], [lerp(d0, ku, 0.75), v0 + fn.dorsal.h * 0.52], [ku, kv]]));
  } else if (fn.down !== undefined) pts.push(["M", leAt(v0), fn.down], ["L", leAt(v0), v0]);
  else pts.push(["M", leAt(v0) - 0.6, v0], ["Q", leAt(v0) + 0.1, v0 + 0.05, leAt(v0 + 0.5), v0 + 0.5]);
  pts.push(["L", leTip - 0.05, h - 0.06], ["C", leTip, h, leTip + 0.05, h, leTip + 0.18, h], ["L", teTip, h], ["L", teRoot, v0 - 0.01]);
  if (fn.down !== undefined) pts.push(["L", teRoot, fn.down]);
  pts.push(["Z"]);
  const d = g.d(pts);
  path(pts, `fill="${g.lgrad([leAt(v0 + 2), 9], [teTip, 9], [[0, "#ffffff"], [0.6, "#fafafb"], [1, "#eceef0"]])}" ${st(0.8, OUT)}`);
  innerShade(g, d, { dx: -0.05, dy: 0, blur: 0.12, opacity: 0.12, color: "#5b6168", my: 0.2 });
  const rc = fn.rudder ?? 0.3; // rudder chord fraction
  const hingeTop = lerp(teTip, leTip, rc), hingeBot = lerp(teRoot, leAt(v0), rc * 0.9);
  path([["M", hingeTop, h - 0.08], ["L", hingeBot, v0 + 0.02]], `fill="none" ${st(0.45, "#c3c8cc")}`);
  path([["M", leTip + 0.2, h - 0.14], ["L", teTip - 0.05, h - 0.14]], `fill="none" ${st(0.4, "#d0d4d8")}`);
  g.geo.fin = { leTip, teTip, h, teRoot, leAt, v0 };
}

// ---------------- stabilisers ----------------
function stabCone(g, s, path, clip) {
  const { L, D, VB } = g.geo;
  const k = s.stab.k ?? 1; // size relative to the 737-800 tailplane
  const r = [L - (s.stab.root ?? 4.62 * k), VB + (s.stab.rootV ?? 0.75) * D];
  const tip = [r[0] + 5.91 * k * (s.stab.sweep ?? 1), r[1] + 1.17 * k * (s.stab.dih ?? 1)];
  const te = [r[0] + 3.05 * k, r[1] + 0.13 * k];
  const d1 = [te[0] + 0.2 * k, VB + (s.stab.lowV ?? 0.6) * D];
  const c1 = [r[0] + 0.95 * k, VB + 0.25 * D];
  const under = [["M", ...r], ["L", ...te], ["L", d1[0], d1[1] - 0.3], ["L", ...c1], ["C", lerp(c1[0], r[0], 0.5), lerp(c1[1], r[1], 0.6), r[0] + 0.1, r[1] - 0.3, ...r], ["Z"]];
  g.add(`<g clip-path="${clip}"><path d="${g.d(under)}" fill="${g.lgrad([te[0], r[1]], [te[0] + 0.2, c1[1]], [[0, "#83898e"], [1, "#696e73"]])}" ${st(0.5, OUT_D)}/></g>`);
  path([["M", ...te], ["L", ...d1]], `fill="none" ${st(0.5, OUT_D)}`);
  const band = [["M", ...r], ["L", ...tip], ["C", tip[0] + 0.1, tip[1], tip[0] + 0.1, tip[1] - 0.06 * k, tip[0] - 0.02, tip[1] - 0.1 * k], ["L", ...te], ["L", r[0] + 0.75 * k, r[1] - 0.35 * k], ["Z"]];
  path(band, `fill="${g.lgrad([te[0], r[1] + 0.4], [te[0] + 0.05, r[1] - 0.3], [[0, "#4b4f54"], [1, "#5d6267"]])}" ${st(0.5, OUT_D)}`);
  path([["M", r[0] + 0.15, r[1] - 0.01], ["L", tip[0] - 0.06, tip[1] - 0.04]], `fill="none" ${st(0.6, "#8e9399")}`);
}

/** T-tail (or cruciform with s.stab.atV): stabiliser seen from the side at the fin top, with bullet fairing. */
function stabT(g, s, path) {
  const fi = g.geo.fin; if (!fi) return;
  const st0 = s.stab;
  const v = st0.atV ?? fi.h;
  const k = st0.k ?? 1;
  const le = st0.atV ? fi.leAt(v) : fi.leTip;
  const r = [le + (st0.dx ?? 0.2), v + 0.05];
  const tip = [r[0] + 4.6 * k, r[1] + 0.4 * k * (st0.dih ?? 1)];
  const te = [r[0] + 2.6 * k, r[1] - 0.42 * k];
  const band = [["M", ...r], ["L", ...tip], ["C", tip[0] + 0.1, tip[1], tip[0] + 0.08, tip[1] - 0.08 * k, tip[0] - 0.05, tip[1] - 0.12 * k], ["L", ...te], ["L", r[0] + 0.6 * k, r[1] - 0.32 * k], ["Z"]];
  path(band, `fill="${g.lgrad([te[0], r[1] + 0.3], [te[0] + 0.05, te[1]], [[0, "#8b9196"], [0.3, "#5d6267"], [1, "#4b4f54"]])}" ${st(0.5, OUT_D)}`);
  path([["M", r[0] + 0.1, r[1] - 0.01], ["L", tip[0] - 0.06, tip[1] - 0.04]], `fill="none" ${st(0.6, "#a7adb2")}`);
  if (st0.bullet !== false && !st0.atV) {
    const bl = st0.bullet ?? { fwd: 0.6, aft: 0.5, h: 0.32 };
    const u0 = fi.leTip - bl.fwd, u1 = fi.teTip + bl.aft, hv = bl.h * k;
    path([["M", u0, v - 0.05], ["C", u0 + 0.3, v + hv * 0.9, u0 + 1.2, v + hv, u0 + 2.2, v + hv], ["L", u1 - 0.6, v + hv * 0.85], ["C", u1 - 0.2, v + hv * 0.6, u1, v + hv * 0.2, u1, v - 0.05], ["L", fi.teTip - 0.1, v - hv * 0.4], ["L", u0 + 0.8, v - hv * 0.45], ["C", u0 + 0.4, v - hv * 0.35, u0 + 0.1, v - hv * 0.2, u0, v - 0.05], ["Z"]],
      `fill="${g.vgrad(v + hv, v - hv * 0.45, [[0, "#f3f4f5"], [0.55, "#ffffff"], [1, "#c9cdd1"]])}" ${st(0.6, OUT)}`);
  }
}

// ---------------- wing ----------------
/** Wing reference lines. s.wing = { root: [u, v] of LE at the side of body, sweep (deg, LE), semi (m, exposed), dih (deg), rootChord, tipChord } */
export function wingLines(s) {
  const w = s.wing;
  const R = w.root;
  const tip = [R[0] + w.semi * tan(w.sweep), R[1] + w.semi * tan(w.dih) * (w.persp ?? 0.85)];
  const teTip = [tip[0] + w.tipChord, tip[1] - 0.05 * w.tipChord - 0.1];
  const teRoot = [R[0] + w.rootChord * (w.teRootK ?? 0.66), R[1] - (w.teDrop ?? 0.48)];
  const hlRoot = [R[0] + w.rootChord * 0.27, R[1] - 0.38];
  const hlTip = [tip[0] + w.tipChord * 0.55, tip[1] - 0.13];
  const LE = [R, P(R, tip, 0.29), P(R, tip, 0.64), tip].map(([u, v], i) => [u, v + (i === 1 || i === 2 ? 0.03 : 0)]);
  const leAt = (eta) => P(R, tip, eta);
  return { R, tip, teTip, teRoot, hlRoot, hlTip, LE, leAt };
}

function wing(g, s, path) {
  const w = s.wing;
  const k = wingLines(s);
  const { R, tip, teTip, teRoot, hlRoot, hlTip, LE } = k;
  if (w.high) return highWing(g, s, path, k);
  const TE = [teRoot, P(teRoot, teTip, 0.33), P(teRoot, teTip, 0.66), teTip];
  const HL = [hlRoot, P(hlRoot, hlTip, 0.34), P(hlRoot, hlTip, 0.67), hlTip];
  path([["M", ...LE[0]], ...cr(LE), ["C", tip[0] + 0.3, tip[1] + 0.02, teTip[0] - 0.2, teTip[1] + 0.12, ...teTip], ...cr([...TE].reverse()), ["L", R[0] + 0.4, R[1] - 0.48], ["Z"]],
    `fill="${g.lgrad(P(R, tip, 0.45), [P(R, tip, 0.45)[0] + 0.3, P(teRoot, teTip, 0.45)[1]], [[0, "#62676d"], [0.6, "#52575c"], [1, "#45494e"]])}" ${st(0.5, OUT_D)}`);
  const flapPts = [P(hlRoot, hlTip, 0.3), ...HL.slice(2)];
  path([["M", ...flapPts[0]], ...cr(flapPts), ["L", ...teTip], ...cr([P(teRoot, teTip, 1), P(teRoot, teTip, 0.66), P(teRoot, teTip, 0.38)]), ["Z"]],
    `fill="${g.lgrad(P(hlRoot, hlTip, 0.6), [P(hlRoot, hlTip, 0.6)[0] + 0.2, P(teRoot, teTip, 0.6)[1]], [[0, "#9aa0a5"], [1, "#7d8389"]])}" ${st(0.4, OUT_D)}`);
  for (const e of [0.48, 0.72, 0.88]) { const a = P(hlRoot, hlTip, e), b = P(teRoot, teTip, e); g.add(`<path d="${g.d([["M", ...a], ["L", b[0] - 0.05, b[1]]])}" fill="none" ${st(0.4, "#62686e")}/>`); }
  path([["M", ...LE[0]], ...cr(LE)], `fill="none" ${st(2.0, "#dfe2e5")}`);
  path([["M", ...LE[0]], ...cr(LE)], `fill="none" ${st(0.5, OUT)}`);
  // flap-track fairings
  const nF = w.fairings ?? 3;
  const sz = w.fairingSize ?? Math.min(1.6, Math.max(0.7, w.rootChord / 3.4));
  for (let i = 0; i < nF; i++) {
    const e = 0.42 + (i * 0.45) / Math.max(1, nF - 1);
    const a = P(hlRoot, hlTip, e), b = P(teRoot, teTip, e);
    const u = a[0] + (b[0] - a[0]) * 0.2, v = lerp(a[1], b[1], 0.4), len = (b[0] - a[0]) * 0.95 + 0.9 * sz * (1 - e * 0.5), h = 0.22 * sz * (1 - e * 0.35);
    path([["M", u, v], ["C", u + len * 0.4, v + h * 0.15, u + len * 0.8, v - h * 0.1, u + len, v - h * 0.55], ["C", u + len * 0.7, v - h * 0.95, u + len * 0.3, v - h, u + 0.05, v - h * 0.6], ["Z"]],
      `fill="${g.vgrad(v + 0.03, v - h, [[0, "#d9dcdf"], [1, "#9ba1a6"]])}" ${st(0.4, OUT_D)}`);
  }
  wingtip(g, s, k, path);
}

function wingtip(g, s, k, path) {
  const { tip, teTip } = k;
  const kind = s.wing.tip ?? "plain";
  const c = teTip[0] - tip[0];
  const white = (a, b) => g.lgrad(a, b, [[0, "#ffffff"], [0.5, "#f3f4f5"], [1, "#d6d9dc"]]);
  if (kind === "blended") {
    const hgt = s.wing.wingletH ?? 2.6, sw = hgt * 0.62;
    path([["M", tip[0] - 0.1, tip[1]], ["C", tip[0] + c * 0.55, tip[1] + 0.1, tip[0] + c * 0.9, tip[1] + hgt * 0.4, tip[0] + c * 1.0 + sw * 0.45, tip[1] + hgt * 0.62], ["L", tip[0] + c + sw, tip[1] + hgt], ["C", tip[0] + c + sw + 0.1, tip[1] + hgt + 0.06, tip[0] + c + sw + 0.24, tip[1] + hgt + 0.04, tip[0] + c + sw + 0.27, tip[1] + hgt - 0.05], ["L", tip[0] + c + sw * 0.6, tip[1] + hgt * 0.5], ["C", teTip[0] + 0.3, teTip[1] + 0.5, teTip[0] + 0.15, teTip[1] + 0.15, ...teTip], ["Z"]],
      `fill="${white([tip[0] + c, tip[1] + 1], [tip[0] + c + sw, tip[1] + 1])}" ${st(0.6, OUT)}`);
    g.add(`<circle cx="${f(g.X(tip[0] + c + sw + 0.15))}" cy="${f(g.Y(tip[1] + hgt - 0.08))}" r="${f(0.05 * S)}" fill="#3b9b58"/>`);
  } else if (kind === "sharklet" || kind === "a350" || kind === "canted") {
    const hgt = s.wing.wingletH ?? (kind === "canted" ? 1.9 : 2.43), sw = hgt * (kind === "canted" ? 0.55 : 0.68), tc = Math.max(0.35, c * (kind === "a350" ? 0.35 : 0.42));
    const rootFwd = kind === "canted" ? c * 0.15 : c * 0.25;
    path([["M", tip[0] + rootFwd, tip[1]], ["C", tip[0] + rootFwd + 0.4, tip[1] + 0.05, tip[0] + c * 0.75, tip[1] + 0.25, tip[0] + c * 0.85 + sw * 0.35, tip[1] + hgt * 0.4], ["L", tip[0] + c + sw - tc, tip[1] + hgt], ["L", tip[0] + c + sw, tip[1] + hgt], ["L", teTip[0] + sw * 0.45, teTip[1] + hgt * 0.35], ["C", teTip[0] + 0.25, teTip[1] + 0.25, teTip[0] + 0.1, teTip[1] + 0.05, ...teTip], ["Z"]],
      `fill="${white([tip[0] + c, tip[1] + 1], [tip[0] + c + sw, tip[1] + 1])}" ${st(0.6, OUT)}`);
  } else if (kind === "fence") {
    const hgt = s.wing.wingletH ?? 0.8;
    path([["M", tip[0] + c * 0.05, tip[1]], ["L", tip[0] + c * 0.62, tip[1] + hgt], ["L", tip[0] + c * 0.9, tip[1] + hgt], ["L", teTip[0] + 0.05, teTip[1] + 0.05], ["Z"]], `fill="${white([tip[0], tip[1] + 0.5], [teTip[0], tip[1] + 0.5])}" ${st(0.6, OUT)}`);
    path([["M", tip[0] + c * 0.15, tip[1] - 0.05], ["L", tip[0] + c * 0.55, tip[1] - hgt * 0.62], ["L", tip[0] + c * 0.8, tip[1] - hgt * 0.62], ["L", teTip[0], teTip[1] - 0.02], ["Z"]], `fill="#c4c9ce" ${st(0.6, OUT)}`);
  } else if (kind === "split") {
    const hgt = s.wing.wingletH ?? 2.9, sw = hgt * 0.62;
    path([["M", tip[0] - 0.1, tip[1]], ["C", tip[0] + c * 0.55, tip[1] + 0.1, tip[0] + c * 0.9, tip[1] + hgt * 0.4, tip[0] + c + sw * 0.45, tip[1] + hgt * 0.62], ["L", tip[0] + c + sw, tip[1] + hgt], ["L", tip[0] + c + sw + 0.28, tip[1] + hgt - 0.06], ["L", tip[0] + c + sw * 0.6, tip[1] + hgt * 0.5], ["C", teTip[0] + 0.3, teTip[1] + 0.5, teTip[0] + 0.15, teTip[1] + 0.15, ...teTip], ["Z"]],
      `fill="${white([tip[0] + c, tip[1] + 1], [tip[0] + c + sw, tip[1] + 1])}" ${st(0.6, OUT)}`);
    path([["M", tip[0] + c * 0.45, tip[1] - 0.05], ["L", tip[0] + c + 0.55, tip[1] - 1.05], ["L", tip[0] + c + 0.78, tip[1] - 1.02], ["L", teTip[0] + 0.05, teTip[1] + 0.02], ["Z"]], `fill="#c7ccd1" ${st(0.55, OUT)}`);
  } else if (kind === "raked") {
    const ext = s.wing.rake ?? 2.0;
    path([["M", tip[0] - 0.05, tip[1]], ["L", tip[0] + ext, tip[1] + 0.32], ["C", tip[0] + ext + 0.2, tip[1] + 0.34, tip[0] + ext + 0.25, tip[1] + 0.3, tip[0] + ext + 0.15, tip[1] + 0.26], ["L", ...teTip], ["Z"]], `fill="${g.lgrad(tip, [tip[0], teTip[1]], [[0, "#62676d"], [1, "#4b4f54"]])}" ${st(0.5, OUT_D)}`);
  }
}

function highWing(g, s, path, k) {
  const { VT } = g.geo;
  const w = s.wing;
  const u0 = w.root[0], c = w.rootChord;
  // root fairing on the crown
  const ab = w.above ?? 0.42;
  path([["M", u0 - 1.2 - ab, VT - 0.02], ["C", u0 - 0.2, VT + ab * 0.7, u0 + 0.6, VT + ab, u0 + 1.6, VT + ab], ["L", u0 + c - 0.6, VT + ab - 0.02], ["C", u0 + c + 0.6, VT + ab * 0.85, u0 + c + 1.8 + ab, VT + ab * 0.35, u0 + c + 2.8 + ab * 2, VT - 0.02], ["Z"]],
    `fill="${g.vgrad(VT + ab, VT, [[0, "#ffffff"], [1, "#e9ecee"]])}" ${st(0.6, OUT)}`);
  const v = VT + (w.above ?? 0.42);
  const tip = [u0 + w.semi * tan(w.sweep), v + w.semi * tan(w.dih) * 0.85];
  g.geo.highWing = { v, tip, u0, c, semi: w.semi };
}
/** High wing seen from the side, drawn over the nacelles: a thin band from root to tip with the lit leading edge. */
function highWingFront(g, s, path) {
  const { v, tip, u0, c } = g.geo.highWing;
  const w = s.wing;
  if ((w.sweep ?? 0) < 8) {
    // straight wing: from the side you see its root section, a thick airfoil sitting on the fairing
    const t = w.thick ?? c * 0.17;
    const d = g.d([["M", u0, v], ["C", u0, v + t * 0.55, u0 + c * 0.12, v + t, u0 + c * 0.32, v + t], ["C", u0 + c * 0.62, v + t * 0.98, u0 + c * 0.85, v + t * 0.45, u0 + c, v + t * 0.05],
      ["L", u0 + c, v - 0.03], ["C", u0 + c * 0.7, v - t * 0.12, u0 + c * 0.3, v - t * 0.2, u0 + c * 0.1, v - t * 0.16], ["C", u0 + 0.03, v - t * 0.12, u0, v - t * 0.05, u0, v], ["Z"]]);
    g.add(`<path d="${d}" fill="${g.vgrad(v + t, v - t * 0.2, [[0, "#ffffff"], [0.55, "#eef0f2"], [1, "#b9bfc5"]])}" ${st(0.6, OUT)}/>`);
    innerShade(g, d, { dy: -0.12, blur: 0.12, opacity: 0.4, color: "#2f3338", mx: 0.1, my: 1.0 });
    path([["M", u0 + c * 0.72, v + t * 0.75], ["L", u0 + c * 0.72, v - t * 0.12]], `fill="none" ${st(0.4, "#b9bfc5")}`);
    return;
  }
  // swept wing: a slim band from the root fairing out to the tip, lit leading edge, darker underside
  const tt = 0.14, tb = 0.26;
  path([["M", u0 - 0.3, v + tt], ["L", tip[0] - 0.05, tip[1] + tt * 0.6], ["C", tip[0] + 0.2, tip[1] + tt * 0.7, tip[0] + w.tipChord, tip[1] + tt * 0.5, tip[0] + w.tipChord + 0.05, tip[1]], ["L", tip[0] + w.tipChord, tip[1] - tb * 0.6], ["L", u0 + c, v - tb], ["L", u0 - 0.2, v - tb * 0.7], ["Z"]],
    `fill="${g.vgrad(v + tt, v - tb, [[0, "#f6f7f8"], [0.4, "#c3c8cd"], [1, "#7d838a"]])}" ${st(0.5, OUT_D)}`);
  path([["M", u0 - 0.25, v + tt - 0.02], ["L", tip[0] - 0.05, tip[1] + tt * 0.6 - 0.02]], `fill="none" ${st(1.0, "#ffffff")}`);
}

// ---------------- gear bay and body fairing canoe ----------------
function bay(g, s, path, clip) {
  const { VB, D } = g.geo;
  const k = wingLines(s);
  const mg = s.gear?.main?.[0]; if (!mg) return;
  const R = k.R, belly = (s.belly?.drop ?? 0.04 * D);
  const gu = mg.u, back = mg.bayAft ?? (1.0 + (mg.axles ?? 1) * 0.35 + ((mg.axles ?? 1) > 1 ? (mg.pitch ?? 1.4) * ((mg.axles ?? 1) - 1) / 2 : 0));
  const top = Math.min(R[1] - 0.06, VB + 0.32 * D);
  const w0 = Math.max(R[0] + 1.0, gu - (mg.bayFwd ?? 3.0) - (mg.axles ?? 1) * 0.6);
  const well = [["M", w0, top], ["L", gu + back, R[1] - 0.2 - (gu + back - R[0]) * 0.03], ["L", gu + back + 0.95, VB + 0.06 - belly + 0.1], ["L", gu + back + 0.35, VB - belly - 0.1], ["L", w0 + 0.7, VB - belly - 0.1], ["Z"]];
  g.add(`<g clip-path="${clip}"><path d="${g.d(well)}" fill="${g.vgrad(top, VB - belly, [[0, "#454a4f"], [1, "#2b2f33"]])}"/></g>`);
  if (s.canoe !== false) {
    const cu0 = gu + back, cv = top - 0.02, len = s.canoeLen ?? Math.min(5.5, 0.35 * (k.teRoot[0] - R[0]) + 2.6), hh = (cv - (VB - belly + 0.12));
    path([["M", cu0, cv], ["C", cu0 + len * 0.35, cv + 0.06, cu0 + len * 0.8, cv + 0.02, cu0 + len, cv - hh * 0.35], ["C", cu0 + len * 1.06, cv - hh * 0.6, cu0 + len * 0.95, cv - hh * 0.95, cu0 + len * 0.82, cv - hh * 0.97], ["L", cu0 + 0.95, cv - hh], ["Z"]],
      `fill="${g.vgrad(cv + 0.05, cv - hh, [[0, "#f3f4f5"], [0.5, "#e2e4e7"], [1, "#a7adb2"]])}" ${st(0.45, OUT)}`);
    path([["M", cu0, cv], ["L", cu0 + 0.95, cv - hh]], `fill="none" ${st(0.4, "#5c6166")}`);
  }
}

// ---------------- landing gear ----------------
function wheel(g, u, r) {
  const t = g.rgrad(u, r, r, [[0, "#3a3f44"], [0.75, "#2a2e32"], [0.93, "#1c1f22"], [1, "#111315"]]);
  const h = g.rgrad(u - r * 0.12, r + r * 0.12, r * 0.5, [[0, "#f0f1f2"], [0.6, "#c3c8cc"], [1, "#8b9197"]]);
  let x = `<circle cx="${f(g.X(u))}" cy="${f(g.Y(r))}" r="${f(r * S)}" fill="${t}"/>`;
  x += `<circle cx="${f(g.X(u))}" cy="${f(g.Y(r))}" r="${f(r * 0.5 * S)}" fill="${h}" ${st(0.5, "#5f656b")}/>`;
  x += `<circle cx="${f(g.X(u))}" cy="${f(g.Y(r))}" r="${f(r * 0.33 * S)}" fill="none" ${st(0.45, "#8d939a")}/>`;
  for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3 + 0.3; x += `<circle cx="${f(g.X(u + Math.cos(a) * r * 0.24))}" cy="${f(g.Y(r + Math.sin(a) * r * 0.24))}" r="${f(0.022 * S)}" fill="#6f767c"/>`; }
  x += `<circle cx="${f(g.X(u))}" cy="${f(g.Y(r))}" r="${f(r * 0.12 * S)}" fill="#9aa0a6" ${st(0.3, "#5f656b")}/>`;
  return x;
}
/** gr = { u (axle centre), r, axles: 1|2|3, pitch (m between axles), top (v where the leg enters the body) } */
function mainGear(g, gr) {
  const { u, r } = gr;
  const ax = gr.axles ?? 1, pitch = gr.pitch ?? r * 2.55, top = gr.top ?? g.geo.VB + 0.1;
  const offs = ax === 1 ? [0] : ax === 2 ? [-pitch / 2, pitch / 2] : [-pitch, 0, pitch];
  const x = [];
  const w = Math.max(0.12, r * 0.24);
  const strut = g.lgrad([u - w, 1], [u + w, 1], [[0, "#8e959c"], [0.35, "#e4e7e9"], [1, "#7d848b"]]);
  const vAx = ax === 1 ? r : r + 0.12;
  x.push(`<path d="${g.poly([[u - w, top], [u + w, top], [u + w * 0.85, vAx + 0.45], [u - w * 0.85, vAx + 0.45]])}" fill="${strut}" ${st(0.4, "#5f666d")}/>`);
  x.push(`<path d="${g.poly([[u - w * 0.55, vAx + 0.5], [u + w * 0.55, vAx + 0.5], [u + w * 0.5, vAx], [u - w * 0.5, vAx]])}" fill="${g.lgrad([u - w, 1], [u + w, 1], [[0, "#9aa1a8"], [0.4, "#f6f7f8"], [1, "#8b9198"]])}"/>`);
  x.push(`<path d="${g.d([["M", u + w, vAx + 0.75], ["L", u + w + 0.25, vAx + 0.5], ["L", u + w * 0.8, vAx + 0.2]])}" fill="none" ${st(1.1, "#6d747b")}/>`);
  x.push(`<path d="${g.d([["M", u - w, top - 0.12], ["L", u - w - 0.7, top]])}" fill="none" ${st(1.4, "#5c6269")}/>`);
  if (ax > 1) x.push(`<rect x="${f(g.X(u + offs[0] - 0.12))}" y="${f(g.Y(r + 0.1))}" width="${f((offs[offs.length - 1] - offs[0] + 0.24) * S)}" height="${f(0.2 * S)}" rx="${f(0.08 * S)}" fill="#8d949b" ${st(0.5, "#5f666d")}/>`);
  for (const o of offs) x.push(wheel(g, u + o, r));
  g.add(`<g>${x.join("")}</g>`);
  g.see(u, 0);
}
function noseGear(g, ng, s) {
  const { u, r } = ng;
  const VB = g.geo.VB, top = ng.top ?? VB + 0.05;
  const x = [];
  if (ng.door !== false) { const d0 = ng.doorU ?? u - 1.6, d1 = d0 + (ng.doorLen ?? 1.1); x.push(`<path d="${g.d([["M", d0, VB + 0.05], ["L", d1, VB + 0.02], ["L", d1 - 0.04, VB - 0.42], ["L", d0 + 0.02, VB - 0.36], ["Z"]])}" fill="${g.vgrad(VB, VB - 0.42, [[0, "#eceef0"], [1, "#c3c8cc"]])}" ${st(0.5, OUT)}/>`); }
  const ua = u + 0.06;
  x.push(`<path d="${g.poly([[ua - 0.09, top], [ua + 0.09, top], [ua + 0.07, r + 0.25], [ua - 0.07, r + 0.25]])}" fill="${g.lgrad([ua - 0.1, 1], [ua + 0.1, 1], [[0, "#8e959c"], [0.4, "#e4e7e9"], [1, "#7d848b"]])}" ${st(0.35, "#5f666d")}/>`);
  x.push(`<path d="${g.poly([[u - 0.05, r + 0.3], [u + 0.05, r + 0.3], [u + 0.04, r], [u - 0.04, r]])}" fill="#e7e9eb" ${st(0.3, "#7d848b")}/>`);
  x.push(`<path d="${g.d([["M", ua + 0.08, r + 0.55], ["L", ua + 0.25, r + 0.36], ["L", ua + 0.06, r + 0.16]])}" fill="none" ${st(0.9, "#6d747b")}/>`);
  x.push(`<path d="${g.d([["M", ua - 0.08, Math.min(top - 0.2, r + 0.9)], ["L", ua - 0.62, top]])}" fill="none" ${st(1.0, "#6d747b")}/>`);
  x.push(`<rect x="${f(g.X(u - 0.6))}" y="${f(g.Y(r + 0.64))}" width="${f(0.4 * S)}" height="${f(0.15 * S)}" rx="${f(0.04 * S)}" fill="${g.vgrad(r + 0.64, r + 0.49, [[0, "#c9cdd1"], [1, "#868d94"]])}" ${st(0.35, "#5f666d")}/>`);
  const offs = ng.twin ? [0] : [0];
  for (const o of offs) x.push(wheel(g, u + o, r));
  g.add(`<g>${x.join("")}</g>`);
  g.see(u, 0);
}

// ---------------- engines ----------------
/**
 * e.kind: "fan" (underwing pod placed from e.eta along the wing LE), "pod" (absolute u0/vc, e.g. rear-mounted),
 * "prop", "custom" (e.draw(g, s)).
 * Nacelle: len, d, flat (lower-lip flattening), mixed (long duct, no separate core), core {len, d0, d1}, plug {len, d},
 * chevrons, buckets (target reverser at the nozzle), stripe (fan-blade red line), short (turbojet-era ring cowl).
 */
function engine(g, s, e, path) {
  if (e.kind === "custom") return e.draw(g, s);
  if (e.kind === "prop") return prop(g, s, e, path);
  let u0 = e.u0, vc = e.vc;
  if (e.kind === "fan") {
    const k = wingLines(s);
    const le = k.leAt(e.eta);
    u0 = le[0] - (e.fwd ?? e.len * 0.62);
    vc = le[1] - (e.drop ?? 0.25) - e.d / 2;
    const ue = u0 + e.len;
    // aft pylon fairing under the wing
    if (e.pylon !== false) {
      const pa = e.pylonAft ?? 2.1;
      path([["M", ue - 0.5, vc + e.d * 0.36], ["L", le[0] + 0.3, le[1] - 0.05], ["L", ue + pa * 0.8, le[1] + (ue + pa - le[0]) * 0.1 - 0.05], ["C", ue + pa, vc + e.d * 0.42, ue + pa, vc + e.d * 0.3, ue + pa + 0.1, vc + e.d * 0.2], ["L", ue + 0.6, vc + e.d * 0.15], ["Z"]],
        `fill="${g.vgrad(le[1], vc, [[0, "#5a5f64"], [1, "#3e4247"]])}"`);
      if (e.pylonTop) path([["M", u0 + e.len * 0.35, vc + e.d * 0.48], ["C", u0 + e.len * 0.45, le[1] - 0.05, u0 + e.len * 0.55, vOnLine(k.LE, u0 + e.len * 0.6) + 0.02, u0 + e.len * 0.62, vOnLine(k.LE, u0 + e.len * 0.62)], ["L", ue + 0.2, vOnLine(k.LE, ue + 0.2) - 0.1], ["L", ue - 0.2, vc + e.d * 0.4], ["Z"]], `fill="${g.vgrad(le[1], vc + e.d / 2, [[0, "#f1f2f3"], [1, "#c9cdd1"]])}" ${st(0.5, OUT)}`);
    }
  }
  nacelle(g, { ...e, u0, vc });
}
function vOnLine(line, u) { return vOn(line, u); }

export function nacelle(g, e) {
  const path = (cmds, attrs) => g.add(`<path d="${g.d(cmds)}" ${attrs}/>`);
  const { u0, vc, len, d } = e;
  const r = d / 2, rb = r - (e.flat ?? 0), ue = u0 + len;
  const nz = (e.nozzle ?? (e.mixed ? 0.7 : 0.78)) * r;
  // core / exhaust
  if (!e.mixed) {
    const c = { len: len * 0.28, d0: d * 0.55, d1: d * 0.4, ...(e.core ?? {}) };
    const c0 = c.d0 / 2, c1 = c.d1 / 2, cu = ue + c.len;
    path([["M", ue - 0.3, vc + c0], ["C", ue + c.len * 0.35, vc + c0, ue + c.len * 0.8, vc + c1 + 0.03, cu, vc + c1], ["L", cu, vc - c1], ["C", ue + c.len * 0.8, vc - c1 - 0.03, ue + c.len * 0.35, vc - c0, ue - 0.3, vc - c0], ["Z"]],
      `fill="${g.vgrad(vc + c0, vc - c0, [[0, "#8a9096"], [0.3, "#6a7076"], [1, "#373b40"]])}" ${st(0.45, "#4a4f54")}`);
    g.add(`<g fill="none" ${st(0.4, "#4d5257")}>${[0.3, 0.7].map((t) => `<path d="${g.d([["M", ue + c.len * t, vc + c0 - (c0 - c1) * t], ["L", ue + c.len * t, vc - c0 + (c0 - c1) * t]])}"/>`).join("")}</g>`);
    const pl = { len: c1 * 1.4, d: c1 * 1.3, ...(e.plug ?? {}) };
    path([["M", cu, vc + pl.d / 2], ["C", cu + pl.len * 0.5, vc + pl.d * 0.47, cu + pl.len * 0.9, vc + pl.d * 0.15, cu + pl.len, vc], ["C", cu + pl.len * 0.9, vc - pl.d * 0.15, cu + pl.len * 0.5, vc - pl.d * 0.47, cu, vc - pl.d / 2], ["Z"]],
      `fill="${g.vgrad(vc + pl.d / 2, vc - pl.d / 2, [[0, "#6d6862"], [1, "#2f2c29"]])}"`);
    if (e.coreChevrons) zig(g, cu, vc, c1, e.coreChevrons, 0.12);
  } else {
    // mixed exhaust: dark nozzle ring and plug
    const pr = nz * 0.75;
    path([["M", ue - 0.05, vc + pr], ["C", ue + 0.3, vc + pr * 0.9, ue + 0.55, vc + pr * 0.4, ue + 0.62, vc], ["C", ue + 0.55, vc - pr * 0.4, ue + 0.3, vc - pr * 0.9, ue - 0.05, vc - pr], ["Z"]],
      `fill="${g.vgrad(vc + pr, vc - pr, [[0, "#6d6862"], [1, "#2f2c29"]])}"`);
  }
  // cowl
  const lip = e.lip ?? Math.min(0.22, d * 0.1);
  const bul = e.bulge ?? 0.38;
  const ub = u0 + len * bul;
  const cowl = [["M", u0, vc + r * 0.9], ["C", u0 + len * 0.06, vc + r, ub - len * 0.15, vc + r, ub, vc + r], ["C", ub + len * 0.3, vc + r, ue - len * 0.12, vc + nz * 1.04, ue, vc + nz],
    ["L", ue, vc - nz], ["C", ue - len * 0.12, vc - nz * 1.04, ub + len * 0.3, vc - rb, ub, vc - rb], ["C", ub - len * 0.15, vc - rb, u0 + len * 0.06, vc - rb * 0.98, u0 + 0.02, vc - rb * 0.86],
    ["C", u0 - lip, vc - rb * 0.55, u0 - lip, vc + r * 0.55, u0, vc + r * 0.9], ["Z"]];
  const cd = g.d(cowl);
  g.add(`<path d="${cd}" fill="${g.vgrad(vc + r, vc - rb, [[0, "#e4e6e8"], [0.08, "#f7f8f8"], [0.3, "#ffffff"], [0.62, "#f1f2f3"], [1, "#dcdfe2"]])}" ${st(0.6, OUT)}/>`);
  innerShade(g, cd, { dy: -0.3 * d / 2.1, blur: 0.3 * d / 2.1, opacity: 0.5, color: "#30353a", mx: 0.3, my: 0.6 });
  innerShade(g, cd, { dx: 0.12 * d / 2.1, dy: 0, blur: 0.12 * d / 2.1, opacity: 0.25, color: "#41474d", mx: 0.3, my: 0.3 });
  const cl = g.clip(cd);
  const sp = (e.splits ?? [0.37, 0.65]).map((t) => { const uu = u0 + len * t; return `<path d="${g.d([["M", uu, vc + r + 0.1], ["C", uu + 0.05, vc + r * 0.3, uu + 0.05, vc - r * 0.3, uu, vc - rb - 0.1]])}" fill="none" ${st(0.4, "#cdd1d5")}/>`; }).join("");
  let x = `<path d="${g.d([["M", u0 + 0.12, vc + r + 0.1], ["C", u0 + 0.3, vc + 0.4 * r, u0 + 0.3, vc - 0.4 * r, u0 + 0.12, vc - rb - 0.1]])}" fill="none" ${st(0.45, "#c3c8cc")}/>` + sp;
  if (e.stripe !== false && d > 1.5) { const us = u0 + len * (e.stripeAt ?? 0.38); x += `<path d="${g.d([["M", us, vc - 0.05 * d], ["L", us, vc - rb - 0.1]])}" fill="none" ${st(0.9, "#c9473c")}/>`; }
  g.add(`<g clip-path="${cl}">${x}</g>`);
  if (e.chevrons) zig(g, ue, vc, nz, e.chevrons, 0.18);
  if (e.buckets) {
    path([["M", ue - 0.05, vc + nz * 1.05], ["L", ue + 0.42, vc + nz * 0.98], ["L", ue + 0.42, vc - nz * 0.98], ["L", ue - 0.05, vc - nz * 1.05], ["Z"]], `fill="${g.vgrad(vc + nz, vc - nz, [[0, "#c9cdd1"], [0.5, "#9ba1a7"], [1, "#6a7076"]])}" ${st(0.5, OUT_D)}`);
  }
  return { ue, vc, r };
}
function zig(g, u, vc, r, n, depth) {
  const pts = [];
  for (let i = 0; i <= n * 2; i++) pts.push(i % 2 ? [u + depth, vc + r - (2 * r * i) / (n * 2)] : [u, vc + r - (2 * r * i) / (n * 2)]);
  g.add(`<path d="${g.d([["M", ...pts[0]], ...pts.slice(1).map((p) => ["L", ...p])])}" fill="none" ${st(0.5, "#8b9299")}/>`);
}

/** Rear-mounted engine pod with its pylon stub (DC-9, 727 side engines, CRJ, F28...). */
export function rearPod(g, e) {
  const { u0, vc, len, d } = e;
  // the stub pylon runs inboard behind the pod; from the side only its shadow on the fuselage shows
  if (g.geo.clip) soft(g, g.d([["M", u0 + len * 0.15, vc - d * 0.32], ["C", u0 + len * 0.4, vc - d * 0.62, u0 + len * 0.8, vc - d * 0.62, u0 + len * 1.02, vc - d * 0.3], ["L", u0 + len * 0.95, vc], ["L", u0 + len * 0.2, vc], ["Z"]]), { color: "#2c3035", opacity: 0.32, blur: 0.12, clip: g.geo.clip });
  return nacelle(g, { mixed: true, stripe: false, splits: [0.2, 0.55, 0.8], ...e });
}

function prop(g, s, e, path) {
  const hw = g.geo.highWing;
  const v = e.v ?? (hw ? hw.v - 0.62 : 2), u = e.u;
  const len = e.len ?? 7.3, h = e.h ?? 1.5;
  const wv = hw ? hw.v - 0.04 : v + h * 0.55; // nacelle top meets the wing underside
  const bot = v - h * 0.5;
  const cmds = [["M", u + 0.35, v + 0.3], ["C", u + 0.9, v + 0.55, u + 1.6, wv - 0.02, u + 2.6, wv], ["L", u + len * 0.72, wv], ["C", u + len * 0.86, wv - 0.04, u + len * 0.95, wv - 0.18, u + len, wv - 0.32],
    ["C", u + len * 0.88, wv - 0.5, u + len * 0.72, bot + 0.45, u + len * 0.55, bot + 0.2], ["C", u + len * 0.4, bot, u + 1.8, bot, u + 1.25, bot + 0.02], ["C", u + 0.75, bot + 0.05, u + 0.4, v - 0.3, u + 0.35, v - 0.22], ["Z"]];
  const d = g.d(cmds);
  g.add(`<path d="${d}" fill="${g.vgrad(wv, bot, [[0, "#f3f4f5"], [0.3, "#ffffff"], [0.7, "#eef0f2"], [1, "#dcdfe2"]])}" ${st(0.6, OUT)}/>`);
  innerShade(g, d, { dy: -0.3, blur: 0.28, opacity: 0.55, color: "#2f3338", mx: 0.05, my: 1.0 });
  innerShade(g, d, { dx: 0.15, dy: 0, blur: 0.15, opacity: 0.22, color: "#41474d", mx: 0.1, my: 0.3 });
  // chin intake under the spinner, cowl seams, side exhaust
  path([["M", u + 0.45, v - 0.3], ["C", u + 0.8, v - 0.36, u + 1.25, v - 0.42, u + 1.6, bot + 0.12], ["L", u + 1.65, bot + 0.03], ["C", u + 1.2, bot + 0.05, u + 0.75, v - 0.42, u + 0.42, v - 0.36], ["Z"]], `fill="#2a2e32"`);
  g.add(`<g fill="none" ${st(0.4, "#c9cdd1")}><path d="${g.d([["M", u + 2.35, wv], ["L", u + 2.35, bot + 0.02]])}"/><path d="${g.d([["M", u + 3.9, wv], ["L", u + 3.9, bot + 0.05]])}"/></g>`);
  path([["M", u + 4.2, v + 0.42], ["C", u + 4.5, v + 0.58, u + 5.1, v + 0.58, u + 5.35, v + 0.44], ["C", u + 5.1, v + 0.28, u + 4.5, v + 0.28, u + 4.2, v + 0.42], ["Z"]], `fill="${g.vgrad(v + 0.58, v + 0.28, [[0, "#5d6369"], [1, "#2a2e32"]])}"`);
  propeller(g, { u, v, r: e.r ?? 1.96, n: e.blades ?? 6, phase: 0.35, spinnerLen: 0.95, spinnerR: 0.33 });
}

// ---------------- configuration helpers used by fleet specs ----------------
const pth = (g, cmds, attrs) => g.add(`<path d="${g.d(cmds)}" ${attrs}/>`);

/**
 * S-duct centre-engine intake (727, Trident, L-1011): an oval mouth on the crown whose fairing sweeps up into the fin
 * leading edge. Use in s.front (after the fin exists). u = lip station, h = lip height above the crown, w = mouth width.
 */
export function sDuct({ u, h, w = 0.28, join = 0.9 }) {
  return (g) => {
    const { VT } = g.geo, fi = g.geo.fin;
    const vj = VT + h + join, uj = fi.leAt(vj);
    const k = Math.tan(Math.atan2(vj - (VT + h), uj - u)); // unused guard for odd fins
    const dir = [fi.leAt(vj + 1) - uj, 1]; // fin LE direction
    const top = [["C", u + 0.35, VT + h + 0.08, uj - dir[0] * 0.9, vj - 0.9, uj, vj]];
    const fillD = g.d([["M", u - 0.55, VT - 0.03], ["C", u - 0.25, VT + 0.06, u - 0.08, VT + h * 0.55, u + 0.06, VT + h], ...top, ["L", fi.leAt(VT), VT - 0.03], ["Z"]]);
    g.add(`<path d="${fillD}" fill="${g.vgrad(VT + h + join, VT, [[0, "#ffffff"], [0.6, "#fafbfb"], [1, "#eef0f2"]])}"/>`);
    innerShade(g, fillD, { dx: 0.12, dy: 0, blur: 0.14, opacity: 0.16, color: "#3b4046", mx: 0.3, my: 0.4 });
    g.add(`<path d="${g.d([["M", u - 0.55, VT - 0.03], ["C", u - 0.25, VT + 0.06, u - 0.08, VT + h * 0.55, u + 0.06, VT + h], ...top])}" fill="none" ${st(0.7, OUT)}/>`);
    // mouth: dark oval set just behind the lip, lit lip ring in front of it
    const m = [["M", u + 0.1, VT + h - 0.06], ["C", u + 0.1 + w, VT + h - 0.1, u + 0.05 + w, VT + 0.22, u - 0.02, VT + 0.16], ["C", u - 0.06, VT + h * 0.35, u - 0.02, VT + h * 0.75, u + 0.1, VT + h - 0.06], ["Z"]];
    g.add(`<path d="${g.d(m)}" fill="${g.lgrad([u, VT + h], [u + w, VT], [[0, "#3c4146"], [1, "#1d2125"]])}"/>`);
    g.add(`<path d="${g.d([["M", u + 0.06, VT + h - 0.02], ["C", u - 0.06, VT + h * 0.7, u - 0.08, VT + h * 0.35, u - 0.03, VT + 0.15]])}" fill="none" ${st(1.1, "#e9ecee")}/>`);
    g.add(`<path d="${g.d([["M", u + 0.06, VT + h - 0.02], ["C", u - 0.06, VT + h * 0.7, u - 0.08, VT + h * 0.35, u - 0.03, VT + 0.15]])}" fill="none" ${st(0.4, OUT_D)}/>`);
    void k;
  };
}
/** Centre-engine exhaust nozzle at the tail end. */
export function tailNozzle({ r, len = 0.7 }) {
  return (g) => {
    const { L, tail } = g.geo;
    const vc = (tail.tailBot[0][1] + tail.tailTop[3][1]) / 2;
    pth(g, [["M", L - 0.25, vc + r], ["L", L + len, vc + r * 0.92], ["L", L + len, vc - r * 0.92], ["L", L - 0.25, vc - r], ["Z"]], `fill="${g.vgrad(vc + r, vc - r, [[0, "#9aa0a6"], [0.4, "#70767c"], [1, "#3c4045"]])}" ${st(0.5, OUT_D)}`);
    g.add(`<ellipse cx="${f(g.X(L + len))}" cy="${f(g.Y(vc))}" rx="${f(0.12 * S)}" ry="${f(r * 0.9 * S)}" fill="#2a2e32"/>`);
  };
}
/** Straight-through tail engine with the fairing down to the crown (DC-10, MD-11). */
export function throughEngine(e) {
  return (g) => {
    const { VT } = g.geo;
    const r = e.d / 2, top = e.vc + r;
    pth(g, [["M", e.u0 - 1.2, VT - 0.02], ["C", e.u0 + 0.3, VT + 0.05, e.u0 + 1.0, top - 0.4, e.u0 + 2.2, e.vc + r * 0.2], ["L", e.u0 + e.len, e.vc - r * 0.5], ["L", e.u0 + e.len + 0.4, VT - 0.6], ["Z"]],
      `fill="${g.vgrad(e.vc, VT, [[0, "#eceef0"], [1, "#dfe2e5"]])}" ${st(0.6, OUT)}`);
    nacelle(g, { mixed: true, stripe: false, splits: [0.16, 0.62], bulge: 0.22, ...e });
  };
}
/** Fuselage-side main-gear fairing for high-wing types (ATR, BAe 146): streamlined, shaded, with the gear doors. */
export function sponson({ u0, u1, top, bot }) {
  return (g) => {
    const len = u1 - u0, m = u0 + len * 0.45;
    const d = g.d([["M", u0 - 0.6, top + 0.05], ["C", u0 + len * 0.05, top - 0.02, u0 + len * 0.1, bot + 0.06, u0 + len * 0.3, bot + 0.02], ["L", u0 + len * 0.7, bot], ["C", u0 + len * 0.9, bot + 0.04, u1 + 0.4, top - 0.25, u1 + 1.6, top + 0.05], ["Z"]]);
    g.add(`<path d="${d}" fill="${g.vgrad(top, bot, [[0, "#f6f7f8"], [0.5, "#eef0f2"], [1, "#dfe2e5"]])}"/>`);
    innerShade(g, d, { dy: -0.3, blur: 0.28, opacity: 0.6, color: "#2f3338", mx: 0.2, my: 1.0 });
    g.add(`<path d="${g.d([["M", u0 - 0.6, top + 0.05], ["C", u0 + len * 0.05, top - 0.02, u0 + len * 0.1, bot + 0.06, u0 + len * 0.3, bot + 0.02], ["L", u0 + len * 0.7, bot], ["C", u0 + len * 0.9, bot + 0.04, u1 + 0.4, top - 0.25, u1 + 1.6, top + 0.05]])}" fill="none" ${st(0.55, OUT)}/>`);
    g.add(`<path d="${g.d([["M", m - 0.85, bot + 0.04], ["L", m - 0.85, top - 0.18], ["L", m + 0.85, top - 0.18], ["L", m + 0.85, bot + 0.03]])}" fill="none" ${st(0.4, "#a9b0b7")}/>`);
    g.add(`<path d="${g.d([["M", m, bot + 0.04], ["L", m, top - 0.18]])}" fill="none" ${st(0.35, "#b9bfc5")}/>`);
  };
}
/** Caravelle-style rounded triangular windows. */
export function triWindows({ v, from, to, pitch = 0.9, size = 0.42, skip = [] }) {
  return (g, s, clip) => {
    const us = [];
    for (let u = from; u <= to + 1e-6; u += pitch) if (!skip.some(([a, b]) => u > a && u < b)) us.push(u);
    const h = size, w = size * 0.95;
    const fill = g.vgrad(v + h / 2, v - h / 2, [[0, "#4b545d"], [0.35, "#2b3238"], [1, "#1e2429"]]);
    const shapes = us.map((u) => `<path d="${g.d([["M", u - w / 2 + 0.05, v - h / 2], ["L", u + w / 2 - 0.05, v - h / 2], ["Q", u + w / 2, v - h / 2, u + w / 2 - 0.03, v - h / 2 + 0.06], ["L", u + 0.04, v + h / 2 - 0.05], ["Q", u, v + h / 2, u - 0.04, v + h / 2 - 0.05], ["L", u - w / 2 + 0.03, v - h / 2 + 0.06], ["Q", u - w / 2, v - h / 2, u - w / 2 + 0.05, v - h / 2], ["Z"]])}"/>`).join("");
    g.add(`<g clip-path="${clip}" fill="${fill}" ${st(0.3, "#4a5158")}>${shapes}</g>`);
  };
}
/** Painted black window surround (A350 "mask"). */
export function cockpitMask({ u0, u1, v0, v1 }) {
  return (g, s, clip) => {
    g.add(`<g clip-path="${clip}"><path d="${g.d([["M", u0, v0 + 0.1], ["C", u0 + 0.2, v1 - 0.05, u0 + 0.5, v1, u0 + 0.9, v1], ["L", u1 - 0.3, v1 - 0.02], ["C", u1, v1 - 0.05, u1 + 0.1, v0 + 0.3, u1 - 0.05, v0], ["L", u0 + 0.3, v0 - 0.05], ["Z"]])}" fill="#1f2328"/></g>`);
  };
}
