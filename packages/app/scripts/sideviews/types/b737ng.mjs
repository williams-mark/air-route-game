// Boeing 737 Next Generation, white-tail side view. Base geometry is the 737-800 (length 39.47 m, span 35.79 m with
// blended winglets, height 12.55 m, fuselage 3.76 m wide x 4.01 m tall, CFM56-7B engines). Station and height values
// were measured off a scaled side elevation and fitted with smooth curves; other NG lengths come from the forward and
// aft fuselage plugs. Everything here is artwork: proportions are faithful, small details are approximations.
import { Drawing, cr, innerShade, soft, windowRow, door, antenna, light, st, f, S } from "../lib.mjs";

const OUT = "#a3a9af"; // outline
const OUT_D = "#7d848b"; // outline on shaded parts

export function draw737ng({ id, title, fwd = 0, aft = 0, winglets = true, exits = 2 }) {
  const g = new Drawing(id);
  const sF = (u) => (u > 9 ? u + fwd : u); // stations behind the forward plug
  const sA = (u) => sF(u > 26 ? u + aft : u); // stations behind the aft plug
  const T = (u) => sA(u); // tail stations are measured on the -800 and moved by both plugs
  const W = sF; // wing, engine and main gear move with the forward plug
  const VT = 5.5, VB = 1.38;
  const add = (s) => g.add(s);
  const path = (cmds, attrs) => add(`<path d="${g.d(cmds)}" ${attrs}/>`);
  const grad = (v0, v1, stops) => g.vgrad(v0, v1, stops);

  // ================= vertical fin (behind the fuselage) =================
  const fin = [["M", T(27.9), VT - 0.03], ...cr([[T(27.9), VT - 0.03], [T(29.9), 5.75], [T(31.7), 6.25], [T(32.85), 6.9]]),
    ["L", T(38.05), 12.42], ["C", T(38.1), 12.47, T(38.15), 12.48, T(38.25), 12.48], ["L", T(39.62), 12.48], ["L", T(37.62), VT - 0.04], ["Z"]];
  const finD = g.d(fin);
  path(fin, `fill="${g.lgrad([T(33), 9], [T(39.6), 9], [[0, "#ffffff"], [0.6, "#fafafb"], [1, "#eceef0"]])}" ${st(0.8, OUT)}`);
  innerShade(g, finD, { dx: -0.05, dy: 0, blur: 0.12, opacity: 0.12, color: "#5b6168", my: 0.2 });
  path([["M", T(38.72), 12.42], ["L", T(36.66), VT]], `fill="none" ${st(0.45, "#c3c8cc")}`); // rudder hinge
  path([["M", T(38.3), 12.3], ["L", T(39.55), 12.3]], `fill="none" ${st(0.4, "#d0d4d8")}`); // tip cap
  path([["M", T(32.85), 6.9], ["L", T(33.0), VT]], `fill="none" ${st(0.4, "#dde0e3")}`); // dorsal joint
  path([["M", T(39.1), 11.0], ["L", T(39.42), 11.0], ["M", T(38.9), 9.4], ["L", T(38.98), 9.4]], `fill="none" ${st(0.35, "#c9cdd1")}`);

  // ================= fuselage =================
  const nose = [[0, 2.94], [0.12, 3.3], [0.45, 3.62], [1.0, 3.88], [1.6, 4.18], [2.3, 4.58], [3.2, 4.96], [4.2, 5.22], [5.4, 5.43], [6.8, VT]];
  const tailTop = [[T(37.45), VT], [T(38.2), 5.34], [T(38.75), 4.98], [T(39.12), 4.56]];
  const tailBot = [[T(39.1), 4.28], [T(38.1), 3.88], [T(36.5), 3.25], [T(35.0), 2.8], [T(33.0), 2.32], [T(31.0), 1.9], [T(29.0), 1.55], [T(27.4), VB]];
  const noseBot = [[5.6, VB], [4.4, 1.41], [3.2, 1.48], [2.3, 1.6], [1.6, 1.8], [1.0, 2.05], [0.45, 2.38], [0.12, 2.68], [0, 2.94]];
  const body = [["M", 0, 2.94], ...cr(nose), ["L", tailTop[0][0], VT], ...cr(tailTop), ["C", T(39.2), 4.45, T(39.2), 4.33, T(39.1), 4.28], ...cr(tailBot),
    ["L", W(24.6), VB], ["C", W(23.6), 1.24, W(22.6), 1.22, W(21.6), 1.22], ["L", W(15.6), 1.22], ["C", W(14.8), 1.22, W(14.2), 1.3, W(13.6), VB], ["L", 5.6, VB], ...cr(noseBot), ["Z"]];
  const bd = g.d(body);
  path(body, `fill="${grad(VT, VB, [[0, "#eceef0"], [0.05, "#f8f8f9"], [0.2, "#ffffff"], [0.5, "#fcfcfc"], [0.72, "#f1f2f3"], [1, "#e4e6e8"]])}"`);
  const clip = g.clip(bd);
  innerShade(g, bd, { dy: -0.72, blur: 0.62, opacity: 0.74, color: "#2f3338" }); // belly and nose/tail undersides
  innerShade(g, bd, { dy: 0.05, blur: 0.07, opacity: 0.16, color: "#4c5258", my: 0.3 }); // crown edge
  innerShade(g, bd, { dx: 0.18, dy: -0.1, blur: 0.22, opacity: 0.22, color: "#3b4046", my: 0.3 }); // nose rim

  // panel joins (faint)
  const seam = (u, v0 = VB - 0.3, v1 = VT + 0.3, bow = 0) => (bow ? [["M", u, v1], ["C", u - bow, 4.4, u - bow, 2.6, u, v0]] : [["M", u, v1], ["L", u, v0]]);
  add(`<g clip-path="${clip}" fill="none" ${st(0.35, "#d6d9dc")}>${[seam(4.15, 1.0, 6, 0.08), seam(7.7), seam(sF(13.25)), seam(sF(15.9)), seam(sF(21.05)), seam(sA(26.3)), seam(T(33.65), 1.5, 6), seam(T(36.95), 2.5, 6, 0.08)].map((c) => `<path d="${g.d(c)}"/>`).join("")}</g>`);
  add(`<g clip-path="${clip}" fill="none" ${st(0.35, "#d3d6d9")}><path d="${g.d([["M", 3.0, 1.9], ["C", 6, 1.83, 10, 1.8, W(13.4), 1.8]])}"/><path d="${g.d([["M", W(24.8), 1.82], ["C", sA(28), 1.85, T(31), 2.15, T(33.2), 2.6]])}"/></g>`);

  // windows and doors
  const skip = [[sF(13.4), sF(13.85)], [sF(14.45), sF(14.95)], [sF(16.45), sF(17.2)], [sF(17.5), sF(18.25)]];
  windowRow(g, clip, { v: 3.95, w: 0.235, h: 0.34, pitch: 0.508, from: 6.02, to: sA(29.85), skip: exits === 2 ? skip : [skip[0], skip[1], [sF(17.0), sF(17.75)]] });
  const doorAt = (u, kind) => door(g, clip, { u, vBot: 2.97, w: 0.84, h: 1.92, kind, r: 0.2 });
  doorAt(5.07, "pax"); doorAt(T(31.45), "pax");
  for (const u of exits === 2 ? [sF(16.83), sF(17.88)] : [sF(17.38)]) door(g, clip, { u, vBot: 3.3, w: 0.52, h: 1.04, kind: "overwing", r: 0.13 });
  door(g, clip, { u: 8.55, vBot: 1.62, w: 1.2, h: 0.86, kind: "cargo", r: 0.1 });
  door(g, clip, { u: sA(28.25), vBot: 1.75, w: 1.2, h: 0.82, kind: "cargo", r: 0.1 });

  // cockpit glazing: windscreen, two side windows, two eyebrow windows
  const glass = grad(4.5, 3.7, [[0, "#59626b"], [0.4, "#2e353b"], [1, "#1b2025"]]);
  const cw = [
    [["M", 1.56, 3.82], ["C", 1.64, 3.95, 1.76, 4.05, 1.88, 4.1], ["L", 2.17, 4.17], ["L", 2.2, 3.78], ["Z"]],
    [["M", 2.27, 3.78], ["L", 2.29, 4.18], ["L", 2.69, 4.18], ["L", 2.69, 3.7], ["Z"]],
    [["M", 2.76, 3.7], ["L", 2.77, 4.18], ["L", 3.22, 4.15], ["C", 3.25, 4.0, 3.2, 3.82, 3.06, 3.72], ["Z"]],
    [["M", 2.15, 4.36], ["L", 2.2, 4.47], ["L", 2.42, 4.5], ["L", 2.42, 4.37], ["Z"]],
    [["M", 2.5, 4.38], ["L", 2.52, 4.51], ["L", 2.75, 4.53], ["L", 2.75, 4.39], ["Z"]],
  ];
  add(`<g fill="${glass}" ${st(0.45, "#3a4148")}>${cw.map((c) => `<path d="${g.d(c)}"/>`).join("")}</g>`);
  path([["M", 1.78, 3.38], ["L", 1.55, 3.36]], `fill="none" ${st(1.0, "#8d949b")}`); // pitot
  path([["M", 2.9, 3.4], ["L", 3.15, 3.4]], `fill="none" ${st(0.6, "#b9bec3")}`);
  for (const [u, v] of [[3.05, 3.22], [3.22, 3.22], [T(35.2), 3.85]]) add(`<circle cx="${f(g.X(u))}" cy="${f(g.Y(v))}" r="${f(0.045 * S)}" fill="#9aa1a8"/>`);

  // antennas, beacons
  antenna(g, sF(9.0), VT - 0.01, 0.3, 0.34);
  antenna(g, sF(17.4), VT - 0.01, 0.33, 0.4);
  antenna(g, T(27.7), VT - 0.01, 0.3, 0.36);
  antenna(g, sF(9.4), VB + 0.02, -0.25, 0.3);
  antenna(g, W(21.5), 1.24, -0.22, 0.28);
  light(g, sF(15.3), VT + 0.03, "#c4392f", 0.06);
  light(g, W(19.1), 1.24, "#c4392f", 0.06);

  // ================= horizontal stabiliser (root on the tail cone) =================
  const under = [["M", T(34.85), 4.47], ["L", T(37.9), 4.6], ["L", T(38.12), 3.6], ["L", T(35.8), 2.6], ["C", T(35.3), 3.3, T(35.05), 3.9, T(34.85), 4.47], ["Z"]];
  add(`<g clip-path="${clip}"><path d="${g.d(under)}" fill="${g.lgrad([T(36.5), 4.4], [T(36.8), 3.2], [[0, "#83898e"], [1, "#696e73"]])}" ${st(0.5, OUT_D)}/></g>`);
  path([["M", T(37.9), 4.6], ["L", T(38.1), 3.9]], `fill="none" ${st(0.5, OUT_D)}`);
  path([["M", T(34.85), 4.47], ["L", T(40.76), 5.64], ["C", T(40.86), 5.64, T(40.86), 5.58, T(40.74), 5.54], ["L", T(37.9), 4.6], ["L", T(35.6), 4.12], ["Z"]], `fill="${g.lgrad([T(37), 4.9], [T(37.05), 4.3], [[0, "#4b4f54"], [1, "#5d6267"]])}" ${st(0.5, OUT_D)}`);
  path([["M", T(35.0), 4.46], ["L", T(40.7), 5.6]], `fill="none" ${st(0.6, "#8e9399")}`);
  add(`<g fill="#55595e">${[[36.3, 3.4], [36.8, 3.58], [37.3, 3.76], [37.8, 3.92]].map(([u, v]) => `<circle cx="${f(g.X(T(u)))}" cy="${f(g.Y(v))}" r="${f(0.035 * S)}"/>`).join("")}</g>`);
  path([["M", T(34.8), 4.62], ["L", T(34.8), 5.0]], `fill="none" ${st(2.0, "#3c4146")}`); // jackscrew fairing vent
  // APU exhaust at the tail end
  add(`<ellipse cx="${f(g.X(T(39.14)))}" cy="${f(g.Y(4.42))}" rx="${f(0.05 * S)}" ry="${f(0.13 * S)}" fill="#3a3f44"/>`);

  // ================= main-gear bay, body fairing =================
  const canoe = [["M", W(20.0), 2.44], ["C", W(21.2), 2.5, W(22.9), 2.46, W(23.8), 2.12], ["C", W(24.25), 1.92, W(24.05), 1.6, W(23.4), 1.55], ["C", W(22.6), 1.5, W(21.8), 1.46, W(21.15), 1.42], ["Z"]];
  path(canoe, `fill="${grad(2.5, 1.45, [[0, "#f3f4f5"], [0.5, "#e2e4e7"], [1, "#a7adb2"]])}" ${st(0.45, OUT)}`);
  // gear bay and the shadow it throws across the front of the canoe
  const well = [["M", W(16.6), 2.62], ["L", W(20.85), 2.48], ["L", W(21.8), 1.44], ["L", W(21.2), 1.25], ["L", W(17.3), 1.24], ["Z"]];
  add(`<g clip-path="${clip}"><path d="${g.d(well)}" fill="${grad(2.6, 1.25, [[0, "#454a4f"], [1, "#2b2f33"]])}"/></g>`);
  path([["M", W(20.85), 2.48], ["L", W(21.8), 1.44]], `fill="none" ${st(0.4, "#5c6166")}`);
  path([["M", W(22.3), 2.47], ["L", W(22.3), 1.5]], `fill="none" ${st(0.35, "#c3c7cb")}`);

  // ================= landing gear =================
  gearMain(g, W(19.54), 0.565);
  gearNose(g, 4.02, 0.335);

  // ================= wing =================
  const LE = [[W(15.6), 2.68], [W(18.0), 2.98], [W(21.0), 3.44], [W(23.85), 3.99]];
  const HL = [[W(16.4), 2.3], [W(19.0), 2.66], [W(21.6), 3.16], [W(24.4), 3.86]]; // front of the flaps
  const TE = [[W(18.6), 2.2], [W(20.6), 2.56], [W(22.7), 3.07], [W(24.95), 3.8]];
  path([["M", ...LE[0]], ...cr(LE), ["C", W(24.25), 4.02, W(24.75), 3.95, W(24.95), 3.8], ...cr([...TE].reverse()), ["L", W(16.0), 2.2], ["Z"]],
    `fill="${g.lgrad([W(19.5), 3.1], [W(19.8), 2.3], [[0, "#62676d"], [0.6, "#52575c"], [1, "#45494e"]])}" ${st(0.5, OUT_D)}`);
  path([["M", ...HL[1]], ...cr(HL.slice(1)), ["L", W(24.95), 3.8], ...cr([...TE].reverse().slice(0, 3)), ["Z"]],
    `fill="${g.lgrad([W(21.5), 3.15], [W(21.7), 2.75], [[0, "#9aa0a5"], [1, "#7d8389"]])}" ${st(0.4, OUT_D)}`);
  add(`<g fill="none" ${st(0.4, "#62686e")}>${[[W(21.0), 2.95, W(20.95), 2.68], [W(22.7), 3.36, W(22.65), 3.07], [W(23.75), 3.66, W(23.7), 3.42]].map(([a, b, c, d]) => `<path d="${g.d([["M", a, b], ["L", c, d]])}"/>`).join("")}</g>`);
  path([["M", ...LE[0]], ...cr(LE)], `fill="none" ${st(2.0, "#dfe2e5")}`); // lit leading edge / slats
  path([["M", ...LE[0]], ...cr(LE)], `fill="none" ${st(0.5, OUT)}`);
  const ftf = (u, v, len, h) => [["M", u, v], ["C", u + len * 0.4, v + h * 0.15, u + len * 0.8, v - h * 0.1, u + len, v - h * 0.55], ["C", u + len * 0.7, v - h * 0.95, u + len * 0.3, v - h, u + 0.05, v - h * 0.6], ["Z"]];
  for (const [u, v, len, h] of [[W(21.5), 3.08, 1.75, 0.22], [W(22.75), 3.38, 1.5, 0.19], [W(23.8), 3.66, 1.25, 0.16]])
    path(ftf(u, v, len, h), `fill="${grad(v + 0.03, v - h, [[0, "#d9dcdf"], [1, "#9ba1a6"]])}" ${st(0.4, OUT_D)}`);
  if (winglets) {
    const wl = [["M", W(23.75), 3.99], ["C", W(24.6), 4.12, W(25.1), 4.6, W(25.6), 5.4], ["L", W(26.68), 6.74], ["C", W(26.78), 6.8, W(26.92), 6.78, W(26.95), 6.69], ["L", W(25.95), 5.2], ["C", W(25.55), 4.55, W(25.25), 4.05, W(24.95), 3.8], ["Z"]];
    path(wl, `fill="${g.lgrad([W(25.0), 5.2], [W(26.3), 5.0], [[0, "#ffffff"], [0.5, "#f3f4f5"], [1, "#d6d9dc"]])}" ${st(0.6, OUT)}`);
    path([["M", W(24.45), 4.12], ["C", W(25.0), 4.45, W(25.4), 4.95, W(25.75), 5.5], ["L", W(26.6), 6.62]], `fill="none" ${st(0.4, "#d0d4d8")}`);
    add(`<circle cx="${f(g.X(W(26.82)))}" cy="${f(g.Y(6.64))}" r="${f(0.05 * S)}" fill="#3b9b58"/>`);
  }

  // ================= engine and pylon =================
  engineCfm56(g, W(13.0), 1.51);

  return g.svg(title);
}

/** CFM56-7B in its 737 nacelle: inlet lip, fan cowl with the flattened lower lip, reverser, core and plug. */
function engineCfm56(g, u0, vc) {
  const add = (s) => g.add(s);
  const path = (cmds, attrs) => add(`<path d="${g.d(cmds)}" ${attrs}/>`);
  const len = 4.25, r = 1.05, ue = u0 + len, rb = 0.92; // r = top radius, rb = flattened lower radius
  // aft pylon fairing under the wing and the exhaust (fan nozzle, core cowl, small plug)
  path([["M", ue - 0.5, vc + 0.75], ["L", ue + 1.4, vc + 0.95], ["C", ue + 1.9, vc + 0.85, ue + 2.2, vc + 0.65, ue + 2.3, vc + 0.45], ["L", ue + 0.6, vc + 0.3], ["Z"]], `fill="${g.vgrad(vc + 1, vc + 0.3, [[0, "#5a5f64"], [1, "#3e4247"]])}"`);
  const c0 = 0.58, c1 = 0.44, cl = 1.15, cu = ue + cl;
  path([["M", ue - 0.3, vc + c0], ["C", ue + 0.4, vc + c0, ue + 0.9, vc + c1 + 0.03, cu, vc + c1], ["L", cu, vc - c1], ["C", ue + 0.9, vc - c1 - 0.03, ue + 0.4, vc - c0, ue - 0.3, vc - c0], ["Z"]],
    `fill="${g.vgrad(vc + c0, vc - c0, [[0, "#8a9096"], [0.3, "#6a7076"], [1, "#373b40"]])}" ${st(0.45, "#4a4f54")}`);
  add(`<g fill="none" ${st(0.4, "#4d5257")}>${[0.25, 0.55, 0.85].map((t) => `<path d="${g.d([["M", ue + cl * t, vc + c0 - (c0 - c1) * t], ["L", ue + cl * t, vc - c0 + (c0 - c1) * t]])}"/>`).join("")}</g>`);
  path([["M", cu, vc + 0.3], ["C", cu + 0.18, vc + 0.28, cu + 0.32, vc + 0.1, cu + 0.36, vc], ["C", cu + 0.32, vc - 0.1, cu + 0.18, vc - 0.28, cu, vc - 0.3], ["Z"]],
    `fill="${g.vgrad(vc + 0.3, vc - 0.3, [[0, "#6d6862"], [1, "#2f2c29"]])}"`);
  // fan cowl
  const cowl = [["M", u0, vc + r * 0.9], ["C", u0 + 0.25, vc + r * 1.0, u0 + 0.9, vc + r, u0 + 1.6, vc + r], ["C", u0 + 2.6, vc + r, u0 + 3.6, vc + r * 0.92, ue, vc + 0.82],
    ["L", ue, vc - 0.78], ["C", u0 + 3.6, vc - rb * 0.95, u0 + 2.4, vc - rb, u0 + 1.4, vc - rb], ["C", u0 + 0.7, vc - rb, u0 + 0.25, vc - rb * 0.95, u0 + 0.02, vc - rb * 0.82],
    ["C", u0 - 0.2, vc - rb * 0.55, u0 - 0.22, vc + r * 0.55, u0, vc + r * 0.9], ["Z"]];
  const cd = g.d(cowl);
  add(`<path d="${cd}" fill="${g.vgrad(vc + r, vc - rb, [[0, "#e4e6e8"], [0.08, "#f7f8f8"], [0.3, "#ffffff"], [0.62, "#f1f2f3"], [1, "#dcdfe2"]])}" ${st(0.6, OUT)}/>`);
  innerShade(g, cd, { dy: -0.32, blur: 0.3, opacity: 0.5, color: "#30353a", mx: 0.3, my: 0.6 });
  innerShade(g, cd, { dx: 0.12, dy: 0, blur: 0.12, opacity: 0.25, color: "#41474d", mx: 0.3, my: 0.3 });
  const cl2 = g.clip(cd);
  add(`<g clip-path="${cl2}">` +
    `<path d="${g.d([["M", u0 + 0.12, vc + r + 0.1], ["C", u0 + 0.3, vc + 0.4, u0 + 0.3, vc - 0.4, u0 + 0.12, vc - rb - 0.1]])}" fill="none" ${st(0.45, "#c3c8cc")}/>` +
    `<path d="${g.d([["M", u0 + 1.55, vc + r + 0.1], ["C", u0 + 1.6, vc + 0.3, u0 + 1.6, vc - 0.3, u0 + 1.55, vc - rb - 0.1]])}" fill="none" ${st(0.4, "#d4d7da")}/>` +
    `<path d="${g.d([["M", u0 + 2.75, vc + r + 0.1], ["C", u0 + 2.8, vc + 0.3, u0 + 2.8, vc - 0.3, u0 + 2.75, vc - rb - 0.1]])}" fill="none" ${st(0.4, "#c7cbcf")}/>` +
    `<path d="${g.d([["M", u0 + 1.62, vc - 0.05], ["L", u0 + 1.62, vc - rb - 0.1]])}" fill="none" ${st(0.9, "#c9473c")}/>` +
    `<circle cx="${f(g.X(u0 + 1.3))}" cy="${f(g.Y(vc + 0.33))}" r="${f(0.07 * S)}" fill="none" ${st(0.6, "#c9473c")}/>` +
    `</g>`);
}

function wheel(g, u, r) {
  const t = g.rgrad(u, r, r, [[0, "#3a3f44"], [0.75, "#2a2e32"], [0.93, "#1c1f22"], [1, "#111315"]]);
  const h = g.rgrad(u - r * 0.12, r + r * 0.12, r * 0.5, [[0, "#f0f1f2"], [0.6, "#c3c8cc"], [1, "#8b9197"]]);
  let s = `<circle cx="${f(g.X(u))}" cy="${f(g.Y(r))}" r="${f(r * S)}" fill="${t}"/>`;
  s += `<circle cx="${f(g.X(u))}" cy="${f(g.Y(r))}" r="${f(r * 0.5 * S)}" fill="${h}" ${st(0.5, "#5f656b")}/>`;
  s += `<circle cx="${f(g.X(u))}" cy="${f(g.Y(r))}" r="${f(r * 0.33 * S)}" fill="none" ${st(0.45, "#8d939a")}/>`;
  for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3 + 0.3; s += `<circle cx="${f(g.X(u + Math.cos(a) * r * 0.24))}" cy="${f(g.Y(r + Math.sin(a) * r * 0.24))}" r="${f(0.022 * S)}" fill="#6f767c"/>`; }
  s += `<circle cx="${f(g.X(u))}" cy="${f(g.Y(r))}" r="${f(r * 0.12 * S)}" fill="#9aa0a6" ${st(0.3, "#5f656b")}/>`;
  return s;
}

function gearMain(g, u, r) {
  const s = [];
  const strut = g.lgrad([u - 0.16, 1], [u + 0.16, 1], [[0, "#8e959c"], [0.35, "#e4e7e9"], [1, "#7d848b"]]);
  s.push(`<path d="${g.poly([[u - 0.14, 1.45], [u + 0.14, 1.45], [u + 0.12, r + 0.32], [u - 0.12, r + 0.32]])}" fill="${strut}" ${st(0.4, "#5f666d")}/>`);
  s.push(`<path d="${g.poly([[u - 0.08, r + 0.36], [u + 0.08, r + 0.36], [u + 0.07, r], [u - 0.07, r]])}" fill="${g.lgrad([u - 0.08, 1], [u + 0.08, 1], [[0, "#9aa1a8"], [0.4, "#f6f7f8"], [1, "#8b9198"]])}"/>`);
  s.push(`<path d="${g.d([["M", u + 0.12, r + 0.7], ["L", u + 0.36, r + 0.45], ["L", u + 0.1, r + 0.18]])}" fill="none" ${st(1.1, "#6d747b")}/>`); // torque links
  s.push(`<path d="${g.d([["M", u - 0.1, 1.3], ["L", u - 0.75, 1.42]])}" fill="none" ${st(1.4, "#5c6269")}/>`); // side brace
  s.push(wheel(g, u, r));
  g.add(`<g>${s.join("")}</g>`);
  g.see(u, 0);
}

function gearNose(g, u, r) {
  const s = [];
  s.push(`<path d="${g.d([["M", 2.4, 1.6], ["L", 3.5, 1.5], ["L", 3.46, 1.08], ["L", 2.42, 1.16], ["Z"]])}" fill="${g.vgrad(1.6, 1.08, [[0, "#eceef0"], [1, "#c3c8cc"]])}" ${st(0.5, OUT)}/>`); // open forward doors
  const ua = u + 0.06;
  s.push(`<path d="${g.poly([[ua - 0.09, 1.45], [ua + 0.09, 1.45], [ua + 0.07, r + 0.25], [ua - 0.07, r + 0.25]])}" fill="${g.lgrad([ua - 0.1, 1], [ua + 0.1, 1], [[0, "#8e959c"], [0.4, "#e4e7e9"], [1, "#7d848b"]])}" ${st(0.35, "#5f666d")}/>`);
  s.push(`<path d="${g.poly([[u - 0.05, r + 0.3], [u + 0.05, r + 0.3], [u + 0.04, r], [u - 0.04, r]])}" fill="#e7e9eb" ${st(0.3, "#7d848b")}/>`);
  s.push(`<path d="${g.d([["M", ua + 0.08, r + 0.55], ["L", ua + 0.25, r + 0.36], ["L", ua + 0.06, r + 0.16]])}" fill="none" ${st(0.9, "#6d747b")}/>`);
  s.push(`<path d="${g.d([["M", ua - 0.08, 1.2], ["L", ua - 0.62, 1.42]])}" fill="none" ${st(1.0, "#6d747b")}/>`); // drag brace
  s.push(`<rect x="${f(g.X(u - 0.62))}" y="${f(g.Y(0.98))}" width="${f(0.42 * S)}" height="${f(0.16 * S)}" rx="${f(0.04 * S)}" fill="${g.vgrad(0.98, 0.82, [[0, "#c9cdd1"], [1, "#868d94"]])}" ${st(0.35, "#5f666d")}/>`); // taxi light
  s.push(wheel(g, u, r));
  g.add(`<g>${s.join("")}</g>`);
  g.see(u, 0);
}
