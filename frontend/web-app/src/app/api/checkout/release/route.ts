import { userDb } from "@/lib/server/clients";
import { DbError, dbCheck, errorResponse, expireSessions, json } from "@/lib/server/payments";

// The user left checkout: free their held seats and close the Stripe session.
export async function POST(req: Request) {
  const db = userDb(req);
  if (!db) return errorResponse("not_signed_in");
  const ref = (await req.json().catch(() => null))?.ref;
  if (typeof ref !== "string") return errorResponse("booking_not_found");

  try {
    const sessionId = dbCheck(await db.rpc("release_hold", { p_ref: ref })) as string | null;
    if (sessionId) await expireSessions([sessionId]);
    return json({});
  } catch (e) {
    return e instanceof DbError ? errorResponse(e.message) : json({ error: "payment_error" }, 502);
  }
}
