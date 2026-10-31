import { userDb } from "@/lib/server/clients";
import { DbError, dbCheck, errorResponse, json, refund } from "@/lib/server/payments";

// Cancel a booking and refund its payment.
export async function POST(req: Request) {
  const db = userDb(req);
  if (!db) return errorResponse("not_signed_in");
  const ref = (await req.json().catch(() => null))?.ref;
  if (typeof ref !== "string") return errorResponse("booking_not_found");

  let row: { payment_id: string; payment_intent: string; amount: number } | undefined;
  try {
    row = (dbCheck(await db.rpc("cancel_booking", { p_ref: ref })) as NonNullable<typeof row>[])[0];
  } catch (e) {
    return e instanceof DbError ? errorResponse(e.message) : json({ error: "payment_error" }, 502);
  }
  if (!row) return json({ refunded: null });

  // The booking is already cancelled; calling again retries the refund.
  try {
    await refund(row.payment_id, row.payment_intent);
  } catch {
    return json({ error: "refund_pending" }, 502);
  }
  return json({ refunded: Number(row.amount) });
}
