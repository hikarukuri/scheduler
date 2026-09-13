import { admin, siteUrl } from "./admin";
import {
  accessTokenFor,
  listAllDayEvents,
  stopChannel,
  watchCalendar,
  type AllDayEvent,
} from "./google";

/**
 * §7 — reconciling watched calendars into deadlines.
 *
 * Only all-day events on a designated calendar become deadlines. An imported
 * deadline's title and date always follow its source event; `kind` and `notes`
 * belong to the user and are never touched here. When a source event is deleted
 * or moved the change is reflected and recorded, so it can be shown rather than
 * applied silently.
 */

export type CalendarChange = {
  deadline_id: string | null;
  title: string;
  change: "added" | "moved" | "retitled" | "removed";
  detail: string | null;
};

export type SyncResult = {
  watched: number;
  events: number;
  changes: CalendarChange[];
};

const HORIZON_MONTHS = 18;

function horizon(): { timeMin: string; timeMax: string } {
  const now = new Date();
  const min = new Date(now.getTime() - 7 * 86_400_000);
  const max = new Date(now);
  max.setUTCMonth(max.getUTCMonth() + HORIZON_MONTHS);
  return { timeMin: min.toISOString(), timeMax: max.toISOString() };
}

export async function watchedCalendarIds(userId: string): Promise<string[]> {
  const { data } = await admin()
    .from("preferences")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  const settings = data?.settings as { watchedCalendarIds?: string[] } | undefined;
  return settings?.watchedCalendarIds ?? [];
}

export async function syncCalendars(userId: string): Promise<SyncResult> {
  const db = admin();
  const calendars = await watchedCalendarIds(userId);
  if (calendars.length === 0) return { watched: 0, events: 0, changes: [] };

  const token = await accessTokenFor(userId);
  const { timeMin, timeMax } = horizon();

  const events: AllDayEvent[] = [];
  for (const calendarId of calendars) {
    events.push(...(await listAllDayEvents(token, calendarId, timeMin, timeMax)));
  }

  const { data: existingRows, error } = await db
    .from("deadlines")
    .select("*")
    .eq("user_id", userId)
    .eq("source", "calendar");
  if (error) throw new Error(error.message);

  type Row = {
    id: string;
    title: string;
    date: string;
    calendar_event_id: string | null;
    archived_at: string | null;
  };
  const existing = new Map<string, Row>();
  for (const row of (existingRows ?? []) as Row[]) {
    if (row.calendar_event_id) existing.set(row.calendar_event_id, row);
  }

  const changes: CalendarChange[] = [];
  const upserts: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const stamp = new Date().toISOString();

  for (const event of events) {
    seen.add(event.id);
    const row = existing.get(event.id);
    if (!row) {
      const id = crypto.randomUUID();
      upserts.push({
        id,
        user_id: userId,
        title: event.title,
        date: event.date,
        kind: "other",
        notes: null,
        source: "calendar",
        calendar_event_id: event.id,
        archived_at: null,
        updated_at: stamp,
      });
      changes.push({
        deadline_id: id,
        title: event.title,
        change: "added",
        detail: event.date,
      });
      continue;
    }

    const movedTo = row.date !== event.date ? event.date : null;
    const retitledTo = row.title !== event.title ? event.title : null;
    const returned = Boolean(row.archived_at);
    if (!movedTo && !retitledTo && !returned) continue;

    upserts.push({
      id: row.id,
      user_id: userId,
      title: event.title,
      date: event.date,
      source: "calendar",
      calendar_event_id: event.id,
      archived_at: null,
      updated_at: stamp,
    });
    if (movedTo) {
      changes.push({
        deadline_id: row.id,
        title: event.title,
        change: "moved",
        detail: `${row.date} to ${movedTo}`,
      });
    }
    if (retitledTo) {
      changes.push({
        deadline_id: row.id,
        title: event.title,
        change: "retitled",
        detail: `was ${row.title}`,
      });
    }
  }

  // §7 — a source event that is gone. The deadline is archived rather than
  // deleted, so any tasks planned against it survive and can be re-pointed.
  for (const [eventId, row] of existing) {
    if (seen.has(eventId) || row.archived_at) continue;
    upserts.push({
      id: row.id,
      user_id: userId,
      archived_at: stamp,
      updated_at: stamp,
    });
    changes.push({
      deadline_id: row.id,
      title: row.title,
      change: "removed",
      detail: "The event is no longer on the calendar.",
    });
  }

  if (upserts.length) {
    // `kind` and `notes` are absent from update payloads on purpose: they are
    // the two fields an imported deadline keeps as its own (§7).
    const { error: writeError } = await db.from("deadlines").upsert(upserts, {
      onConflict: "id",
      defaultToNull: false,
    });
    if (writeError) throw new Error(writeError.message);
  }

  if (changes.length) {
    const { error: changeError } = await db
      .from("calendar_changes")
      .insert(changes.map((change) => ({ ...change, user_id: userId })));
    if (changeError) throw new Error(changeError.message);
  }

  return { watched: calendars.length, events: events.length, changes };
}

/**
 * Keep a push channel open for every watched calendar, and let go of channels
 * for calendars no longer watched. Channels expire, so they are renewed well
 * before they do.
 */
export async function reconcileWatches(userId: string): Promise<number> {
  const db = admin();
  const calendars = await watchedCalendarIds(userId);
  const token = await accessTokenFor(userId);
  const address = `${siteUrl()}/api/calendar/webhook`;

  const { data: rows } = await db.from("calendar_watches").select("*").eq("user_id", userId);
  type Watch = {
    id: string;
    calendar_id: string;
    channel_id: string;
    resource_id: string;
    expiration: string;
  };
  const watches = (rows ?? []) as Watch[];
  const renewBefore = new Date(Date.now() + 24 * 3_600_000).toISOString();
  let opened = 0;

  for (const watch of watches) {
    if (calendars.includes(watch.calendar_id) && watch.expiration > renewBefore) continue;
    await stopChannel(token, watch.channel_id, watch.resource_id);
    await db.from("calendar_watches").delete().eq("id", watch.id);
  }

  const live = new Set(
    watches
      .filter((w) => calendars.includes(w.calendar_id) && w.expiration > renewBefore)
      .map((w) => w.calendar_id),
  );

  for (const calendarId of calendars) {
    if (live.has(calendarId)) continue;
    const channelId = crypto.randomUUID();
    const result = await watchCalendar(token, calendarId, channelId, address, userId);
    const { error } = await db.from("calendar_watches").upsert(
      {
        user_id: userId,
        calendar_id: calendarId,
        channel_id: channelId,
        resource_id: result.resourceId,
        expiration: result.expiration,
      },
      { onConflict: "user_id,calendar_id" },
    );
    if (error) throw new Error(error.message);
    opened += 1;
  }
  return opened;
}
