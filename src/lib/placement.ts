/**
 * The placement model — spec §4.
 *
 * Placement fields are cumulative: a task at `day` level also carries a valid
 * `placement_week` and `placement_month`. That invariant is enforced here and
 * nowhere else. No other module may write a `placement_*` field directly.
 */

import {
  dayOfMonth,
  monthLabel,
  shortMonth,
  shortWeekday,
  startOfMonth,
  startOfWeek,
  weekOwnerMonth,
} from "./dates";
import type { ISODate, PlacementLevel, Task } from "./types";

export type PlacementFields = Pick<
  Task,
  "placement_level" | "placement_month" | "placement_week" | "placement_day"
>;

/** Where a task is being put. One shape per level, so a level can't arrive without its date. */
export type Placement =
  | { level: "none" }
  | { level: "month"; date: ISODate }
  | { level: "week"; date: ISODate }
  | { level: "day"; date: ISODate };

/**
 * The single constructor for placement fields.
 *
 * A day's month is derived from its *week's* owner month, never from the day's
 * own calendar month — otherwise 1 November in a week October owns would sit in
 * a month block that does not contain its week (spec §3).
 */
export function placementFields(p: Placement): PlacementFields {
  switch (p.level) {
    case "none":
      return {
        placement_level: "none",
        placement_month: null,
        placement_week: null,
        placement_day: null,
      };
    case "month":
      return {
        placement_level: "month",
        placement_month: startOfMonth(p.date),
        placement_week: null,
        placement_day: null,
      };
    case "week": {
      const week = startOfWeek(p.date);
      return {
        placement_level: "week",
        placement_month: weekOwnerMonth(week),
        placement_week: week,
        placement_day: null,
      };
    }
    case "day": {
      const week = startOfWeek(p.date);
      return {
        placement_level: "day",
        placement_month: weekOwnerMonth(week),
        placement_week: week,
        placement_day: p.date,
      };
    }
  }
}

export const LEVELS: PlacementLevel[] = ["none", "month", "week", "day"];

export function levelIndex(level: PlacementLevel): number {
  return LEVELS.indexOf(level);
}

/** Read a task's current placement back out as a `Placement`. */
export function placementOf(task: Task): Placement {
  switch (task.placement_level) {
    case "day":
      return { level: "day", date: task.placement_day! };
    case "week":
      return { level: "week", date: task.placement_week! };
    case "month":
      return { level: "month", date: task.placement_month! };
    default:
      return { level: "none" };
  }
}

/**
 * One level less specific. Demotion is a blameless act, not an undo (spec §4),
 * so it needs no target: the coarser date is already on the task.
 */
export function demoted(task: Task): Placement | null {
  switch (task.placement_level) {
    case "day":
      return { level: "week", date: task.placement_week! };
    case "week":
      return { level: "month", date: task.placement_month! };
    case "month":
      return { level: "none" };
    default:
      return null;
  }
}

/** The level a task would land at if dropped on a block of `blockLevel`. */
export function levelForBlock(blockLevel: PlacementLevel): PlacementLevel {
  return blockLevel;
}

/** Human-readable placement, for the list view and the quick-add preview (§5.5, §6.5). */
export function describePlacement(p: Placement): string {
  switch (p.level) {
    case "day":
      return `${shortWeekday(p.date)} ${dayOfMonth(p.date)} ${shortMonth(p.date)}`;
    case "week": {
      const monday = startOfWeek(p.date);
      return `Week of ${dayOfMonth(monday)} ${shortMonth(monday)}`;
    }
    case "month":
      return monthLabel(p.date);
    default:
      return "Backlog";
  }
}

export function placementText(task: Task): string {
  return describePlacement(placementOf(task));
}

/** §6.4 — open tasks already sitting in a day block, excluding one being moved. */
export function dayLoad(tasks: Task[], day: ISODate, excludeId?: string): number {
  return tasks.filter(
    (t) =>
      t.status === "open" &&
      t.placement_level === "day" &&
      t.placement_day === day &&
      t.id !== excludeId,
  ).length;
}
