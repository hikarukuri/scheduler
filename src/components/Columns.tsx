"use client";

import { useEffect, useRef } from "react";
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
  atDay,
  atMonth,
  atWeek,
  belowMonth,
  belowWeek,
  deadlinesInMonth,
  deadlinesInWeek,
  deadlinesOnDay,
  deadlineById,
  monthWindow,
  plannedTasks,
} from "@/lib/select";
import { useUi, usePlanner } from "@/lib/ui";
import { dayLoad } from "@/lib/placement";
import { Block } from "./Block";

/** The three calendar columns. The rail is rendered beside them, not among them. */
export function Columns() {
  const state = usePlanner();
  const { ui, set } = useUi();
  const stripRef = useRef<HTMLDivElement>(null);
  const weeksRef = useRef<HTMLDivElement>(null);
  const daysRef = useRef<HTMLDivElement>(null);

  const now = today();
  const tasks = plannedTasks(state, ui.lensDeadlineId);
  const deadlines = activeDeadlines(state);
  const allDeadlines = deadlines;
  const lens = deadlineById(state, ui.lensDeadlineId);
  const months = monthWindow(state, now);
  const weeks = ui.selectedMonth ? weeksOfMonth(ui.selectedMonth) : [];
  const days = ui.selectedWeek ? daysOfWeek(ui.selectedWeek) : [];
  const showSize = state.settings.showSize;

  // §5.4 — expanding a column scrolls it into view, leaving its parent partly
  // visible at the left edge. Only below the breakpoint, where they don't fit.
  useEffect(() => {
    if (!ui.selectedMonth || !stripRef.current || !weeksRef.current) return;
    if (window.matchMedia("(min-width: 1101px)").matches) return;
    weeksRef.current.scrollIntoView({ inline: "end", block: "nearest" });
  }, [ui.selectedMonth]);

  useEffect(() => {
    if (!ui.selectedWeek || !stripRef.current || !daysRef.current) return;
    if (window.matchMedia("(min-width: 1101px)").matches) return;
    daysRef.current.scrollIntoView({ inline: "end", block: "nearest" });
  }, [ui.selectedWeek]);

  return (
    <div ref={stripRef} className="column-strip flex flex-1 overflow-x-auto">
      <Column title="Months" width="w-[76vw] wide:w-[248px]">
        {months.map((month, index) => (
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
            tasks={atMonth(tasks, month)}
            belowCount={belowMonth(tasks, month)}
            deadlines={deadlinesInMonth(deadlines, month)}
            allDeadlines={allDeadlines}
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
            showEmptyText={
              ui.selectedMonth ? ui.selectedMonth === month : index === 0
            }
          />
        ))}
      </Column>

      <Column title="Weeks" innerRef={weeksRef} width="w-[76vw] wide:w-[268px]">
        {!ui.selectedMonth ? (
          <p className="px-3 py-3 text-xs text-ink-3">
            Choose a month to see the weeks it holds.
          </p>
        ) : (
          <div className="column-open" key={ui.selectedMonth}>
            {weeks.map((week, index) => (
              <Block
                key={week}
                level="week"
                date={week}
                expandable
                label={weekRangeLabel(week)}
                tasks={atWeek(tasks, week)}
                belowCount={belowWeek(tasks, week)}
                deadlines={deadlinesInWeek(deadlines, week)}
                allDeadlines={allDeadlines}
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
                showEmptyText={ui.selectedWeek ? ui.selectedWeek === week : index === 0}
              />
            ))}
          </div>
        )}
      </Column>

      <Column title="Days" innerRef={daysRef} width="w-[76vw] wide:w-[300px]" last>
        {!ui.selectedWeek ? (
          <p className="px-3 py-3 text-xs text-ink-3">
            Choose a week to see its days.
          </p>
        ) : (
          <div className="column-open" key={ui.selectedWeek}>
            {days.map((day, index) => {
              const load = dayLoad(state.tasks, day);
              return (
                <Block
                  key={day}
                  level="day"
                  date={day}
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
                  sublabel={load > 0 ? `${load} of ${state.settings.dayCap}` : undefined}
                  tasks={atDay(tasks, day)}
                  belowCount={null}
                  deadlines={deadlinesOnDay(deadlines, day)}
                  allDeadlines={allDeadlines}
                  milestones={state.milestones}
                  showSize={showSize}
                  muted={isWeekend(day)}
                  selected={ui.selectedDay === day}
                  onSelect={() => set({ selectedDay: day })}
                  emptyText="Drop a task here to place it on this day."
                  showEmptyText={
                    ui.selectedDay ? ui.selectedDay === day : day === now || index === 0
                  }
                />
              );
            })}
          </div>
        )}
      </Column>
    </div>
  );
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
