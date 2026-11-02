import { useSim } from "../sim/useSim";

export default function OrdersView() {
  const { decisions } = useSim();
  return (
    <div className="page">
      <header className="page-head"><h1>Orders / Offers</h1><p>Aircraft orders, manufacturer offers and partner proposals.</p></header>
      <div className="empty-state">
        <h2>No open orders</h2>
        <p>Orders you place and offers you receive will appear here. {decisions.length > 0 ? `${decisions.length} decision${decisions.length > 1 ? "s are" : " is"} waiting on the map.` : "Nothing needs your attention."}</p>
      </div>
    </div>
  );
}
