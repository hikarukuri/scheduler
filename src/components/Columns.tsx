"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  dayOfMonth,
  daysOfWeek,
  isWeekend,
  monthLabel,
  shortMonth,
  shortWeekday,
  today,
  weekRangeLabel,
  weeksOfMonth,
  weeksUntil,
} from "@/lib/dates";
import {
  activeDeadlines,
  buildIndex,
  deadlineById,
  deadlinesInMonth,
  deadlinesInWeek,
  deadlinesOnDay,
  loadByDay,
  monthWindow,
  plannedTasks,
  tasksAt,
} from "@/lib/select";
import { useUi, usePlanner } from "@/lib/ui";
import { Block } from "./Block";
import { DayPanel } from "./DayPanel";

/** The calendar columns. The rail is rendered beside them, not among them. */
export function Columns() {
  const state = usePlanner();
  const { ui, set } = useUi();
  const weeksRef = useRef<HTMLDivElement>(null);
  const daysRef = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLDivElement>(null);

  const now = today();
  const tasks = plannedTasks(state, ui.lensDeadlineId);
  const index = useMemo(() => buildIndex(tasks), [tasks]);
  const load = useMemo(() => loadByDay(state.tasks), [state.tasks]);
  const deadlines = activeDeadlines(state);
  const lens = deadlineById(state, ui.lensDeadlineId);
  const months = useMemo(() => monthWindow(state, now), [state, now]);
  const weeks = ui.selectedMonth ? weeksOfMonth(ui.selectedMonth) : [];
  const days = ui.selectedWeek ? daysOfWeek(ui.selectedWeek) : [];
  const showSize = state.settings.showSize;

  // §5.4 — expanding a column scrolls it into view, leaving its parent partly
  // visible at the left edge. Only below the breakpoint, where they don't fit.
  useScrollIntoViewWhenNarrow(weeksRef, ui.selectedMonth);
  useScrollIntoViewWhenNarrow(daysRef, ui.selectedWeek);
  useScrollIntoViewWhenNarrow(dayRef, ui.selectedDay);

  return (
    <div className="column-strip flex flex-1 overflow-x-auto">
      <Column title="Months" width="w-[76vw] wide:w-[244px]">
        {months.map((month, position) => (
          <Block
            key={month}
            level="month"
            date={month}
            expandable
            label={monthLabel(month)}
            sublabel={
              lens && lens.date >= month
                ? `${weeksUntil(month, lens.date)} weeks to ${lens.title}`
                : undefined
            }
            tasks={tasksAt(index.atMonth, month)}
            belowCount={index.belowMonth.get(month) ?? 0}
            deadlines={deadlinesInMonth(deadlines, month)}
            allDeadlines={deadlines}
            milestones={state.milestones}
            showSize={showSize}
            selected={ui.selectedMonth === month}
            onSelect={() =>
              // Selecting a block never clears the selected task: promoting with
              // the keyboard means selecting a task, then the block to put it in
              // (§6.3). Re-selecting the same month keeps the drill-down.
              set(
                ui.selectedMonth === month
                  ? { selectedMonth: month }
                  : { selectedMonth: month, selectedWeek: null, selectedDay: null },
              )
            }
            emptyText="Drop a task here to place it in this month."
            showEmptyText={ui.selectedMonth ? ui.selectedMonth === month : position === 0}
          />
        ))}
      </Column>

      <Column title="Weeks" innerRef={weeksRef} width="w-[76vw] wide:w-[262px]">
        {!ui.selectedMonth ? (
          <Empty>Choose a month to see the weeks it holds.</Empty>
        ) : (
          <div className="column-open" key={ui.selectedMonth}>
            {weeks.map((week, position) => (
              <Block
                key={week}
                level="week"
                date={week}
                expandable
                label={weekRangeLabel(week)}
                tasks={tasksAt(index.atWeek, week)}
                belowCount={index.belowWeek.get(week) ?? 0}
                deadlines={deadlinesInWeek(deadlines, week)}
                allDeadlines={deadlines}
                milestones={state.milestones}
                showSize={showSize}
                selected={ui.selectedWeek === week}
                onSelect={() =>
                  set(
                    ui.selectedWeek === week
                      ? { selectedWeek: week }
                      : { selectedWeek: week, selectedDay: null },
                  )
                }
                emptyText="Drop a task here to place it in this week."
                showEmptyText={ui.selectedWeek ? ui.selectedWeek === week : position === 0}
              />
            ))}
          </div>
        )}
      </Column>

      <Column title="Days" innerRef={daysRef} width="w-[76vw] wide:w-[248px]">
        {!ui.selectedWeek ? (
          <Empty>Choose a week to see its days.</Empty>
        ) : (
          <div className="column-open" key={ui.selectedWeek}>
            {days.map((day, position) => (
              <Block
                key={day}
                level="day"
                date={day}
                expandable
                label={
                  <span className="flex items-baseline gap-2">
                    <span>{shortWeekday(day)}</span>
                    <span className="numeral">{dayOfMonth(day)}</span>
                    {dayOfMonth(day) === 1 ? (
                      <span className="text-sm text-ink-3">{shortMonth(day)}</span>
                    ) : null}
                    {day === now ? <span className="text-2xs text-ink-3">today</span> : null}
                  </span>
                }
                sublabel={
                  (load.get(day) ?? 0) > 0
                    ? `${load.get(day)} of ${state.settings.dayCap}`
                    : undefined
                }
                tasks={tasksAt(index.atDay, day)}
                belowCount={null}
                deadlines={deadlinesOnDay(deadlines, day)}
                allDeadlines={deadlines}
                milestones={state.milestones}
                showSize={showSize}
                muted={isWeekend(day)}
                selected={ui.selectedDay === day}
                onSelect={() => set({ selectedDay: day })}
                emptyText="Drop a task here to place it on this day."
                showEmptyText={
                  ui.selectedDay ? ui.selectedDay === day : day === now || position === 0
                }
              />
            ))}
          </div>
        )}
      </Column>

      <Column title="Day" innerRef={dayRef} width="w-[86vw] wide:w-[300px]" last>
        <div key={ui.selectedDay ?? "none"}>
          <DayPanel index={index} load={load} deadlines={deadlines} />
        </div>
      </Column>
    </div>
  );
}

function useScrollIntoViewWhenNarrow(
  ref: React.RefObject<HTMLDivElement | null>,
  trigger: string | null,
) {
  useEffect(() => {
    if (!trigger || !ref.current) return;
    if (window.matchMedia("(min-width: 1101px)").matches) return;
    ref.current.scrollIntoView({ inline: "end", block: "nearest" });
  }, [ref, trigger]);
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-3 text-xs text-ink-3">{children}</p>;
}

function Column({
  title,
  children,
  innerRef,
  width,
  last = false,
}: {
  title: string;
  children: React.ReactNode;
  innerRef?: React.Ref<HTMLDivElement>;
  width: string;
  last?: boolean;
}) {
  return (
    <div
      ref={innerRef}
      className={[
        "column-snap flex shrink-0 flex-col",
        width,
        last ? "" : "border-r border-hairline",
      ].join(" ")}
    >
      <h2 className="border-b border-hairline px-3 py-2 font-serif text-md">{title}</h2>
      <div className="scroll-column flex-1 py-1">{children}</div>
    </div>
  );
}
