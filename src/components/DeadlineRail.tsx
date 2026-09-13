"use client";

import {
  countdownLabel,
  dayOfMonth,
  diffDays,
  isNear,
  monthName,
  parse,
  today,
  weekdayName,
  weeksUntil,
} from "@/lib/dates";
import { activeDeadlines } from "@/lib/select";
import { archiveDeadline, restoreDeadline } from "@/lib/store";
import { useUi, usePlanner } from "@/lib/ui";

/** "Thursday 15 October 2026" — a date read, not parsed. */
function longDate(iso: string): string {
  return `${weekdayName(iso)} ${dayOfMonth(iso)} ${monthName(iso)} ${parse(iso).getUTCFullYear()}`;
}

/**
 * The deadline rail — spec §5.2. A lens over the columns, not a column.
 * Selecting a deadline filters all three columns to its tasks; deselecting
 * restores everything. The rail collapses.
 */
export function DeadlineRail({ onNavigate }: { onNavigate?: () => void }) {
  const state = usePlanner();
  const { ui, set, notifyUndo } = useUi();
  const deadlines = activeDeadlines(state);
  const now = today();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between border-b border-hairline px-3 py-2">
        <h2 className="font-serif text-md">Deadlines</h2>
        <button
          type="button"
          aria-label="Add deadline"
          className="text-2xs text-ink-3"
          onClick={() => set({ editingDeadlineId: "new" })}
        >
          Add
        </button>
      </div>

      <div className="scroll-column flex-1">
        {deadlines.length === 0 ? (
          <p className="px-3 py-3 text-xs text-ink-3">
            No deadlines yet. Add one to start planning backwards from it.
          </p>
        ) : (
          <ul>
            {deadlines.map((deadline) => {
              const selected = ui.lensDeadlineId === deadline.id;
              const near = isNear(deadline.date, now);
              const passed = diffDays(now, deadline.date) < 0;
              return (
                <li key={deadline.id}>
                  <button
                    type="button"
                    onClick={() => {
                      set({
                        lensDeadlineId: selected ? null : deadline.id,
                        selectedTaskId: null,
                      });
                      onNavigate?.();
                    }}
                    className={[
                      "flex w-full items-baseline justify-between gap-2 border-l-2 px-3 py-[6px] text-left",
                      selected ? "border-ink bg-selected" : "border-transparent",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "min-w-0 flex-1 font-serif text-sm",
                        passed ? "text-ink-3" : "",
                      ].join(" ")}
                    >
                      {deadline.title}
                    </span>
                    <span
                      className={["numeral shrink-0 text-xs", passed ? "text-ink-3" : ""].join(" ")}
                      style={near ? { color: "var(--accent)" } : undefined}
                    >
                      {countdownLabel(deadline.date, now)}
                    </span>
                  </button>
                  {selected ? (
                    <div className="border-l-2 border-ink bg-selected px-3 pb-2 text-2xs text-ink-3">
                      <p>{longDate(deadline.date)}</p>
                      <p className="mt-[2px] flex gap-3">
                        <span>{deadline.kind}</span>
                        <span>
                          {passed
                            ? `${-diffDays(now, deadline.date)} days ago`
                            : `${weeksUntil(now, deadline.date)} weeks from today`}
                        </span>
                      </p>
                      {deadline.notes ? (
                        <p className="mt-1 whitespace-pre-wrap text-ink-2">{deadline.notes}</p>
                      ) : null}
                      <p className="mt-1 flex gap-3">
                        <button
                          type="button"
                          className="underline"
                          onClick={() => set({ editingDeadlineId: deadline.id })}
                        >
                          Edit
                        </button>
                        {passed ? (
                          // A deadline that has passed is usually finished with;
                          // archiving it from here keeps the rail current.
                          <button
                            type="button"
                            className="underline"
                            onClick={() => {
                              archiveDeadline(deadline.id);
                              set({ lensDeadlineId: null });
                              notifyUndo(`“${deadline.title}” archived.`, () =>
                                restoreDeadline(deadline.id),
                              );
                            }}
                          >
                            Archive
                          </button>
                        ) : null}
                      </p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {ui.lensDeadlineId ? (
        <button
          type="button"
          className="border-t border-hairline px-3 py-2 text-left text-2xs text-ink-3"
          onClick={() => set({ lensDeadlineId: null })}
        >
          Showing one deadline. Clear to see everything.
        </button>
      ) : null}
    </div>
  );
}
