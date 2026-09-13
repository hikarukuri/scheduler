"use client";

/**
 * Phase 1 storage — localStorage, single user, no network.
 *
 * One module-level store, read through `useSyncExternalStore`. Every mutation
 * goes through an action here, and every placement change goes through
 * `placementFields` so the cumulative invariant in §3 holds in one place.
 */

import { addDays, today } from "./dates";
import { dayLoad, demoted, placementFields, type Placement } from "./placement";
import {
  DEFAULT_SETTINGS,
  EMPTY_STATE,
  type Deadline,
  type DeadlineKind,
  type ISODate,
  type Milestone,
  type PlannerState,
  type Settings,
  type Size,
  type Task,
} from "./types";

const KEY = "study-planner/v1";

let state: PlannerState = EMPTY_STATE;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // A full or unavailable localStorage must not take the interface down.
  }
}

function commit(next: PlannerState) {
  state = next;
  persist();
  emit();
}

/** True once `load` has run, so the first paint can wait for stored data. */
export function isLoaded(): boolean {
  return loaded;
}

/** Read once on the client. Unknown or broken payloads are left alone, never overwritten blindly. */
export function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as PlannerState;
    if (parsed?.version !== 1) return;
    state = {
      ...EMPTY_STATE,
      ...parsed,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      dayClose: { ...EMPTY_STATE.dayClose, ...(parsed.dayClose ?? {}) },
    };
  } catch {
    // Keep the in-memory empty state; the stored value stays untouched.
  } finally {
    emit();
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function snapshot(): PlannerState {
  return state;
}

function id(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ── Deadlines ───────────────────────────────────────────────────────────────

export type DeadlineDraft = {
  title: string;
  date: ISODate;
  kind: DeadlineKind;
  notes?: string | null;
};

export function addDeadline(draft: DeadlineDraft): Deadline {
  const deadline: Deadline = {
    id: id(),
    title: draft.title.trim(),
    date: draft.date,
    kind: draft.kind,
    notes: draft.notes?.trim() || null,
    source: "manual",
    calendar_event_id: null,
    archived_at: null,
  };
  commit({ ...state, deadlines: [...state.deadlines, deadline] });
  return deadline;
}

/** Imported deadlines are read-only except `kind` and `notes` (spec §7). */
export function updateDeadline(deadlineId: string, patch: Partial<DeadlineDraft>) {
  commit({
    ...state,
    deadlines: state.deadlines.map((d) => {
      if (d.id !== deadlineId) return d;
      const allowed =
        d.source === "calendar" ? { kind: patch.kind, notes: patch.notes } : patch;
      const next = { ...d };
      if (allowed.title !== undefined) next.title = allowed.title.trim();
      if (allowed.date !== undefined) next.date = allowed.date;
      if (allowed.kind !== undefined) next.kind = allowed.kind;
      if (allowed.notes !== undefined) next.notes = allowed.notes?.trim() || null;
      return next;
    }),
  });
}

export function archiveDeadline(deadlineId: string) {
  commit({
    ...state,
    deadlines: state.deadlines.map((d) =>
      d.id === deadlineId ? { ...d, archived_at: now() } : d,
    ),
  });
}

export function restoreDeadline(deadlineId: string) {
  commit({
    ...state,
    deadlines: state.deadlines.map((d) =>
      d.id === deadlineId ? { ...d, archived_at: null } : d,
    ),
  });
}

// ── Milestones ──────────────────────────────────────────────────────────────

export function addMilestone(deadlineId: string, title: string): Milestone {
  const siblings = state.milestones.filter((m) => m.deadline_id === deadlineId);
  const milestone: Milestone = {
    id: id(),
    deadline_id: deadlineId,
    title: title.trim(),
    order: siblings.length,
    archived_at: null,
  };
  commit({ ...state, milestones: [...state.milestones, milestone] });
  return milestone;
}

export function renameMilestone(milestoneId: string, title: string) {
  commit({
    ...state,
    milestones: state.milestones.map((m) =>
      m.id === milestoneId ? { ...m, title: title.trim() } : m,
    ),
  });
}

export function archiveMilestone(milestoneId: string) {
  commit({
    ...state,
    milestones: state.milestones.map((m) =>
      m.id === milestoneId ? { ...m, archived_at: now() } : m,
    ),
    tasks: state.tasks.map((t) =>
      t.milestone_id === milestoneId ? { ...t, milestone_id: null } : t,
    ),
  });
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export type TaskDraft = {
  title: string;
  deadline_id?: string | null;
  milestone_id?: string | null;
  size?: Size | null;
  placement?: Placement;
  notes?: string | null;
};

export type PlaceResult = { ok: true } | { ok: false; reason: string; day?: ISODate };

/** §6.4 — the per-day cap. Reaching it blocks the move; there is no override. */
function capCheck(placement: Placement, excludeId?: string): PlaceResult {
  if (placement.level !== "day") return { ok: true };
  const load = dayLoad(state.tasks, placement.date, excludeId);
  if (load < state.settings.dayCap) return { ok: true };
  return {
    ok: false,
    reason: `That day already holds ${state.settings.dayCap} tasks.`,
    day: placement.date,
  };
}

export function addTask(draft: TaskDraft): PlaceResult & { task?: Task } {
  const placement = draft.placement ?? { level: "none" as const };
  const check = capCheck(placement);
  if (!check.ok) return check;
  const task: Task = {
    id: id(),
    title: draft.title.trim(),
    deadline_id: draft.deadline_id ?? null,
    milestone_id: draft.milestone_id ?? null,
    size: draft.size ?? null,
    ...placementFields(placement),
    status: "open",
    carry_count: 0,
    created_at: now(),
    completed_at: null,
    notes: draft.notes?.trim() || null,
  };
  commit({ ...state, tasks: [...state.tasks, task] });
  return { ok: true, task };
}

function patchTask(taskId: string, patch: Partial<Task>) {
  commit({
    ...state,
    tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
  });
}

export function updateTask(
  taskId: string,
  patch: Partial<Pick<Task, "title" | "size" | "deadline_id" | "milestone_id" | "notes">>,
) {
  const clean: Partial<Task> = { ...patch };
  if (clean.title !== undefined) clean.title = String(clean.title).trim();
  if (clean.notes !== undefined) clean.notes = (clean.notes as string | null) || null;
  // Dropping the deadline drops the milestone with it; a milestone belongs to one deadline.
  if (patch.deadline_id !== undefined) {
    const kept = state.tasks.find((t) => t.id === taskId);
    const milestone = state.milestones.find((m) => m.id === kept?.milestone_id);
    if (!milestone || milestone.deadline_id !== patch.deadline_id) clean.milestone_id = null;
  }
  patchTask(taskId, clean);
}

/** The one entry point for moving a task between levels. */
export function placeTask(taskId: string, placement: Placement): PlaceResult {
  const check = capCheck(placement, taskId);
  if (!check.ok) return check;
  patchTask(taskId, placementFields(placement));
  return { ok: true };
}

/** §4 — one level less specific. Needs no target and no confirmation beyond the gesture. */
export function demoteTask(taskId: string): PlaceResult {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, reason: "That task is gone." };
  const next = demoted(task);
  if (!next) return { ok: false, reason: "It is already in the backlog." };
  return placeTask(taskId, next);
}

export function setDone(taskId: string, done: boolean) {
  patchTask(taskId, {
    status: done ? "done" : "open",
    completed_at: done ? now() : null,
  });
}

export function dropTask(taskId: string) {
  patchTask(taskId, { status: "dropped", completed_at: now() });
}

export function reopenTask(taskId: string) {
  patchTask(taskId, { status: "open", completed_at: null });
}

// ── Day close (§6.2) ────────────────────────────────────────────────────────

export type DayCloseChoice = "tomorrow" | "week" | "month" | "backlog" | "drop";

/**
 * One unfinished task, one explicit choice. Carrying increments `carry_count`;
 * stepping back to a coarser level than the week resets it — a task put back in
 * the month is no longer being carried.
 */
export function dayCloseApply(taskId: string, choice: DayCloseChoice): PlaceResult {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, reason: "That task is gone." };

  if (choice === "drop") {
    dropTask(taskId);
    return { ok: true };
  }
  if (choice === "tomorrow") {
    const target = addDays(task.placement_day ?? today(), 1);
    const check = capCheck({ level: "day", date: target }, taskId);
    if (!check.ok) return check;
    commit({
      ...state,
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              ...placementFields({ level: "day", date: target }),
              carry_count: t.carry_count + 1,
            }
          : t,
      ),
    });
    return { ok: true };
  }
  if (choice === "week") {
    const week = task.placement_week ?? task.placement_day ?? today();
    commit({
      ...state,
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              ...placementFields({ level: "week", date: week }),
              carry_count: t.carry_count + 1,
            }
          : t,
      ),
    });
    return { ok: true };
  }
  const placement: Placement =
    choice === "month"
      ? { level: "month", date: task.placement_month ?? today() }
      : { level: "none" };
  commit({
    ...state,
    tasks: state.tasks.map((t) =>
      t.id === taskId ? { ...t, ...placementFields(placement), carry_count: 0 } : t,
    ),
  });
  return { ok: true };
}

export function dayCloseFinish(day: ISODate) {
  commit({ ...state, dayClose: { ...state.dayClose, completedFor: day } });
}

export function dayCloseDismiss(day: ISODate) {
  commit({ ...state, dayClose: { ...state.dayClose, dismissedFor: day } });
}

// ── Settings (§9) ───────────────────────────────────────────────────────────

export function updateSettings(patch: Partial<Settings>) {
  commit({ ...state, settings: { ...state.settings, ...patch } });
}

/** Used by the settings view to clear local data; always behind a confirmation. */
export function resetAll() {
  commit({ ...EMPTY_STATE });
}
