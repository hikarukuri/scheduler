import { admin } from "@/lib/server/admin";
import { syncCalendars } from "@/lib/server/calendar";

/**
 * Google's push endpoint (§7). The request carries no user session, so the
 * channel id is looked up to find whose calendar changed, and the channel token
 * must match that same user — a notification for an unknown channel is ignored.
 *
 * Google retries on a non-2xx, so failures return 500 and successes return 200
 * quickly.
 */
export async function POST(request: Request) {
  const channelId = request.headers.get("x-goog-channel-id");
  const channelToken = request.headers.get("x-goog-channel-token");
  const state = request.headers.get("x-goog-resource-state");
  if (!channelId) return new Response(null, { status: 400 });

  // The handshake Google sends when a channel opens carries no change.
  if (state === "sync") return new Response(null, { status: 200 });

  try {
    const { data } = await admin()
      .from("calendar_watches")
      .select("user_id")
      .eq("channel_id", channelId)
      .maybeSingle();
    if (!data?.user_id || data.user_id !== channelToken) {
      return new Response(null, { status: 200 });
    }
    await syncCalendars(data.user_id);
    return new Response(null, { status: 200 });
  } catch {
    return new Response(null, { status: 500 });
  }
}
