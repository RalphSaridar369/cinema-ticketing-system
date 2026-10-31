# Stripe payments: design

Date: 2026-10-31. Status: approved by the user on 2026-10-31.

## Intent

Booking is now real (branch `booking-backend`): seats, reservations and tickets live in the database. But confirming a booking charges nothing. The goal is to take payment through Stripe in test mode before a booking is confirmed, hold the chosen seats while the user pays, track every payment in a table, and refund automatically when a paid booking is cancelled.

The user's words: "add stripe for testing functionality", "add obviously a payment table to track the payments", "hold seats 10 min then release them if unpaid", "refund automatically".

## Goals

- Checkout sends the user to Stripe's hosted Checkout page (test mode) for the booking's total. Paying confirms the booking; the user lands on their ticket.
- Pressing Pay holds the seats for 10 minutes. Nobody else can take them during the hold. If the booking is unpaid after 10 minutes, the seats are released.
- One `payment` row per Stripe Checkout attempt, linked to its `reservation`. One booking (any number of tickets) is one payment. The user confirmed this model: "3 tickets 1 payment".
- Cancelling a paid booking refunds its payment in full through Stripe, automatically.
- Prices and totals are decided by the database, never by the browser or by data Stripe echoes back.

## Non-goals

- Live (real money) Stripe keys, or deploying the site.
- Partial refunds, or cancelling some tickets of a booking.
- Saved cards, Stripe customers, receipts or confirmation emails (Stripe's own test receipts are fine).
- Embedded payment forms (Stripe Elements). The hosted Checkout page is enough for testing.
- Refunds or payments for the 10,000 seeded reservations. They have no payment row and cancel as they do today, without a refund.
- Admin tools for payments.

## Anti-goals (a failure even if it works)

- A confirmed booking whose payment did not succeed.
- A successful payment with no confirmed booking and no refund (money taken, no tickets).
- Two active tickets for the same seat and showtime, including held ones.
- A Stripe secret key, webhook secret or Supabase service-role key reaching the browser.
- A user starting payment for, confirming, releasing or cancelling another user's booking.
- Expired holds showing up in My Tickets as "Cancelled" bookings the user never made.

## Current state

- **Branch:** `booking-backend` holds the booking work, unpushed and unmerged. Payments build on top of it, on a new branch `stripe-payments` cut from `booking-backend`.
- **Tables:** see `docs/superpowers/specs/2026-10-28-booking-backend-design.md` and `backend/supabase/migrations/20261029120000_booking.sql`.
  - `reservation.status` allows `pending`, `confirmed`, `completed`, `cancelled`. Nothing writes `pending` yet. `reservation` has a unique `ref` like `VLR-2B8QX7`.
  - `ticket.status` allows `confirmed`, `used`, `cancelled`. The partial unique index `ticket_showtime_id_seat_id_active_key` on `(showtime_id, seat_id) where status <> 'cancelled'` stops double booking.
  - `showtime.price` is `numeric(10,2)`. The app shows prices in dollars (`money()` in `lib/data.ts`).
- **Functions:** `book_seats` creates a `confirmed` reservation and tickets at once. `cancel_booking` cancels the caller's confirmed upcoming booking. `showtime_taken_seats` and `showtime_seats_left` count every ticket that isn't `cancelled`.
- **Web app** (`frontend/web-app`, Next.js 16.4, React 19, `supabase-js` in the browser with the anon key only):
  - No server code yet: no API routes, no server-side Supabase client, no service-role key in `.env.local`.
  - `components/screens/checkout.tsx` calls `bookSeats` and redirects to `/tickets/<ref>?new=1`. It says "Pay at the box office or with the card on your account."
  - `lib/booking.ts` holds `bookSeats`, `cancelBooking` and the bookings loader. `lib/booking-view.ts` maps reservation status to the Upcoming/Past view.
- **Tools:** the Stripe CLI is not installed on the user's machine.

## Design

### Database (one new migration)

1. **`payment` table** (new):
   - `id uuid` default `gen_random_uuid()`, `reservation_id` references `reservation` (on delete cascade), `user_id` references `auth.users`.
   - `amount numeric(10,2)`, `currency text` (`usd`), copied from the reservation's `total_amount` when the payment is created.
   - `status`: `pending`, `succeeded`, `expired`, `refunding`, `refunded`. (`failed` is not needed: Stripe Checkout keeps the user on its page after a declined card; an abandoned session ends as `expired`.)
   - `stripe_checkout_session_id text unique not null`, `stripe_payment_intent_id text unique` (set once paid), `stripe_refund_id text`.
   - `created_at`, `paid_at`, `refunded_at`.
   - RLS on, owner may read their own rows, nobody writes from the browser.
2. **Holds:**
   - Add `held` to the `ticket.status` check. Held tickets block their seats through the existing unique index, and the seat-count functions already treat them as taken.
   - Add `expired` to the `reservation.status` check. An unpaid hold that times out or is abandoned becomes `expired`, and its tickets `cancelled`.
   - Add `reservation.hold_expires_at timestamptz`, null except for pending reservations.
3. **`hold_seats(p_showtime, p_seats)` returns the reservation's `ref`:** replaces `book_seats`, with the same checks and errors. It inserts the reservation as `pending` with `hold_expires_at = now() + 10 minutes` and the tickets as `held`. Drop `book_seats`. Before inserting, it:
   - expires any of this showtime's holds that are past their time, so a slow cron never blocks a seat
   - expires all of the caller's own pending reservations, on any showtime. A user has one checkout in progress at a time, so one account can't keep many seats held. It also returns the Stripe session ids of those released payments (or the server looks them up) so `/api/checkout` can expire those Stripe sessions. If an old session gets paid anyway, it ends as `refund_needed`.
   - **Own held seats:** `showtime_taken_seats` leaves out seats held by the caller's own pending reservation. The seat map and checkout then let the user pick them again, for example after leaving Stripe with the browser's Back button. The new hold replaces the old one.
4. **`release_hold(p_ref)`:** the caller's own pending reservation becomes `expired`, its tickets `cancelled`. Used when the user backs out of Stripe's page. A no-op if the reservation is no longer pending.
5. **`expire_holds()`:** expires every pending reservation past `hold_expires_at`, cancelling its tickets. Scheduled with `pg_cron` every minute (enable the extension in this migration). Not callable by users.
6. **`confirm_payment(p_session_id, p_payment_intent)` returns what happened:** service role only, idempotent.
   - Payment `pending` and reservation still `pending`: payment `succeeded` with `paid_at` and the payment intent id, reservation `confirmed` with `hold_expires_at` null, tickets `confirmed`. Returns `confirmed`.
   - Already succeeded: returns `confirmed` again, changing nothing.
   - Reservation already `expired` (paid after the hold ran out): the booking stays expired, the payment is recorded as paid and returned as `refund_needed`, and the server refunds it.
7. **`cancel_booking(p_ref)`:** still called as the user, same rules. In the same transaction, if the reservation has a `succeeded` payment, set it to `refunding`. Return the payment's id and payment intent id (or nothing for unpaid seeded bookings) so the server can refund.
8. **`mark_refunded(p_payment, p_refund_id)`:** service role only. Payment `refunded` with `refunded_at` and the refund id.

### Server (Next.js route handlers in `frontend/web-app`)

Stripe needs server code for the secret key and webhook, and the site has none. This is the assistant's call: route handlers in the existing Next.js app, not Supabase Edge Functions.

- **New server env vars** (in `.env.local`, never `NEXT_PUBLIC_`): `STRIPE_SECRET_KEY` (test key, `sk_test_…`), `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`. Add them to `.env.example` without values.
- **Dependency:** the `stripe` npm package.
- **Who the user is:** the browser sends its Supabase access token as `Authorization: Bearer …`. The route makes a Supabase client with that token, so user-level functions (`hold_seats`, `release_hold`, `cancel_booking`) still check `auth.uid()` themselves. Service-role calls happen only for `payment` writes, `confirm_payment` and `mark_refunded`.
- **`POST /api/checkout`** `{ showtimeId, seatIds }`:
  1. `hold_seats` as the user. Its errors pass through unchanged (`seats_taken`, etc.).
  2. Create a Stripe Checkout Session: `mode: payment`, one line item named after the movie and showtime, unit amount = showtime price in cents, quantity = seat count, read from the database, not the request. Put the reservation id and ref in `metadata`. `success_url` → `/tickets/<ref>?new=1&session_id={CHECKOUT_SESSION_ID}`. `cancel_url` → back to the checkout page with the same seats and a marker that the user backed out.
  3. Insert the `pending` payment row with the session id.
  4. Return `{ url }`. If anything after step 1 fails, release the hold and return an error.
- **`POST /api/stripe/webhook`:** verify the signature with `STRIPE_WEBHOOK_SECRET`.
  - `checkout.session.completed` with `payment_status: paid`: `confirm_payment`. On `refund_needed`, refund the payment intent and `mark_refunded`.
  - `checkout.session.expired`: mark the payment `expired` and release the hold if it is still pending.
  - `charge.refunded`: `mark_refunded` if not already.
  - Return 2xx for events it ignores.
- **`POST /api/checkout/confirm`** `{ sessionId }`: the ticket page calls this on `?session_id=`. It retrieves the session from Stripe and, if paid, runs the same confirm logic as the webhook. Locally this makes payment work even when no webhook is forwarded. Both paths are idempotent, so running both is safe.
- **`POST /api/bookings/cancel`** `{ ref }`: `cancel_booking` as the user. If it returned a payment, create a Stripe refund for the full amount (idempotency key = payment id), then `mark_refunded`. If Stripe fails, the booking stays cancelled and the payment stays `refunding`. The call returns an error the UI shows ("Booking cancelled; refund is still processing"). **Retry:** calling the route again for a cancelled booking whose payment is still `refunding` retries the refund. `cancel_booking`, or a small companion function, returns that payment instead of raising `booking_not_cancellable`. The ticket page offers "Retry refund" in that state. The `charge.refunded` webhook also finishes it.

### Stripe session expiry vs. the 10-minute hold

Stripe's Checkout Sessions last at least 30 minutes, so the Stripe page can outlive the 10-minute hold. The design accepts this rather than switch to an embedded payment form:
- When a hold expires, the server doesn't need to expire the Stripe session.
- If the user pays after the hold expired, `confirm_payment` returns `refund_needed`, the payment is refunded at once, and the ticket page says the hold ran out and the payment was refunded, with a link back to the seat map.
- The checkout page shows the hold time ("Seats held for 10 minutes once you continue to payment").

### Web app

- **Checkout:** the button becomes "Pay $X" and calls `/api/checkout`, then redirects the browser to the Stripe URL. The "Confirming your booking" dialog becomes "Taking you to payment". Same error handling as today for `seats_taken`, `showtime_unavailable` and `invalid_seats`. Remove the "Pay at the box office…" text. When the page is reached from Stripe's cancel URL, call `release_hold` for that ref and let the user pay again.
- **Ticket page after payment** (`?new=1&session_id=`): call `/api/checkout/confirm`, then show the booking. While the reservation is still pending, show a "Confirming payment" state and retry briefly. If the booking expired and was refunded, say so.
- **My Tickets:** hide `pending` reservations, and `expired` ones that have no paid payment. An expired reservation that was paid late and refunded shows under Past as "Refunded", and `/tickets/<ref>` loads it later too. Upcoming stays confirmed and not yet started.
- **Cancel:** the existing Cancel booking action calls `/api/bookings/cancel` instead of the RPC. The confirm text mentions the refund for paid bookings ("You'll be refunded $X to your card").
- **Ticket view:** paid bookings show the amount paid. A refunded booking shows "Refunded".

### Testing

- Extend `backend/src/scripts/tests/booking_rpc_test.ts` (or add a sibling test) for: hold blocks seats, `release_hold`, `expire_holds`, lazy expiry inside `hold_seats`, `confirm_payment` (normal, repeated, after expiry), `cancel_booking` returning the payment and moving it to `refunding`, and users being unable to call the service-role functions.
- Manual end to end in test mode with card `4242 4242 4242 4242`, a declined card (`4000 0000 0000 0002`), backing out of Stripe's page, letting a hold expire, and cancelling a paid booking to see the refund in the Stripe dashboard.

## Constraints

- **Stack:** Next.js 16 with `cacheComponents`. Read `frontend/web-app/node_modules/next/dist/docs/` before using route handlers or other framework APIs, per `frontend/web-app/AGENTS.md`. Route handlers that use Stripe run on the Node.js runtime. The webhook route must read the raw request body for signature checks.
- **Migrations:** the user applies them with `cd backend && npx supabase db push`. Get their go-ahead first. The integration test writes temporary users to the live project and also needs their go-ahead.
- **Keys:** the user creates a Stripe test account and puts the keys in `.env.local`. The assistant never prints or commits them.
- **Webhooks locally:** the webhook is required, not optional. The user chose to install the Stripe CLI and run `stripe listen --forward-to localhost:3000/api/stripe/webhook` while testing. The webhook is what recovers a payment whose tab was closed before the redirect back. `/api/checkout/confirm` only makes the ticket page fast, and the work isn't done until the webhook path is tested. The plan includes a step to install the CLI, done by the user.
- **Test mode only, permanently:** the user's words: "I will always be using Stripe as development and not production, so no real money happening in the transactions". Use test keys only. Don't build anything for live mode, such as production webhook endpoints or key switching.
- **Code style:** match the existing code: short intent comments, the existing component patterns and Tailwind classes, errors as known codes like the booking functions use.

## Left to the builder

- Exact SQL shape of the functions and their return types.
- How the route handlers share code (one server helper module for Supabase clients and Stripe is expected).
- The cancel URL marker and exactly how the ticket page polls while confirming.
- Line item wording on Stripe's page.

## Calls made without the user (check these)

- Stripe's hosted Checkout page, not an embedded card form.
- Server code as Next.js route handlers in the web app, not Supabase Edge Functions.
- Paying after the 10-minute hold ran out is refunded automatically, not honoured (Stripe sessions can't be shorter than 30 minutes).
- Backing out of Stripe's page releases the hold at once.
- One checkout in progress per user: a new hold releases the user's older ones and expires their Stripe sessions. The user's own held seats stay pickable.
- Late-paid, refunded bookings show in My Tickets → Past as "Refunded". Unpaid expired holds stay hidden.
- A stuck refund is retried by cancelling again, with a "Retry refund" action on the ticket page.
- Expired holds get a new reservation status `expired` and are hidden from My Tickets.
- Seeded bookings have no payment and cancel without a refund.
- Work goes on a new branch `stripe-payments` cut from `booking-backend`.
