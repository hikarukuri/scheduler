"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * The cloud is optional. With no environment variables the app runs exactly as
 * it did in Phase 1: local, private, and complete.
 */
export const cloudConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return client;
}

/** §2, §7 — Google is the only provider, and the calendar scope is read-only. */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");
