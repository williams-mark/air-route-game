import type { Day } from "@arg/contracts";

/** Day 0 = 2015-01-01 (a Thursday). Proleptic Gregorian calendar. */
export const START_YEAR = 2015;

/**
 * Campaign day of 1 January of `year` (day 0 = 2015-01-01). Negative before 2015, so a game started in an earlier year keeps the same
 * absolute calendar as every other year; all year-dependent sim data (closures, offers, aircraft availability) is keyed on it.
 */
export function jan1Day(year: number): Day {
  let d = 0;
  if (year >= START_YEAR) for (let y = START_YEAR; y < year; y++) d += isLeapYear(y) ? 366 : 365;
  else for (let y = year; y < START_YEAR; y++) d -= isLeapYear(y) ? 366 : 365;
  return d;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  const base = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month] ?? 30;
  return month === 1 && isLeapYear(year) ? 29 : base;
}

export interface CalendarDate {
  year: number;
  month: number; // 0..11
  dayOfMonth: number; // 1..31
  dayOfYear: number; // 0..365
  /** 0 = Monday ... 6 = Sunday. */
  weekday: number;
}

export function dayToDate(day: Day): CalendarDate {
  let d = Math.floor(day);
  let year = START_YEAR;
  if (d >= 0) {
    for (;;) {
      const len = isLeapYear(year) ? 366 : 365;
      if (d < len) break;
      d -= len;
      year++;
    }
  } else {
    while (d < 0) {
      year--;
      d += isLeapYear(year) ? 366 : 365;
    }
  }
  const dayOfYear = d;
  let month = 0;
  while (d >= daysInMonth(year, month)) {
    d -= daysInMonth(year, month);
    month++;
  }
  const weekday = (((Math.floor(day) + 3) % 7) + 7) % 7; // 2015-01-01 was Thursday (3)
  return { year, month, dayOfMonth: d + 1, dayOfYear, weekday };
}

/** Month position in [0,12): month index plus fraction through month, for smooth seasonal curves. */
export function monthPosition(day: Day): number {
  const c = dayToDate(day);
  return c.month + (c.dayOfMonth - 0.5) / daysInMonth(c.year, c.month);
}

/** Fractional calendar year, e.g. 2015.5 near mid-2015. */
export function fractionalYear(day: Day): number {
  const c = dayToDate(day);
  return c.year + (c.dayOfYear + 0.5) / (isLeapYear(c.year) ? 366 : 365);
}
