import type Stripe from "stripe";
import { serviceDb, stripe } from "./clients";

// Payment steps shared by the routes. Server only.

// Database errors carry their code as the message.
export class DbError extends Error {}

export function dbCheck<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new DbError(error.message);
  return data as T;
}

export const json = (body: unknown, status = 200) => Response.json(body, { status });

export const errorResponse = (code: string) => json({ error: code }, code === "seats_taken" ? 409 : code === "not_signed_in" ? 401 : 400);

// The payment intent id of a session, whether Stripe sent it as an id or expanded.
const intentId = (pi: string | Stripe.PaymentIntent | null) => (typeof pi === "string" ? pi : (pi?.id ?? null));

// Refund the payment, then record it. Safe to repeat: Stripe dedupes on the key.
export async function refund(paymentId: string, paymentIntent: string): Promise<void> {
  const r = await stripe().refunds.create({ payment_intent: paymentIntent }, { idempotencyKey: "refund-" + paymentId });
  dbCheck(await serviceDb().rpc("mark_refunded", { p_payment_intent: paymentIntent, p_refund_id: r.id }));
}

// A paid session confirms its booking, or is refunded when the hold was lost.
export async function settleSession(session: Stripe.Checkout.Session): Promise<"confirmed" | "refunded" | "pending"> {
  if (session.payment_status !== "paid") return "pending";
  const intent = intentId(session.payment_intent);
  if (!intent) throw new Error("payment_error");
  const rows = dbCheck(await serviceDb().rpc("confirm_payment", { p_session_id: session.id, p_payment_intent: intent })) as {
    outcome: "confirmed" | "refund_needed" | "refunded";
    payment_id: string;
    payment_intent: string;
  }[];
  const row = rows[0];
  if (row.outcome === "confirmed") return "confirmed";
  if (row.outcome === "refund_needed") await refund(row.payment_id, row.payment_intent);
  return "refunded";
}

// Best effort: a session that is already complete or expired is fine.
export async function expireSessions(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => stripe().checkout.sessions.expire(id).catch(() => undefined)));
}
