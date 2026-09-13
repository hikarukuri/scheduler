"use client";

/**
 * Phase 2 — cloud storage and cross-device sync.
 *
 * Local state stays the source of truth for the interface: every action applies
 * immediately and is pushed afterwards, so the columns never wait on a network.
 * Conflicts resolve last-write-wins on `updated_at`, and when a remote write
 * replaces something different that was here, it is reported rather than
 * silently swallowed.
 */

import { useSyncExternalStore } from "react";
import type { RealtimePostgresChangesPayload, Session, SupabaseClient } from "@supabase/supabase-js";
import { applyRemote, onLocalChange, snapshot } from "./store";
import { GOOGLE_SCOPES, cloudConfigured, supabase } from "./supabase";
import {
  DEFAULT_SETTINGS,
  EMPTY_STATE,
  type Deadline,
  type Milestone,
  type PlannerState,
  type Task,
} from "./types";

export type Overwrite = { id: string; what: string; at: string };

export type SyncStatus = {
  configured: boolean;
  signedIn: boolean;
  userId: string | null;
  email: string | null;
  connection: "off" | "connecting" | "live" | "error";
  error: string | null;
  lastSyncedAt: string | null;
  /** §2 — "show me when a remote change overwrote something". */
  overwrites: Overwrite[];
};

const OFFLINE: SyncStatus = {
  configured: false,
  signedIn: false,
  userId: null,
  email: null,
  connection: "off",
  error: null,
  lastSyncedAt: null,
  overwrites: [],
};

/** Stable value for the server render, which never has a session. */
export function syncServerSnapshot(): SyncStatus {
  return OFFLINE;
}

let status: SyncStatus = {
  configured: cloudConfigured,
  signedIn: false,
  userId: null,
  email: null,
  connection: "off",
  error: null,
  lastSyncedAt: null,
  overwrites: [],
};

const listeners = new Set<() => void>();

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function syncStatus(): SyncStatus {
  return status;
}

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l();
}

export function dismissOverwrite(id: string) {
  setStatus({ overwrites: status.overwrites.filter((o) => o.id !== id) });
}

// ── Row mapping ─────────────────────────────────────────────────────────────
// Column names match the model field for field; only ownership is added.

type Row = { id: string; updated_at: string };

function withUser<T>(row: T, userId: string) {
  return { ...row, user_id: userId };
}

function stripUser<T extends Record<string, unknown>>(row: T): T {
  const copy = { ...row };
  delete copy.user_id;
  return copy;
}

/**
 * Merge what is here with what is in the cloud. This doubles as the one-time
 * migration: on a first sign-in the cloud is empty, so every local row is new
 * and gets pushed.
 */
function mergeRows<T extends Row>(local: T[], remote: T[]): { merged: T[]; push: T[] } {
  const byId = new Map<string, T>();
  for (const row of remote) byId.set(row.id, row);
  const push: T[] = [];
  for (const row of local) {
    const there = byId.get(row.id);
    if (!there || row.updated_at > there.updated_at) {
      byId.set(row.id, row);
      push.push(row);
    }
  }
  return { merged: [...byId.values()], push };
}

// ── Pushing local changes ───────────────────────────────────────────────────

let queue: Promise<void> = Promise.resolve();

function enqueue(work: () => Promise<void>) {
  queue = queue.then(work).catch((error: unknown) => {
    setStatus({ connection: "error", error: describe(error) });
  });
}

function describe(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function changedRows<T extends Row>(prev: T[], next: T[]): T[] {
  if (prev === next) return [];
  const before = new Map(prev.map((row) => [row.id, row]));
  return next.filter((row) => before.get(row.id) !== row);
}

async function pushChanges(
  client: SupabaseClient,
  userId: string,
  prev: PlannerState,
  next: PlannerState,
) {
  // Parents before children: a task may reference a deadline created alongside it.
  const deadlines = changedRows(prev.deadlines, next.deadlines);
  const milestones = changedRows(prev.milestones, next.milestones);
  const tasks = changedRows(prev.tasks, next.tasks);

  if (deadlines.length) {
    const { error } = await client
      .from("deadlines")
      .upsert(deadlines.map((row) => withUser(row, userId)));
    if (error) throw error;
  }
  if (milestones.length) {
    const { error } = await client
      .from("milestones")
      .upsert(milestones.map((row) => withUser(row, userId)));
    if (error) throw error;
  }
  if (tasks.length) {
    const { error } = await client
      .from("tasks")
      .upsert(tasks.map((row) => withUser(row, userId)));
    if (error) throw error;
  }
  if (prev.settings !== next.settings || prev.dayClose !== next.dayClose) {
    const { error } = await client.from("preferences").upsert({
      user_id: userId,
      settings: next.settings,
      day_close: next.dayClose,
      updated_at: next.prefsUpdatedAt,
    });
    if (error) throw error;
  }
  setStatus({ lastSyncedAt: new Date().toISOString(), connection: "live", error: null });
}

// ── Receiving remote changes ────────────────────────────────────────────────

function summarise(row: { title?: string } | null): string {
  return row?.title ? `“${row.title}”` : "an item";
}

function applyRemoteRow<K extends "deadlines" | "milestones" | "tasks">(
  key: K,
  incoming: PlannerState[K][number],
) {
  const local = snapshot();
  const list = local[key] as Row[];
  const existing = list.find((row) => row.id === incoming.id);

  if (existing && existing.updated_at > incoming.updated_at) {
    // Ours is newer, so ours wins and gets pushed again on the next change.
    return;
  }
  if (existing && JSON.stringify(existing) !== JSON.stringify(incoming)) {
    setStatus({
      overwrites: [
        ...status.overwrites.slice(-4),
        {
          id: `${incoming.id}-${incoming.updated_at}`,
          what: summarise(incoming as { title?: string }),
          at: incoming.updated_at,
        },
      ],
    });
  }
  const next = existing
    ? list.map((row) => (row.id === incoming.id ? incoming : row))
    : [...list, incoming];
  applyRemote({ ...local, [key]: next } as PlannerState);
}

function handleRow(
  key: "deadlines" | "milestones" | "tasks",
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
) {
  if (payload.eventType === "DELETE") {
    const local = snapshot();
    const gone = (payload.old as { id?: string }).id;
    if (!gone) return;
    applyRemote({
      ...local,
      [key]: (local[key] as Row[]).filter((row) => row.id !== gone),
    } as PlannerState);
    return;
  }
  const row = stripUser(payload.new as Record<string, unknown>);
  if (key === "deadlines") applyRemoteRow("deadlines", row as unknown as Deadline);
  else if (key === "milestones") applyRemoteRow("milestones", row as unknown as Milestone);
  else applyRemoteRow("tasks", row as unknown as Task);
}

function handlePreferences(payload: RealtimePostgresChangesPayload<Record<string, unknown>>) {
  if (payload.eventType === "DELETE") return;
  const row = payload.new as {
    settings?: PlannerState["settings"];
    day_close?: PlannerState["dayClose"];
    updated_at?: string;
  };
  const local = snapshot();
  if (!row.updated_at || row.updated_at <= local.prefsUpdatedAt) return;
  applyRemote({
    ...local,
    settings: { ...DEFAULT_SETTINGS, ...(row.settings ?? {}) },
    dayClose: { ...EMPTY_STATE.dayClose, ...(row.day_close ?? {}) },
    prefsUpdatedAt: row.updated_at,
  });
}

// ── Connecting ──────────────────────────────────────────────────────────────

let connected: { userId: string; teardown: () => void } | null = null;

async function connect(client: SupabaseClient, session: Session) {
  const userId = session.user.id;
  if (connected?.userId === userId) return;
  disconnect();
  setStatus({
    signedIn: true,
    userId,
    email: session.user.email ?? null,
    connection: "connecting",
    error: null,
  });

  // The Google refresh token is handed over once, at sign-in. Keep it so the
  // calendar can still be read when this session is long gone (§7).
  if (session.provider_refresh_token) {
    await client
      .from("google_credentials")
      .upsert({ user_id: userId, refresh_token: session.provider_refresh_token })
      .then(({ error }) => {
        if (error) setStatus({ error: describe(error) });
      });
  }

  try {
    const [deadlines, milestones, tasks, preferences] = await Promise.all([
      client.from("deadlines").select("*"),
      client.from("milestones").select("*"),
      client.from("tasks").select("*"),
      client.from("preferences").select("*").maybeSingle(),
    ]);
    const failure = deadlines.error ?? milestones.error ?? tasks.error ?? preferences.error;
    if (failure) throw failure;

    const local = snapshot();
    const mergedDeadlines = mergeRows(
      local.deadlines,
      (deadlines.data ?? []).map((row) => stripUser(row) as unknown as Deadline),
    );
    const mergedMilestones = mergeRows(
      local.milestones,
      (milestones.data ?? []).map((row) => stripUser(row) as unknown as Milestone),
    );
    const mergedTasks = mergeRows(
      local.tasks,
      (tasks.data ?? []).map((row) => stripUser(row) as unknown as Task),
    );

    const remotePrefs = preferences.data as {
      settings?: PlannerState["settings"];
      day_close?: PlannerState["dayClose"];
      updated_at?: string;
    } | null;
    const remotePrefsNewer =
      remotePrefs?.updated_at && remotePrefs.updated_at > local.prefsUpdatedAt;

    const merged: PlannerState = {
      ...local,
      deadlines: mergedDeadlines.merged,
      milestones: mergedMilestones.merged,
      tasks: mergedTasks.merged,
      settings: remotePrefsNewer
        ? { ...DEFAULT_SETTINGS, ...(remotePrefs?.settings ?? {}) }
        : local.settings,
      dayClose: remotePrefsNewer
        ? { ...EMPTY_STATE.dayClose, ...(remotePrefs?.day_close ?? {}) }
        : local.dayClose,
      prefsUpdatedAt: remotePrefsNewer ? remotePrefs!.updated_at! : local.prefsUpdatedAt,
    };
    applyRemote(merged);

    // Anything local that the cloud had not seen — the Phase 1 plan, on a first
    // sign-in — goes up now.
    if (mergedDeadlines.push.length) {
      const { error } = await client
        .from("deadlines")
        .upsert(mergedDeadlines.push.map((row) => withUser(row, userId)));
      if (error) throw error;
    }
    if (mergedMilestones.push.length) {
      const { error } = await client
        .from("milestones")
        .upsert(mergedMilestones.push.map((row) => withUser(row, userId)));
      if (error) throw error;
    }
    if (mergedTasks.push.length) {
      const { error } = await client
        .from("tasks")
        .upsert(mergedTasks.push.map((row) => withUser(row, userId)));
      if (error) throw error;
    }
    if (!remotePrefsNewer) {
      const { error } = await client.from("preferences").upsert({
        user_id: userId,
        settings: merged.settings,
        day_close: merged.dayClose,
        updated_at: merged.prefsUpdatedAt,
      });
      if (error) throw error;
    }

    const filter = `user_id=eq.${userId}`;
    const channel = client
      .channel(`planner-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deadlines", filter }, (p) =>
        handleRow("deadlines", p),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "milestones", filter }, (p) =>
        handleRow("milestones", p),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter }, (p) =>
        handleRow("tasks", p),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "preferences", filter }, (p) =>
        handlePreferences(p),
      )
      .subscribe((state) => {
        if (state === "SUBSCRIBED") setStatus({ connection: "live", error: null });
        else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
          setStatus({ connection: "error", error: "Realtime connection lost." });
        }
      });

    onLocalChange((prev, next) => {
      enqueue(() => pushChanges(client, userId, prev, next));
    });

    connected = {
      userId,
      teardown: () => {
        onLocalChange(null);
        void client.removeChannel(channel);
      },
    };
    setStatus({ connection: "live", lastSyncedAt: new Date().toISOString(), error: null });
  } catch (error) {
    setStatus({ connection: "error", error: describe(error) });
  }
}

function disconnect() {
  connected?.teardown();
  connected = null;
}

let started = false;

/** Called once, after the local state has loaded. */
export function startCloud() {
  if (started) return;
  started = true;
  const client = supabase();
  if (!client) return;

  client.auth.onAuthStateChange((event, session) => {
    if (session?.user) void connect(client, session);
    else {
      disconnect();
      setStatus({
        signedIn: false,
        userId: null,
        email: null,
        connection: "off",
        lastSyncedAt: null,
      });
    }
  });

  void client.auth.getSession().then(({ data }) => {
    if (data.session) void connect(client, data.session);
  });
}

export async function signIn() {
  const client = supabase();
  if (!client) return;
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: GOOGLE_SCOPES,
      redirectTo: window.location.origin,
      // Needed to receive a refresh token, so the calendar can be read later.
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });
  if (error) setStatus({ error: error.message });
}

export async function signOut() {
  const client = supabase();
  if (!client) return;
  disconnect();
  await client.auth.signOut();
  // The plan lives in the cloud now; leaving a copy behind on a shared machine
  // would be the wrong default.
  try {
    window.localStorage.removeItem("study-planner/v1");
  } catch {
    // Nothing to clear.
  }
  applyRemote(EMPTY_STATE);
  setStatus({ signedIn: false, userId: null, email: null, connection: "off", overwrites: [] });
}

export async function accessToken(): Promise<string | null> {
  const client = supabase();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

export function useSync(): SyncStatus {
  return useSyncExternalStore(subscribeSync, syncStatus, syncServerSnapshot);
}
