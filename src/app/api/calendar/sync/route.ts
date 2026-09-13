import { userFromRequest } from "@/lib/server/admin";
import { reconcileWatches, syncCalendars } from "@/lib/server/calendar";

/**
 * Pull watched calendars now. Called after a push notification arrives, when
 * settings change, and by the 15-minute polling fallback (§7).
 */
export async function POST(request: Request) {
  const userId = await userFromRequest(request);
  if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });
  try {
    const result = await syncCalendars(userId);
    // Renewing here means the channels stay alive for as long as the app is used.
    const opened = await reconcileWatches(userId).catch(() => 0);
    return Response.json({ ...result, watchesOpened: opened });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
