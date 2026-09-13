import { userFromRequest } from "@/lib/server/admin";
import { accessTokenFor, listCalendars } from "@/lib/server/google";

/** The calendars available to choose from in settings (§7, §9). */
export async function GET(request: Request) {
  const userId = await userFromRequest(request);
  if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });
  try {
    const token = await accessTokenFor(userId);
    return Response.json({ calendars: await listCalendars(token) });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
