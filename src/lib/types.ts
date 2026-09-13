/**
 * Data model — spec §3, LOCKED.
 *
 * No entity here stores a time of day, a duration, or a start/end timestamp
 * for planned work. `size` is the only workload signal. `completed_at`,
 * `created_at` and `updated_at` are record-keeping timestamps, not planned work.
 *
 * `updated_at` is the comparison for last-write-wins across devices (Phase 2).
 * It is stamped centrally in the store, never by a caller.
 */

/** A calendar date with no time component, `YYYY-MM-DD`. */
export type ISODate = string;

export type DeadlineKind = "exam" | "application" | "submission" | "other";
export type DeadlineSource = "manual" | "calendar";

export type Deadline = {
  id: string;
  title: string;
  /** Date only, never a time. */
  date: ISODate;
  kind: DeadlineKind;
  notes: string | null;
  source: DeadlineSource;
  calendar_event_id: string | null;
  archived_at: string | null;
  updated_at: string;
};

export type Milestone = {
  id: string;
  deadline_id: string;
  title: string;
  order: number;
  archived_at: string | null;
  updated_at: string;
};

export type Size = "S" | "M" | "L";
export type PlacementLevel = "none" | "month" | "week" | "day";
export type TaskStatus = "open" | "done" | "dropped";

export type Task = {
  id: string;
  title: string;
  deadline_id: string | null;
  milestone_id: string | null;
  size: Size | null;
  /** The core field — spec §4. */
  placement_level: PlacementLevel;
  /** First-of-month date; set when level is month, week or day. */
  placement_month: ISODate | null;
  /** Monday date; set when level is week or day. */
  placement_week: ISODate | null;
  /** Set only when level is day. */
  placement_day: ISODate | null;
  status: TaskStatus;
  carry_count: number;
  created_at: string;
  completed_at: string | null;
  notes: string | null;
  updated_at: string;
};

/** Spec §9. Customisable in settings, never inline. */
export type Settings = {
  /** §6.4 — maximum tasks in one day block. */
  dayCap: number;
  /** §6.2 — local hour after which the day close is offered. */
  dayClosePromptHour: number;
  /** §8.3 — the single accent, used only for a deadline inside 14 days. */
  accentColor: string;
  /** §5.4 — minimum months the months column extends forward. */
  monthsForward: number;
  /** §9 — whether `size` is shown at all. */
  showSize: boolean;
  /** §7, §9 — the calendars whose all-day events become deadlines. */
  watchedCalendarIds: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  dayCap: 5,
  dayClosePromptHour: 21,
  accentColor: "#0F5B43",
  monthsForward: 12,
  showSize: true,
  watchedCalendarIds: [],
};

export type PlannerState = {
  version: 1;
  deadlines: Deadline[];
  milestones: Milestone[];
  tasks: Task[];
  settings: Settings;
  /** §6.2 — the day close is offered once per day, never run automatically. */
  dayClose: { completedFor: ISODate | null; dismissedFor: ISODate | null };
  /** Last-write-wins stamp for the settings row. */
  prefsUpdatedAt: string;
};

export const EMPTY_STATE: PlannerState = {
  version: 1,
  deadlines: [],
  milestones: [],
  tasks: [],
  settings: DEFAULT_SETTINGS,
  dayClose: { completedFor: null, dismissedFor: null },
  prefsUpdatedAt: "1970-01-01T00:00:00.000Z",
};
