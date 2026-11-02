import type { AircraftType, CabinClass, CabinLayout } from "@arg/contracts";
import { cabinGeometry, layoutLengthM, SECTION_DIVIDER_M } from "@arg/sim";
import { arrangementLabel, arrangementParts, CLASS_LABEL } from "./helpers";

const W = 1000;
const MARGIN = 46; // nose and tail caps
const BODY_H = 156;

interface Props { type: AircraftType; layout: CabinLayout; label?: string }

/** Top-down seat map: nose at the left, one rect per seat, aisles from the arrangement, doors and galleys marked. */
export function SeatMap({ type, layout, label }: Props) {
  const geo = cabinGeometry(type);
  const wide = geo.bodyClass === "widebody";
  const needed = layoutLengthM(layout);
  const bodyH = BODY_H;
  const rad = bodyH / 2 - 6;
  const noseLen = rad * 0.85, tailLen = rad * 1.25;
  const zoneL = MARGIN + noseLen, zoneR = W - MARGIN - tailLen;
  const span = Math.max(geo.cabinLengthM, geo.serviceAllowanceM + needed);
  const sc = (zoneR - zoneL) / span; // px per metre
  const half = (geo.serviceAllowanceM / 2) * sc;
  let x = zoneL + half; // seats start after the forward galley / door area
  const height = bodyH + 26; // room for class labels under the hull
  const cy = bodyH / 2;
  const inner = bodyH - 6 - (wide ? 30 : 38);
  const overflow = needed > geo.usableLengthM + 1e-9;
  const rects: JSX.Element[] = [];
  const dividers: JSX.Element[] = [];
  const labels: JSX.Element[] = [];

  layout.sections.forEach((s, si) => {
    const parts = arrangementParts(arrangementLabel(type, s.cls, s.seatsAcross));
    const sum = parts.reduce((a, b) => a + b, 0) || s.seatsAcross;
    const aisleH = wide ? 9 : 11;
    const gaps = Math.max(0, parts.length - 1);
    const cell = (inner - gaps * aisleH) / sum;
    const rowPx = s.pitchIn * 0.0254 * sc;
    const seatLen = Math.max(2, rowPx * (s.cls === "Y" ? 0.78 : 0.86));
    const x0 = x;
    for (let r = 0; r < s.rows; r++) {
      let yy = cy - inner / 2;
      parts.forEach((p, pi) => {
        for (let k = 0; k < p; k++) {
          rects.push(<rect key={`${s.cls}-${r}-${pi}-${k}`} x={x + (rowPx - seatLen) / 2} y={yy + 0.7} width={seatLen} height={Math.max(1.5, cell - 1.4)} rx={Math.min(2.5, cell / 4)} className={`seat seat-${s.cls}`} />);
          yy += cell;
        }
        yy += aisleH;
      });
      x += rowPx;
    }
    labels.push(
      <text key={`l${s.cls}`} x={(x0 + x) / 2} y={bodyH + 14} textAnchor="middle" className="seatmap-label">{CLASS_LABEL[s.cls]}</text>,
    );
    if (si < layout.sections.length - 1) {
      x += SECTION_DIVIDER_M * sc;
      dividers.push(<line key={`d${si}`} x1={x - SECTION_DIVIDER_M * sc / 2} x2={x - SECTION_DIVIDER_M * sc / 2} y1={cy - inner / 2 - 3} y2={cy + inner / 2 + 3} className="seatmap-div" />);
    }
  });

  const bodyL = MARGIN, bodyR = W - MARGIN;
  const bodyTop = cy - bodyH / 2 + 6, bodyBot = cy + bodyH / 2 - 6;
  const hull = `M ${zoneL} ${bodyTop} L ${zoneR} ${bodyTop} Q ${bodyR + 6} ${cy - rad * 0.55} ${bodyR} ${cy} Q ${bodyR + 6} ${cy + rad * 0.55} ${zoneR} ${bodyBot} L ${zoneL} ${bodyBot} Q ${bodyL - 4} ${cy + rad * 0.9} ${bodyL} ${cy} Q ${bodyL - 4} ${cy - rad * 0.9} ${zoneL} ${bodyTop} Z`;
  // Exits: forward and aft pairs, plus mid pairs on widebodies, as small bars on the hull.
  const exitX = [zoneL + half * 0.5, zoneR - half * 0.5];
  if (wide) exitX.push(zoneL + geo.cabinLengthM * sc * 0.36, zoneL + geo.cabinLengthM * sc * 0.64);
  const galleyW = Math.max(8, half * 0.8);
  const seatsTotal = layout.sections.reduce((n, s) => n + s.rows * s.seatsAcross, 0);
  const aria = `${label ?? type.name} seat map, ${seatsTotal} seats: ${layout.sections.map((s) => `${CLASS_LABEL[s.cls]} ${s.rows * s.seatsAcross}, ${s.seatsAcross} across ${arrangementLabel(type, s.cls, s.seatsAcross)}`).join("; ")}.${overflow ? " Rows do not fit the cabin." : ""}`;

  return (
    <svg className={`seatmap ${overflow ? "overflow" : ""}`} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={aria} preserveAspectRatio="xMidYMid meet">
      <path d={hull} className="seatmap-hull" />
      <text x={bodyL + 14} y={cy + 4} className="seatmap-note" textAnchor="start">Nose</text>
      <rect x={zoneL + half * 0.1} y={cy - 14} width={galleyW} height={28} rx={3} className="seatmap-galley"><title>Forward galley and lavatories</title></rect>
      <rect x={zoneR - half * 0.1 - galleyW} y={cy - 14} width={galleyW} height={28} rx={3} className="seatmap-galley"><title>Aft galley and lavatories</title></rect>
      {rects}
      {dividers}
      {exitX.flatMap((ex, i) => [
        <rect key={`et${i}`} x={ex - 7} y={bodyTop - 3} width={14} height={5} rx={2} className="seatmap-exit"><title>Exit</title></rect>,
        <rect key={`eb${i}`} x={ex - 7} y={bodyBot - 2} width={14} height={5} rx={2} className="seatmap-exit"><title>Exit</title></rect>,
      ])}
      {labels}
      <text x={bodyR} y={height - 3} textAnchor="end" className="seatmap-note">{needed.toFixed(1)} m of {geo.usableLengthM.toFixed(1)} m used</text>
    </svg>
  );
}

export const CLASS_VAR: Record<CabinClass, string> = { F: "var(--cabin-F)", J: "var(--cabin-J)", W: "var(--cabin-W)", Y: "var(--cabin-Y)" };
