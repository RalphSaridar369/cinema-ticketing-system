import { serviceDb, stripe, userDb } from "@/lib/server/clients";
import { DbError, dbCheck, errorResponse, expireSessions, json } from "@/lib/server/payments";
import { seatLabel, sortSeats } from "@/lib/booking-view";
import { MO, WD } from "@/lib/data";

type Hold = { reservation_id: string; ref: string; seat_count: number; unit_price: number; released_sessions: string[] };

// Stripe rejects sessions that expire in under 30 minutes, so leave a margin for clock skew and latency.
const SESSION_MINUTES = 31;

// Hold the seats, then open a Stripe Checkout session for them.
export async function POST(req: Request) {
  const db = userDb(req);
  if (!db) return errorResponse("not_signed_in");
  const body = await req.json().catch(() => null);
  const showtimeId = body?.showtimeId;
  const seatIds = body?.seatIds;
  if (typeof showtimeId !== "string" || !Array.isArray(seatIds) || seatIds.some((s) => typeof s !== "string")) {
    return errorResponse("invalid_seats");
  }

  let hold: Hold;
  try {
    hold = (dbCheck(await db.rpc("hold_seats", { p_showtime: showtimeId, p_seats: seatIds })) as Hold[])[0];
  } catch (e) {
    return errorResponse(e instanceof DbError ? e.message : "payment_error");
  }

  let sessionId: string | null = null;
  try {
    await expireSessions(hold.released_sessions);

    const service = serviceDb();
    const [showtime, seats] = await Promise.all([
      service.from("showtime").select("starts_at, movie(title)").eq("id", showtimeId).single().then(dbCheck),
      service.from("seat").select("row_label, seat_number").in("id", seatIds).then(dbCheck),
    ]);
    const starts = new Date((showtime as unknown as { starts_at: string }).starts_at);
    const title = (showtime as unknown as { movie: { title: string } }).movie.title;
    const clock = String(starts.getHours()).padStart(2, "0") + ":" + String(starts.getMinutes()).padStart(2, "0");
    const labels = sortSeats((seats as { row_label: string; seat_number: number }[]).map((s) => ({ row: s.row_label, number: s.seat_number })))
      .map(seatLabel)
      .join(",");

    const origin = req.headers.get("origin") ?? new URL(req.url).origin;
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      allowed_payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(Number(hold.unit_price) * 100),
            product_data: { name: `${title} · ${WD[starts.getDay()]} ${starts.getDate()} ${MO[starts.getMonth()]}, ${clock}` },
          },
          quantity: hold.seat_count,
        },
      ],
      metadata: { reservation_id: hold.reservation_id, ref: hold.ref },
      client_reference_id: hold.ref,
      expires_at: Math.floor(Date.now() / 1000) + SESSION_MINUTES * 60,
      success_url: `${origin}/tickets/${hold.ref}?new=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/book/${showtimeId}/checkout?seats=${encodeURIComponent(labels)}&released=${hold.ref}`,
    });
    sessionId = session.id;

    dbCheck(await service.rpc("create_payment", { p_reservation: hold.reservation_id, p_session_id: session.id }));
    return json({ url: session.url });
  } catch (e) {
    // Don't leave the seats held for a checkout that can't happen.
    if (sessionId) await expireSessions([sessionId]);
    await db.rpc("release_hold", { p_ref: hold.ref });
    return e instanceof DbError ? errorResponse(e.message) : json({ error: "payment_error" }, 502);
  }
}
