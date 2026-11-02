import type { Day } from "@arg/contracts";

/** Day 0 = 2015-01-01 (a Thursday). Proleptic Gregorian calendar. */
export const START_YEAR = 2015;

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
