/** Pure derivations over planner state. No mutation, no React. */

import {
  addMonths,
  diffDays,
  startOfMonth,
  today,
  weekOwnerMonth,
} from "./dates";
import type { Deadline, ISODate, PlannerState, Task } from "./types";

export function byCreation(a: Task, b: Task): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

/** §5.2 — the rail lists active deadlines, sorted by date. */
export function activeDeadlines(state: PlannerState): Deadline[] {
  return state.deadlines
    .filter((d) => !d.archived_at)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * §6.6 — completed and dropped tasks never appear in the columns.
 * §5.2 — selecting a deadline filters all three columns to that deadline's tasks.
 */
export function plannedTasks(state: PlannerState, lens: string | null): Task[] {
  return state.tasks
    .filter((t) => t.status === "open")
    .filter((t) => (lens ? t.deadline_id === lens : true))
    .sort(byCreation);
}

export function atMonth(tasks: Task[], month: ISODate): Task[] {
  return tasks.filter((t) => t.placement_level === "month" && t.placement_month === month);
}

export function atWeek(tasks: Task[], week: ISODate): Task[] {
  return tasks.filter((t) => t.placement_level === "week" && t.placement_week === week);
}

export function atDay(tasks: Task[], day: ISODate): Task[] {
  return tasks.filter((t) => t.placement_level === "day" && t.placement_day === day);
}

export function inBacklog(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.placement_level === "none");
}

/** §5.3 — tasks placed at finer levels beneath a block, so its weight still shows. */
export function belowMonth(tasks: Task[], month: ISODate): number {
  return tasks.filter(
    (t) =>
      (t.placement_level === "week" || t.placement_level === "day") &&
      t.placement_month === month,
  ).length;
}

export function belowWeek(tasks: Task[], week: ISODate): number {
  return tasks.filter((t) => t.placement_level === "day" && t.placement_week === week).length;
}

/**
 * Which block a deadline's marker belongs in. A deadline sits in the month
 * block that owns its *week*, so its marker never lands in a different block
 * from the tasks placed on the same day (spec §3).
 */
export function deadlinesInMonth(deadlines: Deadline[], month: ISODate): Deadline[] {
  return deadlines.filter((d) => weekOwnerMonth(d.date) === month);
}

export function deadlinesInWeek(deadlines: Deadline[], week: ISODate): Deadline[] {
  return deadlines.filter((d) => diffDays(week, d.date) >= 0 && diffDays(week, d.date) <= 6);
}

export function deadlinesOnDay(deadlines: Deadline[], day: ISODate): Deadline[] {
  return deadlines.filter((d) => d.date === day);
}

/**
 * §5.4 — a rolling window starting at the current month, extending forward far
 * enough to cover the furthest active deadline, and at least as far as the
 * settings horizon. Nothing behind the current month: the past is kept in the
 * archive, not in the columns.
 */
export function monthWindow(state: PlannerState, now: ISODate = today()): ISODate[] {
  const first = startOfMonth(now);
  let last = startOfMonth(addMonths(first, Math.max(1, state.settings.monthsForward)));

  const extend = (date: ISODate) => {
    const m = weekOwnerMonth(date);
    if (diffDays(last, m) > 0) last = m;
  };
  for (const d of activeDeadlines(state)) extend(d.date);
  for (const t of state.tasks) {
    if (t.status === "open" && t.placement_month && diffDays(last, t.placement_month) > 0) {
      last = t.placement_month;
    }
  }

  const months: ISODate[] = [];
  let cursor = first;
  while (diffDays(cursor, last) >= 0) {
    months.push(cursor);
    cursor = startOfMonth(addMonths(cursor, 1));
  }
  return months;
}

export function deadlineById(state: PlannerState, id: string | null): Deadline | null {
  if (!id) return null;
  return state.deadlines.find((d) => d.id === id) ?? null;
}

export function taskById(state: PlannerState, id: string | null): Task | null {
  if (!id) return null;
  return state.tasks.find((t) => t.id === id) ?? null;
}

/** §6.2 — the mark shown quietly once a task has been carried three times. */
export const CARRY_LIMIT = 3;

/**
 * Grouped views of the task list, built once per render.
 *
 * Every block would otherwise scan the whole task array, which is fine at ten
 * tasks and wasteful at a year of them. One pass here, map lookups everywhere
 * else.
 */
export type TaskIndex = {
  atMonth: Map<ISODate, Task[]>;
  atWeek: Map<ISODate, Task[]>;
  atDay: Map<ISODate, Task[]>;
  belowMonth: Map<ISODate, number>;
  belowWeek: Map<ISODate, number>;
  backlog: Task[];
};

const NO_TASKS: Task[] = [];

function push(map: Map<ISODate, Task[]>, key: ISODate, task: Task) {
  const list = map.get(key);
  if (list) list.push(task);
  else map.set(key, [task]);
}

function bump(map: Map<ISODate, number>, key: ISODate) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export function buildIndex(tasks: Task[]): TaskIndex {
  const index: TaskIndex = {
    atMonth: new Map(),
    atWeek: new Map(),
    atDay: new Map(),
    belowMonth: new Map(),
    belowWeek: new Map(),
    backlog: [],
  };
  for (const task of tasks) {
    switch (task.placement_level) {
      case "day":
        push(index.atDay, task.placement_day!, task);
        bump(index.belowWeek, task.placement_week!);
        bump(index.belowMonth, task.placement_month!);
        break;
      case "week":
        push(index.atWeek, task.placement_week!, task);
        bump(index.belowMonth, task.placement_month!);
        break;
      case "month":
        push(index.atMonth, task.placement_month!, task);
        break;
      default:
        index.backlog.push(task);
    }
  }
  return index;
}

export function tasksAt(map: Map<ISODate, Task[]>, key: ISODate | null): Task[] {
  return (key && map.get(key)) || NO_TASKS;
}

/**
 * §6.4 — how full each day is. Counted across every open task, never through
 * the deadline lens: the cap is a fact about the day, not about what you are
 * currently looking at.
 */
export function loadByDay(tasks: Task[]): Map<ISODate, number> {
  const load = new Map<ISODate, number>();
  for (const task of tasks) {
    if (task.status === "open" && task.placement_level === "day") bump(load, task.placement_day!);
  }
  return load;
}
