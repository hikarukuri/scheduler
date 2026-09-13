/**
 * Quick add parsing — spec §6.5.
 *
 *   #text            fuzzy-matches a deadline
 *   by fri / fri     places on that weekday, at day level
 *   today / tomorrow day level
 *   nov / november   month level
 *   nov 12 / 12 nov  day level
 *   week of nov 10   week level
 *   !S !M !L         size
 *
 * Everything else becomes the title. Nothing here raises an error: text that
 * does not parse is simply title text.
 */

import { addDays, isoWeekday, parse, startOfMonth, startOfWeek, today } from "./dates";
import type { Placement } from "./placement";
import type { Deadline, ISODate, Size } from "./types";

export type ParsedQuickAdd = {
  title: string;
  deadline: Deadline | null;
  /** The `#text` that matched nothing, so the preview can say so. */
  unmatchedDeadline: string | null;
  size: Size | null;
  placement: Placement;
  /** The literal words that produced the placement, for the preview. */
  placementSource: string | null;
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const WEEKDAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

function monthIndex(word: string): number {
  const w = word.toLowerCase().replace(/\.$/, "");
  if (w.length < 3) return -1;
  return MONTHS.findIndex((m) => m.startsWith(w) && w.length <= m.length);
}

function weekdayIndex(word: string): number {
  const w = word.toLowerCase().replace(/\.$/, "");
  if (w.length < 3) return -1;
  return WEEKDAYS.findIndex((d) => d.startsWith(w) && w.length <= d.length);
}

function iso(year: number, monthIdx: number, day: number): ISODate {
  const y = String(year).padStart(4, "0");
  const m = String(monthIdx + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysInMonth(year: number, monthIdx: number): number {
  return new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
}

type DateMatch = { consumed: number; date: ISODate; level: "day" | "month" };

/**
 * Read a date out of `tokens` starting at 0. Bare years are never dates and a
 * bare number is never a date — "read 12 pages" must stay a title.
 *
 * The day-first form (`25 sep`) is only read when something introduced it —
 * `by 25 sep`, `week of 25 sep`. Unintroduced, "chapter 4 nov" would parse its
 * chapter number as a date, and chapter, section and paper numbers are
 * everywhere in this app's titles. Month-first (`sep 25`) is unambiguous and
 * always read.
 */
function matchDate(tokens: string[], from: ISODate, allowDayFirst = false): DateMatch | null {
  if (tokens.length === 0) return null;
  const first = tokens[0].toLowerCase().replace(/[.,]$/, "");
  const ref = parse(from);
  const thisYear = ref.getUTCFullYear();
  const thisMonth = ref.getUTCMonth();

  if (first === "today") return { consumed: 1, date: from, level: "day" };
  if (first === "tomorrow") return { consumed: 1, date: addDays(from, 1), level: "day" };

  const wd = weekdayIndex(first);
  if (wd >= 0) {
    const delta = (wd + 1 - isoWeekday(from) + 7) % 7;
    return { consumed: 1, date: addDays(from, delta), level: "day" };
  }

  const mi = monthIndex(first);
  if (mi >= 0) {
    const second = tokens[1]?.replace(/[.,]$/, "");
    const dayNum = second && /^\d{1,2}(st|nd|rd|th)?$/i.test(second)
      ? Number(second.replace(/\D/g, ""))
      : null;
    if (dayNum && dayNum >= 1 && dayNum <= daysInMonth(thisYear, mi)) {
      let year = thisYear;
      if (iso(year, mi, dayNum) < from) year += 1;
      return { consumed: 2, date: iso(year, mi, dayNum), level: "day" };
    }
    const yearNum = second && /^\d{4}$/.test(second) ? Number(second) : null;
    if (yearNum) return { consumed: 2, date: iso(yearNum, mi, 1), level: "month" };
    const year = mi < thisMonth ? thisYear + 1 : thisYear;
    return { consumed: 1, date: iso(year, mi, 1), level: "month" };
  }

  // `12 nov`, only when introduced
  if (allowDayFirst && /^\d{1,2}(st|nd|rd|th)?$/i.test(first) && tokens[1]) {
    const m2 = monthIndex(tokens[1].replace(/[.,]$/, ""));
    const dayNum = Number(first.replace(/\D/g, ""));
    if (m2 >= 0 && dayNum >= 1 && dayNum <= daysInMonth(thisYear, m2)) {
      let year = thisYear;
      if (iso(year, m2, dayNum) < from) year += 1;
      return { consumed: 2, date: iso(year, m2, dayNum), level: "day" };
    }
  }
  return null;
}

/** Subsequence match, scored so word-start hits win. Returns null below a floor. */
export function fuzzyDeadline(query: string, deadlines: Deadline[]): Deadline | null {
  const q = query.toLowerCase().replace(/[^a-z0-9　-鿿]/gi, "");
  if (!q) return null;
  let best: { deadline: Deadline; score: number } | null = null;

  for (const d of deadlines) {
    const title = d.title.toLowerCase();
    let qi = 0;
    let score = 0;
    let atWordStart = true;
    for (let i = 0; i < title.length && qi < q.length; i++) {
      const ch = title[i];
      if (ch === q[qi]) {
        score += atWordStart ? 3 : 1;
        if (i === 0) score += 2;
        qi++;
      }
      atWordStart = ch === " " || ch === "-" || ch === "/";
    }
    if (qi < q.length) continue;
    score -= Math.max(0, title.length - q.length) * 0.05;
    if (!best || score > best.score) best = { deadline: d, score };
  }
  return best ? best.deadline : null;
}

export function parseQuickAdd(
  input: string,
  deadlines: Deadline[],
  from: ISODate = today(),
): ParsedQuickAdd {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const titleWords: string[] = [];
  let size: Size | null = null;
  let deadline: Deadline | null = null;
  let unmatchedDeadline: string | null = null;
  let placement: Placement = { level: "none" };
  let placementSource: string | null = null;

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    const lower = token.toLowerCase();

    const sizeMatch = /^!([sml])$/i.exec(token);
    if (sizeMatch) {
      size = sizeMatch[1].toUpperCase() as Size;
      i += 1;
      continue;
    }

    if (token.startsWith("#") && token.length > 1) {
      const query = token.slice(1);
      const found = fuzzyDeadline(query, deadlines);
      if (found) deadline = found;
      else {
        unmatchedDeadline = query;
        titleWords.push(token);
      }
      i += 1;
      continue;
    }

    // `week of <date>`
    if (lower === "week" && tokens[i + 1]?.toLowerCase() === "of") {
      const m = matchDate(tokens.slice(i + 2), from, true);
      if (m && m.level === "day") {
        placement = { level: "week", date: startOfWeek(m.date) };
        placementSource = tokens.slice(i, i + 2 + m.consumed).join(" ");
        i += 2 + m.consumed;
        continue;
      }
    }

    // `by <date>`
    if (lower === "by") {
      const m = matchDate(tokens.slice(i + 1), from, true);
      if (m) {
        placement =
          m.level === "day"
            ? { level: "day", date: m.date }
            : { level: "month", date: startOfMonth(m.date) };
        placementSource = tokens.slice(i, i + 1 + m.consumed).join(" ");
        i += 1 + m.consumed;
        continue;
      }
    }

    // A bare date, only when nothing has set a placement yet.
    if (placementSource === null) {
      const m = matchDate(tokens.slice(i), from);
      if (m) {
        placement =
          m.level === "day"
            ? { level: "day", date: m.date }
            : { level: "month", date: startOfMonth(m.date) };
        placementSource = tokens.slice(i, i + m.consumed).join(" ");
        i += m.consumed;
        continue;
      }
    }

    titleWords.push(token);
    i += 1;
  }

  return {
    title: titleWords.join(" "),
    deadline,
    unmatchedDeadline,
    size,
    placement,
    placementSource,
  };
}
