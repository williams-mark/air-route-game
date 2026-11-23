import type { AircraftType, CabinClass, CabinLayout } from "@arg/contracts";
import { cabinGeometry, deckLengths, deckOf, layoutLengthM, SECTION_DIVIDER_M, upperDeckOf } from "@arg/sim";
import { arrangementLabel, arrangementParts, CLASS_LABEL } from "./helpers";
import { deckSpecFor, layoutByDeck } from "./decks";

const W = 1000;
const MARGIN = 46; // nose and tail caps
const BODY_H = 156;
const LABEL_H = 26; // room for class labels under a hull
const UPPER_END_M = 0.8; // stairs / galley strip drawn at each end of an upper deck

interface Props { type: AircraftType; layout: CabinLayout; label?: string }

interface DeckArgs {
  type: AircraftType; layout: CabinLayout; wide: boolean; keyPrefix: string;
  /** Left edge of the cabin zone, px per metre, cabin length in metres, service strip at each end in metres. */
  zoneL: number; sc: number; lengthM: number; endM: number;
  bodyH: number;
  /** "full" draws the nose and tail caps of the fuselage; "pod" a rounded cabin outline (upper deck). */
  shape: "full" | "pod";
  overflow: boolean;
  exits: number[];
  title?: string;
}

/** One deck, top-down: nose at the left, one rect per seat, aisles from the arrangement, exits and galleys marked. */
function Deck({ type, layout, wide, keyPrefix, zoneL, sc, lengthM, endM, bodyH, shape, overflow, exits, title }: DeckArgs) {
  const zoneR = zoneL + lengthM * sc;
  const half = endM * sc;
  const cy = bodyH / 2;
  const rad = bodyH / 2 - 6;
  const inner = bodyH - 6 - (wide ? 30 : 38) * (bodyH / BODY_H);
  let x = zoneL + half; // seats start after the forward galley / door area
  const rects: JSX.Element[] = [];
  const dividers: JSX.Element[] = [];
  const labels: JSX.Element[] = [];

  layout.sections.forEach((s, si) => {
    const parts = arrangementParts(arrangementLabel(type, s.cls, s.seatsAcross, deckOf(s)));
    const sum = parts.reduce((a, b) => a + b, 0) || s.seatsAcross;
    const aisleH = (wide ? 9 : 11) * (bodyH / BODY_H);
    const gaps = Math.max(0, parts.length - 1);
    const cell = (inner - gaps * aisleH) / sum;
    const rowPx = s.pitchIn * 0.0254 * sc;
    const seatLen = Math.max(2, rowPx * (s.cls === "Y" ? 0.78 : 0.86));
    const x0 = x;
    for (let r = 0; r < s.rows; r++) {
      let yy = cy - inner / 2;
      parts.forEach((p, pi) => {
        for (let k = 0; k < p; k++) {
          rects.push(<rect key={`${keyPrefix}${s.cls}-${si}-${r}-${pi}-${k}`} x={x + (rowPx - seatLen) / 2} y={yy + 0.7} width={seatLen} height={Math.max(1.5, cell - 1.4)} rx={Math.min(2.5, cell / 4)} className={`seat seat-${s.cls}`} />);
          yy += cell;
        }
        yy += aisleH;
      });
      x += rowPx;
    }
    labels.push(
      <text key={`l${si}`} x={(x0 + x) / 2} y={bodyH + 14} textAnchor="middle" className="seatmap-label">{CLASS_LABEL[s.cls]}</text>,
    );
    if (si < layout.sections.length - 1) {
      x += SECTION_DIVIDER_M * sc;
      dividers.push(<line key={`d${si}`} x1={x - SECTION_DIVIDER_M * sc / 2} x2={x - SECTION_DIVIDER_M * sc / 2} y1={cy - inner / 2 - 3} y2={cy + inner / 2 + 3} className="seatmap-div" />);
    }
  });

  const bodyTop = cy - bodyH / 2 + 6, bodyBot = cy + bodyH / 2 - 6;
  let hull: string;
  let bodyL = zoneL;
  if (shape === "full") {
    const noseLen = rad * 0.85, tailLen = rad * 1.25;
    bodyL = zoneL - noseLen;
    const bodyR = zoneR + tailLen;
    hull = `M ${zoneL} ${bodyTop} L ${zoneR} ${bodyTop} Q ${bodyR + 6} ${cy - rad * 0.55} ${bodyR} ${cy} Q ${bodyR + 6} ${cy + rad * 0.55} ${zoneR} ${bodyBot} L ${zoneL} ${bodyBot} Q ${bodyL - 4} ${cy + rad * 0.9} ${bodyL} ${cy} Q ${bodyL - 4} ${cy - rad * 0.9} ${zoneL} ${bodyTop} Z`;
  } else {
    const r = Math.min(rad * 0.6, 22);
    hull = `M ${zoneL + r} ${bodyTop} L ${zoneR - r} ${bodyTop} Q ${zoneR} ${bodyTop} ${zoneR} ${bodyTop + r} L ${zoneR} ${bodyBot - r} Q ${zoneR} ${bodyBot} ${zoneR - r} ${bodyBot} L ${zoneL + r} ${bodyBot} Q ${zoneL} ${bodyBot} ${zoneL} ${bodyBot - r} L ${zoneL} ${bodyTop + r} Q ${zoneL} ${bodyTop} ${zoneL + r} ${bodyTop} Z`;
  }
  const galleyW = Math.max(6, half * 0.8);
  const galleyH = 28 * (bodyH / BODY_H);
  return (
    <g>
      <path d={hull} className={`seatmap-hull ${overflow ? "over" : ""}`} />
      {shape === "full" && <text x={bodyL + 14} y={cy + 4} className="seatmap-note" textAnchor="start">Nose</text>}
      {title && <text x={shape === "full" ? bodyL : zoneL} y={-6} className="seatmap-note" textAnchor="start">{title}</text>}
      <rect x={zoneL + half * 0.1} y={cy - galleyH / 2} width={galleyW} height={galleyH} rx={3} className="seatmap-galley"><title>{shape === "full" ? "Forward galley and lavatories" : "Stairs and galley"}</title></rect>
      <rect x={zoneR - half * 0.1 - galleyW} y={cy - galleyH / 2} width={galleyW} height={galleyH} rx={3} className="seatmap-galley"><title>{shape === "full" ? "Aft galley and lavatories" : "Galley and lavatories"}</title></rect>
      {rects}
      {dividers}
      {exits.flatMap((ex, i) => [
        <rect key={`et${i}`} x={ex - 7} y={bodyTop - 3} width={14} height={5} rx={2} className="seatmap-exit"><title>Exit</title></rect>,
        <rect key={`eb${i}`} x={ex - 7} y={bodyBot - 2} width={14} height={5} rx={2} className="seatmap-exit"><title>Exit</title></rect>,
      ])}
      {labels}
    </g>
  );
}

/**
 * Top-down seat map. Single-deck types draw one fuselage. The 747 family and the A380 draw the upper deck above the main deck
 * (`decks.ts`: rows from the front of the layout go upstairs; a drawing aid only, the cabin model is unchanged).
 */
export function SeatMap({ type, layout, label }: Props) {
  const geo = cabinGeometry(type);
  const wide = geo.bodyClass === "widebody";
  const needed = layoutLengthM(layout);
  const overflow = needed > geo.usableLengthM + 1e-9;
  const spec = deckSpecFor(type.id);
  const rad = BODY_H / 2 - 6;
  const noseLen = rad * 0.85, tailLen = rad * 1.25;
  const zoneL = MARGIN + noseLen, zoneR = W - MARGIN - tailLen;
  const seatsTotal = layout.sections.reduce((n, s) => n + s.rows * s.seatsAcross, 0);
  const seatsOf = (l: CabinLayout) => l.sections.reduce((n, s) => n + s.rows * s.seatsAcross, 0);
  const describe = (l: CabinLayout) => l.sections.map((s) => `${CLASS_LABEL[s.cls]} ${s.rows * s.seatsAcross}, ${s.seatsAcross} across ${arrangementLabel(type, s.cls, s.seatsAcross, deckOf(s))}`).join("; ");
  const note = `${needed.toFixed(1)} m of ${geo.usableLengthM.toFixed(1)} m used`;

  if (!spec) {
    const span = Math.max(geo.cabinLengthM, geo.serviceAllowanceM + needed);
    const sc = (zoneR - zoneL) / span; // px per metre
    const half = (geo.serviceAllowanceM / 2) * sc;
    const exits = [zoneL + half * 0.5, zoneR - half * 0.5];
    if (wide) exits.push(zoneL + geo.cabinLengthM * sc * 0.36, zoneL + geo.cabinLengthM * sc * 0.64);
    const height = BODY_H + LABEL_H;
    const aria = `${label ?? type.name} seat map, ${seatsTotal} seats: ${describe(layout)}.${overflow ? " Rows do not fit the cabin." : ""}`;
    return (
      <svg className={`seatmap ${overflow ? "overflow" : ""}`} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={aria} preserveAspectRatio="xMidYMid meet">
        <Deck type={type} layout={layout} wide={wide} keyPrefix="m" zoneL={zoneL} sc={sc} lengthM={span} endM={geo.serviceAllowanceM / 2} bodyH={BODY_H} shape="full" overflow={overflow} exits={exits} />
        <text x={W - MARGIN} y={height - 3} textAnchor="end" className="seatmap-note">{note}</text>
      </svg>
    );
  }

  // Two decks: each section on its own deck, at that deck's width and arrangement. An older layout with no upper-deck section is
  // drawn on the main deck with the upper deck empty (see layoutByDeck).
  const lengths = deckLengths(type)!;
  const upperUsable = lengths.upper;
  const { upper, main, legacy } = layoutByDeck(layout);
  const mainLen = Math.max(geo.cabinLengthM - upperUsable, geo.serviceAllowanceM + layoutLengthM(main));
  const upperWide = (upperDeckOf(type)?.aisles ?? 1) === 2;
  const sc = (zoneR - zoneL) / mainLen;
  const half = (geo.serviceAllowanceM / 2) * sc;
  const upperLen = upperUsable + 2 * UPPER_END_M;
  const upperH = BODY_H * spec.upperWidth;
  const upperX = zoneL + spec.upperStart * mainLen * sc;
  const TITLE_H = 20;
  const mainY = TITLE_H + upperH + LABEL_H + TITLE_H;
  const height = mainY + BODY_H + LABEL_H;
  const exits = [zoneL + half * 0.5, zoneR - half * 0.5, zoneL + mainLen * sc * 0.36, zoneL + mainLen * sc * 0.64];
  const deckOver = !legacy && (layoutLengthM(upper) > lengths.upper + 1e-9 || layoutLengthM(main) > lengths.main + 1e-9);
  const aria = `${label ?? type.name} seat map, ${seatsTotal} seats on two decks. Upper deck ${legacy ? "not set up" : `${seatsOf(upper)} seats: ${describe(upper) || "none"}`}. Main deck ${seatsOf(main)} seats: ${describe(main) || "none"}.${overflow || deckOver ? " Rows do not fit the cabin." : ""}`;
  return (
    <svg className={`seatmap two-deck ${overflow ? "overflow" : ""}`} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={aria} preserveAspectRatio="xMidYMid meet">
      <g transform={`translate(0 ${TITLE_H})`}>
        <Deck type={type} layout={upper} wide={upperWide} keyPrefix="u" zoneL={upperX} sc={sc} lengthM={upperLen} endM={UPPER_END_M} bodyH={upperH} shape="pod" overflow={!legacy && layoutLengthM(upper) > lengths.upper + 1e-9} exits={[]}
          title={legacy ? "Upper deck not set up: this older cabin counts every row on one long main deck" : `Upper deck, ${seatsOf(upper)} seats`} />
      </g>
      <g transform={`translate(0 ${mainY})`}>
        <Deck type={type} layout={main} wide={wide} keyPrefix="m" zoneL={zoneL} sc={sc} lengthM={mainLen} endM={geo.serviceAllowanceM / 2} bodyH={BODY_H} shape="full" overflow={overflow || (!legacy && layoutLengthM(main) > lengths.main + 1e-9)} exits={exits} title={`Main deck, ${seatsOf(main)} seats`} />
      </g>
      <text x={W - MARGIN} y={height - 3} textAnchor="end" className="seatmap-note">{note}</text>
    </svg>
  );
}

export const CLASS_VAR: Record<CabinClass, string> = { F: "var(--cabin-F)", J: "var(--cabin-J)", W: "var(--cabin-W)", Y: "var(--cabin-Y)" };
