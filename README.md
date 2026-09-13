# Study Planner

A personal tool for working backwards from dated commitments — exams, application
deadlines, submissions — from about twelve months out down to today.

It is not a task list. The interface makes the shape of time between now and a
deadline visible, and lets work be committed into that shape progressively. A task
sits at whatever level of specificity has been decided so far, and no further:

    none → month → week → day

Moving a task rightward raises its level. Moving it leftward lowers it, which is a
legitimate act, not an undo. Nothing raises a task's level automatically.

## Running it

    npm install
    npm run dev

Phase 1 keeps everything in `localStorage`, in this browser, with no account and no
network. Clearing site data clears the plan.

## The interface

A deadline rail, then three columns of calendar time:

    ┌──────────┬────────────┬────────────┬────────────┐
    │ Deadline │  MONTHS    │   WEEKS    │    DAYS    │
    │  rail    │            │ (of the    │ (of the    │
    │ (lens)   │            │  selected  │  selected  │
    │          │            │  month)    │   week)    │
    └──────────┴────────────┴────────────┴────────────┘

Deadlines are a lens over the columns, not a column of their own: two deadlines can
fall in the same month and one project can span four, so a week must exist once, in
one place, showing everything committed to it.

The backlog — level `none` — sits outside calendar time, as a collapsible panel in
the bottom-right. Collapsed, it is still a drop target, so a task can be returned to
the backlog without opening it first.

Below 1100px the column strip scrolls horizontally with scroll-snap rather than
collapsing to tabs, and the rail becomes a drawer.

## Keyboard

| key | |
|---|---|
| `n` | quick add |
| `→` | promote the selected task one level, into the selected block of the next column |
| `←` | demote the selected task one level |
| `Enter` | mark the selected task done |
| `Escape` | close a panel, or deselect |

## Quick add syntax

    Draft the personal statement #cam by fri !M

`#text` fuzzy-matches a deadline, `!S` `!M` `!L` set size, and `today`, `tomorrow`,
`by fri`, `nov`, `nov 12`, `week of nov 10` set placement. Everything else becomes
the title, and text that does not parse joins the title rather than raising an error.
What was parsed is shown before it is committed.

A day-first date (`25 sep`) is only read when something introduces it — `by 25 sep`,
`week of 25 sep`. Unintroduced, "read chapter 4 nov" would parse the chapter number
as a date, and chapter, section and paper numbers are everywhere in these titles.

## Where the rules live

Two invariants decide whether the rest of the app is correct, so each has exactly one
implementation and no caller may work around it:

- **`weekOwnerMonth`** in `src/lib/dates.ts` — a week belongs to the month containing
  its Thursday (ISO 8601), so a week is never split across two month blocks. Every
  question of "which month is this in?" comes through here, including deadline markers.
- **`placementFields`** in `src/lib/placement.ts` — the only constructor of the four
  `placement_*` fields. Placement is cumulative: a task at day level also carries a
  valid week and month, and a day's month is derived from its *week's* owner month,
  never from the day's own calendar month.

No entity stores a time of day, a duration, or a start/end timestamp for planned work.
`size` is the only workload signal.

## Design

Near-black `#131314` on off-white `#FBFBFB`, hairline `#E2E2E2`. One accent,
`#0F5B43`, used for exactly one thing: a deadline inside 14 days. Deadline kinds are
not colour-coded. Columns are separated by space and a single hairline — no cards, no
shadows, no alternating fills.

Source Serif 4 for block labels, deadline titles and countdowns; Inter for task text
and controls. Each chain falls through to a Japanese face (Noto Serif JP, Noto Sans
JP) so a title mixing Latin and Japanese renders without a step in weight or size.

Motion is limited to two things, both brief: a task landing after a move, and a column
expanding. Both are disabled under `prefers-reduced-motion`.

## Build phases

- **Phase 1 — complete.** The column interface, local only: deadlines, milestones,
  tasks, expansion and selection, placement in both directions by pointer and
  keyboard, per-day cap, day close, quick add, list view, archive, settings.
- **Phase 2** — Supabase, Google sign-in, migration of local data, Realtime sync.
- **Phase 3** — Google Calendar read-only, all-day import rule, push notifications
  with a polling fallback. The data model and the deadline editor already carry
  `source`, `calendar_event_id`, and the rule that imported deadlines are read-only
  except for `kind` and `notes`.
- **Phase 4** — keyboard coverage, touch drag on real devices, carry-count treatment,
  performance across a year of data.
