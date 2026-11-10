import { useEffect, useMemo, useState } from "react";
import { aircraftTypes } from "@arg/data";
import { COMMAND_PARAMS, dayToDate, defaultLayout, FINANCING_PARAMS, homeHubOf, layoutSeats, orderableTypes, orderDiscount, ownedHubsOf } from "@arg/sim";
import { bridge, useSim } from "../sim/useSim";
import { formatDate, formatMoney, formatMonthYear } from "../sim/format";
import { useToasts } from "../routes/store";
import { AircraftPicker } from "../aircraft/AircraftPicker";
import { orderBlock } from "../aircraft/availability";
import { usePickerMemory } from "../aircraft/memory";
import { OffersPanel } from "../offers/OffersPanel";
import { useOffersUi } from "../offers/store";
import { CabinDialog } from "../cabin/CabinDialog";
import { useCabinDrafts } from "../cabin/store";
import { ownedHubChoices } from "../hubs/hubs";
import { parseQuantity, pendingBalanceUsd } from "./orderExposure";

type Financing = "purchase" | "lease";

export default function OrdersView() {
  const { day, cash, orders, decisions, offers } = useSim();
  const tab = useOffersUi((s) => s.tab);
  const setTab = useOffersUi((s) => s.setTab);
  const push = useToasts((s) => s.push);
  const year = dayToDate(day).year;
  // The order list is what the sim will take an order for on this date (in production or recently out, introduced by the order lead).
  const types = useMemo(() => orderableTypes(aircraftTypes, year, COMMAND_PARAMS.orderLeadYears), [year]);
  const remembered = usePickerMemory((s) => s.last.order);
  const [typeId, setTypeId] = useState(remembered ?? "");
  // A "order this type" link elsewhere (route aircraft section) updates the remembered choice while this view is mounted.
  useEffect(() => { if (remembered) setTypeId(remembered); }, [remembered]);
  const [qty, setQty] = useState(1);
  const [financing, setFinancing] = useState<Financing>("purchase");
  const [designing, setDesigning] = useState(false);
  const orderLayouts = useCabinDrafts((s) => s.orderLayouts);
  const setOrderLayout = useCabinDrafts((s) => s.setOrderLayout);
  // Default to the in-production type closest to a 180-seat narrowbody, a sensible first order.
  const type = types.find((t) => t.id === typeId) ?? [...types].sort((a, b) => Math.abs(a.maxSeats - 190) - Math.abs(b.maxSeats - 190))[0];
  // The quote follows the field only while it holds a whole number in range; otherwise the form says so and refuses to order.
  const parsedQty = parseQuantity(qty, COMMAND_PARAMS.maxOrderCount);
  const count = parsedQty ?? 1;
  const discount = orderDiscount(count);
  const unit = type ? type.listPriceUsdM * 1e6 * (1 - discount) : 0;
  const listEach = type ? type.listPriceUsdM * 1e6 : 0;
  // Purchase: share of the net price now, the rest at delivery. Lease: down payment on list price now, payments from delivery.
  const deposit = financing === "purchase" ? unit * count * FINANCING_PARAMS.purchaseDownFraction : listEach * count * FINANCING_PARAMS.leaseDownFractionOfList;
  const balance = unit * count * (1 - FINANCING_PARAMS.purchaseDownFraction);
  const short = deposit > cash;
  // Purchase balances fall due in full on delivery day and nothing checks cash then, so show what is already committed.
  const owedAtDelivery = pendingBalanceUsd(orders);
  const cashAfter = cash - deposit - owedAtDelivery - (financing === "purchase" ? balance : 0);

  const custom = type ? orderLayouts[type.id] : undefined;
  // New aircraft are delivered to a hub the player owns; the home hub is the default.
  const simNow = bridge.getSim?.() ?? null;
  const home = simNow ? homeHubOf(simNow) : bridge.getState().airline.hub;
  const hubs = ownedHubChoices(simNow ? ownedHubsOf(simNow) : [home], home);
  const [deliveryHub, setDeliveryHub] = useState<string>(home);
  const deliveryHubId = hubs.includes(deliveryHub) ? deliveryHub : home;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!type || parsedQty === null) return;
    const res = bridge.dispatch({ kind: "orderAircraft", typeId: type.id, count, layout: custom ?? { sections: [] }, financing, deliveryHubId });
    if (res && !res.ok) { push("alert", res.error.message); return; }
    push("good", `Ordered ${count} ${type.id} on ${financing}. ${financing === "purchase" ? "Deposit" : "Down payment"} ${formatMoney(deposit)} paid.`);
  };

  const open = orders.filter((o) => o.delivered < o.count);
  const done = orders.filter((o) => o.delivered >= o.count);
  return (
    <div className="page">
      <header className="page-head"><h1>Orders / Offers</h1><p>Order new aircraft from the manufacturers. Delivery takes 6 to 30 months depending on size; buy outright (20% now, 80% at delivery) or lease (a 10% down payment on list price now, lease payments from delivery). Check the Offers tab for launch deals, last production slots, flash sales and used aircraft.</p></header>

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
            <AircraftPicker label="Aircraft type" value={type?.id ?? ""} onChange={setTypeId} year={year} types={types} block={(t) => orderBlock(t, year)} memoryKey="order" />
          </div>
          <div className="rp-field">
            <label htmlFor="ord-qty">Quantity</label>
            <input id="ord-qty" type="number" min={1} max={COMMAND_PARAMS.maxOrderCount} value={qty} aria-invalid={parsedQty === null || undefined} aria-describedby={parsedQty === null ? "ord-qty-err" : undefined} onChange={(e) => setQty(e.target.value === "" ? NaN : Number(e.target.value))} />
            {parsedQty === null && <div id="ord-qty-err" className="rp-err" role="alert">Enter a whole number from 1 to {COMMAND_PARAMS.maxOrderCount}.</div>}
          </div>
          <div className="rp-field">
            <label htmlFor="ord-hub">Delivery hub</label>
            <select id="ord-hub" value={deliveryHubId} onChange={(e) => setDeliveryHub(e.target.value)}>
              {hubs.map((h) => <option key={h} value={h}>{h}{h === home ? " (home hub)" : ""}</option>)}
            </select>
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
          <fieldset className="fin-cards">
            <legend>Financing</legend>
            <div className="fin-grid" role="radiogroup" aria-label="Financing">
              <button type="button" role="radio" aria-checked={financing === "purchase"} className={`fin-card${financing === "purchase" ? " on" : ""}`} onClick={() => setFinancing("purchase")}>
                <strong>Purchase</strong>
                <span>20% of the net price now, 80% due at delivery.</span>
                <span>Owned outright: no lease payments after delivery.</span>
                <span className="fin-amt">Now {formatMoney(unit * count * FINANCING_PARAMS.purchaseDownFraction)}, at delivery {formatMoney(balance)}</span>
              </button>
              <button type="button" role="radio" aria-checked={financing === "lease"} className={`fin-card${financing === "lease" ? " on" : ""}`} onClick={() => setFinancing("lease")}>
                <strong>Lease</strong>
                <span>10% of list price down now.</span>
                <span>Lease payments and a 15% higher fixed operating cost from delivery.</span>
                <span className="fin-amt">Now {formatMoney(listEach * count * FINANCING_PARAMS.leaseDownFractionOfList)}, then monthly</span>
              </button>
            </div>
          </fieldset>
          <dl className="mini order-quote" aria-live="polite">
            <dt>List price</dt><dd>{type ? formatMoney(type.listPriceUsdM * 1e6) : "–"} each</dd>
            <dt>Volume discount</dt><dd>{(discount * 100).toFixed(0)}%</dd>
            <dt>Net price</dt><dd>{formatMoney(unit)} each, {formatMoney(unit * count)} total</dd>
            <dt>{financing === "purchase" ? "Deposit due now" : "Down payment due now"}</dt><dd className={short ? "neg" : ""}>{formatMoney(deposit)}{short ? " (more than your cash)" : ""}</dd>
            <dt>Already owed at delivery</dt><dd>{formatMoney(owedAtDelivery)} on open orders</dd>
            <dt>Cash after every balance is paid</dt><dd className={cashAfter < 0 ? "neg" : ""}>{formatMoney(cashAfter)}{cashAfter < 0 ? " (before the income you earn until then)" : ""}</dd>
          </dl>
          <button type="submit" className="primary" disabled={!type || parsedQty === null}>Place order</button>
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
