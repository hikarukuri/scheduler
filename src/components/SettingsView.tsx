"use client";

import { useState } from "react";
import { resetAll, updateSettings } from "@/lib/store";
import { usePlanner } from "@/lib/ui";
import { DEFAULT_SETTINGS } from "@/lib/types";

/**
 * §9 — customisable in a settings view, never inline.
 *
 * Not customisable, and so not here: the three-level column hierarchy, the
 * absence of times, deadlines as a lens rather than a column, and the archive's
 * lack of statistics.
 */
export function SettingsView() {
  const state = usePlanner();
  const s = state.settings;
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <div className="scroll-column flex-1">
      <div className="mx-auto w-[min(620px,100%)] px-4 py-4">
        <h2 className="mb-4 font-serif text-xl">Settings</h2>

        <Setting
          label="Tasks per day"
          note="A day block holds this many tasks. Reaching it blocks a move; there is no override."
        >
          <input
            type="number"
            min={1}
            max={20}
            value={s.dayCap}
            onChange={(event) =>
              updateSettings({ dayCap: clamp(Number(event.target.value), 1, 20) })
            }
            className="w-[64px] border border-hairline px-1 py-[2px]"
          />
        </Setting>

        <Setting
          label="Day close after"
          note="The local hour after which the day close is offered. It is never run for you."
        >
          <input
            type="number"
            min={0}
            max={23}
            value={s.dayClosePromptHour}
            onChange={(event) =>
              updateSettings({ dayClosePromptHour: clamp(Number(event.target.value), 0, 23) })
            }
            className="w-[64px] border border-hairline px-1 py-[2px]"
          />
          <span className="ml-2 text-2xs text-ink-3">o&rsquo;clock</span>
        </Setting>

        <Setting
          label="Months ahead"
          note="How far forward the months column extends. It always reaches at least as far as your furthest deadline."
        >
          <input
            type="number"
            min={1}
            max={36}
            value={s.monthsForward}
            onChange={(event) =>
              updateSettings({ monthsForward: clamp(Number(event.target.value), 1, 36) })
            }
            className="w-[64px] border border-hairline px-1 py-[2px]"
          />
        </Setting>

        <Setting label="Show size" note="Whether S, M and L appear on tasks at all.">
          <button
            type="button"
            className="underline"
            onClick={() => updateSettings({ showSize: !s.showSize })}
          >
            {s.showSize ? "Shown" : "Hidden"}
          </button>
        </Setting>

        <Setting
          label="Accent"
          note="Used for exactly one thing: a deadline inside 14 days."
        >
          <input
            type="color"
            value={s.accentColor}
            onChange={(event) => updateSettings({ accentColor: event.target.value })}
            className="h-[22px] w-[40px] border border-hairline"
          />
          <span className="numeral ml-2 text-2xs text-ink-3">{s.accentColor}</span>
          <button
            type="button"
            className="ml-3 text-2xs text-ink-3 underline"
            onClick={() => updateSettings({ accentColor: DEFAULT_SETTINGS.accentColor })}
          >
            Reset
          </button>
        </Setting>

        <section className="mt-8 border-t border-hairline pt-4">
          <h3 className="font-serif text-md">Local data</h3>
          <p className="mt-1 text-xs text-ink-3">
            Everything is stored in this browser. Clearing it cannot be undone.
          </p>
          {confirmingReset ? (
            <p className="mt-2 flex items-baseline gap-4 text-xs">
              <span>Erase every deadline and task?</span>
              <button
                type="button"
                className="underline"
                onClick={() => {
                  resetAll();
                  setConfirmingReset(false);
                }}
              >
                Erase
              </button>
              <button
                type="button"
                className="text-ink-3"
                onClick={() => setConfirmingReset(false)}
              >
                Keep
              </button>
            </p>
          ) : (
            <button
              type="button"
              className="mt-2 text-xs text-ink-3 underline"
              onClick={() => setConfirmingReset(true)}
            >
              Clear local data
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function Setting({
  label,
  note,
  children,
}: {
  label: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <div className="flex items-baseline gap-3">
        <h3 className="w-[120px] shrink-0 font-serif text-md">{label}</h3>
        <div className="flex items-baseline text-xs">{children}</div>
      </div>
      <p className="mt-[2px] pl-[132px] text-2xs text-ink-3">{note}</p>
    </section>
  );
}
