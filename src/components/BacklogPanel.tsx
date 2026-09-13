"use client";

import { useState } from "react";
import { dropKey, dropProps, useDrag } from "@/lib/drag";
import { inBacklog, plannedTasks } from "@/lib/select";
import { addTask } from "@/lib/store";
import { useUi, usePlanner } from "@/lib/ui";
import { TaskRow } from "./TaskRow";

/**
 * The backlog — level `none` (§4).
 *
 * It sits outside calendar time, so it is not a column: the left-to-right
 * commitment grammar runs month → week → day, and the backlog is the staging
 * area before a task enters that sequence at all. Collapsed, it is a control in
 * the bottom-right corner that is itself a drop target, so a task can be
 * returned to `none` without opening the panel first.
 */
export function BacklogPanel() {
  const state = usePlanner();
  const { ui, set } = useUi();
  const drag = useDrag();
  const [draft, setDraft] = useState("");

  const open = ui.backlogOpen;
  const all = inBacklog(plannedTasks(state, null));
  const shown = inBacklog(plannedTasks(state, ui.lensDeadlineId));
  const hidden = all.length - shown.length;
  const over = drag.overKey === dropKey("none", null);

  if (!open) {
    return (
      <button
        type="button"
        {...dropProps("none", null)}
        onClick={() => set({ backlogOpen: true })}
        className={[
          "fixed bottom-0 right-0 z-40 flex items-baseline gap-2 border-l border-t bg-surface px-3 py-2",
          over ? "border-ink" : "border-hairline",
        ].join(" ")}
      >
        <span className="text-xs">Backlog</span>
        <span className="numeral text-xs text-ink-3">{all.length}</span>
      </button>
    );
  }

  function submit() {
    const title = draft.trim();
    if (title) addTask({ title, deadline_id: ui.lensDeadlineId });
    setDraft("");
  }

  return (
    <div
      {...dropProps("none", null)}
      className={[
        "fixed bottom-0 right-0 z-40 flex max-h-[60vh] w-[min(340px,92vw)] flex-col border-l border-t bg-surface",
        over ? "border-ink" : "border-hairline",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between border-b border-hairline px-3 py-2">
        <h2 className="flex items-baseline gap-2 font-serif text-md">
          Backlog
          <span className="numeral text-xs text-ink-3">{all.length}</span>
        </h2>
        <button
          type="button"
          className="text-2xs text-ink-3"
          onClick={() => set({ backlogOpen: false })}
        >
          Close
        </button>
      </div>

      <div className="scroll-column flex-1 px-3 py-2">
        {shown.length === 0 ? (
          <p className="text-xs text-ink-3">
            Nothing waiting. Capture something with the quick add, then drag it into a month.
          </p>
        ) : (
          shown.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              deadlines={state.deadlines.filter((d) => !d.archived_at)}
              milestones={state.milestones}
              showSize={state.settings.showSize}
              showDeadline={!ui.lensDeadlineId}
            />
          ))
        )}
        {hidden > 0 ? (
          <p className="mt-2 text-2xs text-ink-3">
            {hidden} more hidden by the deadline you have selected.
          </p>
        ) : null}
      </div>

      <div className="border-t border-hairline px-3 py-2">
        <input
          aria-label="Capture a task"
          value={draft}
          placeholder="Capture a task"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          className="w-full text-base"
        />
      </div>
    </div>
  );
}
