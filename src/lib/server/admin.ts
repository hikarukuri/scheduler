import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The service-role client, for server work that cannot run as the signed-in
 * user: the calendar push webhook arrives from Google with no session at all.
 * Every query made with it is scoped to a user id by hand.
 */
export function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Identify the caller from the bearer token the browser client sends. */
export async function userFromRequest(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  throw new Error("NEXT_PUBLIC_SITE_URL is not set.");
}
