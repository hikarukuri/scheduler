import { userFromRequest } from "@/lib/server/admin";
import { reconcileWatches } from "@/lib/server/calendar";

/** Open, renew or release push channels to match the watched calendars (§7). */
export async function POST(request: Request) {
  const userId = await userFromRequest(request);
  if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });
  try {
    return Response.json({ opened: await reconcileWatches(userId) });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
