import { useMemo, useState } from "react";
import { aircraftTypes } from "@arg/data";
import { COMMAND_PARAMS, dayToDate, defaultLayout, layoutSeats, orderDiscount } from "@arg/sim";
import { bridge, useSim } from "../sim/useSim";
import { formatDate, formatMoney, formatMonthYear } from "../sim/format";
import { useToasts } from "../routes/store";
import { OffersPanel } from "../offers/OffersPanel";
import { useOffersUi } from "../offers/store";
import { CabinDialog } from "../cabin/CabinDialog";
import { useCabinDrafts } from "../cabin/store";

/** Types the sim will take an order for in `year` (not out of production, not more than three years before introduction). */
export function orderableTypes(year: number) {
  return aircraftTypes
    .filter((t) => (t.endYear === null || t.endYear >= year) && t.introYear <= year + COMMAND_PARAMS.orderLeadYears)
    .sort((a, b) => a.maxSeats - b.maxSeats);
}

export default function OrdersView() {
  const { day, cash, orders, decisions, offers } = useSim();
  const tab = useOffersUi((s) => s.tab);
  const setTab = useOffersUi((s) => s.setTab);
  const push = useToasts((s) => s.push);
  const year = dayToDate(day).year;
  const types = useMemo(() => orderableTypes(year), [year]);
  const [typeId, setTypeId] = useState("");
  const [qty, setQty] = useState(1);
  const [designing, setDesigning] = useState(false);
  const orderLayouts = useCabinDrafts((s) => s.orderLayouts);
  const setOrderLayout = useCabinDrafts((s) => s.setOrderLayout);
  // Default to the in-production type closest to a 180-seat narrowbody, a sensible first order.
  const type = types.find((t) => t.id === typeId) ?? [...types].sort((a, b) => Math.abs(a.maxSeats - 190) - Math.abs(b.maxSeats - 190))[0];
  const count = Math.max(1, Math.min(COMMAND_PARAMS.maxOrderCount, Math.round(qty) || 1));
  const discount = orderDiscount(count);
  const unit = type ? type.listPriceUsdM * 1e6 * (1 - discount) : 0;
  const deposit = unit * count * COMMAND_PARAMS.depositFraction;
  const short = deposit > cash;

  const custom = type ? orderLayouts[type.id] : undefined;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) return;
    const res = bridge.dispatch({ kind: "orderAircraft", typeId: type.id, count, layout: custom ?? { sections: [] } });
    if (res && !res.ok) { push("alert", res.error.message); return; }
    push("good", `Ordered ${count} ${type.id}. Deposit ${formatMoney(deposit)} paid.`);
  };

  const open = orders.filter((o) => o.delivered < o.count);
  const done = orders.filter((o) => o.delivered >= o.count);
  return (
    <div className="page">
      <header className="page-head"><h1>Orders / Offers</h1><p>Order new aircraft from the manufacturers. Delivery takes 6 to 30 months depending on size; you pay a 15% deposit now, credited back as each aircraft arrives. Check the Offers tab for launch deals, last production slots, flash sales and used aircraft.</p></header>

      <div className="orders-tabs" role="tablist" aria-label="Orders and offers">
        <button role="tab" id="tab-orders" aria-selected={tab === "orders"} aria-controls="panel-orders" onClick={() => setTab("orders")}>Orders</button>
        <button role="tab" id="tab-offers" aria-selected={tab === "offers"} aria-controls="panel-offers" onClick={() => setTab("offers")}>
          Offers {offers.length > 0 && <span className="n" aria-label={`${offers.length} open`}>{offers.length}</span>}
        </button>
      </div>
      {tab === "offers" ? <div role="tabpanel" id="panel-offers" aria-labelledby="tab-offers"><OffersPanel /></div> : <div role="tabpanel" id="panel-orders" aria-labelledby="tab-orders">
      <section className="panel-box" aria-labelledby="order-h">
        <h2 id="order-h">New order</h2>
        <form className="order-form" onSubmit={submit}>
          <div className="rp-field">
            <label htmlFor="ord-type">Aircraft type</label>
            <select id="ord-type" value={type?.id ?? ""} onChange={(e) => setTypeId(e.target.value)}>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.introYear > year ? ` (enters service ${t.introYear})` : ""}, {t.maxSeats} seats max</option>
              ))}
            </select>
          </div>
          <div className="rp-field">
            <label htmlFor="ord-qty">Quantity</label>
            <input id="ord-qty" type="number" min={1} max={COMMAND_PARAMS.maxOrderCount} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </div>
          <div className="rp-field">
            <label htmlFor="ord-layout">Cabin layout</label>
            <div className="cabin-head-row" style={{ margin: 0 }}>
              <select id="ord-layout" value={custom ? "custom" : "default"} onChange={(e) => { if (e.target.value === "default" && type) setOrderLayout(type.id, null); }}>
                <option value="default">Default for the type{type ? ` (${layoutSeats(defaultLayout(type))} seats)` : ""}</option>
                {custom && <option value="custom">Custom design ({layoutSeats(custom)} seats)</option>}
              </select>
              <button type="button" disabled={!type} onClick={() => setDesigning(true)}>Design cabin{"…"}</button>
            </div>
          </div>
          <dl className="mini order-quote" aria-live="polite">
            <dt>List price</dt><dd>{type ? formatMoney(type.listPriceUsdM * 1e6) : "–"} each</dd>
            <dt>Volume discount</dt><dd>{(discount * 100).toFixed(0)}%</dd>
            <dt>Net price</dt><dd>{formatMoney(unit)} each, {formatMoney(unit * count)} total</dd>
            <dt>Deposit due now</dt><dd className={short ? "neg" : ""}>{formatMoney(deposit)}{short ? " (more than your cash)" : ""}</dd>
          </dl>
          <button type="submit" className="primary" disabled={!type}>Place order</button>
        </form>
      </section>
      {designing && type && (
        <CabinDialog
          title={`Cabin layout for new ${type.name}`} type={type} initial={custom ?? defaultLayout(type)} day={day} confirmLabel="Use this layout"
          onConfirm={(l) => { setOrderLayout(type.id, l); setDesigning(false); }} onClose={() => setDesigning(false)}
        />
      )}

      <section className="panel-box" aria-labelledby="pending-h">
        <h2 id="pending-h">Pending orders</h2>
        {open.length === 0 ? (
          <p className="foot-note">No open orders.{decisions.length > 0 ? ` ${decisions.length} decision${decisions.length > 1 ? "s are" : " is"} waiting on the map.` : ""}</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th scope="col">Order</th><th scope="col">Aircraft</th><th scope="col" className="num">Delivered</th><th scope="col">Ordered</th><th scope="col">Delivery window</th><th scope="col">Next delivery</th><th scope="col" className="num">Net price each</th></tr></thead>
              <tbody>
                {open.map((o) => {
                  const next = o.deliveryDays.filter((d) => d >= day).sort((a, b) => a - b)[0];
                  return (
                    <tr key={o.id}>
                      <th scope="row">{o.id}</th>
                      <td>{o.typeName}</td>
                      <td className="num">{o.delivered} of {o.count}</td>
                      <td>{formatDate(o.orderDay)}</td>
                      <td>{formatMonthYear(o.firstDelivery)}{o.lastDelivery - o.firstDelivery > 20 ? ` to ${formatMonthYear(o.lastDelivery)}` : ""}</td>
                      <td>{next !== undefined ? formatDate(next) : "–"}</td>
                      <td className="num">{formatMoney(o.unitPriceUsd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {done.length > 0 && <p className="foot-note">{done.length} earlier order{done.length > 1 ? "s" : ""} fully delivered.</p>}
      </section>
      </div>}
    </div>
  );
}
