import { fleetRows } from "../dev/viewData";

const LABEL = { active: "Active", maintenance: "Maintenance", delivery: "On order", stored: "Stored" } as const;

export default function FleetView() {
  return (
    <div className="page">
      <header className="page-head"><h1>Fleet</h1><p>{fleetRows.length} aircraft. Demo data from fixtures.</p></header>
      <ul className="cards">
        {fleetRows.map((a) => (
          <li key={a.tail} className="card">
            <div className="card-top"><strong>{a.tail}</strong><span className={`status st-${a.status}`}>{LABEL[a.status]}</span></div>
            <div className="card-sub">{a.type}</div>
            <dl className="mini"><dt>Age</dt><dd>{a.ageYears} yr</dd><dt>Assignment</dt><dd>{a.assignment}</dd></dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
