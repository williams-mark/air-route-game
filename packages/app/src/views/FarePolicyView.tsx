import { useMemo, useState } from "react";
import type { FarePolicy, Id, RouteCategory } from "@arg/contracts";
import { homeHubOf, playerHubs } from "@arg/sim";
import { Modal } from "../shell/Modal";
import { uiAirports } from "../dev/airportSource";
import { bridge, useSim } from "../sim/useSim";
import { useToasts } from "../routes/store";
import { fareFloorText } from "../routes/helpers";
import {
  CATEGORY_GROUPS, MARKDOWN_MAX_PCT, TARGET_MAX_PCT, TARGET_MIN_PCT, blankDraft, categoryLabel, clampMarkdownPct, clampTargetPct, coverage, draftFromPolicy, draftToPolicy,
  filterRoutes, moveBy, reorderPlan, scopeText, targetText, withPolicy, type PolicyDraft,
} from "../farepolicy/policy";
import "../farepolicy/farepolicy.css";

const NO_POLICIES: FarePolicy[] = [];

/** Fare policies: name, target load factor, connection markdown and scope, with a live preview of the routes each one covers. */
export default function FarePolicyView() {
  const { routes: snapRoutes } = useSim();
  const sim = bridge.getSim?.() ?? null;
  const policies = sim?.world.farePolicies ?? NO_POLICIES;
  const routes = sim?.world.routes ?? snapRoutes;
  const airports = sim?.airports ?? uiAirports;
  const hubs = sim ? playerHubs(sim) : [bridge.getState().airline.hub];
  const home = sim ? homeHubOf(sim) : hubs[0]!;
  void home;
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [picked, setPicked] = useState<Id | null>(null);
  const [onlyCovered, setOnlyCovered] = useState(false);
  const [del, setDel] = useState<FarePolicy | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validRoutes = useMemo(() => new Set(routes.map((r) => r.id)), [routes]);
  const parsed = draft ? draftToPolicy(draft, validRoutes) : null;
  // Preview list: the saved policies, with the draft applied when editing.
  const previewPolicies = useMemo(() => (parsed?.ok ? withPolicy(policies, parsed.policy) : policies), [policies, parsed]);
  const focusId = draft?.id ?? picked;
  const rows = useMemo(() => coverage(previewPolicies, routes, airports, hubs), [previewPolicies, routes, airports, hubs.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const coverCount = (id: Id) => rows.filter((r) => r.covering.includes(id)).length;
  const nameOf = (id: Id) => previewPolicies.find((p) => p.id === id)?.name ?? id;
  const floorCell = (id: Id) => {
    const rep = sim?.routeReports[id];
    const t = fareFloorText(rep);
    return t ? <span className="neg" title={t}>Floor binding: load factor {Math.round(rep!.evaluation.loadFactor * 100)}% below target {Math.round(rep!.fareFloor!.target * 100)}%</span> : <span className="dim">no</span>;
  };
  const shown = onlyCovered && focusId ? rows.filter((r) => r.covering.includes(focusId)) : rows;

  const toast = (kind: "good" | "alert", text: string) => useToasts.getState().push(kind, text);
  const run = (cmd: Parameters<typeof bridge.dispatch>[0]): boolean => {
    if (!sim) { setError("The mock game does not support fare policies."); return false; }
    const res = bridge.dispatch(cmd);
    if (res && !res.ok) { setError(res.error.message); return false; }
    setError(null);
    return true;
  };

  const save = () => {
    if (!draft || !parsed) return;
    if (!parsed.ok) { setError(parsed.error); return; }
    if (run({ kind: "setFarePolicy", policy: parsed.policy })) { toast("good", `${isNew ? "Added" : "Saved"} fare policy "${parsed.policy.name}".`); setPicked(parsed.policy.id); setDraft(null); }
  };
  const remove = () => {
    if (!del) return;
    if (run({ kind: "removeFarePolicy", id: del.id })) { toast("good", `Deleted fare policy "${del.name}".`); if (picked === del.id) setPicked(null); if (draft?.id === del.id) setDraft(null); }
    setDel(null);
  };
  const reorder = (index: number, delta: -1 | 1) => {
    const next = moveBy(policies, index, delta);
    const plan = reorderPlan(policies, next);
    for (const id of plan.remove) if (!run({ kind: "removeFarePolicy", id })) return;
    for (const policy of plan.add) if (!run({ kind: "setFarePolicy", policy })) return;
  };
  const edit = (p: FarePolicy) => { setDraft(draftFromPolicy(p)); setIsNew(false); setPicked(p.id); setError(null); };
  const create = () => { setDraft(blankDraft(policies)); setIsNew(true); setError(null); };
  const set = (patch: Partial<PolicyDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <div className="fp">
      <header className="fp-head">
        <h1>Fare policy</h1>
        <p>A policy steers fares towards a target load factor on the routes it covers. A route&apos;s own target overrides every policy, and a later policy overrides an earlier one where both cover a route.</p>
        <button className="primary" onClick={create} disabled={!sim}>New policy</button>
      </header>
      {!sim && <p className="fp-warn" role="status">Fare policies need the full simulation. The mock game (?mock) ignores these commands, so editing is disabled.</p>}
      {error && <p className="fp-error" role="alert">{error}</p>}
      <div className="fp-grid">
        <section className="fp-box" aria-label="Policies">
          <h2>Policies, in order (last wins)</h2>
          {policies.length === 0 ? (
            <p className="fp-empty">No fare policies yet. Routes keep their own target, or none. Create one to steer many routes at once.</p>
          ) : (
            <ol className="fp-list">
              {policies.map((p, i) => (
                <li key={p.id} className={focusId === p.id ? "on" : undefined}>
                  <button className="fp-pick" onClick={() => setPicked(p.id === picked ? null : p.id)} aria-pressed={picked === p.id}>
                    <b>{p.name}</b>
                    <span>Target {targetText(p.targetLoadFactor)} · {Math.round(p.connectionMarkdown * 100) > 0 ? `Connections −${Math.round(p.connectionMarkdown * 100)}%` : "Connections at full fare"}</span>
                    <span className="dim">{scopeText(p)} · covers {coverCount(p.id)} route{coverCount(p.id) === 1 ? "" : "s"}</span>
                  </button>
                  <span className="fp-actions">
                    <button aria-label={`Move ${p.name} up`} title="Earlier (lower priority)" disabled={i === 0} onClick={() => reorder(i, -1)}>↑</button>
                    <button aria-label={`Move ${p.name} down`} title="Later (higher priority)" disabled={i === policies.length - 1} onClick={() => reorder(i, 1)}>↓</button>
                    <button onClick={() => edit(p)}>Edit</button>
                    <button onClick={() => setDel(p)} aria-label={`Delete ${p.name}`}>Delete</button>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {draft && (
            <form className="fp-form" aria-label={isNew ? "New fare policy" : "Edit fare policy"} onSubmit={(e) => { e.preventDefault(); save(); }}>
              <h3>{isNew ? "New policy" : "Edit policy"}</h3>
              <label className="fp-field">Name
                <input value={draft.name} onChange={(e) => set({ name: e.target.value })} maxLength={40} placeholder="e.g. Long-haul fill" autoFocus />
              </label>
              <div className="fp-field">
                <span className="fp-label">Target load factor</span>
                <div className="fp-row">
                  <label className="fp-check"><input type="checkbox" checked={!draft.targetOn} onChange={(e) => set({ targetOn: !e.target.checked })} />Off</label>
                  <input type="range" aria-label="Target load factor" min={TARGET_MIN_PCT} max={TARGET_MAX_PCT} value={draft.targetPct} disabled={!draft.targetOn} onChange={(e) => set({ targetPct: clampTargetPct(Number(e.target.value)) })} />
                  <input type="number" className="fp-num" aria-label="Target load factor percent" min={TARGET_MIN_PCT} max={TARGET_MAX_PCT} value={draft.targetPct} disabled={!draft.targetOn} onChange={(e) => set({ targetPct: Number(e.target.value) })} onBlur={() => set({ targetPct: clampTargetPct(draft.targetPct) })} />
                  <span>%</span>
                </div>
                <span className="hint">{draft.targetOn ? `Fares on covered routes are adjusted each week to fill about ${draft.targetPct}% of seats (${TARGET_MIN_PCT}-${TARGET_MAX_PCT}%).` : "Off: covered routes get no target from this policy, and it switches off an earlier policy's target on them."}</span>
              </div>
              <div className="fp-field">
                <span className="fp-label">Connection markdown</span>
                <div className="fp-row">
                  <input type="range" aria-label="Connection markdown" min={0} max={MARKDOWN_MAX_PCT} value={draft.markdownPct} onChange={(e) => set({ markdownPct: clampMarkdownPct(Number(e.target.value)) })} />
                  <input type="number" className="fp-num" aria-label="Connection markdown percent" min={0} max={MARKDOWN_MAX_PCT} value={draft.markdownPct} onChange={(e) => set({ markdownPct: Number(e.target.value) })} onBlur={() => set({ markdownPct: clampMarkdownPct(draft.markdownPct) })} />
                  <span>%</span>
                </div>
                <span className="hint">Average markdown in price for connecting fares: a through ticket costs this much less than the two direct fares added together (0-{MARKDOWN_MAX_PCT}%). Cheaper connections win more passengers but earn less on each. Local fares are not changed.</span>
              </div>
              <fieldset className="fp-field fp-scope">
                <legend>Scope</legend>
                <label className="fp-check"><input type="radio" name="fp-scope" checked={draft.all} onChange={() => set({ all: true })} />All routes</label>
                <label className="fp-check"><input type="radio" name="fp-scope" checked={!draft.all} onChange={() => set({ all: false })} />Categories and/or chosen routes</label>
                {!draft.all && (
                  <>
                    <div className="fp-cats">
                      {CATEGORY_GROUPS.map((g) => (
                        <div key={g.label}>
                          <span className="fp-label">{g.label}</span>
                          {g.cats.map((c) => (
                            <label key={c.id} className="fp-check"><input type="checkbox" checked={draft.categories.includes(c.id)} onChange={() => set({ categories: toggle(draft.categories, c.id) })} />{c.label}</label>
                          ))}
                        </div>
                      ))}
                    </div>
                    <RoutePicker routes={routes} selected={draft.routeIds} onToggle={(id) => set({ routeIds: toggle(draft.routeIds, id) })} />
                    <span className="hint">A route is covered when it matches any ticked category or is ticked in the list.</span>
                  </>
                )}
              </fieldset>
              <div className="fp-form-actions">
                <button type="button" onClick={() => { setDraft(null); setError(null); }}>Cancel</button>
                <button type="submit" className="primary" disabled={!sim}>{isNew ? "Add policy" : "Save changes"}</button>
              </div>
            </form>
          )}
        </section>
        <section className="fp-box" aria-label="Preview">
          <h2>Effective target per route{draft ? " (with your draft)" : ""}</h2>
          <div className="fp-preview-bar">
            {focusId ? <label className="fp-check"><input type="checkbox" checked={onlyCovered} onChange={(e) => setOnlyCovered(e.target.checked)} />Only routes covered by “{nameOf(focusId)}” ({coverCount(focusId)})</label> : <span className="hint">Select a policy to highlight the routes it covers.</span>}
          </div>
          {rows.length === 0 ? <p className="fp-empty">You have no routes yet.</p> : (
            <div className="fp-scroll">
              <table className="fp-table">
                <thead><tr><th scope="col">Route</th><th scope="col">Covered by</th><th scope="col" className="num">Effective target</th><th scope="col">From</th><th scope="col">Fare floor</th></tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.routeId} className={focusId && r.covering.includes(focusId) ? "hit" : undefined}>
                      <th scope="row">{r.name}<span className="fp-cats-txt">{r.categories.map(categoryLabel).join(", ")}</span></th>
                      <td>{r.covering.length === 0 ? <span className="dim">no policy</span> : r.covering.map((id, k) => <span key={id} className={`fp-chip ${k === r.covering.length - 1 && r.source.kind === "policy" ? "win" : "lost"}`}>{nameOf(id)}</span>)}</td>
                      <td className="num">{targetText(r.target)}</td>
                      <td className="src">{r.source.kind === "route" ? "Route target" : r.source.kind === "policy" ? r.source.name : <span className="dim">none</span>}</td>
                      <td className="src">{floorCell(r.routeId)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      {del && (
        <Modal label={`Delete fare policy ${del.name}`} onClose={() => setDel(null)}>
          <div className="dialog-head"><h2>Delete “{del.name}”?</h2></div>
          <div className="fp-confirm">
            <p>The {coverCount(del.id)} route{coverCount(del.id) === 1 ? "" : "s"} it covers fall back to an earlier policy, their own target, or no target.</p>
            <div className="fp-form-actions"><button onClick={() => setDel(null)}>Cancel</button><button className="primary" onClick={remove}>Delete policy</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function toggle<T>(list: readonly T[], v: T): T[] { return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]; }

function RoutePicker({ routes, selected, onToggle }: { routes: ReadonlyArray<{ id: Id; origin: string; destination: string }>; selected: readonly Id[]; onToggle: (id: Id) => void }) {
  const [q, setQ] = useState("");
  const list = filterRoutes(routes, q);
  return (
    <div className="fp-routes">
      <span className="fp-label">Chosen routes ({selected.filter((id) => routes.some((r) => r.id === id)).length} of {routes.length})</span>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search routes, e.g. LAX" aria-label="Search routes" />
      <div className="fp-route-list" role="group" aria-label="Routes">
        {list.length === 0 ? <span className="hint">No route matches.</span> : list.map((r) => (
          <label key={r.id} className="fp-check"><input type="checkbox" checked={selected.includes(r.id)} onChange={() => onToggle(r.id)} />{r.origin}–{r.destination}</label>
        ))}
      </div>
    </div>
  );
}

export type { RouteCategory };
