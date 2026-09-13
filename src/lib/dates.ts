/**
 * Calendar arithmetic — spec §3, LOCKED.
 *
 *   - Weeks start on Monday.
 *   - A week belongs to the month containing its Thursday (ISO 8601), so a
 *     week is never split across two month blocks.
 *
 * Every date in the app is an `ISODate` (`YYYY-MM-DD`). All arithmetic runs in
 * UTC so it cannot drift across a timezone or a DST boundary; the only place
 * the local clock is read is `today()` and `localHour()`.
 */

import type { ISODate } from "./types";

const DAY_MS = 86_400_000;

/** Parse `YYYY-MM-DD` to a UTC midnight Date. Throws on a malformed date. */
export function parse(iso: ISODate): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Not an ISO date: ${iso}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) throw new Error(`Not an ISO date: ${iso}`);
  return d;
}

export function format(d: Date): ISODate {
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today, read from the local clock. */
export function today(): ISODate {
  const n = new Date();
  return format(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));
}

/** The local wall-clock hour, 0–23. Used only to decide when to offer the day close. */
export function localHour(): number {
  return new Date().getHours();
}

export function addDays(iso: ISODate, n: number): ISODate {
  return format(new Date(parse(iso).getTime() + n * DAY_MS));
}

export function addMonths(iso: ISODate, n: number): ISODate {
  const d = parse(iso);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = daysInMonth(target.getUTCFullYear(), target.getUTCMonth());
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return format(target);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / DAY_MS);
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: ISODate): number {
  const js = parse(iso).getUTCDay();
  return js === 0 ? 7 : js;
}

export function isWeekend(iso: ISODate): boolean {
  return isoWeekday(iso) >= 6;
}

/** The Monday of the week containing `iso`. */
export function startOfWeek(iso: ISODate): ISODate {
  return addDays(iso, -(isoWeekday(iso) - 1));
}

/** The first of the month containing `iso`. */
export function startOfMonth(iso: ISODate): ISODate {
  const d = parse(iso);
  return format(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

export function endOfMonth(iso: ISODate): ISODate {
  const d = parse(iso);
  return format(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/**
 * THE month-ownership rule. A week belongs to the month containing its
 * Thursday. Nothing else in the app may decide which month a week sits in —
 * every caller comes through here.
 */
export function weekOwnerMonth(anyDayInWeek: ISODate): ISODate {
  const monday = startOfWeek(anyDayInWeek);
  return startOfMonth(addDays(monday, 3));
}

/** The Mondays of every week the given month owns, in order. */
export function weeksOfMonth(monthStart: ISODate): ISODate[] {
  const month = startOfMonth(monthStart);
  const weeks: ISODate[] = [];
  // The owning week of the 1st may begin in the previous month; walk from there.
  let monday = startOfWeek(month);
  if (weekOwnerMonth(monday) !== month) monday = addDays(monday, 7);
  while (weekOwnerMonth(monday) === month) {
    weeks.push(monday);
    monday = addDays(monday, 7);
  }
  return weeks;
}

/** The seven days of the week beginning at `monday`. */
export function daysOfWeek(monday: ISODate): ISODate[] {
  const start = startOfWeek(monday);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** First-of-month dates from `from` through `to`, inclusive. */
export function monthRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cursor = startOfMonth(from);
  const last = startOfMonth(to);
  while (diffDays(cursor, last) >= 0) {
    out.push(cursor);
    cursor = startOfMonth(addMonths(cursor, 1));
  }
  return out;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function monthName(iso: ISODate): string {
  return MONTHS[parse(iso).getUTCMonth()];
}

export function monthLabel(iso: ISODate): string {
  return `${monthName(iso)} ${parse(iso).getUTCFullYear()}`;
}

export function shortMonth(iso: ISODate): string {
  return monthName(iso).slice(0, 3);
}

export function dayOfMonth(iso: ISODate): number {
  return parse(iso).getUTCDate();
}

export function weekdayName(iso: ISODate): string {
  return WEEKDAYS[isoWeekday(iso) - 1];
}

export function shortWeekday(iso: ISODate): string {
  return weekdayName(iso).slice(0, 3);
}

/** `10 – 16 November`, or `27 October – 2 November` across a boundary. */
export function weekRangeLabel(monday: ISODate): string {
  const start = startOfWeek(monday);
  const end = addDays(start, 6);
  const a = dayOfMonth(start);
  const b = dayOfMonth(end);
  if (shortMonth(start) === shortMonth(end)) return `${a} – ${b} ${shortMonth(start)}`;
  return `${a} ${shortMonth(start)} – ${b} ${shortMonth(end)}`;
}

/** `D-45` before, `D-0` on the day, `D+3` after. */
export function countdownLabel(date: ISODate, from: ISODate = today()): string {
  const n = diffDays(from, date);
  return n >= 0 ? `D-${n}` : `D+${-n}`;
}

/** §8.3 — the one accented condition: a deadline inside 14 days. */
export function isNear(date: ISODate, from: ISODate = today()): boolean {
  const n = diffDays(from, date);
  return n >= 0 && n <= 14;
}

/** Whole weeks between `from` and `date`, never negative. */
export function weeksUntil(from: ISODate, date: ISODate): number {
  return Math.max(0, Math.floor(diffDays(from, date) / 7));
}

export function isSameMonth(a: ISODate, b: ISODate): boolean {
  return startOfMonth(a) === startOfMonth(b);
}
