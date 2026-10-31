import { stripe, userDb } from "@/lib/server/clients";
import { DbError, dbCheck, errorResponse, json, settleSession } from "@/lib/server/payments";

// The success page asks for the outcome without waiting for the webhook.
export async function POST(req: Request) {
  const db = userDb(req);
  if (!db) return errorResponse("not_signed_in");
  const sessionId = (await req.json().catch(() => null))?.sessionId;
  if (typeof sessionId !== "string") return errorResponse("payment_not_found");

  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    // Only the owner of the reservation (row level security) can settle its session.
    const ref = session.client_reference_id;
    const owned = ref
      ? (dbCheck(await db.from("reservation").select("ref").eq("ref", ref).limit(1)) as { ref: string }[])
      : [];
    if (!owned.length) return errorResponse("payment_not_found");
    return json({ outcome: await settleSession(session) });
  } catch (e) {
    return e instanceof DbError ? errorResponse(e.message) : json({ error: "payment_error" }, 502);
  }
}
