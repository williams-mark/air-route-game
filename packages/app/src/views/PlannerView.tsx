import { shortTypeLabel, typeShortName } from "../aircraft/names";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent } from "react";
import { aircraftTypes } from "@arg/data";
import type { Aircraft, Id, Route } from "@arg/contracts";
import {
  coverageGaps, dayToDate, forecastFleet, infeasibleReason, layoutSeats, maintenanceEnabled, refitQuote, suggestCover, typeCanServe,
  type CoverageGap, type CoverSuggestion, type FleetForecast, type SimState,
} from "@arg/sim";
import { CabinDialog } from "../cabin/CabinDialog";
import { usd } from "../cabin/helpers";
import {
  AXIS_H, GROUP_H, HORIZONS, LEAD_DAYS, LEFT_W, ROW_H, ROUTE_COLORS, axisTicks, barRect, buildSegments, cabinSummary, dayX, layoutRows, makeScale, money, routeSlot,
  type PlannerRow, type Seg,
} from "../planner/helpers";
import { usePlanner } from "../planner/store";
import "../planner/planner.css";
import { useToasts } from "../routes/store";
import { formatDate } from "../sim/format";
import { bridge, useSim } from "../sim/useSim";

interface Item { ac: Aircraft; baseRoute: Id | null }
interface Data { fc: FleetForecast; gaps: CoverageGap[]; items: Item[]; groups: Array<{ key: string; items: Item[] }>; causeKeys: Set<string> }

const typeName = (id: Id) => shortTypeLabel(id);
const rname = (r: Route) => `${r.origin}-${r.destination}`;
const dateOf = (d: number) => dayToDate(d);
const WIN_LABEL = { B: "B check", C: "C check", D: "D check", refit: "Cabin refit" } as const;

function compute(state: SimState, horizon: number, showShort: boolean): Data {
  const fc = forecastFleet(state, horizon);
  const gaps = coverageGaps(state, horizon, fc, showShort ? 1 : 4);
  const primary = new Map<Id, { route: Id; rank: number }>();
  for (const r of state.world.routes) {
    (state.routeReports[r.id]?.scheduling?.aircraftIds ?? []).forEach((id, rank) => {
      const cur = primary.get(id);
      if (!cur || rank < cur.rank) primary.set(id, { route: r.id, rank });
    });
  }
  // Aircraft in the hangar or not yet delivered fly nothing today; assume the scheduler gives them the first route asking for their type.
  const byType = new Map<Id, Id>();
  for (const r of state.world.routes) if (!byType.has(r.typeId)) byType.set(r.typeId, r.id);
  const items: Item[] = state.world.fleet.map((ac) => ({ ac, baseRoute: primary.get(ac.id)?.route ?? (ac.status === "maintenance" || ac.status === "delivery" ? byType.get(ac.typeId) ?? null : null) }));
  const by = new Map<string, Item[]>();
  for (const it of items) by.set(it.ac.typeId, [...(by.get(it.ac.typeId) ?? []), it]);
  const groups = [...by.entries()]
    .sort((x, y) => Number(aircraftTypes.find((t) => t.id === y[0])?.widebody) - Number(aircraftTypes.find((t) => t.id === x[0])?.widebody) || (x[0] < y[0] ? -1 : 1))
    .map(([key, list]) => ({ key, items: list.sort((a, b) => a.ac.tailNumber.localeCompare(b.ac.tailNumber)) }));
  const causeKeys = new Set<string>();
  for (const g of gaps) for (const c of g.causes) causeKeys.add(`${c.aircraftId}:${c.startDay}`);
  return { fc, gaps, items, groups, causeKeys };
}

function statusText(it: Item, state: SimState, fc: FleetForecast): { text: string; cls: string } {
  const { ac } = it;
  const meta = state.fleetMeta[ac.id];
  if (ac.status === "stored") return { text: "Stored", cls: "st-stored" };
  if (ac.status === "delivery") return { text: meta?.deliveryDay != null ? `Due ${formatDate(meta.deliveryDay).slice(0, -5)}` : "On order", cls: "st-delivery" };
  if (ac.status === "maintenance") return { text: meta?.maintenance ? `${meta.maintenance.refit || !maintenanceEnabled() ? "Refit" : meta.maintenance.check} ${Math.max(0, meta.maintenance.endDay - state.world.day)}d` : maintenanceEnabled() ? "In check" : "Refit", cls: "st-maintenance" };
  if (state.planner?.reserved[ac.id]) return { text: "Spare", cls: "st-spare" };
  const next = fc.aircraft[ac.id]?.windows.find((w) => !w.underway);
  if (!it.baseRoute) return { text: "Idle", cls: "st-idle" };
  return { text: next ? `${next.kind} in ${next.startDay - state.world.day}d` : "Active", cls: "st-active" };
}

export default function PlannerView() {
  const sim = useSim();
  const state = bridge.getSim?.() ?? null;
  const { horizon, colorBy, collapsed, aircraftId, tab, showShort, set } = usePlanner();
  const fleetSig = sim.fleet.map((a) => a.status[0]).join("");
  const week = state ? Math.floor(state.world.day / 7) : 0;
  const data = useMemo(() => (state ? compute(state, horizon, showShort) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [week, state?.planner, state?.world.routes, fleetSig, horizon, showShort]);

  if (!state || !data) {
    return <div className="page"><header className="page-head"><h1>Fleet planner</h1><p>The planner needs the real simulation; it is not available in mock mode.</p></header></div>;
  }
  if (state.world.fleet.length === 0) {
    return <div className="page"><header className="page-head"><h1>Fleet planner</h1></header><div className="empty-state"><h2>No aircraft</h2><p>Order aircraft first; the planner shows their {maintenanceEnabled() ? "checks, " : "assignments, "}deliveries and coverage.</p></div></div>;
  }
  const selected = aircraftId ? state.world.fleet.find((a) => a.id === aircraftId) ?? null : null;
  return (
    <div className="planner">
      <header className="pl-head">
        <div>
          <h1>Fleet planner</h1>
          <p>{data.items.length} aircraft. Coverage in the next {horizon} days: {data.gaps.filter((g) => g.structural).length} current (short all along), {data.gaps.filter((g) => !g.structural).length} upcoming (a check or delivery opens a gap); all {data.gaps.length} are in the Issues tab. The scheduler assigns aircraft by default; pins, spares and fallback types steer it.</p>
        </div>
        <div className="pl-controls">
          <div className="seg" role="group" aria-label="Horizon">
            {HORIZONS.map((h) => <button key={h} type="button" aria-pressed={horizon === h} onClick={() => set({ horizon: h })}>{h}d</button>)}
          </div>
          <div className="seg" role="group" aria-label="Colour bars by">
            <button type="button" aria-pressed={colorBy === "route"} onClick={() => set({ colorBy: "route" })}>By route</button>
            <button type="button" aria-pressed={colorBy === "status"} onClick={() => set({ colorBy: "status" })}>By status</button>
          </div>
          <button type="button" onClick={() => set({ collapsed: collapsed.length ? [] : data.groups.map((g) => g.key) })}>{collapsed.length ? "Expand all" : "Collapse all"}</button>
        </div>
      </header>
      <Timeline state={state} data={data} />
      <div className="pl-panels">
        <section className="pl-card" aria-label="Planner side panel">
          <div className="pl-tabs" role="tablist">
            <button role="tab" type="button" aria-selected={tab === "issues"} onClick={() => set({ tab: "issues" })}>Issues <span className="pl-count">{data.gaps.length}</span></button>
            <button role="tab" type="button" aria-selected={tab === "routes"} onClick={() => set({ tab: "routes" })}>Routes</button>
          </div>
          {tab === "issues" ? <Issues state={state} data={data} /> : <RoutesPanel state={state} data={data} />}
        </section>
        <section className="pl-card" aria-label="Aircraft detail">
          {selected ? <AircraftPanel key={selected.id} state={state} data={data} ac={selected} /> : <div className="pl-empty"><h2>Aircraft</h2><p>Select an aircraft in the timeline to pin it to a route, hold it as a spare, change its cabin or see its upcoming checks.</p></div>}
        </section>
      </div>
    </div>
  );
}

// --- Timeline ----------------------------------------------------------------
function Timeline({ state, data }: { state: SimState; data: Data }) {
  const { horizon, colorBy, collapsed, aircraftId, set, toggleGroup } = usePlanner();
  const scroller = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(900);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setVw(Math.max(320, el.clientWidth - LEFT_W - 2));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const today = state.world.day;
  const sc = useMemo(() => makeScale(today - LEAD_DAYS, today + horizon, vw), [today, horizon, vw]);
  const { rows, height } = useMemo(() => layoutRows(data.groups, new Set(collapsed)), [data.groups, collapsed]);
  const routeIds = useMemo(() => state.world.routes.map((r) => r.id), [state.world.routes]);
  const ticks = useMemo(() => axisTicks(sc, dateOf), [sc]);
  const routes = state.world.routes;
  const todayX = dayX(sc, today);

  // Keep the selected row in view when it changes (e.g. from an issue).
  useEffect(() => {
    if (!aircraftId) return;
    const row = rows.find((r) => r.kind === "aircraft" && (r.item as Item).ac.id === aircraftId);
    const el = scroller.current;
    if (row && el) {
      const top = row.y + AXIS_H;
      if (top < el.scrollTop + AXIS_H || top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, top - el.clientHeight / 2);
    }
  }, [aircraftId, rows]);

  const onMove = (e: React.MouseEvent) => {
    const t = (e.target as Element).closest("[data-tip]");
    if (!t) { if (tip) setTip(null); return; }
    setTip({ x: e.clientX, y: e.clientY, text: t.getAttribute("data-tip") ?? "" });
  };
  const fill = (seg: Seg): string => {
    if (colorBy === "status") return seg.routeId ? "var(--pl-active)" : "var(--pl-idle)";
    const s = routeSlot(routeIds, seg.routeId);
    return s < 0 ? "var(--pl-idle)" : `var(--pl-r${s})`;
  };
  const focusRow = (e: RKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const list = [...(scroller.current?.querySelectorAll<HTMLButtonElement>("button.pl-row-btn") ?? [])];
    const i = list.indexOf(e.currentTarget);
    list[i + (e.key === "ArrowDown" ? 1 : -1)]?.focus();
  };

  return (
    <section className="pl-timeline" aria-label="Fleet timeline">
      <div className="pl-scroll" ref={scroller} onMouseMove={onMove} onMouseLeave={() => setTip(null)}>
        <div className="pl-grid" style={{ gridTemplateColumns: `${LEFT_W}px ${sc.width}px` }}>
          <div className="pl-corner" style={{ height: AXIS_H }}>
            <span>Aircraft</span>
          </div>
          <svg className="pl-axis" width={sc.width} height={AXIS_H} aria-hidden="true">
            {ticks.map((t) => (
              <g key={t.day}>
                <line x1={t.x} x2={t.x} y1={t.major ? 4 : 18} y2={AXIS_H} className={t.major ? "pl-tick major" : "pl-tick"} />
                <text x={t.x + 4} y={t.major ? 15 : 29} className={t.major ? "pl-tick-label major" : "pl-tick-label"}>{t.label}</text>
              </g>
            ))}
            <line x1={todayX} x2={todayX} y1={0} y2={AXIS_H} className="pl-today" />
            <text x={todayX + 4} y={AXIS_H - 6} className="pl-today-label">Today</text>
          </svg>
          <div className="pl-left" style={{ height }}>
            {rows.map((r) => r.kind === "group" ? (
              <button key={r.key} type="button" className="pl-group" style={{ top: r.y, height: r.h }} aria-expanded={!r.collapsed} onClick={() => toggleGroup(r.group!)}>
                <span className="pl-caret" aria-hidden="true">{r.collapsed ? "▸" : "▾"}</span>
                <strong>{r.group}</strong><span className="pl-dim pl-gname" title={typeName(r.group!)}>{typeName(r.group!)}</span><span className="pl-dim">{r.count}</span>
              </button>
            ) : <LeftCell key={r.key} r={r} state={state} data={data} selected={(r.item as Item).ac.id === aircraftId} onKey={focusRow} onPick={(id) => set({ aircraftId: id })} />)}
          </div>
          <svg className="pl-body" width={sc.width} height={Math.max(height, 1)} role="img" aria-label="Aircraft timeline bars">
            <g>{ticks.map((t) => <line key={t.day} x1={t.x} x2={t.x} y1={0} y2={height} className={t.major ? "pl-grid-line major" : "pl-grid-line"} />)}</g>
            {rows.map((r) => {
              if (r.kind === "group") return <rect key={r.key} x={0} y={r.y} width={sc.width} height={r.h} className="pl-group-band" />;
              const it = r.item as Item;
              const f = data.fc.aircraft[it.ac.id];
              const sel = it.ac.id === aircraftId;
              const pins = state.planner?.pins[it.ac.id] ?? [];
              const segs = buildSegments({ from: sc.from, to: sc.to, today, delivery: f?.deliveryDay ?? null, windows: f?.windows ?? [], baseRoute: it.baseRoute, pins });
              const y = r.y + 4, h = ROW_H - 8;
              const route = (id: Id | null) => routes.find((q) => q.id === id);
              return (
                <g key={r.key} className={sel ? "pl-row sel" : "pl-row"}>
                  <rect x={0} y={r.y} width={sc.width} height={ROW_H} className="pl-row-band" />
                  {segs.map((s, i) => {
                    const b = barRect(sc, s.start, s.end);
                    if (!b) return null;
                    if (s.kind === "pre") return <rect key={i} x={b.x} y={y + 3} width={b.w} height={h - 6} rx={3} className="pl-pre" data-tip={`${it.ac.tailNumber}: on order, delivery ${f?.deliveryDay != null ? formatDate(f.deliveryDay) : "TBC"}`} />;
                    if (s.kind === "check") {
                      const hot = data.causeKeys.has(`${it.ac.id}:${s.start}`);
                      return (
                        <g key={i} data-tip={`${it.ac.tailNumber} ${WIN_LABEL[s.check!]}: ${formatDate(s.start)} to ${formatDate(s.end - 1)} (${s.end - s.start} days)${hot ? ". Leaves a route short." : ""}`}>
                          <rect x={b.x} y={y} width={b.w} height={h} rx={3} className={`pl-check c-${s.check}${hot ? " hot" : ""}`} />
                          {b.w >= 10 && <text x={b.x + b.w / 2} y={y + h / 2 + 4} className="pl-check-letter" textAnchor="middle">{s.check === "refit" ? "R" : s.check}</text>}
                        </g>
                      );
                    }
                    const rt = route(s.routeId);
                    return (
                      <g key={i} data-tip={`${it.ac.tailNumber}: ${rt ? `${rname(rt)}${s.pinned ? " (pinned)" : ""}` : "no route today (spare)"}${s.end - s.start > 0 ? `, ${formatDate(s.start)} to ${formatDate(s.end - 1)}` : ""}`}>
                        <rect x={b.x} y={y + 2} width={b.w} height={h - 4} rx={3} className={`pl-fly${s.pinned ? " pinned" : ""}${s.routeId ? "" : " idle"}`} style={{ fill: fill(s) }} />
                        {s.pinned && <path d="M0 0l4-4 4 4-2 1-1 4-1-4z" transform={`translate(${b.x + 3} ${y + h / 2 + 3})`} className="pl-pin-icon" />}
                        {b.w > 60 && rt && <text x={b.x + (s.pinned ? 16 : 6)} y={y + h / 2 + 4} className="pl-bar-label">{rname(rt)}</text>}
                      </g>
                    );
                  })}
                  {(f?.aChecks ?? []).map((d) => { const b = barRect(sc, d, d + 1, 2); return b ? <rect key={`a${d}`} x={b.x} y={r.y + ROW_H - 6} width={Math.max(2, b.w)} height={4} className="pl-a" data-tip={`${it.ac.tailNumber} A check ${formatDate(d)} (overnight, no downtime)`} /> : null; })}
                  {f?.deliveryDay != null && (() => { const x = dayX(sc, f.deliveryDay); return x >= 0 && x <= sc.width ? <path d={`M${x} ${y} l6 ${h / 2} -6 ${h / 2} -6 -${h / 2}z`} className="pl-delivery" data-tip={`${it.ac.tailNumber} delivered ${formatDate(f.deliveryDay)}`} /> : null; })()}
                </g>
              );
            })}
            <line x1={todayX} x2={todayX} y1={0} y2={height} className="pl-today" />
          </svg>
        </div>
      </div>
      {tip && <div className="pl-tip" style={{ left: tip.x + 12, top: tip.y + 14 }} role="tooltip">{tip.text}</div>}
      <Legend routes={routes} colorBy={colorBy} />
    </section>
  );
}

function LeftCell({ r, state, data, selected, onKey, onPick }: { r: PlannerRow<Item>; state: SimState; data: Data; selected: boolean; onKey: (e: RKeyboardEvent<HTMLButtonElement>) => void; onPick: (id: Id) => void }) {
  const it = r.item!;
  const st = statusText(it, state, data.fc);
  const pinned = (state.planner?.pins[it.ac.id] ?? []).length > 0;
  return (
    <button type="button" className={`pl-row-btn${selected ? " sel" : ""}`} style={{ top: r.y, height: r.h }} aria-current={selected ? "true" : undefined} onKeyDown={onKey} onClick={() => onPick(it.ac.id)}
      aria-label={`${it.ac.tailNumber}, ${shortTypeLabel(it.ac.typeId)}, ${st.text}`}>
      <span className="pl-tail">{it.ac.tailNumber}{pinned && <svg viewBox="0 0 10 10" width="10" height="10" className="pl-pin-mini" aria-label="pinned"><path d="M1 1l4-1 5 5-1 1-2-1-2 3-1-1 1-3-2-2z" /></svg>}</span>
      <span className="pl-cabin">{cabinSummary(it.ac.layout)}</span>
      <span className={`pl-status ${st.cls}`}>{st.text}</span>
    </button>
  );
}

function Legend({ routes, colorBy }: { routes: Route[]; colorBy: "route" | "status" }) {
  return (
    <ul className="pl-legend" aria-label="Legend">
      {colorBy === "route"
        ? routes.slice(0, ROUTE_COLORS * 2).map((r, i) => <li key={r.id}><i style={{ background: `var(--pl-r${i % ROUTE_COLORS})` }} />{rname(r)}</li>)
        : <><li><i style={{ background: "var(--pl-active)" }} />Flying</li><li><i style={{ background: "var(--pl-idle)" }} />Idle or spare</li></>}
      {maintenanceEnabled() && <><li><i className="lg-check c-B" />B</li><li><i className="lg-check c-C" />C</li><li><i className="lg-check c-D" />D</li></>}
      <li><i className="lg-check c-refit" />Refit</li>
      {maintenanceEnabled() && <li><i className="lg-a" />A check</li>}
      <li><i className="lg-del" />Delivery</li><li><i className="lg-pin" />Pinned</li>
    </ul>
  );
}

// --- Issues ------------------------------------------------------------------
function Issues({ state, data }: { state: SimState; data: Data }) {
  const { showShort, openGap, set } = usePlanner();
  const ignored = state.planner?.ignoredGaps ?? [];
  const send = (cmd: Parameters<typeof bridge.dispatch>[0]) => bridge.dispatch(cmd);
  return (
    <div className="pl-body-panel">
      <div className="pl-row-tools">
        <label className="pl-check-label"><input type="checkbox" checked={showShort} onChange={(e) => set({ showShort: e.target.checked })} /> Include short gaps (under 4 days)</label>
        {ignored.length > 0 && <button type="button" className="pl-link" onClick={() => ignored.forEach((g) => send({ kind: "ignoreGap", gapId: g, ignore: false }))}>Restore {ignored.length} ignored</button>}
      </div>
      {data.gaps.length === 0 ? <p className="pl-dim pl-pad">No coverage gaps in the forecast. Every route keeps its full schedule{maintenanceEnabled() ? " while aircraft are in the hangar" : " through deliveries and cabin refits"}.</p> : (
        <ul className="pl-issues">
          {data.gaps.map((g) => <Issue key={g.id} gap={g} open={openGap === g.id} state={state} data={data} />)}
        </ul>
      )}
    </div>
  );
}

function Issue({ gap, open, state, data }: { gap: CoverageGap; open: boolean; state: SimState; data: Data }) {
  const { set } = usePlanner();
  const push = useToasts((s) => s.push);
  const first = gap.causes[0]?.aircraftId ?? null;
  const missing = gap.requestedPerWeek - gap.scheduledPerWeek;
  const tone = gap.severity >= 0.6 ? "high" : gap.severity >= 0.25 ? "mid" : "low";
  const suggestions = useMemo(() => (open ? suggestCover(state, gap, 3, data.fc) : []), [open, gap, data.fc, state.planner, state.world.routes]);
  const tails = new Map(state.world.fleet.map((a) => [a.id, a.tailNumber]));
  const apply = (s: CoverSuggestion) => {
    const res = bridge.dispatch({ kind: "applyCover", aircraftId: s.aircraftId, routeId: s.routeId, fromDay: s.fromDay, toDay: s.toDay, gapId: gap.id });
    if (res && !res.ok) push("alert", res.error.message);
    else push("good", `${tails.get(s.aircraftId)} will cover ${formatDate(s.fromDay)} to ${formatDate(s.toDay)}.`);
  };
  return (
    <li className={`pl-issue sev-${tone}`}>
      <div className="pl-issue-top">
        <span className="pl-sev" aria-label={`${tone} severity`} title={`${Math.round(gap.severity * 100)}% severity`}><i style={{ width: `${Math.max(8, Math.min(100, gap.severity * 100))}%` }} /></span>
        <strong>{gap.structural ? "Short all along" : `Loses ${missing}/${gap.requestedPerWeek} a week`}</strong>
        <span className="pl-dim">{formatDate(gap.fromDay)} to {formatDate(gap.toDay)}</span>
      </div>
      <p className="pl-issue-text">{gap.summary}</p>
      <div className="pl-issue-actions">
        {!gap.structural && <button type="button" aria-expanded={open} onClick={() => set({ openGap: open ? null : gap.id })}>Suggested cover</button>}
        {first && <button type="button" onClick={() => set({ aircraftId: first })}>Show {tails.get(first)}</button>}
        <button type="button" onClick={() => bridge.dispatch({ kind: "ignoreGap", gapId: gap.id, ignore: true })}>Ignore</button>
      </div>
      {open && (
        <ol className="pl-sugg">
          {suggestions.length === 0 && <li className="pl-dim">No aircraft can legally cover this window. Check range and runway limits, or order another aircraft.</li>}
          {suggestions.map((s) => {
            const ac = state.world.fleet.find((a) => a.id === s.aircraftId)!;
            return (
              <li key={s.aircraftId}>
                <div className="pl-sugg-top">
                  <strong>{ac.tailNumber}</strong><span>{shortTypeLabel(ac.typeId)}</span>
                  <span className="pl-dim">+{s.roundTripsPerWeek}/wk, {s.seats} seats</span>
                  <span className={s.profitDeltaPerWeek >= 0 ? "pos" : "neg"}>{money(s.profitDeltaPerWeek)}/wk</span>
                  <button type="button" className="primary" onClick={() => apply(s)}>Apply</button>
                </div>
                {s.notes.length > 0 && <div className="pl-note">{s.notes.join(" ")}</div>}
              </li>
            );
          })}
        </ol>
      )}
    </li>
  );
}

// --- Aircraft panel ------------------------------------------------------------
function AircraftPanel({ state, data, ac }: { state: SimState; data: Data; ac: Aircraft }) {
  const push = useToasts((s) => s.push);
  const set = usePlanner((s) => s.set);
  const { day, cash } = useSim();
  const [refit, setRefit] = useState(false);
  const type = state.aircraftTypes.find((t) => t.id === ac.typeId)!;
  const f = data.fc.aircraft[ac.id];
  const reserved = !!state.planner?.reserved[ac.id];
  const pins = state.planner?.pins[ac.id] ?? [];
  const standing = pins.find((p) => p.fromDay === undefined && p.toDay === undefined);
  const airports = new Map(state.airports.map((a) => [a.id, a]));
  const send = (cmd: Parameters<typeof bridge.dispatch>[0], ok?: string) => {
    const res = bridge.dispatch(cmd);
    if (res && !res.ok) push("alert", res.error.message); else if (ok) push("good", ok);
  };
  const options = state.world.routes.map((r) => {
    const a = airports.get(r.origin), b = airports.get(r.destination);
    const bad = a && b && !typeCanServe(a, b, type) ? infeasibleReason(a, b, type) : null;
    return { r, bad };
  });
  const current = state.world.routes.filter((r) => state.routeReports[r.id]?.scheduling?.aircraftIds.includes(ac.id)).map(rname);
  const canRefit = (ac.status === "active" || ac.status === "stored");
  return (
    <div className="pl-body-panel">
      <div className="pl-ac-head">
        <h2>{ac.tailNumber}</h2><span className="pl-dim">{type.name} · {layoutSeats(ac.layout)} seats ({cabinSummary(ac.layout)})</span>
        <button type="button" className="icon-btn" aria-label="Close aircraft detail" onClick={() => set({ aircraftId: null })}>{"✕"}</button>
      </div>
      <dl className="pl-dl">
        <dt>Status</dt><dd>{ac.status === "maintenance" ? (maintenanceEnabled() ? "In the hangar" : "In cabin refit") : ac.status === "delivery" ? "On order" : ac.status === "stored" ? "Stored" : reserved ? "Held as a spare" : "In service"}</dd>
        <dt>Flying now</dt><dd>{current.length ? current.join(", ") : "Nothing"}</dd>
      </dl>
      <label className="pl-field">Assign to route
        <select value={standing?.routeId ?? ""} disabled={ac.status === "stored"} onChange={(e) => send({ kind: "pinAircraft", aircraftId: ac.id, routeId: e.target.value === "" ? null : e.target.value }, e.target.value ? `${ac.tailNumber} pinned.` : `${ac.tailNumber} is back on automatic assignment.`)}>
          <option value="">Automatic (scheduler decides)</option>
          {options.map(({ r, bad }) => <option key={r.id} value={r.id} disabled={!!bad}>{rname(r)}{bad ? ` (${bad})` : ""}</option>)}
        </select>
      </label>
      {pins.filter((p) => p !== standing).map((p, i) => (
        <div className="pl-note" key={i}>Cover: {rname(state.world.routes.find((r) => r.id === p.routeId) ?? { origin: "?", destination: "?" } as Route)}, {p.fromDay !== undefined ? formatDate(p.fromDay) : "now"} to {p.toDay !== undefined ? formatDate(p.toDay) : "open"}{" "}
          <button type="button" className="pl-link" onClick={() => send({ kind: "pinAircraft", aircraftId: ac.id, routeId: null }, "Cover removed.")}>Remove</button></div>
      ))}
      <label className="pl-check-label"><input type="checkbox" checked={reserved} onChange={(e) => send({ kind: "reserveAircraft", aircraftId: ac.id, reserve: e.target.checked })} /> Hold as a spare (the scheduler will not use it unless a pin or cover asks)</label>
      {canRefit && <button type="button" onClick={() => setRefit(true)}>Change cabin{"…"}</button>}
      <h3 className="pl-sub">Upcoming</h3>
      <ul className="pl-up">
        {f?.deliveryDay != null && <li><b>Delivery</b> {formatDate(f.deliveryDay)}</li>}
        {(f?.windows ?? []).map((w, i) => <li key={i}><b>{WIN_LABEL[w.kind]}</b> {w.underway ? "until" : `${formatDate(w.startDay)} to`} {formatDate(w.endDay - 1)}{!w.underway && <span className="pl-dim"> (may slip to {formatDate(w.latestStartDay)} if it would drop flights)</span>}</li>)}
        {(maintenanceEnabled() ? f?.aChecks ?? [] : []).slice(0, 3).map((d) => <li key={d}><b>A check</b> {formatDate(d)} <span className="pl-dim">overnight</span></li>)}
        {!f?.windows.length && !f?.aChecks.length && f?.deliveryDay == null && <li className="pl-dim">Nothing due in this horizon.</li>}
      </ul>
      {refit && ac.layout && (
        <CabinDialog requireChange title={`Refit ${ac.tailNumber} (${type.name})`} type={type} initial={ac.layout} day={day} confirmLabel="Start refit"
          quote={(l) => { const q = refitQuote(type, l); return <>Cost {usd(q.costUsd)}, out of service {q.downtimeDays} days.</>; }}
          blocker={(l) => (refitQuote(type, l).costUsd > cash ? "Not enough cash for this refit." : null)}
          onClose={() => setRefit(false)}
          onConfirm={(l) => { send({ kind: "refitAircraft", aircraftId: ac.id, layout: l }, `${ac.tailNumber} is in the hangar for its cabin refit.`); setRefit(false); }} />
      )}
    </div>
  );
}

// --- Routes panel --------------------------------------------------------------
function RoutesPanel({ state, data }: { state: SimState; data: Data }) {
  const push = useToasts((s) => s.push);
  const { routeId, set } = usePlanner();
  const route = state.world.routes.find((r) => r.id === routeId) ?? state.world.routes[0];
  if (!route) return <p className="pl-dim pl-pad">No routes yet.</p>;
  const airports = new Map(state.airports.map((a) => [a.id, a]));
  const a = airports.get(route.origin)!, b = airports.get(route.destination)!;
  const rep = state.routeReports[route.id];
  const tails = new Map(state.world.fleet.map((x) => [x.id, x.tailNumber]));
  const list = state.planner?.routeTypes[route.id] ?? [];
  const owned = [...new Set(state.world.fleet.map((x) => x.typeId))];
  const feasible = (id: Id) => { const t = state.aircraftTypes.find((x) => x.id === id); return !!t && typeCanServe(a, b, t); };
  const save = (next: Id[]) => { const res = bridge.dispatch({ kind: "setRouteTypes", routeId: route.id, preferredTypeIds: next }); if (res && !res.ok) push("alert", res.error.message); };
  const move = (i: number, d: number) => { const n = [...list]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j]!, n[i]!]; save(n); };
  const changeType = (typeId: Id) => {
    const res = bridge.dispatch({ kind: "updateRoute", id: route.id, patch: { typeId } });
    if (res && !res.ok) push("alert", res.error.message); else push("good", `${rname(route)} now plans with the ${shortTypeLabel(typeId)}.`);
  };
  const addable = owned.filter((t) => t !== route.typeId && !list.includes(t));
  return (
    <div className="pl-body-panel">
      <label className="pl-field">Route
        <select value={route.id} onChange={(e) => set({ routeId: e.target.value })}>
          {state.world.routes.map((r) => <option key={r.id} value={r.id}>{rname(r)}, {r.weeklyFrequency}/wk</option>)}
        </select>
      </label>
      <dl className="pl-dl">
        <dt>Scheduled</dt><dd>{rep?.scheduling ? `${rep.scheduling.scheduledFrequency} of ${route.weeklyFrequency} a week` : "Not scheduled"}</dd>
        <dt>Flown by</dt><dd>{rep?.scheduling?.aircraftIds.length ? rep.scheduling.aircraftIds.map((id) => tails.get(id)).join(", ") : "No aircraft"}</dd>
      </dl>
      <label className="pl-field">Planned with (primary type)
        <select value={route.typeId} onChange={(e) => changeType(e.target.value)}>
          {state.aircraftTypes.filter((t) => t.id === route.typeId || owned.includes(t.id)).map((t) => <option key={t.id} value={t.id} disabled={!feasible(t.id)}>{typeShortName(t)}{feasible(t.id) ? "" : ` (${infeasibleReason(a, b, t)})`}</option>)}
        </select>
      </label>
      <h3 className="pl-sub">Fallback types, in order</h3>
      <p className="pl-dim pl-small">When the primary type is busy or out of service, the scheduler tries these before any other aircraft of the same size.</p>
      <ol className="pl-types">
        {list.length === 0 && <li className="pl-dim">None set (automatic).</li>}
        {list.map((t, i) => (
          <li key={t}><span>{i + 1}. {t}</span>
            <button type="button" aria-label={`Move ${t} up`} disabled={i === 0} onClick={() => move(i, -1)}>{"↑"}</button>
            <button type="button" aria-label={`Move ${t} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>{"↓"}</button>
            <button type="button" aria-label={`Remove ${t}`} onClick={() => save(list.filter((x) => x !== t))}>{"✕"}</button>
          </li>
        ))}
      </ol>
      {addable.length > 0 && (
        <label className="pl-field">Add fallback type
          <select value="" onChange={(e) => e.target.value && save([...list, e.target.value])}>
            <option value="">Choose a type from your fleet…</option>
            {addable.map((t) => <option key={t} value={t} disabled={!feasible(t)}>{shortTypeLabel(t)}{feasible(t) ? "" : ` (${infeasibleReason(a, b, state.aircraftTypes.find((x) => x.id === t)!)})`}</option>)}
          </select>
        </label>
      )}
      <p className="pl-dim pl-small">{data.gaps.filter((g) => g.routeId === route.id).length} coverage {data.gaps.filter((g) => g.routeId === route.id).length === 1 ? "issue" : "issues"} on this route in the horizon.</p>
    </div>
  );
}
