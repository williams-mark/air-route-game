import { useMemo, useState } from "react";
import type { Airport, Id } from "@arg/contracts";
import { COMMAND_PARAMS, baseSlotFeeUsd, homeHubOf, hubCongestion, ownedHubsOf, playerHubs, playerTerminalOf, terminalsOf, weeklySlotFees } from "@arg/sim";
import { Modal } from "../shell/Modal";
import { usd } from "../routes/fmt";
import { bridge, useSim } from "../sim/useSim";
import { useToasts } from "../routes/store";
import { deltaText, hubTitle, otherHubs, slotBar, terminalRows, type TerminalRow } from "../hubs/hubs";
import "../hubs/hubs.css";

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

interface Move { airport: Airport; from: TerminalRow; to: TerminalRow }

/** Hubs: slot congestion at each of your non-home hubs and the terminal you occupy there (estimated slot and terminal fees). */
export default function HubsView() {
  const { cash } = useSim(); // re-render on every snapshot (day steps, commands)
  const sim = bridge.getSim?.() ?? null;
  const [move, setMove] = useState<Move | null>(null);
  const [unlockId, setUnlockId] = useState("");
  const owned = sim ? ownedHubsOf(sim) : [];
  const unlockable = useMemo(
    () => (sim?.airports ?? []).filter((a) => !owned.includes(a.id)).sort((a, b) => a.id.localeCompare(b.id, "en")),
    [sim?.airports, owned.join()], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const unlockCost = COMMAND_PARAMS.hubUnlockUsd;
  const unlock = () => {
    const res = bridge.dispatch({ kind: "unlockHub", airportId: unlockId });
    if (res && !res.ok) useToasts.getState().push("alert", res.error.message);
    else useToasts.getState().push("good", `${unlockId} is now one of your hubs.`);
    setUnlockId("");
  };
  const [staged, setStaged] = useState<Record<Id, Id>>({});
  const home = sim ? homeHubOf(sim) : bridge.getState().airline.hub;
  const hubs = sim ? otherHubs(playerHubs(sim), home) : [];
  const total = sim ? weeklySlotFees(sim).total : 0;
  const airportById = useMemo(() => new Map((sim?.airports ?? []).map((a) => [a.id, a])), [sim?.airports]);

  const confirm = () => {
    if (!move) return;
    const res = bridge.dispatch({ kind: "setHubTerminal", airportId: move.airport.id, terminalId: move.to.id });
    if (res && !res.ok) useToasts.getState().push("alert", res.error.message);
    else useToasts.getState().push("good", `${move.airport.id}: your slots moved to ${move.to.name}.`);
    setStaged((s) => { const { [move.airport.id]: _gone, ...rest } = s; return rest; });
    setMove(null);
  };

  return (
    <div className="hubs">
      <header className="hubs-head">
        <h1>Hubs</h1>
        <span className="hubs-home" title="Your home hub is not listed below">Home hub <b>{home}</b></span>
        {sim && <span className="hubs-total">Slot and terminal fees across all airports <b>{usd(total)}</b> a week</span>}
      </header>
      <p className="hubs-intro">Each round trip a week uses 2 slots at both of its airports. Slot counts, slot fees and the terminal fee tiers below are estimates built for this game, not published airport figures.</p>
      {sim && (
        <div className="hubs-unlock">
          <label>Unlock a hub
            <select value={unlockId} onChange={(e) => setUnlockId(e.target.value)} aria-label="Airport to unlock as a hub">
              <option value="">Choose an airport</option>
              {unlockable.map((a) => <option key={a.id} value={a.id}>{a.id} {a.name}</option>)}
            </select>
          </label>
          <button className="primary" disabled={!unlockId || cash < unlockCost} onClick={unlock} title={cash < unlockCost ? "Not enough cash" : undefined}>
            Unlock hub for {usd(unlockCost)}
          </button>
          <span className="dim">Only your hubs can base aircraft or receive new deliveries.</span>
        </div>
      )}
      {!sim ? (
        <div className="empty-state"><h2>Needs the full simulation</h2><p>Slots and terminals are not modelled in the mock game (?mock), so there is nothing to show here.</p></div>
      ) : hubs.length === 0 ? (
        <div className="empty-state"><h2>No other hubs yet</h2><p>{home} is your home hub. Base an aircraft at another airport (Fleet) and it appears here with its slot congestion and terminals.</p></div>
      ) : (
        <div className="hubs-list">
          {hubs.map((id) => {
            const airport = airportById.get(id);
            if (!airport) return null;
            const c = hubCongestion(sim, id);
            const current = playerTerminalOf(sim, airport);
            const rows = terminalRows(terminalsOf(airport), c, current.id, baseSlotFeeUsd(airport));
            const mine = rows.find((r) => r.yours)!;
            const bar = slotBar(c);
            const target = rows.find((r) => r.id === (staged[id] ?? current.id)) ?? mine;
            const anyEstimate = rows.some((r) => r.estimate);
            const single = rows.length === 1;
            return (
              <section key={id} className="hubs-card" aria-label={`Hub ${id}`}>
                <div className="hubs-card-head">
                  <h2>{hubTitle(airport)}</h2>
                  <span className="hubs-nums">
                    <span>You <b>{n0(c.slotsUsedByPlayer)}</b></span>
                    <span>All airlines <b>{n0(c.slotsUsedByAll)}</b></span>
                    <span>Available <b className={c.slotsAvailable === 0 ? "neg" : undefined}>{n0(c.slotsAvailable)}</b></span>
                    <span className="dim">of {n0(c.slotsPerWeekTotal)} slots a week</span>
                  </span>
                </div>
                <div className="hubs-bar" role="img" aria-label={`${id}: you use ${n0(c.slotsUsedByPlayer)}, other airlines ${n0(c.slotsUsedByAll - c.slotsUsedByPlayer)}, ${n0(c.slotsAvailable)} free of ${n0(c.slotsPerWeekTotal)} weekly slots`}>
                  <i className="mine" style={{ width: `${bar.mine * 100}%` }} />
                  <i className="others" style={{ width: `${bar.others * 100}%` }} />
                  <i className="free" style={{ width: `${bar.free * 100}%` }} />
                </div>
                <div className="hubs-legend"><span><i className="mine" />You</span><span><i className="others" />Other airlines and background traffic</span><span><i className="free" />Free</span></div>
                <table className="hubs-table">
                  <thead>
                    <tr><th scope="col">Terminal</th><th scope="col" className="num">Fee tier</th><th scope="col">Source</th><th scope="col" className="num">Your slots</th><th scope="col" className="num">Capacity</th><th scope="col" className="num">Weekly fee</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className={r.yours ? "yours" : undefined}>
                        <th scope="row">{r.name}{r.yours && <span className="hubs-tag you">yours</span>}{r.premium && <span className="hubs-tag prem">premium</span>}</th>
                        <td className="num">x{r.feeMultiplier.toFixed(2)}</td>
                        <td className="src" title={r.source}>{r.implicit ? "No terminal data: one terminal" : r.estimate ? <span className="hubs-est">Estimate</span> : r.source.replace(/^https?:\/\//, "").slice(0, 36)}</td>
                        <td className="num">{n0(r.slotsUsedByPlayer)}</td>
                        <td className="num">{n0(r.slotsCapacity)}</td>
                        <td className="num">{r.yours ? usd(r.weeklyFeeUsd) : <span className="dim">{usd(r.feeIfMovedUsd)} if moved</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {anyEstimate && <p className="hubs-warn">Terminal fee tiers here are estimates (no airport publishes a per-terminal schedule). Source: {mine.estimate ? mine.source : rows.find((r) => r.estimate)?.source}.</p>}
                {single ? (
                  <p className="hubs-note">{id} has a single terminal, so there is nothing to choose. Your slots here cost {usd(mine.weeklyFeeUsd)} a week.</p>
                ) : (
                  <div className="hubs-move">
                    <label>Move to terminal
                      <select value={target.id} onChange={(e) => setStaged((s) => ({ ...s, [id]: e.target.value }))} aria-label={`Terminal at ${id}`}>
                        {rows.map((r) => <option key={r.id} value={r.id}>{r.name}{r.yours ? " (current)" : ""}</option>)}
                      </select>
                    </label>
                    <span className={`hubs-delta ${target.deltaUsd > 0 ? "neg" : target.deltaUsd < 0 ? "pos" : ""}`}>{target.yours ? "Select another terminal to compare fees." : deltaText(target.deltaUsd)}</span>
                    <button className="primary" disabled={target.yours} onClick={() => setMove({ airport, from: mine, to: target })}>Review move</button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      {move && (
        <Modal label={`Move ${move.airport.id} slots to ${move.to.name}`} onClose={() => setMove(null)}>
          <div className="dialog-head"><h2>Move {move.airport.id} to {move.to.name}?</h2></div>
          <div className="hubs-confirm">
            <p>All your slots at {move.airport.id} move from <b>{move.from.name}</b> (x{move.from.feeMultiplier.toFixed(2)}) to <b>{move.to.name}</b> (x{move.to.feeMultiplier.toFixed(2)}).</p>
            <dl>
              <dt>Weekly fee now</dt><dd>{usd(move.from.weeklyFeeUsd)}</dd>
              <dt>Weekly fee after</dt><dd>{usd(move.to.feeIfMovedUsd)}</dd>
              <dt>Difference</dt><dd className={move.to.deltaUsd > 0 ? "neg" : move.to.deltaUsd < 0 ? "pos" : undefined}>{deltaText(move.to.deltaUsd)}</dd>
            </dl>
            {move.to.estimate && <p className="hubs-warn">This fee tier is an estimate, not a published figure.</p>}
            <div className="hubs-confirm-actions"><button onClick={() => setMove(null)}>Cancel</button><button className="primary" onClick={confirm}>Move slots</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
