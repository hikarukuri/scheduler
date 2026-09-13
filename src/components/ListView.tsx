"use client";

import { countdownLabel, isNear, today } from "@/lib/dates";
import { placementText } from "@/lib/placement";
import { activeDeadlines, byCreation } from "@/lib/select";
import { useUi, usePlanner } from "@/lib/ui";
import type { Milestone, Task } from "@/lib/types";
import { TaskRow } from "./TaskRow";

/** Tasks under a deadline, split by milestone in milestone order; unassigned last. */
function byMilestone(
  tasks: Task[],
  milestones: Milestone[],
): { key: string; title: string | null; tasks: Task[] }[] {
  const groups: { key: string; title: string | null; tasks: Task[] }[] = milestones
    .filter((m) => !m.archived_at)
    .sort((a, b) => a.order - b.order)
    .map((m) => ({ key: m.id, title: m.title, tasks: tasks.filter((t) => t.milestone_id === m.id) }))
    .filter((g) => g.tasks.length > 0);
  const assigned = new Set(groups.flatMap((g) => g.tasks.map((t) => t.id)));
  const rest = tasks.filter((t) => !assigned.has(t.id));
  if (rest.length > 0) groups.push({ key: "rest", title: groups.length > 0 ? "No milestone" : null, tasks: rest });
  return groups;
}

const LEVELS = [
  { key: "all", label: "Any placement" },
  { key: "none", label: "Backlog" },
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "day", label: "Day" },
] as const;

/**
 * §5.5 — a toggle, not a separate place. A flat list of all open tasks, grouped
 * by deadline and sorted by deadline date, each showing its current placement
 * as text. For scanning and bulk triage, not for planning.
 */
export function ListView() {
  const state = usePlanner();
  const { ui, set } = useUi();
  const deadlines = activeDeadlines(state);
  const now = today();

  const open = state.tasks.filter((t) => t.status === "open");
  const filtered = open.filter((t) => {
    if (ui.listFilterDeadlineId && t.deadline_id !== ui.listFilterDeadlineId)
      return false;
    if (
      ui.listFilterLevel !== "all" &&
      t.placement_level !== ui.listFilterLevel
    )
      return false;
    return true;
  });

  const groups: {
    key: string;
    title: string;
    countdown: string | null;
    near: boolean;
    tasks: Task[];
  }[] = deadlines
    .map((d) => ({
      key: d.id,
      title: d.title,
      countdown: countdownLabel(d.date, now),
      near: isNear(d.date, now),
      tasks: filtered.filter((t) => t.deadline_id === d.id).sort(byCreation),
    }))
    .filter((g) => g.tasks.length > 0);

  const loose = filtered
    .filter(
      (t) => !t.deadline_id || !deadlines.some((d) => d.id === t.deadline_id),
    )
    .sort(byCreation);
  if (loose.length > 0) {
    groups.push({
      key: "none",
      title: "No deadline",
      countdown: null,
      near: false,
      tasks: loose,
    });
  }

  return (
    <div className="scroll-column flex-1">
      <div className="border-b border-hairline">
        <div className="mx-auto flex w-[min(760px,100%)] flex-wrap items-baseline gap-4 px-4 py-2 text-xs">
          <label className="flex items-baseline gap-2">
            <span className="text-2xs text-ink-3">Deadline</span>
            <select
              value={ui.listFilterDeadlineId ?? ""}
              onChange={(event) =>
                set({ listFilterDeadlineId: event.target.value || null })
              }
            >
              <option value="">All</option>
              {deadlines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-baseline gap-2">
            <span className="text-2xs text-ink-3">Placement</span>
            <select
              value={ui.listFilterLevel}
              onChange={(event) =>
                set({
                  listFilterLevel: event.target
                    .value as typeof ui.listFilterLevel,
                })
              }
            >
              {LEVELS.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <span className="numeral text-2xs text-ink-3">
            {filtered.length} open
          </span>
        </div>
      </div>

      <div className="mx-auto w-[min(760px,100%)] px-4 py-3">
        {groups.length === 0 ? (
          <p className="text-xs text-ink-3">
            Nothing open under this filter. Widen it, or capture something with
            the quick add.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="mb-6">
              <header className="mb-1 flex items-baseline justify-between gap-3 border-b border-hairline pb-1">
                <h2 className="font-serif text-lg">{group.title}</h2>
                {group.countdown ? (
                  <span
                    className="numeral text-xs"
                    style={
                      group.near
                        ? { color: "var(--accent)" }
                        : { color: "var(--ink-3)" }
                    }
                  >
                    {group.countdown}
                  </span>
                ) : null}
              </header>
              {byMilestone(
                group.tasks,
                state.milestones.filter((m) => m.deadline_id === group.key),
              ).map((sub) => (
                <div key={sub.key}>
                  {sub.title ? (
                    <p className="mb-[2px] mt-2 text-2xs text-ink-3">{sub.title}</p>
                  ) : null}
                  {sub.tasks.map((task) => (
                    <div key={task.id} className="flex items-baseline gap-3">
                      <div className="min-w-0 flex-1">
                        <TaskRow
                          task={task}
                          deadlines={deadlines}
                          milestones={state.milestones}
                          showSize={state.settings.showSize}
                        />
                      </div>
                      <span className="shrink-0 pt-[3px] text-2xs text-ink-3">
                        {placementText(task)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
