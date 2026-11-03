import type { Day } from "@arg/contracts";
import { dayToDate, START_YEAR } from "../time/calendar";

/**
 * Airport opening and closing dates (sim-side table; the data package describes airports as they were in 2015 and carries no dates).
 * Dates are calendar dates (UTC, year-month-day), turned into campaign days by `dateToDay`. Day 0 = 2015-01-01.
 *
 * Sources (public record, from memory; the dates are plain calendar facts, not model estimates):
 *  - Rygge (RYG): commercial service ended 31 Oct 2016, the airport closed to civil traffic on 1 Nov 2016.
 *  - Berlin Schoenefeld (SXF): flights moved to BER Terminal 5 / the new airport; last SXF commercial flights 24-25 Oct 2020.
 *  - Berlin Tegel (TXL): last flights 8 Nov 2020, a week after Berlin Brandenburg (BER) opened on 31 Oct 2020.
 *  - Doncaster Sheffield (DSA): closed 1 Nov 2022 (the owner announced the closure on 28 Jul 2022 and the last flights were in Oct 2022).
 *  - Berlin Brandenburg (BER): opened 31 Oct 2020. BER is NOT in packages/data at the time of writing, so this entry is inert until the
 *    data lane adds it; it is listed so that rivals and routes pick it up as soon as it exists. `replacedBy` links are used for notices.
 */
export interface AirportEvent {
  id: string;
  /** First day the airport is unavailable (closing) or available (opening). ISO date. */
  date: string;
  /** For a closure: the airport that takes over, if any (informs notices and rival re-basing). */
  replacedBy?: string;
}

export const AIRPORT_CLOSURES: readonly AirportEvent[] = [
  { id: "RYG", date: "2016-11-01" },
  { id: "SXF", date: "2020-10-26", replacedBy: "BER" },
  { id: "TXL", date: "2020-11-09", replacedBy: "BER" },
  { id: "DSA", date: "2022-11-01" },
];

/** Airports that did not exist at the start of the campaign. */
export const AIRPORT_OPENINGS: readonly AirportEvent[] = [{ id: "BER", date: "2020-10-31" }];

/** Campaign day of an ISO calendar date ("2020-10-31"). Day 0 = 2015-01-01. */
export function dateToDay(iso: string): Day {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const leap = (yy: number) => (yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0;
  const dim = [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let day = 0;
  if (y >= START_YEAR) for (let yy = START_YEAR; yy < y; yy++) day += leap(yy) ? 366 : 365;
  else for (let yy = y; yy < START_YEAR; yy++) day -= leap(yy) ? 366 : 365;
  for (let i = 0; i < m - 1; i++) day += dim[i]!;
  return day + d - 1;
}

const closeDay = new Map(AIRPORT_CLOSURES.map((e) => [e.id, dateToDay(e.date)] as const));
const openDay = new Map(AIRPORT_OPENINGS.map((e) => [e.id, dateToDay(e.date)] as const));
/** Sorted days on which the set of open airports changes; its length up to `day` is the "epoch" that keys caches. */
const changeDays = [...closeDay.values(), ...openDay.values()].sort((x, y) => x - y);

/** True when the airport can be used on `day` (not yet closed, already opened). Unknown ids are always open. */
export function airportOpen(id: string, day: Day): boolean {
  const c = closeDay.get(id);
  if (c !== undefined && day >= c) return false;
  const o = openDay.get(id);
  if (o !== undefined && day < o) return false;
  return true;
}

/** Number of opening/closing events on or before `day`: constant between events, so safe as a cache key for open-airport sets. */
export function airportEpoch(day: Day): number {
  let n = 0;
  while (n < changeDays.length && changeDays[n]! <= day) n++;
  return n;
}

/** The closure record for an airport, if it has one. */
export function closureOf(id: string): (AirportEvent & { day: Day }) | undefined {
  const e = AIRPORT_CLOSURES.find((x) => x.id === id);
  return e ? { ...e, day: dateToDay(e.date) } : undefined;
}

/** Date label for notices ("1 Nov 2022"). */
export function dayLabel(day: Day): string {
  const c = dayToDate(day);
  return `${c.dayOfMonth} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][c.month]} ${c.year}`;
}
