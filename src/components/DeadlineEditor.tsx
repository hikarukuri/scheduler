"use client";

import { useState } from "react";
import { today } from "@/lib/dates";
import {
  addDeadline,
  addMilestone,
  archiveDeadline,
  archiveMilestone,
  renameMilestone,
  updateDeadline,
} from "@/lib/store";
import { useUi, usePlanner } from "@/lib/ui";
import type { DeadlineKind } from "@/lib/types";

const KINDS: DeadlineKind[] = ["exam", "application", "submission", "other"];

/**
 * Creating and editing a deadline, and the optional milestones under it (§3).
 * A milestone carries no placement of its own and never appears as a column.
 */
export function DeadlineEditor() {
  const state = usePlanner();
  const { ui, set } = useUi();
  const editingId = ui.editingDeadlineId;
  const existing = editingId && editingId !== "new"
    ? state.deadlines.find((d) => d.id === editingId) ?? null
    : null;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [date, setDate] = useState(existing?.date ?? today());
  const [kind, setKind] = useState<DeadlineKind>(existing?.kind ?? "exam");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [milestoneDraft, setMilestoneDraft] = useState("");
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  if (!editingId) return null;

  const imported = existing?.source === "calendar";
  const milestones = existing
    ? state.milestones.filter((m) => !m.archived_at && m.deadline_id === existing.id)
    : [];

  function close() {
    set({ editingDeadlineId: null });
  }

  function save() {
    if (!title.trim()) return;
    if (existing) updateDeadline(existing.id, { title, date, kind, notes });
    else {
      const created = addDeadline({ title, date, kind, notes });
      set({ lensDeadlineId: created.id });
    }
    close();
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-paper/70" role="presentation">
      <div className="mx-auto my-[10vh] w-[min(520px,92vw)] border border-hairline bg-surface">
        <header className="border-b border-hairline px-4 py-3">
          <h2 className="font-serif text-lg">{existing ? "Deadline" : "New deadline"}</h2>
          {imported ? (
            <p className="mt-[2px] text-2xs text-ink-3">
              Imported from your calendar. Only the kind and the notes can be changed here.
            </p>
          ) : null}
        </header>

        <div className="px-4 py-3 text-xs">
          <Field label="Title">
            <input
              autoFocus
              value={title}
              disabled={imported}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full border-b border-hairline pb-[2px] text-base disabled:text-ink-3"
            />
          </Field>
          <Field label="Date">
            <input
              type="date"
              value={date}
              disabled={imported}
              onChange={(event) => setDate(event.target.value)}
              className="border-b border-hairline pb-[2px] disabled:text-ink-3"
            />
          </Field>
          <Field label="Kind">
            <select value={kind} onChange={(event) => setKind(event.target.value as DeadlineKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <textarea
              rows={2}
              value={notes}
              placeholder="Optional"
              onChange={(event) => setNotes(event.target.value)}
              className="w-full resize-none border border-hairline px-1 py-[2px]"
            />
          </Field>

          {existing ? (
            <section className="mt-4 border-t border-hairline pt-3">
              <h3 className="font-serif text-md">Milestones</h3>
              <p className="mt-[2px] text-2xs text-ink-3">
                Optional checkpoints under this deadline. They hold no date of their own.
              </p>
              <ul className="mt-2">
                {milestones.map((milestone) => (
                  <li key={milestone.id} className="flex items-baseline gap-2 py-[2px]">
                    <input
                      defaultValue={milestone.title}
                      onBlur={(event) => renameMilestone(milestone.id, event.target.value)}
                      className="min-w-0 flex-1 border-b border-hairline pb-[1px] text-base"
                    />
                    <button
                      type="button"
                      className="shrink-0 text-2xs text-ink-3 underline"
                      onClick={() => archiveMilestone(milestone.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <input
                value={milestoneDraft}
                aria-label="Add a milestone"
                placeholder="Add a milestone"
                onChange={(event) => setMilestoneDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || !milestoneDraft.trim()) return;
                  addMilestone(existing.id, milestoneDraft);
                  setMilestoneDraft("");
                }}
                className="mt-2 w-full border-b border-hairline pb-[2px] text-base"
              />
            </section>
          ) : null}
        </div>

        <footer className="flex items-baseline justify-between border-t border-hairline px-4 py-3 text-xs">
          <span className="flex items-baseline gap-4">
            <button type="button" className="text-ink-3" onClick={close}>
              Cancel
            </button>
            {existing ? (
              confirmingArchive ? (
                <>
                  <span className="text-ink-3">Archive this deadline?</span>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      archiveDeadline(existing.id);
                      if (ui.lensDeadlineId === existing.id) set({ lensDeadlineId: null });
                      close();
                    }}
                  >
                    Archive
                  </button>
                  <button
                    type="button"
                    className="text-ink-3"
                    onClick={() => setConfirmingArchive(false)}
                  >
                    Keep
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="text-ink-3 underline"
                  onClick={() => setConfirmingArchive(true)}
                >
                  Archive
                </button>
              )
            ) : null}
          </span>
          <button type="button" className="underline" onClick={save}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 flex items-baseline gap-3">
      <span className="w-[52px] shrink-0 text-2xs text-ink-3">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}
