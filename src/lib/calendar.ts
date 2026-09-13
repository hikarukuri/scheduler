"use client";

/**
 * Phase 3, client side — read-only Google Calendar (§7).
 *
 * Near-real-time comes from Google's push notifications, which reach the server
 * and update the deadline rows; Realtime then carries them here like any other
 * change. The 15-minute poll is the fallback for a webhook that never arrives.
 */

import { useSyncExternalStore } from "react";
import { accessToken } from "./sync";
import { supabase } from "./supabase";

export type CalendarSummary = { id: string; summary: string; primary: boolean };

export type CalendarChangeRow = {
  id: string;
  title: string;
  change: "added" | "moved" | "retitled" | "removed";
  detail: string | null;
  created_at: string;
};

export type CalendarState = {
  calendars: CalendarSummary[] | null;
  loading: boolean;
  syncing: boolean;
  error: string | null;
  lastSyncAt: string | null;
  /** §7 — what changed on the calendar, to be told rather than applied silently. */
  changes: CalendarChangeRow[];
};

const EMPTY: CalendarState = {
  calendars: null,
  loading: false,
  syncing: false,
  error: null,
  lastSyncAt: null,
  changes: [],
};

let state: CalendarState = {
  calendars: null,
  loading: false,
  syncing: false,
  error: null,
  lastSyncAt: null,
  changes: [],
};

const listeners = new Set<() => void>();

export function subscribeCalendar(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function calendarState(): CalendarState {
  return state;
}

function set(patch: Partial<CalendarState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

async function authorised(path: string, init?: RequestInit): Promise<Response> {
  const token = await accessToken();
  if (!token) throw new Error("Sign in to use the calendar.");
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` },
  });
}

export async function loadCalendars() {
  set({ loading: true, error: null });
  try {
    const response = await authorised("/api/calendar/calendars");
    const body = (await response.json()) as { calendars?: CalendarSummary[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? "Could not read your calendars.");
    set({ calendars: body.calendars ?? [], loading: false });
  } catch (error) {
    set({ loading: false, error: (error as Error).message });
  }
}

export async function syncNow() {
  if (state.syncing) return;
  set({ syncing: true, error: null });
  try {
    const response = await authorised("/api/calendar/sync", { method: "POST" });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(body.error ?? "The calendar sync failed.");
    set({ syncing: false, lastSyncAt: new Date().toISOString() });
    await loadChanges();
  } catch (error) {
    set({ syncing: false, error: (error as Error).message });
  }
}

export async function loadChanges() {
  const client = supabase();
  if (!client) return;
  const { data } = await client
    .from("calendar_changes")
    .select("id, title, change, detail, created_at")
    .is("seen_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  set({ changes: (data ?? []) as CalendarChangeRow[] });
}

export async function markChangesSeen() {
  const client = supabase();
  if (!client) return;
  const ids = state.changes.map((change) => change.id);
  set({ changes: [] });
  if (ids.length) await client.from("calendar_changes").update({ seen_at: new Date().toISOString() }).in("id", ids);
}

let polling: number | null = null;
let channel: ReturnType<NonNullable<ReturnType<typeof supabase>>["channel"]> | null = null;

/** §7 — a polling fallback every 15 minutes, for a webhook that fails to deliver. */
export function startCalendarWatch(userId: string) {
  stopCalendarWatch();
  const client = supabase();
  if (!client) return;

  void loadChanges();
  channel = client
    .channel(`calendar-changes-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "calendar_changes",
        filter: `user_id=eq.${userId}`,
      },
      () => void loadChanges(),
    )
    .subscribe();

  polling = window.setInterval(() => void syncNow(), 15 * 60_000);
}

export function stopCalendarWatch() {
  if (polling !== null) window.clearInterval(polling);
  polling = null;
  const client = supabase();
  if (channel && client) void client.removeChannel(channel);
  channel = null;
  set({ calendars: null, changes: [], lastSyncAt: null, error: null });
}

export function useCalendar(): CalendarState {
  return useSyncExternalStore(subscribeCalendar, calendarState, () => EMPTY);
}
