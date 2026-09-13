"use client";

import {
  countdownLabel,
  dayOfMonth,
  isNear,
  isWeekend,
  monthName,
  today,
  weekdayName,
} from "@/lib/dates";
import { dropKey, dropProps, useDrag } from "@/lib/drag";
import { CARRY_LIMIT, deadlinesOnDay, tasksAt, type TaskIndex } from "@/lib/select";
import { useUi, usePlanner } from "@/lib/ui";
import type { Deadline, ISODate } from "@/lib/types";
import { TaskRow } from "./TaskRow";

/**
 * The rightmost pane: one day, opened. Selecting a day in the Days column
 * expands it here, with the tasks at full width, the deadlines due that day,
 * and how full the day is against the cap.
 *
 * It drills one step further than the Days column rather than repeating it: the
 * column answers "which day", this answers "what is on it".
 */
export function DayPanel({
  index,
  load,
  deadlines,
}: {
  index: TaskIndex;
  load: Map<ISODate, number>;
  deadlines: Deadline[];
}) {
  const state = usePlanner();
  const { ui, set } = useUi();
  const drag = useDrag();
  const day = ui.selectedDay;
  const now = today();

  if (!day) {
    return (
      <p className="px-3 py-3 text-xs text-ink-3">
        Choose a day to open it. Its tasks appear here with room to work on them.
      </p>
    );
  }

  const tasks = tasksAt(index.atDay, day);
  const due = deadlinesOnDay(deadlines, day);
  const count = load.get(day) ?? 0;
  const full = count >= state.settings.dayCap;
  const over = drag.overKey === dropKey("day", day);
  const carried = tasks.filter((t) => t.carry_count >= CARRY_LIMIT);

  return (
    <div
      {...dropProps("day", day)}
      className={[
        "column-open px-3 py-2",
        over ? "outline outline-1 outline-ink" : "",
      ].join(" ")}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3
          className={[
            "font-serif text-lg",
            isWeekend(day) ? "font-light text-ink-3" : "",
          ].join(" ")}
        >
          {weekdayName(day)} {dayOfMonth(day)} {monthName(day)}
        </h3>
        {day === now ? <span className="text-2xs text-ink-3">today</span> : null}
      </header>

      <p className="numeral mt-[1px] text-2xs text-ink-3">
        {count} of {state.settings.dayCap}
        {full ? " — full" : ""}
      </p>

      {due.length > 0 ? (
        <ul className="mt-2 border-t border-hairline pt-2">
          {due.map((deadline) => (
            <li key={deadline.id} className="flex items-baseline justify-between gap-2">
              <span className="truncate font-serif text-sm">{deadline.title}</span>
              <span
                className="numeral shrink-0 text-2xs"
                style={
                  isNear(deadline.date, now)
                    ? { color: "var(--accent)" }
                    : { color: "var(--ink-3)" }
                }
              >
                {countdownLabel(deadline.date, now)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 border-t border-hairline pt-2">
        {tasks.length === 0 ? (
          <p className="text-xs text-ink-3">
            Nothing on this day. Drag a task here, or add one from the day in the column.
          </p>
        ) : (
          tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              deadlines={deadlines}
              milestones={state.milestones}
              showSize={state.settings.showSize}
              showDeadline={!ui.lensDeadlineId}
            />
          ))
        )}
      </div>

      {carried.length > 0 ? (
        <p className="mt-3 border-t border-hairline pt-2 text-2xs text-ink-3">
          {carried.length === 1
            ? "One task here has moved three times. It may be too large, or not yet specific enough."
            : `${carried.length} tasks here have moved three times. They may be too large, or not yet specific enough.`}
        </p>
      ) : null}

      {day === now ? (
        <button
          type="button"
          className="mt-3 text-2xs text-ink-3 underline"
          onClick={() => set({ dayCloseOpen: true })}
        >
          Close the day
        </button>
      ) : null}
    </div>
  );
}
