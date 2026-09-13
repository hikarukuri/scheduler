"use client";

import { useState } from "react";
import { dayOfMonth, shortMonth, today, weekdayName } from "@/lib/dates";
import { atDay, CARRY_LIMIT, plannedTasks } from "@/lib/select";
import { dayCloseApply, dayCloseFinish, type DayCloseChoice } from "@/lib/store";
import { useUi, usePlanner } from "@/lib/ui";

const CHOICES: { key: DayCloseChoice; label: string }[] = [
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "Back to this week" },
  { key: "month", label: "Back to the month" },
  { key: "backlog", label: "Back to backlog" },
  { key: "drop", label: "Drop" },
];

/**
 * The day close — spec §6.2. Explicit, never automatic, never silent. One
 * unfinished task at a time, one choice each, and nothing moves until a choice
 * is made.
 */
export function DayClose() {
  const state = usePlanner();
  const { ui, set } = useUi();
  const [blocked, setBlocked] = useState<string | null>(null);
  const day = today();
  const remaining = atDay(plannedTasks(state, null), day);

  if (!ui.dayCloseOpen) return null;

  function finish() {
    dayCloseFinish(day);
    set({ dayCloseOpen: false });
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-paper/70" role="presentation">
      <div className="mx-auto my-[8vh] w-[min(560px,92vw)] border border-hairline bg-surface">
        <header className="border-b border-hairline px-4 py-3">
          <h2 className="font-serif text-lg">
            Closing {weekdayName(day)} {dayOfMonth(day)} {shortMonth(day)}
          </h2>
          <p className="mt-[2px] text-xs text-ink-3">
            {remaining.length === 0
              ? "Nothing unfinished."
              : `${remaining.length} unfinished. Choose where each one goes; anything you leave stays put.`}
          </p>
        </header>

        <div className="px-4 py-2">
          {remaining.map((task) => (
            <div key={task.id} className="border-b border-hairline py-3 last:border-b-0">
              <p className="text-base">{task.title}</p>
              {task.carry_count >= CARRY_LIMIT ? (
                <p className="mt-[2px] text-2xs text-ink-3">
                  Carried {task.carry_count} times. It may be too large, or not yet specific
                  enough.
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {CHOICES.map((choice) => (
                  <button
                    key={choice.key}
                    type="button"
                    className="text-ink-2 underline"
                    onClick={() => {
                      const result = dayCloseApply(task.id, choice.key);
                      setBlocked(result.ok ? null : `${result.reason} It stayed where it is.`);
                    }}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {remaining.length === 0 ? (
            <p className="py-3 text-xs text-ink-3">
              Everything placed here today is finished or moved.
            </p>
          ) : null}
        </div>

        {blocked ? <p className="px-4 pb-2 text-2xs text-ink-3">{blocked}</p> : null}

        <footer className="flex justify-between border-t border-hairline px-4 py-3 text-xs">
          <button
            type="button"
            className="text-ink-3"
            onClick={() => set({ dayCloseOpen: false })}
          >
            Not now
          </button>
          <button type="button" className="underline" onClick={finish}>
            Done for today
          </button>
        </footer>
      </div>
    </div>
  );
}
