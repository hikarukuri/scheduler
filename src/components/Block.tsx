"use client";

import { useState } from "react";
import { countdownLabel, isNear, today } from "@/lib/dates";
import { dropKey, dropProps, useDrag } from "@/lib/drag";
import { addTask } from "@/lib/store";
import { useUi } from "@/lib/ui";
import type { Deadline, ISODate, Milestone, PlacementLevel, Task } from "@/lib/types";

type BlockLevel = Exclude<PlacementLevel, "none">;
import { TaskRow } from "./TaskRow";

/**
 * One block in one column — spec §5.3. Every block carries its label, the tasks
 * placed at exactly that level, a count of what sits at finer levels beneath
 * it, and any deadline markers falling within it.
 */
export function Block({
  level,
  date,
  label,
  sublabel,
  tasks,
  belowCount,
  deadlines,
  allDeadlines,
  milestones,
  showSize,
  selected,
  onSelect,
  expandable = false,
  muted = false,
  emptyText,
  showEmptyText = true,
  marker,
  children,
}: {
  level: BlockLevel;
  date: ISODate;
  label: React.ReactNode;
  sublabel?: React.ReactNode;
  tasks: Task[];
  belowCount: number | null;
  deadlines: Deadline[];
  allDeadlines: Deadline[];
  milestones: Milestone[];
  showSize: boolean;
  selected?: boolean;
  onSelect?: () => void;
  expandable?: boolean;
  muted?: boolean;
  emptyText: string;
  /** The empty line is shown where it helps, not repeated down the whole column. */
  showEmptyText?: boolean;
  /** A quiet orientation word beside the label: "this month", "this week". */
  marker?: string;
  children?: React.ReactNode;
}) {
  const drag = useDrag();
  const { ui, set, notify } = useUi();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const over = drag.overKey === dropKey(level, date);
  // Finer levels exist below a month and a week, so their own tasks are the
  // ones not yet taken further.
  const hasFinerLevels = level !== "day";

  /** Adds the draft. Returns whether there was anything to add. */
  function submit(): boolean {
    const title = draft.trim();
    if (!title) return false;
    // A new task inherits the lens, so planning backwards from a selected
    // deadline does not mean retyping which deadline it is for (§6.1).
    const result = addTask({
      title,
      deadline_id: ui.lensDeadlineId,
      placement: { level, date },
    });
    if (!result.ok) notify(`${result.reason} Nothing was added.`, true);
    setDraft("");
    return true;
  }

  return (
    <section
      {...dropProps(level, date, expandable)}
      onClick={onSelect}
      className={[
        "group border-l-2 py-3 pl-3 pr-3",
        selected ? "border-ink bg-selected" : "border-transparent",
        over ? "outline outline-1 outline-ink" : "",
        onSelect ? "cursor-default" : "",
      ].join(" ")}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3
          className={[
            "font-serif",
            muted ? "font-light text-ink-3" : "text-ink",
            level === "month" ? "text-xl" : level === "week" ? "text-lg" : "text-md",
          ].join(" ")}
        >
          {label}
        </h3>
        {belowCount ? (
          <span className="numeral shrink-0 text-2xs text-ink-3">
            {belowCount} in {level === "month" ? "weeks" : "days"}
          </span>
        ) : null}
      </header>

      {marker || sublabel ? (
        <p className="mt-[1px] flex gap-3 text-2xs text-ink-3">
          {marker ? <span>{marker}</span> : null}
          {sublabel ? <span>{sublabel}</span> : null}
        </p>
      ) : null}

      {deadlines.length > 0 ? (
        <ul className="mt-1">
          {deadlines.map((d) => (
            <li key={d.id}>
              {/* A marker is also the quickest way into that deadline's lens. */}
              <button
                type="button"
                title={ui.lensDeadlineId === d.id ? "Show everything" : `Show only ${d.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  set({ lensDeadlineId: ui.lensDeadlineId === d.id ? null : d.id });
                }}
                className="flex w-full items-baseline justify-between gap-2 text-left"
              >
                <span
                  className={[
                    "truncate font-serif text-sm",
                    ui.lensDeadlineId === d.id ? "underline" : "",
                  ].join(" ")}
                >
                  {d.title}
                </span>
                <span
                  className="numeral shrink-0 text-2xs"
                  style={
                    isNear(d.date, today())
                      ? { color: "var(--accent)" }
                      : { color: "var(--ink-3)" }
                  }
                >
                  {countdownLabel(d.date)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {children}

      {tasks.length > 0 ? (
        <div className="mt-1">
          {hasFinerLevels ? (
            <p className="mb-[2px] text-2xs text-ink-3">Unplaced</p>
          ) : null}
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              deadlines={allDeadlines}
              milestones={milestones}
              showSize={showSize}
            />
          ))}
        </div>
      ) : null}

      {/* A block with weight beneath it is not empty, whatever sits at its own level. */}
      {tasks.length === 0 && !adding && showEmptyText && !belowCount ? (
        <p className="mt-1 text-2xs text-ink-3">{emptyText}</p>
      ) : null}

      {adding ? (
        <input
          autoFocus
          aria-label="Task"
          value={draft}
          placeholder="Task"
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            submit();
            setAdding(false);
          }}
          onKeyDown={(event) => {
            // Enter adds and stays open, so several tasks go in one after another;
            // an empty Enter, or Escape, closes it.
            if (event.key === "Enter" && !submit()) setAdding(false);
            if (event.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
          className="mt-1 w-full border-b border-hairline pb-[2px] text-base"
        />
      ) : (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect?.();
            setAdding(true);
          }}
          className={[
            "mt-1 text-2xs text-ink-3 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100",
            selected ? "" : "opacity-0",
          ].join(" ")}
        >
          Add
        </button>
      )}
    </section>
  );
}
