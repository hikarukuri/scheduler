"use client";

import { useMemo, useState } from "react";
import { startOfWeek, weekOwnerMonth } from "@/lib/dates";
import { describePlacement } from "@/lib/placement";
import { parseQuickAdd } from "@/lib/quickadd";
import { activeDeadlines } from "@/lib/select";
import { addTask } from "@/lib/store";
import { useUi, usePlanner } from "@/lib/ui";

/**
 * Quick add — spec §6.5. What was parsed is shown before it is committed, and
 * text that did not parse joins the title rather than raising an error.
 */
export function QuickAdd() {
  const state = usePlanner();
  const { ui, set, notify } = useUi();
  const [input, setInput] = useState("");
  const deadlines = activeDeadlines(state);
  const parsed = useMemo(() => parseQuickAdd(input, deadlines), [input, deadlines]);
  // With a deadline selected in the rail, a new task belongs to it unless # says
  // otherwise — the same rule as adding straight into a block.
  const lens = deadlines.find((d) => d.id === ui.lensDeadlineId) ?? null;
  const deadline = parsed.deadline ?? lens;

  function close() {
    setInput("");
    set({ quickAddOpen: false });
  }

  function commit() {
    if (!parsed.title.trim()) return;
    const result = addTask({
      title: parsed.title,
      deadline_id: deadline?.id ?? null,
      size: parsed.size,
      placement: parsed.placement,
    });
    if (!result.ok) {
      notify(`${result.reason} Nothing was added.`, true);
      return;
    }
    // Follow the new task into the columns, so it is where you can see it.
    if (parsed.placement.level !== "none") {
      const date = parsed.placement.date;
      const month =
        parsed.placement.level === "month" ? date : weekOwnerMonth(date);
      set({
        selectedMonth: month,
        selectedWeek: parsed.placement.level === "month" ? null : startOfWeek(date),
      });
    }
    close();
  }

  if (!ui.quickAddOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-paper/70"
      onClick={close}
      role="presentation"
    >
      <div
        className="mx-auto mt-[12vh] w-[min(560px,92vw)] border border-hairline bg-surface"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          aria-label="Quick add"
          value={input}
          placeholder="Draft the personal statement #cam by fri !M"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") close();
          }}
          className="w-full border-b border-hairline px-3 py-3 text-md"
        />

        <dl className="px-3 py-2 text-xs">
          <Row label="Title">
            {parsed.title.trim() ? parsed.title : <span className="text-ink-3">Nothing yet</span>}
          </Row>
          <Row label="Deadline">
            {deadline ? (
              <>
                {deadline.title}
                {!parsed.deadline ? (
                  <span className="ml-2 text-ink-3">the one selected</span>
                ) : null}
              </>
            ) : (
              <span className="text-ink-3">None</span>
            )}
          </Row>
          <Row label="Placement">
            {describePlacement(parsed.placement)}
            {parsed.placementSource ? (
              <span className="ml-2 text-ink-3">from “{parsed.placementSource}”</span>
            ) : null}
          </Row>
          <Row label="Size">
            {parsed.size ?? <span className="text-ink-3">None</span>}
          </Row>
        </dl>

        {parsed.unmatchedDeadline ? (
          <p className="px-3 pb-2 text-2xs text-ink-3">
            No deadline matched “{parsed.unmatchedDeadline}”, so it stayed in the title.
          </p>
        ) : null}

        <p className="border-t border-hairline px-3 py-2 text-2xs text-ink-3">
          # for a deadline, !S !M !L for size, and today, tomorrow, by fri, nov, nov 12 or
          week of nov 10 for placement. Enter to add, Escape to close.
        </p>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-[2px]">
      <dt className="w-[64px] shrink-0 text-2xs text-ink-3">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}
