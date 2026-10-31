# Stripe Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take payment through Stripe in test mode before a booking is confirmed: seats are held for 10 minutes while the user pays on Stripe's hosted page, every payment is recorded in a `payment` table, and cancelling a paid booking refunds it automatically.

**Architecture:**
- **Database:** one migration adds `payment`, the `held` and `expired` statuses, and Postgres functions for holds, payment confirmation and refunds. User-level functions check `auth.uid()`. Payment-writing functions are `service_role` only.
- **Server:** Next.js route handlers under `frontend/web-app/src/app/api/` hold the Stripe secret key. They call user-level functions with the caller's Supabase access token, and service-only functions with the service-role key. Shared logic lives in `src/lib/server/`.
- **Browser:** checkout redirects to Stripe. The ticket page confirms on return. The Stripe webhook (forwarded locally by the Stripe CLI) is the source of truth and recovers closed tabs.

**Tech Stack:** Supabase Postgres (plpgsql, RLS, `pg_cron`), `supabase-js` 2, Next.js 16.4 route handlers (Node.js runtime), the `stripe` npm package in test mode, Stripe CLI, TypeScript, `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-10-31-stripe-payments-design.md` (builds on `docs/superpowers/specs/2026-10-28-booking-backend-design.md`)

## Global Constraints

- **Branch:** `stripe-payments`, cut from `booking-backend`.
- **Test mode only, permanently:** `sk_test_…` keys only. Build nothing for live mode.
- **One payment per booking:** a `payment` row belongs to one `reservation`. Any number of tickets is one payment.
- **Hold length:** 10 minutes (`hold_expires_at = now() + interval '10 minutes'`).
- **Stripe session lifetime:** `expires_at` = now + 30 minutes, Stripe's minimum. A payment made after the hold expired is refunded in full, automatically.
- **Prices:** amount = reservation `total_amount`, set by the database. Stripe gets `unit_amount = round(showtime price × 100)` in `usd` and `quantity` = seat count, both read from `hold_seats`' result, never from the request.
- **Secrets:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are server-only env vars in `frontend/web-app/.env.local`, never `NEXT_PUBLIC_`, never printed or committed. Add them to `.env.example` without values.
- **Webhook required:** the work is done only once the webhook path is tested through `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
- **Seeded bookings:** no payment row. Cancelling one refunds nothing.
- **Migrations and live writes:** the user applies migrations (`cd backend && npx supabase db push`) and approves any test that writes temporary users to the live project. Ask first.
- **Next.js:** read `frontend/web-app/node_modules/next/dist/docs/01-app/` (route handlers, `cacheComponents`) before writing framework code, per `frontend/web-app/AGENTS.md`.
- **Errors:** the database raises the code as the whole exception message, like the booking functions. The routes return `{ error: <code> }` with a non-2xx status. The browser maps unknown codes to `network`.
- **Style:** match the surrounding code: short intent comments, existing components (`Modal`, `LoadError`, `NotFoundNote`, `Spinner`, `Badge`) and Tailwind classes.

## Review Focus

1. **The user pays and closes the tab before the redirect:** the webhook still confirms the booking, and it appears in My Tickets. Task 4: manual check "tab closed after paying".
2. **Payment arrives after the hold expired** (cron already ran): the booking stays expired, the payment is refunded, and the booking shows under Past as "Refunded". Task 1: `confirm after expiry needs refund`. Task 4: manual check.
3. **The same Stripe event arrives twice, or the webhook and `/api/checkout/confirm` both run:** one confirmation, one refund, no error. Task 1: `confirm_payment is idempotent`. Task 2: refunds use the idempotency key `refund-<payment id>`.
4. **Another user's seats are held:** they show as taken for everyone else but stay pickable by the holder. Task 1: `held seats are taken for others, not for the holder`.
5. **A user calls a service-only function or another user's ref directly:** refused. Task 1: `users can't call service functions`, `release_hold ignores other users' refs`.

---

### Task 1: Payment migration and its integration test

**Files:**
- Create: `backend/supabase/migrations/20261031120000_payment.sql`
- Create: `backend/src/scripts/tests/payment_rpc_test.ts`
- Modify: `backend/src/scripts/tests/booking_rpc_test.ts` (`book_seats` is dropped. Book with `hold_seats`, then confirm with a fake session through `create_payment` + `confirm_payment` as the service client.)
- Modify: `backend/package.json` (add `"test:payment": "npx tsx --test src/scripts/tests/payment_rpc_test.ts"`)

**Interfaces:**
- Produces, in SQL (every function `security definer`, `set search_path = ''`, `revoke execute ... from public, anon, authenticated` before granting):
  - **Table `public.payment`:**
    - `id uuid pk default gen_random_uuid()`
    - `reservation_id uuid not null` references `reservation` on delete cascade
    - `user_id uuid not null` references `auth.users` on delete cascade
    - `amount numeric(10,2) not null check (amount >= 0)`
    - `currency text not null default 'usd'`
    - `status text not null check (status in ('pending','succeeded','expired','refunding','refunded'))`
    - `stripe_checkout_session_id text unique not null`
    - `stripe_payment_intent_id text unique`
    - `stripe_refund_id text`
    - `created_at timestamptz not null default now()`, `paid_at timestamptz`, `refunded_at timestamptz`
    - Index on `reservation_id`. RLS enabled. Policy: select where `user_id = auth.uid()`. No write policies.
  - **Status checks:** `ticket.status` check gains `held`, and `reservation.status` check gains `expired`. Drop and re-add the existing check constraints; look up their real names first.
  - **New column:** `reservation.hold_expires_at timestamptz` (nullable).
  - `hold_seats(p_showtime uuid, p_seats uuid[]) returns table(reservation_id uuid, ref text, seat_count int, unit_price numeric, released_sessions text[])`, granted to `authenticated`.
    - Same checks and errors as the old `book_seats`.
    - Before inserting, it expires this showtime's holds past `hold_expires_at`, and all of the caller's own `pending` reservations.
    - `released_sessions` holds the Stripe session ids of the caller's payments it moved from `pending` to `expired`.
    - It inserts the reservation as `pending`, with `hold_expires_at` = now + 10 min, and its tickets as `held`.
  - **`drop function public.book_seats(uuid, uuid[])`.**
  - `release_hold(p_ref text) returns text`, granted to `authenticated`.
    - Applies only to the caller's `pending` reservation. It sets the reservation to `expired`, its tickets to `cancelled`, and its `pending` payment to `expired`.
    - Returns that payment's session id, or null. It's a no-op returning null otherwise, including for another user's ref.
  - `expire_holds() returns int`, not granted to anyone. It expires every `pending` reservation past `hold_expires_at` (reservation, tickets, `pending` payments) and returns the count.
  - **Cron job:** `create extension if not exists pg_cron;` and `select cron.schedule('expire-holds', '* * * * *', 'select public.expire_holds()');`.
  - `create_payment(p_reservation uuid, p_session_id text) returns uuid`, `service_role` only. It inserts a `pending` payment with `amount` = the reservation's `total_amount` and `user_id` = the reservation's user.
  - `confirm_payment(p_session_id text, p_payment_intent text) returns table(outcome text, payment_id uuid, payment_intent text)`, `service_role` only.
    - It locks the payment `for update`, and raises `payment_not_found` when there is none.
    - Payment `pending` or `expired`: record `stripe_payment_intent_id` and `paid_at`.
      - Reservation still `pending`: payment `succeeded`, reservation `confirmed` with `hold_expires_at` null, tickets `confirmed`. Outcome `confirmed`.
      - Otherwise: payment `refunding`. Outcome `refund_needed`.
    - Payment `succeeded`: outcome `confirmed`.
    - Payment `refunding`: outcome `refund_needed`.
    - Payment `refunded`: outcome `refunded`.
  - `expire_payment(p_session_id text) returns void`, `service_role` only. A `pending` payment becomes `expired`. If its reservation is still `pending`, it is expired too, with its tickets cancelled.
  - `cancel_booking(p_ref text) returns table(payment_id uuid, payment_intent text, amount numeric)`, granted to `authenticated`.
    - Drop it and recreate it, because the return type changes.
    - It keeps the same rules and errors. On cancel, a `succeeded` payment becomes `refunding` and is returned.
    - If the caller's reservation is already `cancelled` and its payment is `refunding`, it returns that payment instead of raising `booking_not_cancellable`.
    - It returns zero rows for unpaid bookings.
  - `mark_refunded(p_payment_intent text, p_refund_id text) returns void`, `service_role` only, idempotent. A payment in `refunding` or `succeeded` becomes `refunded`, with `stripe_refund_id` and `refunded_at`.
  - `showtime_taken_seats`: `create or replace`, leaving out `held` tickets whose reservation's `user_id = auth.uid()`. `showtime_seats_left` is unchanged, so held seats count as taken.
- **New error codes:** `payment_not_found`. Existing codes are unchanged.

- [ ] **Step 0: Create the branch and commit the spec and plan.** `git checkout -b stripe-payments` (from `booking-backend`), then `git add docs/superpowers/specs/2026-10-31-stripe-payments-design.md docs/superpowers/plans/2026-10-31-stripe-payments.md && git commit -m "Add Stripe payments design and plan"`

- [ ] **Step 1: Write the failing integration test** `payment_rpc_test.ts`. Copy the setup from `booking_rpc_test.ts`: two temporary users (A, B), a future showtime with free seats, `takeFreeSeats`, and cleanup in `after`. Fake session ids are `cs_test_fake_<uuid>`. Tests:
  - `hold blocks seats and creates a pending reservation`: A holds 2 seats. The result has `seat_count` 2 and `unit_price` = showtime price. The reservation is `pending` with `hold_expires_at` about 10 min ahead. The tickets are `held`. B holding one of them gets `seats_taken`.
  - `held seats are taken for others, not for the holder`: `showtime_taken_seats` as B includes A's held seats. As A, it doesn't.
  - `a new hold releases the caller's previous hold`: A holds, the service creates a payment, and A holds again on other seats. The first reservation is `expired`, its tickets `cancelled`, its payment `expired`. The new result's `released_sessions` contains the first session id.
  - `release_hold frees seats and returns the session`, and `release_hold ignores other users' refs` (it returns null and changes nothing).
  - `expire_holds expires holds past their time`: the service sets a hold's `hold_expires_at` to the past, then calls `expire_holds()`. The reservation is `expired` and the seats are free.
  - `hold_seats expires stale holds on the showtime first`: A's hold is moved into the past, and B holds the same seat successfully.
  - `confirm_payment confirms a pending hold`: outcome `confirmed`. The reservation is `confirmed` with `hold_expires_at` null, the tickets `confirmed`, and the payment `succeeded` with `amount` = `total_amount` and the payment intent set.
  - `confirm_payment is idempotent`: a second call returns `confirmed` and changes nothing.
  - `confirm after expiry needs refund`: hold, payment, `expire_holds` past time, then confirm. Outcome `refund_needed`, payment `refunding`, reservation `expired`. Then `mark_refunded` sets the payment to `refunded`, and a repeated confirm returns `refunded`.
  - `expire_payment expires a pending hold`.
  - `cancel_booking returns the paid payment and marks it refunding`. Calling it again returns the same row. After `mark_refunded`, a third call raises `booking_not_cancellable`. Cancelling an unpaid confirmed booking returns zero rows.
  - `users can't call service functions`: as A, `create_payment`, `confirm_payment`, `expire_payment`, `mark_refunded` and `expire_holds` all fail with a permission error.
  - `users read only their own payments`: B's `select` on `payment` returns none of A's rows.

- [ ] **Step 2: Run it to see it fail.** `cd backend && npm run -s test:payment`. Expected: FAIL, because `hold_seats` doesn't exist.

- [ ] **Step 3: Write `20261031120000_payment.sql`** as specified in Interfaces. Update `booking_rpc_test.ts` to book through `hold_seats` plus the service-side confirm, keeping its existing assertions.

- [ ] **Step 4: Ask the user to apply it.** Get their go-ahead first, then they run `cd backend && npx supabase db push`. Both tests create and delete temporary auth users on the live project.

- [ ] **Step 5: Run both tests to see them pass.** `cd backend && npm run -s test:payment && npm run -s test:booking`. Expected: PASS. Note that the web app's checkout is broken until Task 3, because `book_seats` is gone.

- [ ] **Step 6: Commit** the migration, both tests and `package.json`: `git commit -m "Add payments table, seat holds and payment functions"`.

---

### Task 2: Server routes for checkout, confirmation, webhook and cancellation

**Files:**
- Modify: `frontend/web-app/package.json` (add `stripe`)
- Modify: `frontend/web-app/.env.example` (add `STRIPE_SECRET_KEY=`, `STRIPE_WEBHOOK_SECRET=`, `SUPABASE_SERVICE_ROLE_KEY=` with comments on where to find each)
- Create: `frontend/web-app/src/lib/server/clients.ts`
- Create: `frontend/web-app/src/lib/server/payments.ts`
- Create: `frontend/web-app/src/app/api/checkout/route.ts`
- Create: `frontend/web-app/src/app/api/checkout/release/route.ts`
- Create: `frontend/web-app/src/app/api/checkout/confirm/route.ts`
- Create: `frontend/web-app/src/app/api/stripe/webhook/route.ts`
- Create: `frontend/web-app/src/app/api/bookings/cancel/route.ts`

**Interfaces:**
- Consumes: the Task 1 functions, exactly as named.
- Produces, in `lib/server/clients.ts`:
  - `stripe: Stripe`, built from `STRIPE_SECRET_KEY`.
  - `serviceDb(): SupabaseClient`, built from `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, with no session persistence.
  - `userDb(req: Request): SupabaseClient | null`: an anon-key client with `global.headers.Authorization` copied from the request's `Authorization: Bearer <token>`. It returns null when the header is missing.
- Produces, in `lib/server/payments.ts`:
  - `refund(paymentId: string, paymentIntent: string): Promise<void>`: `stripe.refunds.create({ payment_intent }, { idempotencyKey: "refund-" + paymentId })`, then `mark_refunded`.
  - `settleSession(session: Stripe.Checkout.Session): Promise<"confirmed" | "refunded" | "pending">`:
    - Returns `pending` if `payment_status !== "paid"`.
    - Otherwise it calls `confirm_payment(session.id, payment_intent id)`. On `refund_needed` it calls `refund`, then returns `refunded`.
    - It's shared by the webhook and the confirm route.
  - `expireSessions(ids: string[]): Promise<void>`: best-effort `stripe.checkout.sessions.expire` for each id, ignoring errors from sessions that are already complete or expired.
- **Route contracts:** all are `POST` with a JSON body. Responses are JSON. Errors are `{ error: code }`: `not_signed_in` (401), database codes (409 for `seats_taken`, 400 otherwise), `payment_error` (502) for Stripe failures.
  - **`/api/checkout`** takes `{ showtimeId, seatIds }` and returns `{ url }`.
    - It calls `hold_seats` as the user, then `expireSessions(released_sessions)`.
    - It creates the Checkout Session with:
      - `mode: "payment"`, `payment_method_types: ["card"]`
      - one line item: `price_data { currency: "usd", unit_amount, product_data.name: "<movie title> · <weekday day month, HH:MM>" }` with `quantity` = `seat_count`
      - `metadata { reservation_id, ref }`, `client_reference_id: ref`
      - `expires_at` = now + 30 min
      - `success_url` = `<origin>/tickets/<ref>?new=1&session_id={CHECKOUT_SESSION_ID}`
      - `cancel_url` = `<origin>/book/<showtimeId>/checkout?seats=<labels>&released=<ref>`
    - The route reads the movie title and seat labels with the service client, by showtime id and seat ids.
    - It then calls `create_payment`. If anything after `hold_seats` fails, it calls `release_hold` as the user and returns `payment_error`.
  - **`/api/checkout/release`** takes `{ ref }` and returns `{}`. It calls `release_hold` as the user, then `expireSessions` on the returned id.
  - **`/api/checkout/confirm`** takes `{ sessionId }` and returns `{ outcome }`. It calls `stripe.checkout.sessions.retrieve`, checks `client_reference_id` against a reservation the caller can read (via `userDb`, `reservation.ref`), then runs `settleSession`.
  - **`/api/stripe/webhook`** verifies the raw body (`await req.text()`) with `stripe.webhooks.constructEvent(body, stripe-signature header, STRIPE_WEBHOOK_SECRET)`. A bad signature returns 400.
    - `checkout.session.completed`: `settleSession`.
    - `checkout.session.expired`: `expire_payment`.
    - `charge.refunded`: `mark_refunded(charge.payment_intent, latest refund id)`.
    - Any other event: 200.
  - **`/api/bookings/cancel`** takes `{ ref }` and returns `{ refunded: number | null }`. It calls `cancel_booking` as the user. If a row comes back, it calls `refund` and returns its amount. If the refund fails, it returns 502 `{ error: "refund_pending" }`.
- **Runtime:** every route runs on the Node.js runtime. Check the docs for how to declare it in this Next.js version, and for how route handlers behave under `cacheComponents`.

- [ ] **Step 1: Read the docs.** In `node_modules/next/dist/docs/01-app/`, read the route handler guide and API reference, and the `cacheComponents` notes on dynamic route handlers.

- [ ] **Step 2: Ask the user for the keys.** They create a Stripe test account, then add `STRIPE_SECRET_KEY` (Developers → API keys, `sk_test_…`) and `SUPABASE_SERVICE_ROLE_KEY` (same value as `backend/.env`) to `frontend/web-app/.env.local`. They install the Stripe CLI, run `stripe login`, then `stripe listen --forward-to localhost:3000/api/stripe/webhook`, and copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`. Never read these values back into the chat.

- [ ] **Step 3: Install the package and implement** the files above. Install with `cd frontend/web-app && npm install stripe`. Don't import `lib/server/*` from any client component.

- [ ] **Step 4: Verify the build.** From `frontend/web-app`, run `npx tsc --noEmit && npm run lint && npm run build`. Expected: no errors. The build output lists the five `/api/...` routes as dynamic.

- [ ] **Step 5: Smoke-test the webhook guard.** With `npm run dev` running, `curl -s -o /dev/null -w '%{http_code}' -X POST localhost:3000/api/stripe/webhook -d '{}'` should print `400`. Then `stripe trigger checkout.session.completed` should show `200` in the `stripe listen` output. The settle step fails gracefully with `payment_not_found` for a session that isn't ours, so the webhook must still return 2xx for it, or Stripe retries forever.

- [ ] **Step 6: Commit** `git commit -m "Add Stripe checkout, webhook and refund routes"`.

---

### Task 3: Checkout, ticket page and My Tickets on payments

**Files:**
- Modify: `frontend/web-app/src/lib/booking-view.ts`
- Modify: `frontend/web-app/src/lib/booking-view.test.ts`
- Modify: `frontend/web-app/src/lib/booking.ts`
- Modify: `frontend/web-app/src/components/screens/checkout.tsx`
- Modify: `frontend/web-app/src/components/screens/tickets.tsx`
- Modify: `frontend/web-app/src/app/(app)/my-tickets/page.tsx`

**Interfaces:**
- Consumes: Task 2's route contracts.
- Produces, in `booking-view.ts`:
  - `BookingStatus` gains `"Refunded"`.
  - `BookingError` gains `"payment_error"` and `"refund_pending"`. Add both to `ERRORS`.
  - `bookingStatus(reservationStatus, startsAt, now)` returns `"Refunded"` (not upcoming) for `expired`.
  - `bookingVisible(reservationStatus: string, paymentStatus: string | null): boolean`. It's false for `pending`, false for `expired` unless the payment is `refunding` or `refunded`, and true otherwise.
- Produces, in `booking.ts`:
  - `BOOKING_SELECT` adds `payment(status, amount)`.
  - `Booking` gains `paid: number | null` (the amount of a `succeeded`, `refunding` or `refunded` payment) and `refund: "refunding" | "refunded" | null`.
  - `loadMyBookings` drops rows where `bookingVisible` is false.
  - `startCheckout(showtimeId: string, seatIds: string[]): Promise<{ url: string } | { error: BookingError }>`.
  - `releaseCheckout(ref: string): Promise<void>`.
  - `confirmCheckout(sessionId: string): Promise<"confirmed" | "refunded" | "pending" | "error">`. It refreshes bookings, the seat map and seats-left afterwards.
  - `cancelBooking(ref: string): Promise<{ refunded: number | null } | { error: BookingError }>`. It now posts to `/api/bookings/cancel`. Its callers change to match.
  - **Shared fetch helper:** a private `postApi(path, body)` adds `Authorization: Bearer <(await supabase.auth.getSession()).data.session?.access_token>`. With no session, it returns `{ error: "not_signed_in" }` without calling the route.
  - Remove `bookSeats`.

- [ ] **Step 1: Write the failing tests** in `booking-view.test.ts`:
  - `bookingStatus("expired", future, now)` → `{ status: "Refunded", upcoming: false }`
  - `bookingVisible("pending", null)` → false
  - `bookingVisible("expired", null)` → false
  - `bookingVisible("expired", "expired")` → false
  - `bookingVisible("expired", "refunded")` → true
  - `bookingVisible("expired", "refunding")` → true
  - `bookingVisible("confirmed", null)` → true
  - `bookingVisible("cancelled", "refunded")` → true
  - `bookingError("refund_pending")` → `"refund_pending"`

- [ ] **Step 2: Run them to see them fail.** `cd frontend/web-app && npx tsx --test src/lib/booking-view.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `booking-view.ts` and `booking.ts`** per Interfaces.

- [ ] **Step 4: Update the checkout screen.**
  - **Button:** it reads `Pay ${total}` and calls `startCheckout`. On success it sets `window.location.href = url`.
  - **Dialog:** title "Taking you to payment", status chip unchanged, body "Holding seats {seats} for 10 minutes."
  - **Errors:** `seats_taken`, `showtime_unavailable` and `invalid_seats` keep their current screens. `payment_error` and `network` show "Couldn't start payment. Try again."
  - **Copy:** replace "Pay at the box office or with the card on your account." with "Seats are held for 10 minutes once you continue to payment. Test mode: no real card is charged."
  - **Back from Stripe:** when the page has `?released=<ref>`, call `releaseCheckout(ref)` once on mount. Then refresh the seat map and remove the param with `router.replace`, so a reload doesn't repeat it.

- [ ] **Step 5: Update the ticket page.**
  - **Return from Stripe:** with `?session_id=`, call `confirmCheckout` once on mount.
  - **`pending` outcome:** show a "Confirming payment" state with `Spinner`, retry every 2 s, and stop after 30 s with "Payment is still processing. Check My Tickets in a minute."
  - **`refunded` outcome:** show `NotFoundNote`-style copy, "Your seat hold ran out before payment finished. You've been refunded {money(paid)}.", with a link to `/book/<showtime>`.
  - **Cancel modal:** for a booking with `paid`, add "You'll be refunded {money(paid)} to your card."
  - **`refund_pending` error:** show "Booking cancelled. Your refund is still processing." with a "Retry refund" button that calls `cancelBooking` again.
  - **Refunded bookings:** show "Refunded {money(paid)}" under the total.

- [ ] **Step 6: Update My Tickets.** The Past badge shows REFUNDED for status `Refunded`, alongside the existing CANCELLED and COMPLETED. No filter change is needed, because `loadMyBookings` already drops hidden rows.

- [ ] **Step 7: Verify.** From `frontend/web-app`, run `npx tsx --test src/lib/booking-view.test.ts && npx tsc --noEmit && npm run lint && npm run build`. Expected: all PASS, no errors. `grep -rn "book_seats\|bookSeats" src` should print nothing.

- [ ] **Step 8: Commit** `git commit -m "Pay for bookings through Stripe Checkout and refund on cancel"`.

---

### Task 4: End-to-end check in Stripe test mode

**Files:** none. Fix bugs found here in the owning task's files and commit them separately.

- [ ] **Step 1: Ask the user to run the checks.** They need `npm run dev` and `stripe listen --forward-to localhost:3000/api/stripe/webhook` both running, and they must be signed in. Go through these together, and check the `payment` row with the service key (read-only) after each one:
  1. **Happy path:** pick 3 seats and pay with `4242 4242 4242 4242`. You land on the ticket. My Tickets → Upcoming shows the booking. One `payment` row is `succeeded` for 3 × price.
  2. **Declined card:** `4000 0000 0000 0002`. Stripe shows the error and keeps you on its page. The payment stays `pending`.
  3. **Back out:** press Stripe's back link. You're on checkout with the same seats, the seats are free for others again, and the payment is `expired`.
  4. **Hold expiry:** start a checkout and wait more than 10 minutes. The seats free up, and the booking isn't in My Tickets. If you pay on the still-open Stripe page, you land on the "hold ran out, refunded" message, the payment is `refunded` (visible in the Stripe dashboard), and the booking shows under Past as Refunded.
  5. **Tab closed after paying:** pay, then close the tab before the redirect finishes, or stop it with Esc. The webhook confirms the booking, and My Tickets shows it after a reload.
  6. **Cancel a paid booking:** the modal mentions the refund. After confirming, the booking is cancelled, the payment is `refunded`, and the Stripe dashboard shows the refund.
  7. **Cancel a seeded booking:** works as before, with no refund line.

- [ ] **Step 2: Re-run both database tests.** `cd backend && npm run -s test:payment && npm run -s test:booking`. Expected: PASS. Ask before running them, because they write temporary users.

- [ ] **Step 3: Ask the user about pushing and the PR.** `booking-backend` itself isn't pushed yet. Ask whether to push both branches and open PRs, booking first and then payments on top, or merge differently.
