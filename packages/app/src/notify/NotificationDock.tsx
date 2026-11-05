import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import { bridge, useSimSelector } from "../sim/useSim";
import { formatDay, formatMoney } from "../sim/format";
import type { Severity } from "../sim/bridge";
import { useUi } from "../store";
import { useOffersUi } from "../offers/store";
import { closesIn, KIND_BADGE } from "../offers/format";
import { IconAlert, IconBell, IconChevron, IconGood, IconInfo, IconTag, IconWarn } from "../shell/icons";
import { clampPos, cornerPos, sortDecisions, unresolvedCount, visibleNotices, type Corner, type Pt, type Rect, type Size } from "./dockLogic";
import { useDock } from "./dockStore";
import "./dock.css";
import "../offers/offers.css";

const SEV: Record<Severity, { Icon: typeof IconInfo; label: string }> = {
  info: { Icon: IconInfo, label: "Info" }, good: { Icon: IconGood, label: "Good news" }, warn: { Icon: IconWarn, label: "Warning" }, alert: { Icon: IconAlert, label: "Alert" },
};

/** Free area for the dock: under the top bar and right of the toolbar. */
function freeBounds(): Rect {
  const top = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 56;
  const left = document.querySelector(".toolbar")?.getBoundingClientRect().right ?? 68;
  return { left: left + 6, top: top + 6, right: window.innerWidth - 6, bottom: window.innerHeight - 6 };
}
const avoidRects = (): Rect[] => {
  const r = document.querySelector(".time-pill")?.getBoundingClientRect();
  return r ? [{ left: r.left - 6, top: r.top - 6, right: r.right + 6, bottom: r.bottom + 6 }] : [];
};

/** Whether the dock is shown as its small pill right now (minimized, or auto-collapsed on a non-map view). */
export function useDockCollapsed(): boolean {
  const view = useUi((s) => s.view);
  const minimized = useDock((s) => s.minimized);
  const peek = useDock((s) => s.peek);
  return view === "map" ? minimized : !peek;
}
/** J key / command palette / top-bar bell. */
export function toggleDock(forceOpen = false) {
  const d = useDock.getState();
  const onMap = useUi.getState().view === "map";
  const collapsed = onMap ? d.minimized : !d.peek;
  if (collapsed) { if (onMap) d.setMinimized(false); else d.setPeek(true); }
  else if (!forceOpen) { if (onMap) d.setMinimized(true); else d.setPeek(false); }
}
export function minimizeDock() {
  const d = useDock.getState();
  if (useUi.getState().view === "map") d.setMinimized(true); else d.setPeek(false);
}

function OfferClose({ offer }: { offer: Parameters<typeof closesIn>[0] }) {
  const day = useSimSelector((x) => x.day);
  return <>{closesIn(offer, day)}</>;
}

export function NotificationDock() {
  const sim = {
    decisions: useSimSelector((x) => x.decisions),
    offers: useSimSelector((x) => x.offers),
    notices: useSimSelector((x) => x.notices),
  };
  const view = useUi((s) => s.view);
  const snoozed = useUi((s) => s.snoozed);
  const snooze = useUi((s) => s.snooze);
  const setView = useUi((s) => s.setView);
  const select = useUi((s) => s.select);
  const seen = useOffersUi((s) => s.seen);
  const markSeen = useOffersUi((s) => s.markSeen);
  const setTab = useOffersUi((s) => s.setTab);
  const dock = useDock();
  const collapsed = useDockCollapsed();
  const onMap = view === "map";
  const [open, setOpen] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [tick, setTick] = useState(0);
  const [dragPos, setDragPos] = useState<Pt | null>(null);

  const unseenOffers = sim.offers.filter((o) => !seen.includes(o.id));
  const notices = visibleNotices(sim.notices, dock.clearedUpTo, 10);
  const count = unresolvedCount(sim.decisions.length, unseenOffers.length);

  useEffect(() => { if (!onMap) useDock.getState().setPeek(false); }, [view, onMap]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height })); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => { ro.disconnect(); window.removeEventListener("resize", onResize); };
  }, [collapsed]);

  // Placement: dragged position (map only) or the chosen corner; always clamped into the free area and away from the time pill.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void tick;
  const bounds = typeof document === "undefined" ? { left: 68, top: 56, right: 1440, bottom: 900 } : freeBounds();
  const corner: Corner = onMap ? dock.corner : (dock.corner.replace("top", "bottom") as Corner);
  const wanted = dragPos ?? (onMap && dock.pos ? dock.pos : cornerPos(corner, size, bounds, 14));
  const placed = clampPos(wanted, size, bounds, avoidRects());

  const dragStart = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const onGripDown = (e: RPointerEvent<HTMLButtonElement>) => {
    if (!onMap) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { px: e.clientX, py: e.clientY, ox: placed.x, oy: placed.y };
  };
  const onGripMove = (e: RPointerEvent<HTMLButtonElement>) => {
    const s = dragStart.current;
    if (!s) return;
    setDragPos(clampPos({ x: s.ox + e.clientX - s.px, y: s.oy + e.clientY - s.py }, size, freeBounds(), avoidRects()));
  };
  const onGripUp = () => { dragStart.current = null; if (dragPos) { dock.setPos(dragPos); setDragPos(null); } };
  const onGripKey = (e: RKeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 80 : 20;
    const d: Record<string, Pt> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    const m = d[e.key];
    if (!m || !onMap) return;
    e.preventDefault();
    dock.setPos(clampPos({ x: placed.x + m.x, y: placed.y + m.y }, size, freeBounds(), avoidRects()));
  };

  const toggleRow = useCallback((k: string) => setOpen((o) => (o === k ? null : k)), []);
  const maxId = sim.notices[0]?.id ?? 0;
  const style = { left: placed.x, top: placed.y, visibility: size.w === 0 ? ("hidden" as const) : ("visible" as const) };

  if (collapsed) {
    const urgent = sim.decisions.length > 0;
    return (
      <div className="dock dock-min" ref={rootRef} style={style} data-collapsed="true">
        <button type="button" className={`dock-pill ${urgent ? "urgent" : ""}`} aria-label={`Notifications, ${count} unresolved. Open (J)`} title="Open notifications (J)" onClick={() => toggleDock()}>
          <IconBell size={16} /><span className="dock-pill-n">{count}</span>
          {count === 0 && notices.length > 0 && <span className="dock-pill-sub">{notices.length} new</span>}
        </button>
      </div>
    );
  }

  return (
    <div className={`dock ${dragPos ? "dragging" : ""}`} ref={rootRef} style={style} role="region" aria-label="Notifications" data-collapsed="false">
      <header className="dock-head">
        <button type="button" className="dock-grip" aria-label="Move notifications: drag, or use the arrow keys" title={onMap ? "Drag to move" : "Move on the map view"} disabled={!onMap}
          onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={onGripUp} onKeyDown={onGripKey}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="4" cy="3" r="1.2" /><circle cx="10" cy="3" r="1.2" /><circle cx="4" cy="7" r="1.2" /><circle cx="10" cy="7" r="1.2" /><circle cx="4" cy="11" r="1.2" /><circle cx="10" cy="11" r="1.2" /></svg>
        </button>
        <h2>Notifications</h2>
        <span className={`dock-count ${count > 0 ? "on" : ""}`} aria-label={`${count} unresolved`}>{count}</span>
        <span className="dock-sp" />
        <button type="button" className="dock-clear" disabled={notices.length === 0} onClick={() => dock.clearNotices(maxId)}>Clear notices</button>
        <button type="button" className="icon-btn dock-min-btn" aria-label="Minimize notifications (Esc)" title="Minimize (Esc)" onClick={minimizeDock}>{"–"}</button>
      </header>
      <ul className="dock-list">
        {sortDecisions(sim.decisions, snoozed).map((d) => {
          const k = `d:${d.id}`;
          const later = snoozed.includes(d.id);
          const isOpen = open === k && !later;
          return (
            <li key={k} className={`dock-row dock-decision ${later ? "later" : ""}`}>
              <button type="button" className="dock-row-head" aria-expanded={isOpen} onClick={() => { if (later) useUi.setState((s) => ({ snoozed: s.snoozed.filter((x) => x !== d.id) })); toggleRow(k); }}>
                <span className="dock-ico"><IconBell size={15} /></span>
                <span className="dock-kicker">Decision{later ? " (later)" : ""}</span>
                <span className="dock-title">{d.title}</span>
                <span className={`dock-chev ${isOpen ? "up" : ""}`}><IconChevron size={14} /></span>
              </button>
              {isOpen && (
                <div className="dock-row-body">
                  <p>{d.context}</p>
                  <div className="decision-options">
                    {d.options.map((o) => (
                      <button key={o.id} type="button" className="opt" onClick={() => bridge.decide(d.id, o.id)}>
                        <span className="opt-label">{o.label}</span><span className="opt-effect">{o.effect}</span>
                      </button>
                    ))}
                  </div>
                  {d.routeId && bridge.getState().routes.some((r) => r.id === d.routeId) && (
                    <button type="button" className="link-btn" onClick={() => { setView("routes"); select({ kind: "route", id: d.routeId! }); }}>Show this route in Routes</button>
                  )}
                  <button type="button" className="link-btn" onClick={() => { snooze(d.id); setOpen(null); }}>Decide later</button>
                </div>
              )}
            </li>
          );
        })}
        {unseenOffers.map((o) => {
          const k = `o:${o.id}`;
          const isOpen = open === k;
          return (
            <li key={k} className="dock-row dock-offer">
              <button type="button" className="dock-row-head" aria-expanded={isOpen} onClick={() => toggleRow(k)}>
                <span className="dock-ico"><IconTag size={15} /></span>
                <span className="dock-kicker">{KIND_BADGE[o.kind]}</span>
                <span className="dock-title">{o.quantity} x {o.typeName}</span>
                <span className={`dock-chev ${isOpen ? "up" : ""}`}><IconChevron size={14} /></span>
              </button>
              {isOpen && (
                <div className="dock-row-body">
                  <p>{formatMoney(o.unitPriceUsd)} each, {Math.round(o.discount * 100)}% {o.kind === "used" ? "below new" : "off list"}. <OfferClose offer={o} />.</p>
                  <div className="offer-popup-actions">
                    <button type="button" className="primary" onClick={() => { markSeen(unseenOffers.map((f) => f.id)); setTab("offers"); setView("orders"); }}>View offer</button>
                    <button type="button" onClick={() => { markSeen([o.id]); setOpen(null); }}>Decide later</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {notices.map((n) => {
          const { Icon, label } = SEV[n.severity];
          const k = `n:${n.id}`;
          const isOpen = open === k;
          return (
            <li key={k} className={`dock-row dock-notice sev-${n.severity}`}>
              <button type="button" className="dock-row-head" aria-expanded={isOpen} onClick={() => toggleRow(k)}>
                <span className="sev-icon dock-ico" role="img" aria-label={label}><Icon size={15} /></span>
                <span className={`dock-title ${isOpen ? "full" : ""}`}>{n.text}</span>
                <time>{formatDay(n.day).slice(4, -5)}</time>
              </button>
            </li>
          );
        })}
        {sim.decisions.length + unseenOffers.length + notices.length === 0 && <li className="dock-empty">Nothing new.</li>}
      </ul>
    </div>
  );
}
