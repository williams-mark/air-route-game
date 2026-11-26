// McDonnell Douglas DC-10. Base is the DC-10-30: length 55.50 m (including the tail engine), span 50.40 m,
// height 17.70 m, fuselage 6.02 m diameter. Engines drawn: GE CF6-50 (wing) and the straight-through tail engine.
// The -30 has a two-wheel centreline main gear between the main bogies.
import { airliner, turbofan, surface, C } from "../lib.mjs";

export function drawDC10({ id = "DC10-30", title = "McDonnell Douglas DC-10-30", centreGear = true } = {}) {
  const VB = 2.0, VT = 8.02;
  const L = 51.6; // aft end of the tail cone below the tail engine
  const dU = [6.25, 15.75, 27.0, 41.2];
  const tailEng = { u0: 44.6, vc: 9.85, len: 7.6, d: 2.95, lipD: 2.7, nozD: 2.2, mixed: true, plug: { len: 1.7, d: 1.05 }, splits: [0.16, 0.62], bulge: 0.22 };
  return airliner({
    id, title, VB, VT,
    fin: {
      cmds: [["M", 40.6, VT - 0.02], ["C", 42.6, VT + 0.04, 44.2, VT + 0.2, 45.4, 8.5], ["L", 46.9, 11.2], ["L", 50.2, 17.7], ["L", 53.6, 17.7], ["L", 52.8, 11.0], ["L", 51.8, 8.4], ["L", 48.0, 7.6], ["Z"]],
      gradU: [47, 53.6],
      hinge: [[["M", 52.6, 17.5], ["L", 51.9, 11.25]], [["M", 50.25, 17.55], ["L", 53.58, 17.55]]],
    },
    nose: [0, 4.5],
    top: [
      ["C", 0.1, 5.3, 0.7, 6.15, 1.7, 6.8],
      ["C", 2.8, 7.45, 4.3, 7.95, 6.3, 8.0],
      ["L", 7.2, VT],
      ["L", 40.0, VT],
      ["C", 44.0, VT, 47.5, 8.0, 51.4, 7.5],
      ["L", L, 6.8],
    ],
    bottom: [
      ["C", L - 2.5, 5.6, L - 6.8, 3.6, L - 11.0, 2.55],
      ["C", L - 13.0, 2.2, L - 14.5, VB + 0.02, L - 16.0, VB],
      ["L", 32.6, VB],
      ["C", 31.2, VB - 0.42, 19.6, VB - 0.42, 18.0, VB],
      ["L", 6.8, VB],
      ["C", 4.7, VB + 0.02, 2.5, 2.4, 1.25, 3.05],
      ["C", 0.45, 3.5, 0.05, 4.0, 0, 4.5],
    ],
    seams: [
      [["M", 5.4, VT + 0.2], ["C", 5.3, 6.4, 5.3, 3.4, 5.4, VB - 0.2]],
      [["M", 13.0, VT + 0.2], ["L", 13.0, VB - 0.2]],
      [["M", 18.0, VT + 0.2], ["L", 18.0, VB - 0.4]],
      [["M", 34.6, VT + 0.2], ["L", 34.6, VB - 0.2]],
      [["M", 46.0, VT + 0.2], ["C", 45.9, 6.4, 45.9, 4.4, 46.0, 3.4]],
      [["M", 18.2, VB - 0.05], ["C", 19.8, VB - 0.48, 31.0, VB - 0.48, 32.4, VB - 0.05]],
    ],
    windows: [{ v: 5.9, w: 0.25, h: 0.37, pitch: 0.508, from: 8.0, to: 42.8, skip: [...dU.slice(1).map((u) => [u - 0.62, u + 0.62]), [21.2, 21.7], [33.8, 34.3]] }],
    doors: [
      ...dU.map((u) => ({ u, vBot: 4.78, w: 1.07, h: 1.93, kind: "pax", r: 0.24 })),
      { u: 10.8, vBot: VB + 0.55, w: 2.64, h: 1.68, kind: "cargo", r: 0.15 },
      { u: 37.8, vBot: VB + 0.6, w: 1.78, h: 1.68, kind: "cargo", r: 0.15 },
    ],
    cockpit: [
      [[1.92, 5.82], [2.18, 6.2], [2.64, 6.42], [2.68, 5.82]],
      [[2.78, 5.82], [2.75, 6.46], [3.52, 6.68], [3.56, 5.82]],
      [[3.66, 5.82], [3.64, 6.7], [4.24, 6.78], [4.42, 5.88]],
      [[2.85, 6.66], [2.95, 6.8], [3.3, 6.88], [3.31, 6.76]],
      [[3.45, 6.8], [3.46, 6.92], [3.85, 6.96], [3.85, 6.84]],
    ],
    dots: [[3.6, 4.85], [3.85, 4.85], [44.0, 5.0, 0.07]],
    antennas: [[10.4, VT - 0.01, 0.42, 0.5], [24.0, VT - 0.01, 0.4, 0.5], [12.0, VB + 0.01, -0.36, 0.42]],
    lights: [[17.0, VT + 0.05, 0.09], [27.0, VB - 0.4, 0.09]],
    shadows: [[[21.0, 3.2], [30.6, 2.1], [30.8, VB - 0.35], [21.3, VB - 0.35]]],
    gear: [
      ...(centreGear ? [{ u: 28.6, vTop: VB - 0.2, r: 0.56, lean: 0.06, strutW: 0.2 }] : []),
      { u: 26.25, vTop: VB + 0.05, r: 0.6, lean: 0.1, strutW: 0.26, wheels: [-0.82, 0.82], bogie: true },
      { u: 4.15, vTop: VB + 0.05, r: 0.53, lean: 0.06, strutW: 0.16, doors: [[[3.3, VB + 0.05], [5.1, VB + 0.05], [5.05, VB - 0.55], [3.38, VB - 0.55]]] },
    ],
    stab: { le: [[44.0, 6.3], [54.6, 8.05]], te: [[46.7, 5.4], [53.9, 7.82]] },
    wing: {
      le: [[20.4, 3.0], [22.0, 3.25], [35.0, 5.3]],
      te: [[30.9, 2.0], [31.8, 2.72], [37.6, 5.18]],
      lines: [0.12, 0.68],
      fairings: [[28.8, 2.6, 3.2, 0.55], [30.4, 3.4, 2.9, 0.48], [32.1, 4.2, 2.5, 0.4]],
    },
    engines: [{ pylon: "auto", fan: { u0: 15.9, vc: 2.85, len: 3.6, d: 2.75, lipD: 2.5, nozD: 2.25, core: { len: 2.55, d1: 0.95 }, plug: { len: 0.9, d: 0.55 }, splits: [0.34, 0.66], bulge: 0.33 } }],
    front: [
      (g) => {
        // tail engine through the fin root: nacelle, then the fin's lower fairing over it
        // fairing between the fuselage crown and the nacelle
        g.add(`<path d="${g.d([["M", 44.9, 8.05], ["C", 46.5, 8.25, 48.5, 8.45, 52.0, 8.5], ["L", 52.0, 7.45], ["C", 49.5, 7.75, 47.0, 7.95, 44.9, 8.05], ["Z"]])}" fill="${g.vgrad(8.5, 7.45, [[0, "#eceef0"], [1, "#d3d7db"]])}" stroke="${C.line}" stroke-width="0.7"/>`);
        turbofan(g, tailEng);
        surface(g, [["M", 46.4, 11.18], ["L", 52.9, 11.0], ["L", 52.75, 10.6], ["L", 46.6, 10.75], ["Z"]], { fill: g.vgrad(11.2, 10.6, [[0, "#f6f7f8"], [1, "#d5d9dd"]]), w: 0.6 });
        g.add(`<path d="${g.d([["M", 45.1, 8.36], ["C", 46.5, 8.1, 49.8, 7.9, 51.6, 7.95]])}" fill="none" stroke="${C.line}" stroke-width="0.6"/>`);
      },
    ],
  });
}
