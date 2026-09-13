import { admin } from "./admin";

/**
 * Google Calendar, read-only (§7). The app never writes to the calendar: the
 * only scope requested is `calendar.readonly`, and nothing here issues a write.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

type Cached = { token: string; expiresAt: number };
const cache = new Map<string, Cached>();

/**
 * Supabase hands over the Google refresh token once, at sign-in, and does not
 * refresh provider tokens itself — so the token is stored and exchanged here.
 */
export async function accessTokenFor(userId: string): Promise<string> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const { data, error } = await admin()
    .from("google_credentials")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.refresh_token) {
    throw new Error("No Google authorisation stored. Sign in again to reconnect the calendar.");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google client credentials are not configured.");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    throw new Error(`Google refused the refresh token (${response.status}).`);
  }
  const body = (await response.json()) as { access_token: string; expires_in: number };
  cache.set(userId, {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  });
  return body.access_token;
}

async function get<T>(token: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(API + path);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Google Calendar returned ${response.status}.`);
  return (await response.json()) as T;
}

export type CalendarSummary = { id: string; summary: string; primary: boolean };

export async function listCalendars(token: string): Promise<CalendarSummary[]> {
  const body = await get<{
    items?: { id: string; summary: string; primary?: boolean }[];
  }>(token, "/users/me/calendarList", { minAccessRole: "reader", maxResults: "250" });
  return (body.items ?? []).map((item) => ({
    id: item.id,
    summary: item.summary,
    primary: Boolean(item.primary),
  }));
}

export type AllDayEvent = { id: string; title: string; date: string };

/**
 * §7, LOCKED — only all-day events become deadlines. A timed event has
 * `start.dateTime`; an all-day one has `start.date` and no time at all. Timed
 * events are dropped here and never reach the rest of the app.
 */
export async function listAllDayEvents(
  token: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<AllDayEvent[]> {
  const events: AllDayEvent[] = [];
  let pageToken: string | undefined;
  do {
    const body = await get<{
      items?: {
        id: string;
        summary?: string;
        status?: string;
        start?: { date?: string; dateTime?: string };
      }[];
      nextPageToken?: string;
    }>(token, `/calendars/${encodeURIComponent(calendarId)}/events`, {
      singleEvents: "true",
      showDeleted: "false",
      maxResults: "2500",
      timeMin,
      timeMax,
      ...(pageToken ? { pageToken } : {}),
    });
    for (const item of body.items ?? []) {
      if (item.status === "cancelled") continue;
      if (!item.start?.date || item.start.dateTime) continue;
      events.push({ id: item.id, title: item.summary?.trim() || "Untitled", date: item.start.date });
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return events;
}

export type WatchResult = { resourceId: string; expiration: string };

export async function watchCalendar(
  token: string,
  calendarId: string,
  channelId: string,
  address: string,
  channelToken: string,
): Promise<WatchResult> {
  const response = await fetch(
    `${API}/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address,
        token: channelToken,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Google refused the watch request (${response.status}).`);
  }
  const body = (await response.json()) as { resourceId: string; expiration: string };
  return {
    resourceId: body.resourceId,
    expiration: new Date(Number(body.expiration)).toISOString(),
  };
}

export async function stopChannel(token: string, channelId: string, resourceId: string) {
  await fetch(`${API}/channels/stop`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ id: channelId, resourceId }),
  }).catch(() => {
    // A channel that is already gone is not a failure worth surfacing.
  });
}
