"use client";

import { countdownLabel, isNear, today } from "@/lib/dates";
import { useDrag } from "@/lib/drag";
import { CARRY_LIMIT } from "@/lib/select";
import { dropTask, setDone, updateTask } from "@/lib/store";
import { useUi } from "@/lib/ui";
import type { Deadline, Milestone, Size, Task } from "@/lib/types";

const SIZES: Size[] = ["S", "M", "L"];

/**
 * One task. The only thing that ever gets marked done (§3).
 *
 * Selecting a task expands its detail in place rather than opening a fifth
 * column, so the strip keeps its width at every breakpoint.
 */
export function TaskRow({
  task,
  deadlines,
  milestones,
  showSize,
  showDeadline = false,
}: {
  task: Task;
  deadlines: Deadline[];
  milestones: Milestone[];
  showSize: boolean;
  showDeadline?: boolean;
}) {
  const { ui, set } = useUi();
  const drag = useDrag();
  const expanded = ui.selectedTaskId === task.id;
  const dragging = drag.draggingId === task.id;
  const justMoved = ui.lastMoved === task.id;
  const deadline = deadlines.find((d) => d.id === task.deadline_id) ?? null;
  const carried = task.carry_count >= CARRY_LIMIT;
  const ownMilestones = milestones.filter(
    (m) => !m.archived_at && m.deadline_id === task.deadline_id,
  );

  return (
    <div
      className={[
        "border-l-2 pl-2 -ml-2",
        expanded ? "border-ink bg-selected" : "border-transparent",
        dragging ? "opacity-30" : "",
        justMoved ? "task-landed" : "",
      ].join(" ")}
    >
      <div
        className="flex items-baseline gap-2 py-[3px] cursor-default"
        onPointerDown={(event) => drag.start(event, task.id, task.title)}
        onClick={(event) => {
          // Selecting a task must not also re-select the block it sits in.
          event.stopPropagation();
          if (drag.recentlyDragged()) return;
          set({ selectedTaskId: expanded ? null : task.id });
        }}
      >
        <button
          type="button"
          aria-label={task.status === "done" ? "Mark as not done" : "Mark as done"}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setDone(task.id, task.status !== "done");
          }}
          className={[
            "mt-[3px] h-[11px] w-[11px] shrink-0 border",
            task.status === "done" ? "border-ink bg-ink" : "border-ink-3",
          ].join(" ")}
        />
        <span className="min-w-0 flex-1 text-base">{task.title}</span>
        {showDeadline && deadline ? (
          <span className="shrink-0 text-2xs text-ink-3">{deadline.title}</span>
        ) : null}
        {carried ? (
          <span className="shrink-0 text-2xs text-ink-3">carried {task.carry_count}</span>
        ) : null}
        {showSize && task.size ? (
          <span className="numeral shrink-0 text-2xs text-ink-3">{task.size}</span>
        ) : null}
      </div>

      {expanded ? (
        <div
          className="pb-2 pl-[19px] pr-1 text-xs text-ink-2"
          onClick={(event) => event.stopPropagation()}
        >
          <Field label="Deadline">
            <select
              aria-label="Deadline"
              value={task.deadline_id ?? ""}
              onChange={(event) =>
                updateTask(task.id, { deadline_id: event.target.value || null })
              }
              className="max-w-[150px] truncate"
            >
              <option value="">None</option>
              {deadlines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
            {deadline ? (
              <span
                className="numeral ml-2 text-xs"
                style={isNear(deadline.date, today()) ? { color: "var(--accent)" } : undefined}
              >
                {countdownLabel(deadline.date)}
              </span>
            ) : null}
          </Field>

          {ownMilestones.length > 0 ? (
            <Field label="Milestone">
              <select
                aria-label="Milestone"
                value={task.milestone_id ?? ""}
                onChange={(event) =>
                  updateTask(task.id, { milestone_id: event.target.value || null })
                }
                className="max-w-[150px] truncate"
              >
                <option value="">None</option>
                {ownMilestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {showSize ? (
            <Field label="Size">
              <span className="flex gap-2">
                {SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => updateTask(task.id, { size: task.size === s ? null : s })}
                    className={task.size === s ? "text-ink underline" : "text-ink-3"}
                  >
                    {s}
                  </button>
                ))}
              </span>
            </Field>
          ) : null}

          {task.carry_count > 0 ? (
            <Field label="Carried">
              <span>
                {task.carry_count} {task.carry_count === 1 ? "time" : "times"}
              </span>
            </Field>
          ) : null}

          {carried ? (
            <p className="mb-1 mt-1 text-xs text-ink-3">
              This has moved three times. It may be too large, or not yet specific enough.
            </p>
          ) : null}

          <Field label="Notes">
            <textarea
              aria-label="Notes"
              rows={2}
              defaultValue={task.notes ?? ""}
              placeholder="Optional"
              onBlur={(event) => updateTask(task.id, { notes: event.target.value })}
              className="w-full resize-none border border-hairline px-1 py-[2px] text-xs"
            />
          </Field>

          <div className="mt-1 flex gap-3 text-xs">
            <button
              type="button"
              className="text-ink-3 underline"
              onClick={() => {
                dropTask(task.id);
                set({ selectedTaskId: null });
              }}
            >
              Drop this task
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-[3px] flex items-baseline gap-2">
      <span className="w-[58px] shrink-0 text-2xs text-ink-3">{label}</span>
      <span className="flex min-w-0 flex-1 items-baseline">{children}</span>
    </div>
  );
}
