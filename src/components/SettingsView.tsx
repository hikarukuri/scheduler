"use client";

import { useEffect, useState } from "react";
import { loadCalendars, markChangesSeen, syncNow, useCalendar } from "@/lib/calendar";
import { resetAll, updateSettings } from "@/lib/store";
import { signInWithPassword, signOut, signUpWithPassword, useSync } from "@/lib/sync";
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
  const sync = useSync();
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

        <Account />
        <Calendars />
        <Keyboard />

        <section className="mt-8 border-t border-hairline pt-4">
          <h3 className="font-serif text-md">Local data</h3>
          <p className="mt-1 text-xs text-ink-3">
            {sync.signedIn
              ? "Your plan is in the cloud. This clears only the copy cached in this browser."
              : "Everything is stored in this browser. Clearing it cannot be undone."}
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

const SHORTCUTS: [string, string][] = [
  ["n", "Quick add"],
  ["t", "Go to today"],
  ["b", "Show or hide the backlog"],
  ["→", "Promote the selected task into the selected block of the next column"],
  ["←", "Demote the selected task one level"],
  ["↑ ↓", "Move between tasks in the same block"],
  ["Enter", "Mark the selected task done"],
  ["Escape", "Close a panel, or deselect"],
];

function Keyboard() {
  return (
    <section className="mt-8 border-t border-hairline pt-4">
      <h3 className="font-serif text-md">Keyboard</h3>
      <dl className="mt-2">
        {SHORTCUTS.map(([key, what]) => (
          <div key={key} className="flex items-baseline gap-3 py-[2px] text-xs">
            <dt className="numeral w-[64px] shrink-0 text-ink-3">{key}</dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * §2 — sign-in exists to keep the data private and to carry the plan between
 * devices, not to support more than one person. There are no roles, no
 * invitations and nobody to share with.
 */
function Account() {
  const sync = useSync();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(kind: "in" | "up") {
    if (!email.trim() || !password) {
      setMessage("Enter an email address and a password.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const failure =
      kind === "in"
        ? await signInWithPassword(email.trim(), password)
        : await signUpWithPassword(email.trim(), password);
    setBusy(false);
    setMessage(failure);
    if (!failure) setPassword("");
  }

  if (!sync.configured) {
    return (
      <section className="mt-8 border-t border-hairline pt-4">
        <h3 className="font-serif text-md">Account</h3>
        <p className="mt-1 text-xs text-ink-3">
          No Supabase project is configured, so the plan stays in this browser. Set
          NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to sync across devices.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 border-t border-hairline pt-4">
      <h3 className="font-serif text-md">Account</h3>
      {sync.signedIn ? (
        <>
          <p className="mt-1 text-xs">{sync.email}</p>
          <p className="mt-[2px] text-2xs text-ink-3">
            {sync.saveError
              ? `Changes are not saving. ${sync.saveError}`
              : sync.connection === "live"
                ? "Syncing across your devices."
                : sync.connection === "connecting"
                  ? "Connecting."
                  : `Changes are saving. ${sync.error ?? "Live updates are not connected."}`}
          </p>
          <button type="button" className="mt-2 text-xs underline" onClick={() => void signOut()}>
            Sign out
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-xs text-ink-3">
            Sign in to keep this plan on your phone as well as here. The same email and password
            on both, and nothing else to set up.
          </p>
          <form
            className="mt-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submit("in");
            }}
          >
            <label className="mb-2 flex items-baseline gap-3 text-xs">
              <span className="w-[64px] shrink-0 text-2xs text-ink-3">Email</span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-[220px] border-b border-hairline pb-[2px]"
              />
            </label>
            <label className="mb-2 flex items-baseline gap-3 text-xs">
              <span className="w-[64px] shrink-0 text-2xs text-ink-3">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-[220px] border-b border-hairline pb-[2px]"
              />
            </label>
            <p className="flex items-baseline gap-4 text-xs">
              <button type="submit" className="underline" disabled={busy}>
                {busy ? "Working" : "Sign in"}
              </button>
              <button
                type="button"
                className="text-ink-3"
                disabled={busy}
                onClick={() => void submit("up")}
              >
                Create the account
              </button>
            </p>
          </form>
          {message ? <p className="mt-1 text-2xs text-ink-3">{message}</p> : null}
          {sync.error ? <p className="mt-1 text-2xs text-ink-3">{sync.error}</p> : null}
        </>
      )}
    </section>
  );
}

/** §7, §9 — which calendars are watched, and what changed on them. */
function Calendars() {
  const state = usePlanner();
  const sync = useSync();
  const calendar = useCalendar();
  const watched = state.settings.watchedCalendarIds;

  useEffect(() => {
    if (sync.provider === "google" && !calendar.calendars && !calendar.loading) {
      void loadCalendars();
    }
  }, [sync.provider, calendar.calendars, calendar.loading]);

  if (!sync.configured) return null;

  // Reading a calendar needs a Google token, which only a Google sign-in
  // carries. On any other sign-in the import stays off rather than pretending.
  if (sync.provider !== "google") {
    return (
      <section className="mt-8 border-t border-hairline pt-4">
        <h3 className="font-serif text-md">Calendar</h3>
        <p className="mt-1 text-xs text-ink-3">
          Calendar import is off. It reads all-day events from Google Calendar, which needs a
          Google sign-in and a Google Cloud OAuth client. The README has the steps if you want it
          later; deadlines are typed in by hand until then.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 border-t border-hairline pt-4">
      <h3 className="font-serif text-md">Calendar</h3>
      <p className="mt-1 text-xs text-ink-3">
        Only all-day events on the calendars you choose become deadlines. Timed events are never
        imported, and the app never writes to your calendar.
      </p>

      {calendar.loading ? (
        <p className="mt-2 text-xs text-ink-3">Reading your calendars.</p>
      ) : calendar.calendars && calendar.calendars.length > 0 ? (
        <ul className="mt-2">
          {calendar.calendars.map((entry) => {
            const on = watched.includes(entry.id);
            return (
              <li key={entry.id}>
                <label className="flex items-baseline gap-2 py-[2px] text-xs">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const next = on
                        ? watched.filter((id) => id !== entry.id)
                        : [...watched, entry.id];
                      updateSettings({ watchedCalendarIds: next });
                      void syncNow();
                    }}
                  />
                  <span>{entry.summary}</span>
                  {entry.primary ? <span className="text-2xs text-ink-3">primary</span> : null}
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-ink-3">No calendars available.</p>
      )}

      <p className="mt-2 flex items-baseline gap-4 text-xs">
        <button type="button" className="underline" onClick={() => void syncNow()}>
          {calendar.syncing ? "Syncing" : "Sync now"}
        </button>
        {calendar.lastSyncAt ? (
          <span className="text-2xs text-ink-3">
            last synced {calendar.lastSyncAt.slice(11, 16)}
          </span>
        ) : null}
      </p>

      {calendar.error ? <p className="mt-1 text-2xs text-ink-3">{calendar.error}</p> : null}

      {calendar.changes.length > 0 ? (
        <div className="mt-3 border-t border-hairline pt-2">
          <h4 className="text-xs">What changed on your calendar</h4>
          <ul className="mt-1">
            {calendar.changes.map((change) => (
              <li key={change.id} className="flex items-baseline gap-3 py-[2px] text-2xs">
                <span className="w-[58px] shrink-0 text-ink-3">{change.change}</span>
                <span className="min-w-0 flex-1">{change.title}</span>
                {change.detail ? <span className="text-ink-3">{change.detail}</span> : null}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-1 text-2xs text-ink-3 underline"
            onClick={() => void markChangesSeen()}
          >
            Mark as read
          </button>
        </div>
      ) : null}
    </section>
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
