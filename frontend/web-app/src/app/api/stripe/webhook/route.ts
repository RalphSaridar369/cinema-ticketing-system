import type Stripe from "stripe";
import { serviceDb, stripe } from "@/lib/server/clients";
import { DbError, dbCheck, json, settleSession } from "@/lib/server/payments";

// Stripe's events. 400 for a bad signature, 5xx only when a retry can help.
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature ?? "", process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return json({ error: "bad_signature" }, 400);
  }

  try {
    if (event.type === "checkout.session.completed") {
      await settleSession(event.data.object);
    } else if (event.type === "checkout.session.expired") {
      dbCheck(await serviceDb().rpc("expire_payment", { p_session_id: event.data.object.id }));
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      const refundId = charge.refunds?.data[0]?.id ?? null;
      if (intent) dbCheck(await serviceDb().rpc("mark_refunded", { p_payment_intent: intent, p_refund_id: refundId }));
    }
    return json({ received: true });
  } catch (e) {
    // A session that isn't ours will never succeed; acknowledge it.
    if (e instanceof DbError && e.message === "payment_not_found") return json({ received: true });
    return json({ error: "retry" }, 500);
  }
}
