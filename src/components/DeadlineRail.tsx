"use client";

import { countdownLabel, isNear, today, weeksUntil } from "@/lib/dates";
import { activeDeadlines } from "@/lib/select";
import { useUi, usePlanner } from "@/lib/ui";

/**
 * The deadline rail — spec §5.2. A lens over the columns, not a column.
 * Selecting a deadline filters all three columns to its tasks; deselecting
 * restores everything. The rail collapses.
 */
export function DeadlineRail({ onNavigate }: { onNavigate?: () => void }) {
  const state = usePlanner();
  const { ui, set } = useUi();
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
                    <span className="min-w-0 flex-1 font-serif text-sm">{deadline.title}</span>
                    <span
                      className="numeral shrink-0 text-xs"
                      style={near ? { color: "var(--accent)" } : undefined}
                    >
                      {countdownLabel(deadline.date, now)}
                    </span>
                  </button>
                  {selected ? (
                    <div className="border-l-2 border-ink bg-selected px-3 pb-2 text-2xs text-ink-3">
                      <p className="flex gap-3">
                        <span>{deadline.date}</span>
                        <span>{deadline.kind}</span>
                      </p>
                      <p className="mt-[2px]">
                        {weeksUntil(now, deadline.date)} weeks from today
                      </p>
                      <button
                        type="button"
                        className="mt-1 underline"
                        onClick={() => set({ editingDeadlineId: deadline.id })}
                      >
                        Edit
                      </button>
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
