"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { markChangesSeen, startCalendarWatch, stopCalendarWatch, useCalendar } from "@/lib/calendar";
import { localHour, today } from "@/lib/dates";
import { DragProvider, type DropSpec } from "@/lib/drag";
import { useNarrow } from "@/lib/media";
import type { Placement } from "@/lib/placement";
import { atDay, plannedTasks, taskById } from "@/lib/select";
import { dismissOverwrite, startCloud, useSync } from "@/lib/sync";
import { dayCloseDismiss, demoteTask, isLoaded, load, placeTask, setDone, subscribe } from "@/lib/store";
import { useUi, usePlanner } from "@/lib/ui";
import { ArchiveView } from "./ArchiveView";
import { BacklogPanel } from "./BacklogPanel";
import { Columns } from "./Columns";
import { DayClose } from "./DayClose";
import { DeadlineEditor } from "./DeadlineEditor";
import { DeadlineRail } from "./DeadlineRail";
import { ListView } from "./ListView";
import { QuickAdd } from "./QuickAdd";
import { SettingsView } from "./SettingsView";

export function Planner() {
  // Stored data arrives after hydration. `load` notifies the store, so `ready`
  // follows from the subscription rather than from state set inside an effect.
  const ready = useSyncExternalStore(subscribe, isLoaded, () => false);
  useEffect(() => {
    load();
    startCloud();
  }, []);

  const state = usePlanner();
  const { ui, set, notify, markMoved } = useUi();
  const narrow = useNarrow();
  const sync = useSync();
  const calendar = useCalendar();
  // §7 — push notifications reach the server; the poll is the fallback. Both
  // only run while signed in.
  useEffect(() => {
    if (!sync.signedIn || !sync.userId) return;
    startCalendarWatch(sync.userId);
    return () => stopCalendarWatch();
  }, [sync.signedIn, sync.userId]);

  // The day-close offer depends on the wall clock, so re-check it now and then.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const now = today();
  const openToday = ready ? atDay(plannedTasks(state, null), now) : [];
  const offerDayClose =
    ready &&
    !ui.dayCloseOpen &&
    openToday.length > 0 &&
    localHour() >= state.settings.dayClosePromptHour &&
    state.dayClose.completedFor !== now &&
    state.dayClose.dismissedFor !== now;

  const onDrop = useCallback(
    (taskId: string, placement: Placement) => {
      const result = placeTask(taskId, placement);
      if (result.ok) markMoved(taskId);
      else notify(`${result.reason} It stayed where it was.`, true);
    },
    [markMoved, notify],
  );

  const onDwell = useCallback(
    (spec: DropSpec) => {
      if (spec.level === "month" && spec.date) set({ selectedMonth: spec.date, selectedWeek: null });
      if (spec.level === "week" && spec.date) set({ selectedWeek: spec.date });
    },
    [set],
  );

  /** §6.3 — one key promotes a task one level into the selected block of the next column. */
  const promote = useCallback(() => {
    const task = taskById(state, ui.selectedTaskId);
    if (!task) return;
    let placement: Placement | null = null;
    if (task.placement_level === "none") {
      if (!ui.selectedMonth) return notify("Select a month first.");
      placement = { level: "month", date: ui.selectedMonth };
    } else if (task.placement_level === "month") {
      if (!ui.selectedWeek) return notify("Select a week first.");
      placement = { level: "week", date: ui.selectedWeek };
    } else if (task.placement_level === "week") {
      if (!ui.selectedDay) return notify("Select a day first.");
      placement = { level: "day", date: ui.selectedDay };
    } else {
      return notify("It is already placed on a day.");
    }
    onDrop(task.id, placement);
  }, [notify, onDrop, state, ui.selectedDay, ui.selectedMonth, ui.selectedTaskId, ui.selectedWeek]);

  const demote = useCallback(() => {
    if (!ui.selectedTaskId) return;
    const result = demoteTask(ui.selectedTaskId);
    if (result.ok) markMoved(ui.selectedTaskId);
    else notify(result.reason);
  }, [markMoved, notify, ui.selectedTaskId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (event.key === "Escape") {
        if (ui.quickAddOpen || ui.dayCloseOpen || ui.editingDeadlineId) {
          set({ quickAddOpen: false, dayCloseOpen: false, editingDeadlineId: null });
        } else {
          set({ selectedTaskId: null, notice: null });
        }
        return;
      }
      if (typing) return;
      if (ui.quickAddOpen || ui.dayCloseOpen || ui.editingDeadlineId) return;

      if (event.key === "n") {
        event.preventDefault();
        set({ quickAddOpen: true });
        return;
      }
      if (event.key === "b") {
        event.preventDefault();
        set({ backlogOpen: !ui.backlogOpen });
        return;
      }
      if (!ui.selectedTaskId) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const siblings = blockSiblings(state, ui.lensDeadlineId, ui.selectedTaskId);
        const at = siblings.findIndex((t) => t.id === ui.selectedTaskId);
        const next = siblings[at + (event.key === "ArrowDown" ? 1 : -1)];
        if (next) set({ selectedTaskId: next.id });
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        promote();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        demote();
      } else if (event.key === "Enter") {
        event.preventDefault();
        const task = taskById(state, ui.selectedTaskId);
        if (task) setDone(task.id, task.status !== "done");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    demote,
    promote,
    set,
    state,
    ui.backlogOpen,
    ui.dayCloseOpen,
    ui.editingDeadlineId,
    ui.lensDeadlineId,
    ui.quickAddOpen,
    ui.selectedTaskId,
  ]);

  const railVisible = !narrow && !ui.railCollapsed;
  const railDrawer = narrow && ui.railDrawerOpen;

  return (
    <DragProvider onDrop={onDrop} onDwell={onDwell}>
      <div
        className="flex h-dvh flex-col"
        style={{ "--accent": state.settings.accentColor } as React.CSSProperties}
      >
        <TopBar
          onDayClose={() => set({ dayCloseOpen: true })}
          onToggleRail={() =>
            narrow
              ? set({ railDrawerOpen: !ui.railDrawerOpen })
              : set({ railCollapsed: !ui.railCollapsed })
          }
        />

        {offerDayClose ? (
          <div className="flex items-baseline gap-4 border-b border-hairline px-4 py-2 text-xs">
            <span>
              It is past {state.settings.dayClosePromptHour} o&rsquo;clock, and {openToday.length}{" "}
              {openToday.length === 1 ? "task is" : "tasks are"} still open today.
            </span>
            <button type="button" className="underline" onClick={() => set({ dayCloseOpen: true })}>
              Close the day
            </button>
            <button type="button" className="text-ink-3" onClick={() => dayCloseDismiss(now)}>
              Not now
            </button>
          </div>
        ) : null}

        {sync.overwrites.map((overwrite) => (
          <div
            key={overwrite.id}
            className="flex items-baseline gap-4 border-b border-hairline px-4 py-2 text-xs"
          >
            <span>A change from another device replaced {overwrite.what}.</span>
            <button
              type="button"
              className="text-ink-3"
              onClick={() => dismissOverwrite(overwrite.id)}
            >
              Dismiss
            </button>
          </div>
        ))}

        {calendar.changes.length > 0 ? (
          <div className="flex items-baseline gap-4 border-b border-hairline px-4 py-2 text-xs">
            <span>
              {calendar.changes.length === 1
                ? "One deadline changed on your calendar."
                : `${calendar.changes.length} deadlines changed on your calendar.`}
            </span>
            <button
              type="button"
              className="underline"
              onClick={() => set({ view: "settings" })}
            >
              See what changed
            </button>
            <button
              type="button"
              className="text-ink-3"
              onClick={() => void markChangesSeen()}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {ui.notice ? (
          <div className="flex items-baseline gap-4 border-b border-hairline px-4 py-2 text-xs">
            <span>{ui.notice.text}</span>
            {ui.notice.settingsLink ? (
              <button
                type="button"
                className="underline"
                onClick={() => set({ view: "settings", notice: null })}
              >
                Settings
              </button>
            ) : null}
            <button type="button" className="text-ink-3" onClick={() => set({ notice: null })}>
              Dismiss
            </button>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1">
          {railVisible ? (
            <div className="w-[220px] shrink-0 border-r border-hairline">
              <DeadlineRail />
            </div>
          ) : null}

          {!ready ? (
            <div className="flex-1" />
          ) : ui.view === "columns" ? (
            <Columns />
          ) : ui.view === "list" ? (
            <ListView />
          ) : ui.view === "archive" ? (
            <ArchiveView />
          ) : (
            <SettingsView />
          )}
        </div>

        {railDrawer ? (
          <div className="fixed inset-0 z-40" role="presentation">
            <div
              className="absolute inset-0 bg-paper/70"
              onClick={() => set({ railDrawerOpen: false })}
            />
            <div className="absolute inset-y-0 left-0 w-[min(260px,82vw)] border-r border-hairline bg-surface">
              <DeadlineRail onNavigate={() => set({ railDrawerOpen: false })} />
            </div>
          </div>
        ) : null}

        {ui.view === "columns" ? <BacklogPanel /> : null}
        <QuickAdd />
        <DayClose />
        <DeadlineEditor />
      </div>
    </DragProvider>
  );
}

/**
 * The tasks sharing a block with this one, in the order they are drawn, so
 * Up and Down walk the block rather than the whole plan.
 */
function blockSiblings(
  state: ReturnType<typeof usePlanner>,
  lens: string | null,
  taskId: string,
): ReturnType<typeof plannedTasks> {
  const task = taskById(state, taskId);
  if (!task) return [];
  const visible = plannedTasks(state, lens);
  return visible.filter(
    (other) =>
      other.placement_level === task.placement_level &&
      other.placement_day === task.placement_day &&
      other.placement_week === task.placement_week &&
      other.placement_month === task.placement_month,
  );
}

function TopBar({
  onDayClose,
  onToggleRail,
}: {
  onDayClose: () => void;
  onToggleRail: () => void;
}) {
  const { ui, set } = useUi();
  return (
    <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-hairline px-4 py-2">
      <button
        type="button"
        className="whitespace-nowrap text-xs text-ink-3"
        onClick={onToggleRail}
      >
        Deadlines
      </button>
      <nav className="flex items-baseline gap-4 whitespace-nowrap text-xs">
        <Tab current={ui.view} value="columns" onSelect={set}>
          Columns
        </Tab>
        <Tab current={ui.view} value="list" onSelect={set}>
          List
        </Tab>
        <Tab current={ui.view} value="archive" onSelect={set}>
          Archive
        </Tab>
        <Tab current={ui.view} value="settings" onSelect={set}>
          Settings
        </Tab>
      </nav>
      <span className="flex-1" />
      <button
        type="button"
        className="whitespace-nowrap text-xs text-ink-3"
        onClick={onDayClose}
      >
        Close the day
      </button>
      <button
        type="button"
        aria-label="Quick add"
        className="whitespace-nowrap text-xs underline"
        onClick={() => set({ quickAddOpen: true })}
      >
        Add
      </button>
    </header>
  );
}

function Tab({
  current,
  value,
  onSelect,
  children,
}: {
  current: string;
  value: "columns" | "list" | "archive" | "settings";
  onSelect: (patch: { view: "columns" | "list" | "archive" | "settings" }) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect({ view: value })}
      className={active ? "text-ink" : "text-ink-3"}
    >
      {children}
    </button>
  );
}
