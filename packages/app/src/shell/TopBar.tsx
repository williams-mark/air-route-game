import { useSim } from "../sim/useSim";
import { toggleDock } from "../notify/NotificationDock";
import { formatDay, formatMoney } from "../sim/format";
import { useUi } from "../store";
import { IconKeyboard, IconMoon, IconSearch, IconSun, IconBell, IconTag } from "./icons";
import { Sparkline } from "./Sparkline";
import { useOffersUi } from "../offers/store";

export function TopBar() {
  const sim = useSim();
  const ui = useUi();
  const pending = sim.decisions.length;
  const offerCount = sim.offers.length;
  const openOffers = () => { useOffersUi.getState().setTab("offers"); useOffersUi.getState().markSeen(sim.offers.map((o) => o.id)); ui.setView("orders"); };
  return (
    <header className="topbar">
      <div className="brand" title="Hub: LAX">
        <strong>{sim.airline.name}</strong>
        <span className="chip">Hub {sim.airline.hub}</span>
      </div>

      <div className="stats" role="group" aria-label="Company status">
        <div className="stat"><span className="k">Date</span><span className="v" aria-live="off">{formatDay(sim.day)}</span></div>
        <div className="stat"><span className="k">Cash</span><span className="v">{formatMoney(sim.cash)}</span></div>
        <div className="stat">
          <span className="k">Profit, 30 days</span>
          <span className={`v ${sim.profit30 >= 0 ? "pos" : "neg"}`}>
            {formatMoney(sim.profit30, { sign: true })}
            <Sparkline values={sim.profitSeries} label="Daily profit over the last 30 days" />
          </span>
        </div>
      </div>

      <div className="topbar-right">
        {pending > 0 && (
          <button className="pill-btn" aria-label={`${pending} pending decisions. Show`} onClick={() => { ui.unsnoozeAll(); toggleDock(true); }}>
            <IconBell size={16} /> {pending}
          </button>
        )}
        {offerCount > 0 && (
          <button className="pill-btn offers-badge" aria-label={`${offerCount} open offer${offerCount > 1 ? "s" : ""}. Show`} title="Open manufacturer and market offers" onClick={openOffers}>
            <IconTag size={16} /> {offerCount}
          </button>
        )}
        <button className="icon-btn" aria-label="Open command palette" title="Command palette (Ctrl/Cmd+K)" onClick={() => ui.setPalette(true)}><IconSearch size={18} /></button>
        <button className="icon-btn" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => ui.setHelp(true)}><IconKeyboard size={18} /></button>
        <button className="icon-btn" aria-label={`Switch to ${ui.theme === "dark" ? "light" : "dark"} theme`} title="Toggle theme" onClick={() => ui.setTheme(ui.theme === "dark" ? "light" : "dark")}>
          {ui.theme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
        </button>
      </div>
    </header>
  );
}
