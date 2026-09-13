"use client";

import { useState } from "react";
import { deleteDeadline, deleteTask, reopenTask, restoreDeadline } from "@/lib/store";
import { usePlanner } from "@/lib/ui";
import type { Task } from "@/lib/types";

/** "Delete" that asks once, inline, and never as a modal. */
function DeleteForGood({ what, onDelete }: { what: string; onDelete: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button
        type="button"
        className="shrink-0 text-2xs text-ink-3 underline"
        onClick={() => setAsking(true)}
      >
        Delete
      </button>
    );
  }
  return (
    <span className="flex shrink-0 items-baseline gap-2 text-2xs">
      <span className="text-ink-3">Delete {what} for good?</span>
      <button type="button" className="underline" onClick={onDelete}>
        Delete
      </button>
      <button type="button" className="text-ink-3" onClick={() => setAsking(false)}>
        Keep
      </button>
    </span>
  );
}

function completedFirst(a: Task, b: Task): number {
  const x = a.completed_at ?? "";
  const y = b.completed_at ?? "";
  return x < y ? 1 : x > y ? -1 : 0;
}

function dateOnly(stamp: string | null): string {
  return stamp ? stamp.slice(0, 10) : "";
}

/**
 * §6.6 — completed and dropped tasks never appear in the columns. They are kept
 * here, grouped by deadline, so the record of what was finished stays readable.
 * No streaks, no charts, no scores.
 */
export function ArchiveView() {
  const state = usePlanner();
  const archived = state.tasks.filter((t) => t.status !== "open").sort(completedFirst);
  const archivedDeadlines = state.deadlines.filter((d) => d.archived_at);

  const groups = state.deadlines
    .map((d) => ({
      key: d.id,
      title: d.title,
      date: d.date,
      tasks: archived.filter((t) => t.deadline_id === d.id),
    }))
    .filter((g) => g.tasks.length > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const loose = archived.filter(
    (t) => !t.deadline_id || !state.deadlines.some((d) => d.id === t.deadline_id),
  );
  if (loose.length > 0) {
    groups.push({ key: "none", title: "No deadline", date: "", tasks: loose });
  }

  return (
    <div className="scroll-column flex-1">
      <div className="mx-auto w-[min(760px,100%)] px-4 py-4">
        <h2 className="mb-3 font-serif text-xl">Archive</h2>

        {groups.length === 0 ? (
          <p className="text-xs text-ink-3">
            Nothing finished yet. Tasks you mark done or drop collect here, grouped by deadline,
            with the day they were finished.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="mb-6">
              <h3 className="mb-1 border-b border-hairline pb-1 font-serif text-lg">
                {group.title}
              </h3>
              <ul>
                {group.tasks.map((task) => (
                  <li key={task.id} className="flex items-baseline gap-3 py-[3px]">
                    <span
                      className={[
                        "min-w-0 flex-1 text-base",
                        task.status === "dropped" ? "text-ink-3 line-through" : "",
                      ].join(" ")}
                    >
                      {task.title}
                    </span>
                    <span className="numeral shrink-0 text-2xs text-ink-3">
                      {dateOnly(task.completed_at)}
                    </span>
                    <span className="shrink-0 text-2xs text-ink-3">
                      {task.status === "dropped" ? "dropped" : "done"}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-2xs text-ink-3 underline"
                      onClick={() => reopenTask(task.id)}
                    >
                      Reopen
                    </button>
                    <DeleteForGood what="this task" onDelete={() => deleteTask(task.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        {archivedDeadlines.length > 0 ? (
          <section className="mb-6">
            <h3 className="mb-1 border-b border-hairline pb-1 font-serif text-lg">
              Archived deadlines
            </h3>
            <ul>
              {archivedDeadlines.map((deadline) => (
                <li key={deadline.id} className="flex items-baseline gap-3 py-[3px]">
                  <span className="min-w-0 flex-1 text-base">{deadline.title}</span>
                  <span className="numeral shrink-0 text-2xs text-ink-3">{deadline.date}</span>
                  <button
                    type="button"
                    className="shrink-0 text-2xs text-ink-3 underline"
                    onClick={() => restoreDeadline(deadline.id)}
                  >
                    Restore
                  </button>
                  <DeleteForGood
                    what="this deadline"
                    onDelete={() => deleteDeadline(deadline.id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
