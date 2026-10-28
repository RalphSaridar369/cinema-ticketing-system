# Booking backend: design

Date: 2026-10-28. Status: approved by the user on 2026-10-28.

## Intent

The web app's booking flow (seat map, checkout, ticket page, My Tickets) works end to end on screen, but none of it touches the database. Seat availability is generated, and bookings live only in the browser's localStorage. The goal is to make the same flow real: seats come from the database, confirming a booking writes it, tickets and My Tickets read it back, and a booking can be cancelled.

The user's words: "integrate backend logic for booking from A to Z", "just as you see the flow in the website", "add cancellation too".

## Goals

- Seat map shows the room's real seats and the seats actually taken for that showtime.
- Confirm booking creates a reservation and its tickets in the database, safely under concurrency (two people can never hold the same seat).
- The ticket page and My Tickets read the signed-in user's reservations and tickets from the database, on any device.
- A user can cancel an upcoming booking, which frees its seats.
- The screens keep their current look and flow.

## Non-goals

- Payment. The checkout text "Pay at the box office or with the card on your account" stays; nothing is charged.
- Seat holds while the user is on the checkout page.
- Cancelling some seats of a booking but not others.
- Admin or staff tools (marking tickets used, refunds).
- Real QR codes. The ticket's QR pattern stays decorative.
- Email confirmations.

## Anti-goals (a failure even if it works)

- Two active tickets for the same seat and showtime.
- Prices or totals decided by the browser.
- A user reading or changing another user's reservations or tickets, or seeing who holds a seat.
- My Tickets losing the seeded bookings that already exist in the database.

## Current state

- **Tables** (all exist, see `backend/supabase/migrations/`):
  - `seat`: `room_id`, `row_label`, `seat_number`, `seat_type` (`standard` or `vip`). Seeded: 10 seats per row, 13,200 seats in total, of which 1,200 are VIP.
  - `reservation`: `user_id`, `showtime_id`, `reserved_at`, `party_size`, `status` (`pending`, `confirmed`, `completed` or `cancelled`), `total_amount`.
  - `ticket`: `reservation_id`, `showtime_id`, `seat_id`, `price`, `status` (`confirmed`, `used` or `cancelled`). A unique index on `(showtime_id, seat_id) where status <> 'cancelled'` already forbids double booking.
  - Neither `reservation.id` nor `ticket.id` has a default.
- **RLS:** users can read their own reservations and tickets but can't write either. The migration comment says "read-only for their owner until booking goes through the backend".
- **Seed data:** 10,000 reservations and 21,163 tickets across 372 users, all for showtimes from 2026-09-28 to 2026-10-11. The data is consistent:
  - `party_size` equals the ticket count, and `total_amount` equals the sum of the ticket prices.
  - Ticket statuses match their reservation's: confirmed with confirmed, completed with used, cancelled with cancelled.
  - There are no `pending` rows.
  - Every ticket's price equals its showtime's `price`, VIP seats included.
  - All of these showtimes are in the past, so seeded tickets never block new bookings.
- **Seats per room:** 80 rooms. Every row has exactly 10 seats, rows run A to Y, and each room's seat count equals its `capacity`. All 1,200 VIP seats are in the 15 VIP rooms. Standard and IMAX rooms have none.
- **Frontend** (`frontend/web-app/src`):
  - `lib/data.ts`: `takenSeats`, `unavailableSeats`, `seatsLeft` and `isVipSeat` generate availability from the showtime id. `Booking` is the local booking type.
  - `lib/store.ts`: `bookings` in app state, persisted to localStorage, and `actions.addBooking`.
  - `components/screens/seat-selection.tsx`: the seat map, which assumes 10 seats per row and up to 25 rows (`ROW_LETTERS`).
  - `components/screens/checkout.tsx`: validates seats from the URL (`?seats=E4,E5`), shows a fake 1.8s "Confirming" dialog, writes a local booking with a random `VLR-XXXXX` ref, and redirects to `/tickets/<ref>?new=1`.
  - `components/screens/tickets.tsx`: the ticket carousel, which finds the booking by ref in local state.
  - `app/(app)/my-tickets/page.tsx`: the Upcoming and Past tabs, with Upcoming meaning status `Confirmed`.
  - `components/showtimes.tsx`: the showtime row shows "N left" from the generated seats.
- **Catalogue:** showtimes come from `lib/catalog.ts` (`useCatalog`, the next 7 days), with `Room.rows` derived as `capacity / 10`.

## Design

### Database (one new migration)

All writes go through Postgres functions called with `supabase.rpc`. They're `security definer`, check `auth.uid()`, and set `search_path = ''`. RLS on `reservation` and `ticket` stays read-only for users. These functions are the "backend": no separate server is added.

1. **Booking code:** add `reservation.ref text unique not null`, a short human code shown on tickets and used in URLs (format like `VLR-2B8QX`). Backfill existing rows with unique codes. The builder picks the generation scheme, which must be collision-free. Five hex characters for 10,000 rows would collide, for example.
2. **Id defaults:** give `reservation.id` and `ticket.id` the default `gen_random_uuid()`.
3. **`showtime_taken_seats(p_showtime uuid) returns setof uuid`:** the seat ids with an active (not cancelled) ticket for that showtime. It returns no user information. Callable by `anon` and `authenticated`.
4. **`showtime_seats_left(p_showtimes uuid[])` returns `(showtime_id, seats_left)`:** room seat count minus active tickets, for the "N left" badge on showtime rows. It's one call for a whole list.
5. **`book_seats(p_showtime uuid, p_seats uuid[])` returns the new reservation's `ref`:** authenticated only, and atomic. It must:
   - reject when signed out, when the showtime doesn't exist or has already started, when the seat list is empty, has more than 10 seats (`MAX_SEATS`) or repeats a seat, or when any seat isn't in the showtime's room
   - insert one `reservation` (`status 'confirmed'`, `party_size`, `total_amount` = seats × showtime price, `reserved_at now()`, new `ref`) and one `ticket` per seat (`status 'confirmed'`, `price` = showtime price)
   - on the unique-index violation (a seat taken in the meantime), raise an error the app can recognise as "seats taken", so it can tell the user to pick again
6. **`cancel_booking(p_ref text)`:** authenticated, and only for the caller's own reservation. Allowed while the reservation is `confirmed` and its showtime hasn't started. It sets the reservation to `cancelled` and its tickets to `cancelled`, which frees the seats through the partial unique index. It raises a recognisable error otherwise (not found, already cancelled, too late).

### Seat map (`seat-selection.tsx`)

- Load the room's seats from `seat`: `row_label`, `seat_number`, `seat_type`, readable by everyone. Load the taken seats from `showtime_taken_seats`.
- Lay seats out by their real rows and numbers. VIP styling comes from `seat_type`, replacing `isVipSeat`. The user chose to follow the database: standard and IMAX rooms lose the VIP block the app used to draw, since they have no VIP seats, and no seat data changes. Every seeded row has 10 seats, so the current layout, including the aisle gap after seat 5, stays as it is.
- The checkout URL keeps the human labels (`?seats=E4,E5`). Checkout maps them to seat ids.
- A showtime is unavailable when it isn't in the catalogue, has started, or has no free seats ("sold out").

### Checkout (`checkout.tsx`)

- Validate the requested seats against the real seats and taken seats, as it does now with the generated ones.
- **Confirm:** call `book_seats`, keeping the existing "Confirming your booking" dialog while the call runs, but without the fake 1.8s timer. On success, go to `/tickets/<ref>?new=1`.
- **Seats taken:** show a clear message and a way back to the seat map, with the taken seats refreshed.
- **Other errors:** show a message and let the user retry.
- **Text:** remove "Seats are held for 10 minutes." from the checkout page.

### Tickets and My Tickets

- **Loading:** read the user's reservations with their showtime, room, branch, movie and tickets (with seat labels) from the database, through RLS. Seeded bookings appear for seeded users.
- **Ticket page:** finds the booking by `ref`. It shows one card per ticket, and per-ticket status drives the stamp: `used` shows USED, `cancelled` shows CANCELLED.
- **Upcoming:** reservations with status `confirmed` whose showtime hasn't started.
- **Past:** everything else.
- **Badges:** cancelled shows CANCELLED. A confirmed or completed booking whose showtime has passed shows COMPLETED.
- **Dates and times:** shown in the user's local time, in the formats used now ("Sat 10 Oct", "19:30").
- **Cancel:** the ticket page gets a Cancel booking action for upcoming bookings. It asks for confirmation with the existing `Modal` pattern, as with logging out and removing from lists: "Are you sure you want to cancel this booking for …?". It then calls `cancel_booking`, and on success the page shows the booking as cancelled.

### Local state

- Remove `bookings` and `actions.addBooking` from the store, the `Booking` type's local-only fields, and the generated-availability helpers in `lib/data.ts` once nothing uses them.
- Bookings saved in localStorage by earlier builds are dropped, not migrated. They were never real.

## Constraints

- **Stack:** Next.js 16 with `cacheComponents`. Read `frontend/web-app/node_modules/next/dist/docs/` before using framework APIs, per `frontend/web-app/AGENTS.md`. The app also uses `supabase-js` in the browser and the `useResource` cache in `lib/catalog.ts`.
- **Migrations:** the user applies them with `npx supabase db push` from `backend/`. The assistant can't run SQL directly. It can use the service key in `backend/.env` for read-only checks.
- **Showtime size:** `showtime` has about 70k rows with no index on `movie_id` or `starts_at`. Joins across it from the browser have timed out before, so queries should stay narrow. If the builder needs indexes, add them in this migration.
- **Code style:** match the existing code: short comments on intent, the same component patterns, and Tailwind classes as used.

## Left to the builder

- **Data loading:** how the ticket and My Tickets data is fetched and cached, whether as one nested select or a view, as long as it stays fast and only the user's own data is read.
- **Error signalling:** how errors are signalled from the functions to the app, for example `raise exception` with a known message or `errcode`.
- **Testing:** how to test the functions, for example SQL checks run by the user, or a temporary test user, which needs the user's go-ahead because it writes to live auth.
- **Booking code format:** exact format and generation of `ref`.

## Calls made without the user (check these)

- No payment and no seat holds. The "held for 10 minutes" text is removed.
- Cancellation covers the whole booking, allowed until the showtime starts.
- Old localStorage bookings are dropped.
- The "N left" badge stays, backed by a database function.
