// Drawing library for the white-tail side views in public/aircraft/*.svg.
// Units are metres: u runs aft from the nose tip, v runs up from the ground. Nose points left.
// Shapes are drawing approximations fitted to published dimensions (see SOURCES.md, "Aircraft side views");
// they are artwork, not simulation data.

export const S = 20; // SVG units per metre

const f = (n) => (Math.round(n * 100) / 100).toString();

/** One drawing: collects layers and tracks the extents so the viewBox fits the aircraft. */
export class Drawing {
  constructor(id) {
    this.id = id.replace(/[^A-Za-z0-9]/g, "");
    this.defs = [];
    this.layers = [];
    this.minU = Infinity; this.maxU = -Infinity; this.maxV = 0;
    this.n = 0;
  }
  uid(p) { return `${this.id}-${p}${this.n++}`; }
  see(u, v) { if (u < this.minU) this.minU = u; if (u > this.maxU) this.maxU = u; if (v > this.maxV) this.maxV = v; }
  X(u) { return u * S; }
  Y(v) { return -v * S; }
  /** Path from commands in metres: ["M",u,v], ["L",u,v], ["C",u1,v1,u2,v2,u,v], ["Q",u1,v1,u,v], ["A",ru,rv,rot,large,sweep,u,v], ["Z"]. */
  d(cmds) {
    let out = "";
    for (const c of cmds) {
      const [k, ...a] = c;
      if (k === "Z") { out += "Z"; continue; }
      if (k === "A") {
        const [rx, ry, rot, large, sweep, u, v] = a; this.see(u, v);
        out += `A${f(rx * S)} ${f(ry * S)} ${rot} ${large} ${sweep} ${f(this.X(u))} ${f(this.Y(v))}`;
        continue;
      }
      out += k;
      for (let i = 0; i < a.length; i += 2) { this.see(a[i], a[i + 1]); out += `${i ? " " : ""}${f(this.X(a[i]))} ${f(this.Y(a[i + 1]))}`; }
    }
    return out;
  }
  poly(pts) { return this.d([["M", ...pts[0]], ...pts.slice(1).map((p) => ["L", ...p]), ["Z"]]); }
  add(svg) { this.layers.push(svg); }
  def(svg) { this.defs.push(svg); }

  /** Vertical gradient between two heights (metres), stops as [offset, colour]. */
  vgrad(v0, v1, stops) {
    const id = this.uid("g");
    this.def(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${f(this.Y(v0))}" x2="0" y2="${f(this.Y(v1))}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ""}/>`).join("")}</linearGradient>`);
    return `url(#${id})`;
  }
  /** Gradient along an arbitrary line (metres). */
  lgrad(p0, p1, stops) {
    const id = this.uid("g");
    this.def(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(this.X(p0[0]))}" y1="${f(this.Y(p0[1]))}" x2="${f(this.X(p1[0]))}" y2="${f(this.Y(p1[1]))}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ""}/>`).join("")}</linearGradient>`);
    return `url(#${id})`;
  }
  rgrad(cu, cv, r, stops, fu, fv) {
    const id = this.uid("g");
    this.def(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(this.X(cu))}" cy="${f(this.Y(cv))}" r="${f(r * S)}"${fu !== undefined ? ` fx="${f(this.X(fu))}" fy="${f(this.Y(fv))}"` : ""}>${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ""}/>`).join("")}</radialGradient>`);
    return `url(#${id})`;
  }
  clip(d) {
    const id = this.uid("c");
    this.def(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    return `url(#${id})`;
  }

  svg(title) {
    const pad = 0.6;
    const x0 = (this.minU - pad) * S, x1 = (this.maxU + pad) * S;
    const y0 = -(this.maxV + pad) * S, y1 = 0.25 * S;
    const w = x1 - x0, h = y1 - y0;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x0)} ${f(y0)} ${f(w)} ${f(h)}" width="${Math.round(w)}" height="${Math.round(h)}" role="img" aria-label="${title}">` +
      `<title>${title}</title><defs>${this.defs.join("")}</defs>${this.layers.join("")}</svg>\n`;
  }
}

// ---------- palette ----------
export const C = {
  line: "#878e96",
  lineSoft: "#a9b0b7",
  panel: "#c3c8cd",
  body: [[0, "#f4f5f6"], [0.08, "#ffffff"], [0.42, "#fafbfb"], [0.68, "#eceef0"], [0.88, "#d6dade"], [1, "#bfc5ca"]],
  fin: [[0, "#ffffff"], [1, "#eceef1"]],
  wingUnder: [[0, "#eceef0"], [0.12, "#cfd3d8"], [0.55, "#a9afb5"], [1, "#8e959c"]],
  metal: [[0, "#a7adb3"], [0.5, "#80878e"], [1, "#5d636a"]],
  glass: [[0, "#4b545d"], [0.35, "#2b3238"], [1, "#1e2429"]],
  tyre: "#24282c",
};

const st = (w = 1, c = C.line) => `stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

// ---------- fuselage ----------
/**
 * Fuselage outline: `top` runs nose tip to tail tip, `bottom` runs tail tip back to the nose tip (both command lists
 * without the leading M). Returns the path d (also used as the clip for windows, doors and panel lines).
 */
export function fuselage(g, { nose, top, bottom, vBot, vTop, extra = [] }) {
  const d = g.d([["M", ...nose], ...top, ...bottom, ["Z"]]);
  const fill = g.vgrad(vTop, vBot, C.body);
  g.add(`<path d="${d}" fill="${fill}" ${st(1.1)}/>`);
  for (const e of extra) g.add(e);
  return d;
}

/** Soft shading on the lower nose and tail cone, clipped to the fuselage. */
export function bodyShade(g, clip, { vBot, vTop }) {
  const h = vTop - vBot;
  const sh = g.vgrad(vBot + h * 0.45, vBot, [[0, "#000", 0], [1, "#3b4148", 0.10]]);
  g.add(`<g clip-path="${clip}"><rect x="${f(g.X(-5))}" y="${f(g.Y(vBot + h * 0.45))}" width="${f(g.X(200))}" height="${f(h * 0.45 * S + 40)}" fill="${sh}"/></g>`);
  const hl = g.vgrad(vTop, vTop - h * 0.22, [[0, "#fff", 0], [0.5, "#fff", 0.9], [1, "#fff", 0]]);
  g.add(`<g clip-path="${clip}"><rect x="${f(g.X(-5))}" y="${f(g.Y(vTop))}" width="${f(g.X(200))}" height="${f(h * 0.22 * S)}" fill="${hl}"/></g>`);
}

/** Lines drawn inside the fuselage clip (panel joins, seams). Each item is a command list. */
export function lines(g, clip, items, w = 0.6, c = C.panel) {
  g.add(`<g clip-path="${clip}" fill="none" ${st(w, c)}>${items.map((cmds) => `<path d="${g.d(cmds)}"/>`).join("")}</g>`);
}

/** Row of cabin windows: centre height v, size w x h, every `pitch` from `from` to `to`, skipping ranges. */
export function windowRow(g, clip, { v, w = 0.25, h = 0.36, pitch = 0.508, from, to, skip = [], list }) {
  const us = list ?? [];
  if (!list) for (let u = from; u <= to + 1e-6; u += pitch) if (!skip.some(([a, b]) => u > a && u < b)) us.push(u);
  const fill = g.vgrad(v + h / 2, v - h / 2, C.glass);
  const r = Math.min(w, h) * 0.42;
  const rects = us.map((u) => `<rect x="${f(g.X(u - w / 2))}" y="${f(g.Y(v + h / 2))}" width="${f(w * S)}" height="${f(h * S)}" rx="${f(r * S)}"/>`).join("");
  const hi = us.map((u) => `<rect x="${f(g.X(u - w / 2 + 0.03))}" y="${f(g.Y(v + h / 2 - 0.03))}" width="${f((w - 0.06) * S)}" height="${f(h * 0.28 * S)}" rx="${f(r * 0.7 * S)}"/>`).join("");
  g.add(`<g clip-path="${clip}"><g fill="${fill}" ${st(0.3, "#4a5158")}>${rects}</g><g fill="#ffffff" opacity="0.1">${hi}</g></g>`);
  g.see(us[0] ?? 0, v);
}

/** Door outline: centre u, sill height vBot, width w, height h. kind: pax (with porthole and handle), service, exit, cargo, overwing. */
export function door(g, clip, { u, vBot, w, h, kind = "pax", r = 0.18 }) {
  const x = g.X(u - w / 2), y = g.Y(vBot + h);
  let s = `<rect x="${f(x)}" y="${f(y)}" width="${f(w * S)}" height="${f(h * S)}" rx="${f(r * S)}" fill="none" ${st(0.6, "#7f868d")}/>`;
  s += `<rect x="${f(x + 0.04 * S)}" y="${f(y + 0.04 * S)}" width="${f((w - 0.08) * S)}" height="${f((h - 0.08) * S)}" rx="${f(Math.max(0.02, r - 0.04) * S)}" fill="none" ${st(0.3, "#d5d9dc")}/>`;
  if (kind === "pax" || kind === "exit") {
    const pw = 0.2, ph = 0.26, pu = u, pv = vBot + h * 0.74;
    s += `<rect x="${f(g.X(pu - pw / 2))}" y="${f(g.Y(pv + ph / 2))}" width="${f(pw * S)}" height="${f(ph * S)}" rx="${f(0.08 * S)}" fill="${g.vgrad(pv + ph / 2, pv - ph / 2, C.glass)}" ${st(0.4, "#5c636b")}/>`;
    s += `<rect x="${f(g.X(u - 0.09))}" y="${f(g.Y(vBot + h * 0.5 + 0.03))}" width="${f(0.18 * S)}" height="${f(0.06 * S)}" rx="${f(0.03 * S)}" fill="#9aa1a8"/>`;
  }
  if (kind === "overwing") {
    const pw = w * 0.5, ph = h * 0.38, pv = vBot + h * 0.6;
    s += `<rect x="${f(g.X(u - pw / 2))}" y="${f(g.Y(pv + ph / 2))}" width="${f(pw * S)}" height="${f(ph * S)}" rx="${f(pw * 0.4 * S)}" fill="${g.vgrad(pv + ph / 2, pv - ph / 2, C.glass)}" ${st(0.4, "#5c636b")}/>`;
  }
  if (kind === "cargo" || kind === "service") {
    g.add(`<g clip-path="${clip}"><rect x="${f(x)}" y="${f(y)}" width="${f(w * S)}" height="${f(h * S)}" rx="${f(r * S)}" fill="none" ${st(0.35, "#c9cdd1")}/></g>`);
    return;
    s += `<rect x="${f(g.X(u - 0.1))}" y="${f(g.Y(vBot + h * 0.5 + 0.03))}" width="${f(0.2 * S)}" height="${f(0.06 * S)}" rx="${f(0.03 * S)}" fill="#a3a9b0"/>`;
  }
  g.add(`<g clip-path="${clip}">${s}</g>`);
}

/** Cockpit windows: list of polygons (metres). */
export function cockpit(g, polys) {
  const vs = polys.flat().map((p) => p[1]);
  const fill = g.vgrad(Math.max(...vs), Math.min(...vs), C.glass);
  g.add(`<g fill="${fill}" ${st(0.6, "#3d444b")}>${polys.map((p) => `<path d="${g.poly(p)}"/>`).join("")}</g>`);
  g.add(`<g fill="#fff" opacity="0.12">${polys.map((p) => { const top = Math.max(...p.map((q) => q[1])); return `<path d="${g.poly(p.map(([u, v]) => [u, v + (top - v) * 0.55]))}"/>`; }).join("")}</g>`);
}

// ---------- flying surfaces ----------
/**
 * Near-side wing seen from the side: the underside shows as a band because of dihedral.
 * le and te are polylines root..tip with the same number of points. Optional fairings: flap-track canoes [u, v, len, h].
 * lines: fractions between LE (0) and TE (1) for spar / flap hinge lines.
 */
export function wing(g, { le, te, fairings = [], lines: fr = [0.14, 0.7], tipCap = true, shade = C.wingUnder }) {
  const pts = [...le, ...[...te].reverse()];
  const grad = g.lgrad(le[0], te[0], shade);
  g.add(`<path d="${g.poly(pts)}" fill="${grad}" ${st(1, C.line)}/>`);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const ls = fr.map((t) => `<path d="${g.d([["M", ...lerp(le[0], te[0], t)], ...le.slice(1).map((p, i) => ["L", ...lerp(p, te[i + 1], t)])])}"/>`);
  // flap / aileron segment breaks
  g.add(`<g fill="none" ${st(0.5, "#9aa1a8")}>${ls.join("")}</g>`);
  // leading-edge highlight
  g.add(`<path d="${g.d([["M", ...le[0]], ...le.slice(1).map((p) => ["L", ...p])])}" fill="none" ${st(1.6, "#ffffff")} opacity="0.7"/>`);
  for (const [u, v, len, h] of fairings) {
    const fill = g.vgrad(v + h * 0.2, v - h, [[0, "#e7e9ec"], [1, "#b6bcc2"]]);
    g.add(`<path d="${g.d([["M", u, v], ["C", u + len * 0.35, v - h * 0.05, u + len * 0.75, v - h, u + len, v - h * 0.55], ["C", u + len * 1.02, v - h * 0.35, u + len * 0.6, v + h * 0.06, u + len * 0.2, v + h * 0.05], ["Z"]])}" fill="${fill}" ${st(0.6, "#8a9199")}/>`);
  }
  if (tipCap) { /* reserved */ }
}

/** Generic filled surface (fin, winglet, stabiliser) from a command list, with optional hinge lines. */
export function surface(g, cmds, { fill, hinge = [], w = 1 } = {}) {
  g.add(`<path d="${g.d(cmds)}" fill="${fill}" ${st(w)}/>`);
  if (hinge.length) g.add(`<g fill="none" ${st(0.55, "#a2a9b0")}>${hinge.map((h) => `<path d="${g.d(h)}"/>`).join("")}</g>`);
}

// ---------- engines ----------
/**
 * High-bypass turbofan pod in side view. u0 = inlet lip, vc = centreline, len = fan cowl length, d = max diameter.
 * core: { len, d1 } core cowl after the fan nozzle (tapers from nozD*0.62 to d1); plug: { len, d }.
 * flat: flattening of the lower inlet (737 CFM56). chevrons: number of visible chevrons on the fan nozzle.
 */
export function turbofan(g, o) {
  const { u0, vc, len, d, lipD = d * 0.9, nozD = d * 0.82, core, plug, flat = 0, chevrons = 0, coreChevrons = 0, splits = [0.32, 0.62], mixed = false, lipW = 0.22, bulge = 0.3, longPylonLine } = o;
  const r = d / 2, rl = lipD / 2, rn = nozD / 2;
  const ue = u0 + len;
  // core cowl and plug (behind the fan cowl)
  if (core && !mixed) {
    const c0 = rn * 0.66, c1 = core.d1 / 2, cu = ue + core.len;
    const fill = g.vgrad(vc + c0, vc - c0, [[0, "#d7dbdf"], [0.5, "#bfc4c9"], [1, "#9aa0a7"]]);
    g.add(`<path d="${g.d([["M", ue - 0.4, vc + c0], ["C", ue + core.len * 0.4, vc + c0, ue + core.len * 0.8, vc + c1 * 1.05, cu, vc + c1], ["L", cu, vc - c1], ["C", ue + core.len * 0.8, vc - c1 * 1.05, ue + core.len * 0.4, vc - c0, ue - 0.4, vc - c0], ["Z"]])}" fill="${fill}" ${st(0.8)}/>`);
    if (coreChevrons) zigzag(g, cu, vc, c1, coreChevrons, 0.16);
    if (plug) {
      const pr = plug.d / 2;
      const pf = g.vgrad(vc + pr, vc - pr, C.metal);
      g.add(`<path d="${g.d([["M", cu - 0.05, vc + pr], ["C", cu + plug.len * 0.45, vc + pr * 0.95, cu + plug.len * 0.85, vc + pr * 0.3, cu + plug.len, vc], ["C", cu + plug.len * 0.85, vc - pr * 0.3, cu + plug.len * 0.45, vc - pr * 0.95, cu - 0.05, vc - pr], ["Z"]])}" fill="${pf}" ${st(0.7, "#555b61")}/>`);
    }
  }
  if (mixed && plug) {
    const pr = plug.d / 2, pf = g.vgrad(vc + pr, vc - pr, C.metal);
    g.add(`<path d="${g.d([["M", ue - 0.05, vc + pr], ["C", ue + plug.len * 0.45, vc + pr * 0.95, ue + plug.len * 0.85, vc + pr * 0.3, ue + plug.len, vc], ["C", ue + plug.len * 0.85, vc - pr * 0.3, ue + plug.len * 0.45, vc - pr * 0.95, ue - 0.05, vc - pr], ["Z"]])}" fill="${pf}" ${st(0.7, "#555b61")}/>`);
  }
  // fan cowl
  const ub = u0 + len * bulge;
  const rb = r - flat; // lower side radius
  const cmds = [
    ["M", u0, vc + rl],
    ["C", u0 + len * 0.06, vc + r * 0.99, ub - len * 0.12, vc + r, ub, vc + r],
    ["C", ub + len * 0.3, vc + r, ue - len * 0.18, vc + rn * 1.04, ue, vc + rn],
    ["L", ue, vc - rn],
    ["C", ue - len * 0.18, vc - rn * 1.04, ub + len * 0.3, vc - rb, ub, vc - rb],
    ["C", ub - len * 0.12, vc - rb, u0 + len * 0.06, vc - rl * (flat ? 0.88 : 0.99), u0, vc - rl * (flat ? 0.86 : 1)],
    ["C", u0 - lipW, vc - rl * 0.6, u0 - lipW, vc + rl * 0.6, u0, vc + rl],
    ["Z"],
  ];
  const fill = g.vgrad(vc + r, vc - r, [[0, "#eef0f2"], [0.12, "#ffffff"], [0.45, "#f4f5f6"], [0.75, "#dcdfe3"], [1, "#a9afb6"]]);
  const dd = g.d(cmds);
  g.add(`<path d="${dd}" fill="${fill}" ${st(1.1)}/>`);
  const cl = g.clip(dd);
  // inlet lip ring
  const lf = g.lgrad([u0 - lipW, vc], [u0 + 0.5, vc], [[0, "#cfd4d9"], [0.45, "#f7f8f9"], [1, "#ffffff", 0]]);
  g.add(`<g clip-path="${cl}"><path d="${g.d([["M", u0 + 0.05, vc + rl * 1.1], ["C", u0 + 0.32, vc + rl * 0.5, u0 + 0.32, vc - rl * 0.5, u0 + 0.05, vc - rl * 1.1], ["L", u0 - lipW - 0.1, vc - r], ["L", u0 - lipW - 0.1, vc + r], ["Z"]])}" fill="${lf}"/>` +
    `<path d="${g.d([["M", u0 + 0.05, vc + rl * 1.1], ["C", u0 + 0.32, vc + rl * 0.5, u0 + 0.32, vc - rl * 0.5, u0 + 0.05, vc - rl * 1.1]])}" fill="none" ${st(0.5, "#b4bac0")}/>` +
    splits.map((s) => { const uu = u0 + len * s; return `<path d="${g.d([["M", uu, vc + r + 0.1], ["C", uu + 0.08, vc + r * 0.3, uu + 0.08, vc - r * 0.3, uu, vc - r - 0.1]])}" fill="none" ${st(0.55, "#a8afb5")}/>`; }).join("") +
    `</g>`);
  if (chevrons) zigzag(g, ue, vc, rn, chevrons, 0.22);
  if (o.redLine !== undefined) { const uu = u0 + len * o.redLine; g.add(`<g clip-path="${cl}"><path d="${g.d([["M", uu, vc + 0.12], ["L", uu, vc - r - 0.2]])}" stroke="#c8473d" stroke-width="1" fill="none"/></g>`); }
  return { ue, vc, r };
}

function zigzag(g, u, vc, r, n, depth) {
  const pts = [];
  for (let i = 0; i <= n * 2; i++) {
    const v = vc + r - (2 * r * i) / (n * 2);
    pts.push(i % 2 ? [u + depth, v] : [u, v]);
  }
  g.add(`<path d="${g.d([["M", ...pts[0]], ...pts.slice(1).map((p) => ["L", ...p])])}" fill="none" ${st(0.5, "#8b9299")}/>`);
}

/** Height of a polyline (root..tip) at u, clamped to its ends. */
export function vAt(line, u) {
  if (u <= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) if (u <= line[i][0]) { const [a, b] = [line[i - 1], line[i]]; return a[1] + ((b[1] - a[1]) * (u - a[0])) / (b[0] - a[0]); }
  return line[line.length - 1][1];
}
/** Pylon for an underwing pod: rises from the nacelle top to the wing leading edge, fairs aft over the core. */
export function autoPylon(le, fan) {
  const { u0, vc, len, d, core } = fan;
  const r = d / 2, ue = u0 + len, cl = core?.len ?? 1;
  const uA = u0 + len * 0.42, uB = ue + cl * 0.15;
  const vA = Math.max(vAt(le, uA) - 0.06, vc + r * 0.98), vB = Math.max(vAt(le, uB) - 0.25, vc + r * 0.75);
  return [[u0 + len * 0.28, vc + r * 0.9], [uA, vA], [uB, vB], [ue + cl * 0.95, vc + r * 0.32], [ue + cl * 0.6, vc + r * 0.22], [ue - 0.2, vc + r * 0.6]];
}
/** Pylon from a polygon (metres). */
export function pylon(g, pts) {
  const vs = pts.map((p) => p[1]);
  g.add(`<path d="${g.poly(pts)}" fill="${g.vgrad(Math.max(...vs), Math.min(...vs), [[0, "#f7f8f9"], [1, "#d3d7db"]])}" ${st(0.9)}/>`);
}

// ---------- landing gear ----------
function wheel(g, u, r, hubR = 0.42) {
  const fill = g.rgrad(u, r, r, [[0, "#3d434a"], [0.7, "#2a2f34"], [1, "#16191c"]]);
  const hub = g.rgrad(u - r * 0.1, r + r * 0.1, r * hubR, [[0, "#e1e4e7"], [0.7, "#b4bac0"], [1, "#878e95"]]);
  return `<circle cx="${f(g.X(u))}" cy="${f(g.Y(r))}" r="${f(r * S)}" fill="${fill}" ${st(0.6, "#111")}/>` +
    `<circle cx="${f(g.X(u))}" cy="${f(g.Y(r))}" r="${f(r * hubR * S)}" fill="${hub}" ${st(0.5, "#6d747b")}/>` +
    `<circle cx="${f(g.X(u))}" cy="${f(g.Y(r))}" r="${f(r * 0.14 * S)}" fill="#8f969d"/>`;
}

/**
 * Landing gear leg: strut from attach height vTop at u down to the axle; wheels at u + offsets (one bogie if several).
 * r = tyre radius. lean = how far the axle sits aft (+) of the attach point.
 */
export function gear(g, { u, vTop, r, wheels = [0], lean = 0, strutW = 0.22, doors = [], torque = true, bogie = false }) {
  g.see(u, 0);
  const ua = u + lean;
  const strut = g.vgrad(vTop, r, [[0, "#c9ced3"], [1, "#9aa1a8"]]);
  let s = "";
  for (const dd of doors) s += `<path d="${g.poly(dd)}" fill="${g.vgrad(Math.max(...dd.map((p) => p[1])), Math.min(...dd.map((p) => p[1])), [[0, "#f3f4f6"], [1, "#cdd2d6"]])}" ${st(0.7)}/>`;
  // main strut (outer cylinder) and chrome piston
  const pu0 = u, pv0 = vTop, pu1 = ua, pv1 = r + (bogie ? 0.15 : 0.05);
  s += `<path d="${g.poly([[pu0 - strutW, pv0], [pu0 + strutW, pv0], [pu0 + strutW * 0.9 + (pu1 - pu0) * 0.55, pv0 + (pv1 - pv0) * 0.55], [pu0 - strutW * 0.9 + (pu1 - pu0) * 0.55, pv0 + (pv1 - pv0) * 0.55]])}" fill="${strut}" ${st(0.6, "#6f767d")}/>`;
  s += `<path d="${g.poly([[pu0 - strutW * 0.6 + (pu1 - pu0) * 0.5, pv0 + (pv1 - pv0) * 0.5], [pu0 + strutW * 0.6 + (pu1 - pu0) * 0.5, pv0 + (pv1 - pv0) * 0.5], [pu1 + strutW * 0.6, pv1], [pu1 - strutW * 0.6, pv1]])}" fill="${g.lgrad([pu1 - strutW, pv1], [pu1 + strutW, pv1], [[0, "#8d949b"], [0.4, "#eef0f2"], [1, "#8d949b"]])}" ${st(0.5, "#6f767d")}/>`;
  if (torque) {
    const mv = pv0 + (pv1 - pv0) * 0.62;
    s += `<path d="${g.d([["M", pu0 + strutW * 0.9 + (pu1 - pu0) * 0.45, mv + 0.35], ["L", pu1 + strutW + 0.22, mv], ["L", pu1 + strutW * 0.6, pv1 + 0.25]])}" fill="none" ${st(1.3, "#7b828a")}/>`;
  }
  if (bogie && wheels.length > 1) {
    const a = Math.min(...wheels), b = Math.max(...wheels);
    s += `<rect x="${f(g.X(ua + a - 0.1))}" y="${f(g.Y(r + 0.09))}" width="${f((b - a + 0.2) * S)}" height="${f(0.18 * S)}" rx="${f(0.08 * S)}" fill="#8d949b" ${st(0.5, "#5f666d")}/>`;
  }
  for (const w of wheels) s += wheel(g, ua + w, r);
  g.add(`<g>${s}</g>`);
}

// ---------- small details ----------
/** Blade antenna: base at (u, v), height h (negative = below), raked aft. */
export function antenna(g, u, v, h, len = 0.35) {
  const s = Math.sign(h);
  g.add(`<path d="${g.poly([[u, v], [u + len, v], [u + len * 0.95, v + h], [u + len * 0.65, v + h]])}" fill="#e6e9ec" ${st(0.5)}/>`);
  if (s === 0) return;
}
export function light(g, u, v, color = "#d33a2c", r = 0.09) {
  g.add(`<ellipse cx="${f(g.X(u))}" cy="${f(g.Y(v))}" rx="${f(r * 1.3 * S)}" ry="${f(r * S)}" fill="${color}" ${st(0.3, "#6b2a22")}/>`);
}
export function dot(g, u, v, r = 0.05, color = "#8f969d") {
  g.add(`<circle cx="${f(g.X(u))}" cy="${f(g.Y(v))}" r="${f(r * S)}" fill="${color}"/>`);
}
/** Soft dark area (wheel well, wing-root shadow) from a polygon. */
export function shadow(g, pts, opacity = 0.35) {
  const vs = pts.map((p) => p[1]);
  g.add(`<path d="${g.poly(pts)}" fill="${g.vgrad(Math.max(...vs), Math.min(...vs), [[0, "#5d646b", opacity], [1, "#3a4047", opacity * 1.2]])}"/>`);
}
export function raw(g, cmds, attrs) { g.add(`<path d="${g.d(cmds)}" ${attrs}/>`); }
export { st, f };

/** Propeller seen edge-on: hub at (u, v), radius r, n blades; drawn as foreshortened blades plus a faint disc. */
export function propeller(g, { u, v, r, n = 6, phase = 0.2, spinnerLen = 0.9, spinnerR = 0.3 }) {
  let s = `<rect x="${f(g.X(u + 0.05))}" y="${f(g.Y(v + r))}" width="${f(0.22 * S)}" height="${f(2 * r * S)}" rx="${f(0.1 * S)}" fill="#8a929a" opacity="0.18"/>`;
  for (let i = 0; i < n; i++) {
    const a = phase + (i * 2 * Math.PI) / n;
    const len = r * Math.cos(a), depth = r * Math.sin(a) * 0.12;
    const w = 0.13 + Math.abs(Math.sin(a)) * 0.08;
    const tipV = v + len, uu = u + 0.12 + depth * 0.4;
    s += `<path d="${g.d([["M", uu - w * 0.5, v], ["C", uu - w, v + len * 0.4, uu - w * 0.7, v + len * 0.85, uu - 0.02, tipV], ["C", uu + w * 0.6, v + len * 0.85, uu + w * 0.8, v + len * 0.4, uu + w * 0.5, v], ["Z"]])}" fill="${g.vgrad(v + r, v - r, [[0, "#4a5057"], [1, "#2c3136"]])}" ${st(0.4, "#22262a")}/>`;
  }
  const sp = g.vgrad(v + spinnerR, v - spinnerR, [[0, "#ffffff"], [0.5, "#eceef0"], [1, "#b8bec4"]]);
  s += `<path d="${g.d([["M", u + spinnerLen * 0.55, v + spinnerR], ["C", u + 0.05, v + spinnerR * 0.95, u - spinnerLen * 0.45, v + spinnerR * 0.4, u - spinnerLen * 0.45, v], ["C", u - spinnerLen * 0.45, v - spinnerR * 0.4, u + 0.05, v - spinnerR * 0.95, u + spinnerLen * 0.55, v - spinnerR], ["Z"]])}" fill="${sp}" ${st(0.7)}/>`;
  g.add(s);
}

/** Simple cowling/pod from a closed command list with a vertical gradient (prop nacelles, sponsons, fairings). */
export function pod(g, cmds, v0, v1, stops = [[0, "#ffffff"], [0.5, "#f1f2f4"], [1, "#c2c8cd"]], w = 1) {
  g.add(`<path d="${g.d(cmds)}" fill="${g.vgrad(v0, v1, stops)}" ${st(w)}/>`);
}

/**
 * Generic airliner from a spec (all metres). Drawing order: fin, fuselage and its details, shadows, gear, stabiliser,
 * wing (+winglet), engines, then `front` hooks. See types/*.mjs for the fields.
 */
export function airliner(s) {
  const g = new Drawing(s.id);
  for (const fn of s.back ?? []) fn(g);
  if (s.fin) surface(g, s.fin.cmds, { fill: g.lgrad([s.fin.gradU[0], 5], [s.fin.gradU[1], 5], C.fin), hinge: s.fin.hinge ?? [] });
  for (const fn of s.behindBody ?? []) fn(g);
  const fd = fuselage(g, { nose: s.nose, top: s.top, bottom: s.bottom, vBot: s.VB, vTop: s.VTmax ?? s.VT });
  const clip = g.clip(fd);
  bodyShade(g, clip, { vBot: s.VB, vTop: s.VTmax ?? s.VT });
  if (s.seams) lines(g, clip, s.seams);
  for (const w of s.windows ?? []) windowRow(g, clip, w);
  for (const d of s.doors ?? []) door(g, clip, d);
  if (s.cockpit) cockpit(g, s.cockpit);
  for (const [u, v, r] of s.dots ?? []) dot(g, u, v, r ?? 0.05);
  for (const [u, v, h, len] of s.antennas ?? []) antenna(g, u, v, h, len);
  for (const [u, v, r] of s.lights ?? []) light(g, u, v, undefined, r ?? 0.07);
  for (const fn of s.onBody ?? []) fn(g, clip);
  for (const p of s.shadows ?? []) shadow(g, p[0] ? p : p.pts, p.o ?? 0.4);
  for (const gr of s.gear ?? []) gear(g, gr);
  for (const fn of s.beforeStab ?? []) fn(g);
  if (s.stab) wing(g, { lines: [0.6], shade: [[0, "#dfe2e5"], [0.25, "#a9afb5"], [1, "#757c83"]], ...s.stab });
  for (const fn of s.beforeWing ?? []) fn(g);
  if (s.wing) wing(g, s.wing);
  if (s.winglet) surface(g, s.winglet.cmds, { fill: g.lgrad(s.winglet.grad[0], s.winglet.grad[1], [[0, "#f6f7f8"], [1, "#d5d9dd"]]), hinge: s.winglet.hinge ?? [] });
  for (const e of s.engines ?? []) {
    if (e.pylon === "auto" && e.fan && s.wing) pylon(g, autoPylon(s.wing.le, e.fan));
    else if (e.pylon) pylon(g, e.pylon);
    if (e.fan) turbofan(g, e.fan);
    if (e.draw) e.draw(g);
  }
  for (const fn of s.front ?? []) fn(g, clip);
  return g.svg(s.title);
}

// ---------- v2 helpers: smooth curves and contour shading ----------
/** Catmull-Rom spline through pts as cubic Bézier commands (no leading M). t = tension (0.5 = centripetal-ish). */
export function cr(pts, t = 0.5) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const k = t / 3;
    out.push(["C", p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k, p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k, p2[0], p2[1]]);
  }
  return out;
}

/**
 * Contour-following shading: paints `color` inside the shape, strongest along the edge that faces (dx, dy) metres
 * away, fading with a Gaussian of `blur` metres. dy < 0 darkens the lower edge, dy > 0 the upper edge.
 */
export function innerShade(g, d, { dx = 0, dy = -0.5, blur = 0.5, color = "#2c3035", opacity = 0.6, mx = 0.08, my = 1.2 } = {}) {
  const id = g.uid("f");
  g.def(`<filter id="${id}" x="${-mx * 100}%" y="${-my * 100}%" width="${(1 + 2 * mx) * 100}%" height="${(1 + 2 * my) * 100}%" color-interpolation-filters="sRGB">` +
    `<feFlood flood-color="${color}" flood-opacity="${opacity}" result="c"/><feComposite in="c" in2="SourceAlpha" operator="out" result="o"/>` +
    `<feOffset in="o" dx="${f(dx * S)}" dy="${f(dy * S)}" result="s"/><feGaussianBlur in="s" stdDeviation="${f(blur * S)}" result="b"/>` +
    `<feComposite in="b" in2="SourceAlpha" operator="in"/></filter>`);
  g.add(`<path d="${d}" fill="#000" filter="url(#${id})"/>`);
}

/** Soft-edged fill (blurred polygon or path), optionally clipped. */
export function soft(g, d, { color = "#2c3035", opacity = 0.5, blur = 0.15, clip } = {}) {
  const id = g.uid("f");
  g.def(`<filter id="${id}" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="${f(blur * S)}"/></filter>`);
  const p = `<path d="${d}" fill="${color}" fill-opacity="${opacity}" filter="url(#${id})"/>`;
  g.add(clip ? `<g clip-path="${clip}">${p}</g>` : p);
}
