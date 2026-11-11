import { shortTypeLabel } from "../aircraft/names";
import { useMemo, useState } from "react";
import type { ProfitTier } from "../map/types";
import { useUi } from "../store";
import { formatMoney } from "../sim/format";
import { useCreation, useSwapRequest } from "../routes/store";
import { useRouteSummaries, type RouteSummary } from "../routes/useRoutes";

const TIER_LABEL: Record<ProfitTier, string> = { profit: "Profitable", marginal: "Marginal", loss: "Losing", planned: "Planned" };
const TIERS: ProfitTier[] = ["profit", "marginal", "loss"];

type SortKey = "name" | "aircraft" | "freq" | "load" | "profit" | "margin";
const COLS: Array<{ key: SortKey; label: string; num?: boolean; get: (r: RouteSummary) => string | number }> = [
  { key: "name", label: "Route", get: (r) => r.name },
  { key: "aircraft", label: "Aircraft", get: (r) => r.route.typeId },
  { key: "freq", label: "Freq / wk", num: true, get: (r) => r.route.weeklyFrequency },
  { key: "load", label: "Load factor", num: true, get: (r) => r.loadFactor },
  { key: "margin", label: "Margin", num: true, get: (r) => r.margin },
  { key: "profit", label: "Profit / wk", num: true, get: (r) => r.weeklyProfit },
];

export function sortRoutes(rows: RouteSummary[], key: SortKey, dir: 1 | -1): RouteSummary[] {
  const col = COLS.find((c) => c.key === key)!;
  return [...rows].sort((x, y) => {
    const a = col.get(x), b = col.get(y);
    const c = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
    return (c || x.name.localeCompare(y.name)) * dir;
  });
}

export default function RoutesView() {
  const rows = useRouteSummaries();
  const sel = useUi((s) => s.selection);
  const select = useUi((s) => s.select);
  const begin = useCreation((s) => s.begin);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "profit", dir: -1 });
  const [tiers, setTiers] = useState<Set<ProfitTier>>(new Set());

  const counts = useMemo(() => {
    const m: Record<string, number> = { profit: 0, marginal: 0, loss: 0 };
    for (const r of rows) m[r.tier] = (m[r.tier] ?? 0) + 1;
    return m;
  }, [rows]);
  const shown = useMemo(() => sortRoutes(tiers.size ? rows.filter((r) => tiers.has(r.tier)) : rows, sort.key, sort.dir), [rows, tiers, sort]);
  const total = shown.reduce((s, r) => s + r.weeklyProfit, 0);
  const toggle = (t: ProfitTier) => setTiers((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const swapAc = useSwapRequest((s) => s.request);
  const open = (id: string) => select({ kind: "route", id });

  return (
    <div className="page">
      <header className="page-head routes-head">
        <div>
          <h1>Routes</h1>
          <p>{rows.length} routes{tiers.size ? `, ${shown.length} shown` : ""}. Weekly profit {formatMoney(total, { sign: true })}{rows.some((r) => r.fromSim) ? " before aircraft lease and overhead" : ""}. Select a route to inspect and adjust it.</p>
        </div>
        <button className="primary" onClick={() => begin()} aria-keyshortcuts="N" title="New route (N)">+ New route <kbd>N</kbd></button>
      </header>
      <div className="chips" role="group" aria-label="Filter by profit tier">
        {TIERS.map((t) => (
          <button key={t} className="chip-btn" aria-pressed={tiers.has(t)} onClick={() => toggle(t)}>
            <span className={`dot tier-${t}`} aria-hidden="true" />{TIER_LABEL[t]} <span className="n">{counts[t] ?? 0}</span>
          </button>
        ))}
        {tiers.size > 0 && <button className="link-btn" onClick={() => setTiers(new Set())}>Clear filter</button>}
      </div>
      <div className="table-wrap">
        <table className="data routes-table">
          <thead>
            <tr>
              {COLS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th key={c.key} scope="col" className={c.num ? "num" : ""} aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                    <button className="th-btn" onClick={() => setSort({ key: c.key, dir: active ? (sort.dir === 1 ? -1 : 1) : c.num ? -1 : 1 })}>
                      {c.label}<span className="arrow" aria-hidden="true">{active ? (sort.dir === 1 ? "▲" : "▼") : ""}</span>
                    </button>
                  </th>
                );
              })}
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.route.id} className={`clickable ${sel?.kind === "route" && sel.id === r.route.id ? "selected" : ""}`} onClick={() => open(r.route.id)}>
                <th scope="row">
                  <button className="row-link" aria-label={`Inspect ${r.name}, ${TIER_LABEL[r.tier]}`} onClick={(e) => { e.stopPropagation(); open(r.route.id); }}>
                    <span className={`dot tier-${r.tier}`} aria-hidden="true" />{r.name}
                  </button>
                </th>
                <td>{shortTypeLabel(r.route.typeId)}</td>
                <td className="num">{r.scheduled !== undefined && r.scheduled < r.route.weeklyFrequency ? <span className="neg" title="Round trips actually flown with the aircraft you have">{r.scheduled} of {r.route.weeklyFrequency}</span> : r.route.weeklyFrequency}</td>
                <td className="num">{r.feasible ? `${Math.round(r.loadFactor * 100)}%` : "–"}</td>
                <td className={`num ${r.margin < 0 ? "neg" : "pos"}`}>{r.feasible ? `${(r.margin * 100).toFixed(0)}%` : "–"}</td>
                <td className={`num ${r.weeklyProfit < 0 ? "neg" : r.weeklyProfit > 0 ? "pos" : ""}`}>{formatMoney(r.weeklyProfit, { sign: true })}</td>
                <td><button className="row-act" aria-label={`Change aircraft on ${r.name}`} onClick={(e) => { e.stopPropagation(); swapAc(r.route.id); }}>Change aircraft</button></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={COLS.length + 1} className="empty-row">{rows.length === 0 ? "No routes yet. Press N to open your first." : "No routes match this filter."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
