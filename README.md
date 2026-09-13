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

With no environment variables the planner runs entirely in the browser's
`localStorage` — no account, no network, complete. Signing in is what adds sync and
the calendar; see [Setting up the cloud](#setting-up-the-cloud).

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

Selecting a day opens it in a fifth pane, where its tasks have room to show which
deadline each belongs to. The Days column answers *which day*; the Day pane answers
*what is on it*. The app opens drilled into today — this month, this week, this day —
so the morning view is one glance, and `t` brings it back from anywhere.

Selecting a task expands it in place: title, deadline, milestone, size, notes, and
Drop or Delete. Marking done and dropping remove the row from the columns at once, as
§6.6 requires, and each leaves a notice with Undo for a few seconds. Delete asks once,
inline. In a block, Enter adds a task and keeps the input open for the next one.

The backlog — level `none` — sits outside calendar time, as a collapsible panel in
the bottom-right. Collapsed, it is still a drop target, so a task can be returned to
the backlog without opening it first.

Below 1100px the column strip scrolls horizontally with scroll-snap rather than
collapsing to tabs, and the rail becomes a drawer.

## Keyboard

| key | |
|---|---|
| `n` | quick add |
| `t` | go to today |
| `b` | show or hide the backlog |
| `→` | promote the selected task one level, into the selected block of the next column |
| `←` | demote the selected task one level |
| `↑` `↓` | move between tasks in the same block |
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

## Turning on sync

Sync is optional at runtime: configure it and the plan follows you between devices;
leave it unset and everything stays in this browser. There is no Google Cloud project
involved.

**1. Supabase.** Create a project. In the SQL editor, run
`supabase/migrations/0001_init.sql` — it creates the tables, the row-level security
policies and the realtime publication, and is idempotent, so re-running it is safe.

**2. Email sign-in.** Authentication → Providers → Email is on by default. Turn
**off** "Confirm email" so creating the account signs you straight in; leave it on and
you will need to click a link in an email first.

**3. Environment.** Copy `.env.example` to `.env.local` and fill in
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Settings → API.
Set the same two in your Vercel project. Nothing else is required.

**4. Create the account** in Settings → Account, on whichever device already holds
your plan. The first sign-in merges what is in that browser into the cloud, so a plan
built before sync existed is not lost. Then sign in with the same email and password
on your phone.

## Turning on calendar import (optional)

Calendar import is off, and everything it needs is in the repo waiting. It reads
all-day events from Google Calendar, which needs a Google token, which needs a Google
sign-in — so switching it on means adding Google as a provider:

1. Google Cloud: create a project, enable the **Google Calendar API**, create an OAuth
   client (Web application) with `https://<project-ref>.supabase.co/auth/v1/callback`
   as an authorised redirect URI, and add the `calendar.readonly` scope.
2. Put the client id and secret into Supabase → Authentication → Providers → Google,
   and the same pair into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — the server
   needs them to exchange the stored refresh token, which Supabase does not refresh
   for you.
3. Set the consent screen's publishing status to **In production**, or user type to
   **Internal** if you are on Google Workspace. Left in "Testing", Google expires the
   refresh token after seven days and imports stop until you sign in again.
4. Set `NEXT_PUBLIC_SITE_URL` to your public HTTPS origin — that is where Google sends
   push notifications. They cannot reach localhost, so in local development the
   15-minute poll does the work instead.

Then sign in with Google and the calendar section appears in settings. Until then it
says so plainly rather than offering something that cannot work.

## What the cloud does, and does not

Sign-in exists to keep the data private and to carry the plan between devices — there
is no user management, no sharing, no roles, and nobody to invite. Row-level security means a row is reachable only by
the account that owns it, and the placement rules from §3 are enforced again as
database constraints, so a bad write is rejected rather than stored.

Local state stays the source of truth for the interface: every action applies at once
and is pushed afterwards, so the columns never wait on a network. Conflicts resolve
last-write-wins on `updated_at`, and when a remote write replaces something different
that was here, a line says so rather than swallowing it.

The calendar is read-only in the strict sense: the only scope requested is
`calendar.readonly`, and nothing in the codebase issues a write. Only all-day events
on the calendars you choose become deadlines; timed events are dropped before they
reach the rest of the app. An imported deadline's title and date always follow its
source event, while `kind` and `notes` stay yours. When a source event moves or
disappears the change is applied *and* reported.

## Build phases

- **Phase 1 — complete.** The column interface, local only: deadlines, milestones,
  tasks, expansion and selection, placement in both directions by pointer and
  keyboard, per-day cap, day close, quick add, list view, archive, settings.
- **Phase 2 — complete.** Supabase schema with row-level security, Google sign-in,
  merge-on-first-sign-in of local data, Realtime sync, last-write-wins with the
  overwrite reported.
- **Phase 3 — built, off by default.** Google Calendar read-only, the all-day import
  rule, push notification channels renewed before they expire, a 15-minute polling
  fallback, and calendar selection in settings. It activates on a Google sign-in; see
  above.
- **Phase 4 — complete.** Keyboard coverage, pointer drag that also works by touch
  with edge auto-scrolling, narrow-screen column scrolling, the carry-count marker,
  empty states, and grouped indexes so a year of tasks does not rescan the list for
  every block.

## Where this departs from the spec

Three deliberate changes, each agreed rather than assumed:

- **§2 named Google as the only auth provider.** Sign-in is email and password
  instead. The reasoning in §2 was that sign-in exists to get a Google token and to
  keep the data private; with calendar import off, only the second half applies, and
  this needs nothing configured outside Supabase. The Google path is still in the code
  and is what calendar import switches on.
- **§7's calendar import is off by default**, since it is the only thing that needs a
  Google Cloud project.
- **A fifth pane**, for one day, drilled from the Days column — §12 had settled
  against a fifth column for a single *task*, which is still absent; task detail
  expands in place.

## Two columns that are not in §3

`user_id` and `updated_at` exist on every stored row and are not in the spec's data
model. Cloud storage cannot work without them: one is row ownership, the other is the
comparison that makes last-write-wins possible. Neither represents a time of day for
planned work.
