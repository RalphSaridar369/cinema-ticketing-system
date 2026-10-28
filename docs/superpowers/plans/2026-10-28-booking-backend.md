# Booking Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the web app's booking flow real: seats and availability from the database, atomic booking, tickets and My Tickets read back from the database, and cancellation.

**Architecture:**
- **Writes:** all go through four `security definer` Postgres functions in one migration, called with `supabase.rpc`. RLS on `reservation` and `ticket` stays read-only for users.
- **Reads:** the frontend reads seats and the user's own bookings with ordinary selects, through a new `lib/booking.ts` that reuses the `useResource` cache from `lib/catalog.ts`.
- **Pure logic:** booking status, seat ordering and error mapping live in `lib/booking-view.ts`, so they can be unit tested without Supabase.

**Tech Stack:** Supabase Postgres (plpgsql, RLS), `supabase-js` 2, Next.js 16 (client components, `cacheComponents`), TypeScript, Node's built-in test runner through `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-10-28-booking-backend-design.md`

## Global Constraints

- **Payment:** none. Keep "Pay at the box office or with the card on your account." Remove "Seats are held for 10 minutes."
- **Seat limit:** 1–10 seats per booking (`MAX_SEATS = 10`, already in `lib/data.ts`).
- **Prices:** every ticket's `price` is the showtime's `price`, and the reservation's `total_amount` is seats × showtime price. Both are set by the database, never sent by the browser.
- **Cancellation:** the whole booking at once. Allowed only while the reservation is `confirmed` and its showtime hasn't started. It sets the reservation and all its tickets to `cancelled`.
- **Upcoming / Past:** Upcoming is `confirmed` with a showtime that hasn't started; Past is everything else. The Past badge is CANCELLED for cancelled, otherwise COMPLETED.
- **VIP:** VIP styling comes only from `seat.seat_type`. No seat data changes.
- **Migrations:** the user applies them with `cd backend && npx supabase db push`. The assistant can't run SQL. It can use the service key in `backend/.env`.
- **Next.js:** read `frontend/web-app/node_modules/next/dist/docs/` before using framework APIs (`frontend/web-app/AGENTS.md`).
- **Style:** match the surrounding code: short intent comments, existing Tailwind classes and components (`Modal`, `LoadError`, `NotFoundNote`, `ScreenFallback`, `Spinner`, `Badge`).
- **Old bookings:** bookings in localStorage from earlier builds are dropped, not migrated.

## Review Focus

1. **Two users confirm the same seat at the same moment:** one gets a reservation, the other gets `seats_taken`, and the seat has exactly one active ticket. Task 1: `concurrent bookings of one seat`.
2. **A booking URL edited by hand:** a seat from another room, a repeated seat, 11 seats or an unknown label is refused, and no rows are written. Task 1: `rejects invalid seat lists`; Task 4: label mapping test.
3. **The showtime starts while the user is on checkout:** booking is refused with `showtime_unavailable`, and cancelling after the start is refused with `booking_not_cancellable`. Task 1: `rejects past showtime`, `cancel rules`.
4. **Another user's booking code:** that user can't read it (the ticket page shows "not found") and can't cancel it. Task 1: `other users can't read or cancel`.
5. **A cancelled booking:** its seats show as free again on the seat map, and the seats-left count goes back up. Task 1: `cancel frees seats`.

---

### Task 1: Booking migration and its integration test

**Files:**
- Create: `backend/supabase/migrations/20261029120000_booking.sql`
- Create: `backend/src/scripts/tests/booking_rpc_test.ts`
- Modify: `backend/package.json` (add the script `"test:booking": "npx tsx --test src/scripts/tests/booking_rpc_test.ts"`)

**Interfaces:**
- Produces, in SQL:
  - `public.new_booking_ref() returns text`: `'VLR-'` plus 6 characters from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, retried until unused.
  - `reservation.ref text unique not null`, backfilled.
  - Defaults `gen_random_uuid()` on `reservation.id` and `ticket.id`.
  - `public.showtime_taken_seats(p_showtime uuid) returns setof uuid`, granted to `anon` and `authenticated`.
  - `public.showtime_seats_left(p_showtimes uuid[]) returns table(showtime_id uuid, seats_left int)`, granted to `anon` and `authenticated`.
  - `public.book_seats(p_showtime uuid, p_seats uuid[]) returns text` (the new `ref`), granted to `authenticated` only.
  - `public.cancel_booking(p_ref text) returns void`, granted to `authenticated` only.
- Produces, as error messages (the exception message is exactly the code, which `supabase-js` puts in `error.message`): `not_signed_in`, `showtime_unavailable`, `invalid_seats`, `seats_taken`, `booking_not_found`, `booking_not_cancellable`.

**Notes:**
- **Function settings:** all four functions are `security definer`, `set search_path = ''`, and use fully qualified names. `revoke execute ... from public` before granting.
- **Backfill:** run it in a `do` block that updates one row per statement, so each `new_booking_ref()` sees the codes already written. Add `unique` and `not null` after the backfill.
- **`book_seats` order of checks:**
  1. `auth.uid()` is null → `not_signed_in`.
  2. The showtime is missing or `starts_at <= now()` → `showtime_unavailable`.
  3. `cardinality` is 0 or above 10, there are duplicates, or not every seat is in the showtime's room → `invalid_seats`.
  4. Insert the reservation (`status 'confirmed'`, `party_size`, `total_amount`, `reserved_at now()`, `ref`), then the tickets in one `insert ... select`.
  5. Turn a `unique_violation` into `seats_taken`.
- **`cancel_booking`:**
  - No reservation with that ref for `auth.uid()` → `booking_not_found`.
  - Status isn't `confirmed`, or the showtime has started → `booking_not_cancellable`.

- [ ] **Step 1: Write the failing integration test** `booking_rpc_test.ts`
  - **Setup:**
    - With the service key, create two temporary users through `auth.admin.createUser` (email `booking-test-<random>@example.com`, password, `email_confirm: true`).
    - Sign each in with the anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY` from `frontend/web-app/.env.local`, or `SUPABASE_ANON_KEY` in `backend/.env`).
    - Pick an upcoming showtime with the service client, and read its room's seats and price.
  - **Teardown:** in `after()`, delete both users with `auth.admin.deleteUser`. Their reservations and tickets cascade.
  - **Tests (`node:test`), with these assertions:**
    - `books seats and returns a ref`:
      - The ref matches `/^VLR-[2-9A-HJ-NP-Z]{6}$/`.
      - The user can select their reservation: `status 'confirmed'`, `party_size 2`, `total_amount` = 2 × price, 2 tickets at the showtime price.
    - `taken seats and seats left`:
      - `showtime_taken_seats` includes both seat ids.
      - `showtime_seats_left` equals the room's seat count minus the active tickets.
    - `concurrent bookings of one seat`:
      - Two users call `book_seats` for the same free seat through `Promise.all`.
      - Exactly one succeeds, and the other's `error.message === "seats_taken"`.
    - `rejects invalid seat lists`:
      - These each give `invalid_seats`: `[]`, 11 seats, a repeated seat, and a seat from a different room.
      - Afterwards the user's reservation count hasn't changed.
    - `rejects past showtime`: a showtime with `starts_at` in the past gives `showtime_unavailable`.
    - `other users can't read or cancel`:
      - User B selecting user A's reservation by ref returns 0 rows.
      - User B's `cancel_booking(refA)` gives `booking_not_found`.
    - `cancel frees seats`:
      - After `cancel_booking`, the reservation and its tickets are `cancelled`.
      - The seats are no longer in `showtime_taken_seats`.
      - The same seats can be booked again.
    - `cancel rules`:
      - Cancelling twice gives `booking_not_cancellable`.
      - Insert, with the service client, a `confirmed` reservation for user A on a showtime that has already started, with ref from `new_booking_ref()`. User A's `cancel_booking` on it gives `booking_not_cancellable`.
    - `signed out`: the anon client calling `book_seats` gets a permission error.

- [ ] **Step 2: Run it to see it fail**

  Run: `cd backend && npm run -s test:booking`
  Expected: FAIL. The functions don't exist (`Could not find the function public.book_seats`).

- [ ] **Step 3: Write `20261029120000_booking.sql`** as described in Interfaces and Notes.

- [ ] **Step 4: Ask the user to apply it.** Get their go-ahead first, then they run `cd backend && npx supabase db push`. The test creates and deletes 2 temporary auth users on the live project.

- [ ] **Step 5: Run the test to see it pass**

  Run: `cd backend && npm run -s test:booking`
  Expected: all 9 tests pass, and teardown deletes both users.

- [ ] **Step 6: Commit**

```bash
git add backend/supabase/migrations/20261029120000_booking.sql backend/src/scripts/tests/booking_rpc_test.ts backend/package.json
git commit -m "Add booking functions and reservation refs"
```

---

### Task 2: Pure booking view helpers

**Files:**
- Create: `frontend/web-app/src/lib/booking-view.ts` (no Supabase import)
- Create: `frontend/web-app/src/lib/booking-view.test.ts`

**Interfaces:**
- Produces:
  - `type BookingStatus = "Confirmed" | "Completed" | "Cancelled"`
  - `type BookingError = "not_signed_in" | "showtime_unavailable" | "invalid_seats" | "seats_taken" | "booking_not_found" | "booking_not_cancellable" | "network"`
  - `bookingStatus(reservationStatus: string, startsAt: Date, now: Date): { status: BookingStatus; upcoming: boolean }`
  - `bookingError(message: string | undefined): BookingError`. Unknown or missing messages map to `"network"`.
  - `type SeatRef = { id: string; row: string; number: number; vip: boolean }`
  - `seatLabel(s: { row: string; number: number }): string`, for example `"E4"`.
  - `sortSeats<T extends { row: string; number: number }>(seats: T[]): T[]`: row order follows `ROW_LETTERS`, then by number.
  - `seatsFromLabels(labels: string[], seats: SeatRef[]): SeatRef[] | null`. It returns null if any label is unknown or repeated.

- [ ] **Step 1: Write the failing tests** `booking-view.test.ts`
  - `bookingStatus`:
    - `("cancelled", future)` → `{ status: "Cancelled", upcoming: false }`
    - `("confirmed", future)` → `{ "Confirmed", true }`
    - `("confirmed", past)` → `{ "Completed", false }`
    - `("completed", past)` → `{ "Completed", false }`
  - `bookingError`:
    - `"seats_taken"` → `"seats_taken"`
    - `"JWT expired"` → `"network"`
    - `undefined` → `"network"`
  - `sortSeats`: `[B2, A10, A2]` → `[A2, A10, B2]`.
  - `seatsFromLabels`:
    - `["E4","E5"]` returns the matching two seats.
    - `["E4","E4"]` → null.
    - `["Z99"]` → null.

- [ ] **Step 2: Run them to see them fail**

  Run: `cd frontend/web-app && npx tsx --test src/lib/booking-view.test.ts`
  Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Implement `booking-view.ts`.** Import `ROW_LETTERS` from `./data`.

- [ ] **Step 4: Run them to see them pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/web-app/src/lib/booking-view.ts frontend/web-app/src/lib/booking-view.test.ts
git commit -m "Add booking view helpers"
```

---

### Task 3: Booking data layer

**Files:**
- Create: `frontend/web-app/src/lib/booking.ts`
- Modify: `frontend/web-app/src/lib/catalog.ts`: export `useResource` (now module-private), unchanged otherwise.

**Interfaces:**
- Consumes: Task 1's functions and errors; Task 2's types and helpers; `useResource`, `refresh` and `retry` from `catalog.ts`; `posterUrl` and `Room` formats. Use the same `FORMATS` mapping for `room_type` and `screen_type`: export it from `catalog.ts` as `roomFormat(roomType: string, screenType: string): string`.
- Produces:
  - `type SeatMap = { seats: SeatRef[]; taken: Set<string> }`, where `taken` holds seat ids.
  - `useSeatMap(showtimeId: string, roomId: string): Resource<SeatMap>`, with key `seatmap:<showtimeId>`.
  - `useSeatsLeft(showtimeIds: string[]): Resource<Map<string, number>>`, with key `seats-left:<sorted ids joined>`.
  - `type Booking = { ref: string; showtime: string; movie: { id: string; title: string; poster: string | null }; branchName: string; city: string; room: string; format: string; startsAt: Date; date: string; start: string; end: string; price: number; total: number; status: BookingStatus; upcoming: boolean; tickets: { label: string; status: "confirmed" | "used" | "cancelled" }[] }`
    - `date` uses the "Sat 10 Oct" format, and `start` and `end` use "19:30", both in local time.
    - `tickets` is sorted with `sortSeats`.
  - `useMyBookings(): Resource<Booking[]>`, with key `bookings`, newest `reserved_at` first. One nested select from `reservation` with `showtime(starts_at, ends_at, price, movie(id, title, poster_path), room(name, room_type, screen_type, branch(name, city)))` and `ticket(status, seat(row_label, seat_number))`.
  - `bookSeats(showtimeId: string, seatIds: string[]): Promise<{ ref: string } | { error: BookingError }>`
  - `cancelBooking(ref: string): Promise<BookingError | null>`
  - Both refresh `bookings`, `seatmap:<showtime>` and `seats-left:` after success. `cancelBooking` gets the showtime from the cached booking.

- [ ] **Step 1: Implement `booking.ts` and the `catalog.ts` exports.** Use `supabase.rpc("book_seats", { p_showtime, p_seats })` and the other function names exactly as in Task 1.
- [ ] **Step 2: Verify**

  Run: `cd frontend/web-app && npx tsc --noEmit -p . && npx eslint src`
  Expected: no output.

- [ ] **Step 3: Check against the live DB with a scratch script** in the session scratchpad, not committed:
  - `useMyBookings`'s loader, run as one of Task 1's temporary users, returns their booking with the correct labels, date and status.
  - The seat map loader returns the room's seats with the correct VIP flags.

- [ ] **Step 4: Commit**

```bash
git add frontend/web-app/src/lib/booking.ts frontend/web-app/src/lib/catalog.ts
git commit -m "Add booking data layer"
```

---

### Task 4: Seat map and checkout on real data

**Files:**
- Modify: `frontend/web-app/src/components/screens/seat-selection.tsx`
- Modify: `frontend/web-app/src/components/screens/checkout.tsx`
- Modify: `frontend/web-app/src/components/showtimes.tsx` and `frontend/web-app/src/components/screens/movie-details.tsx`, for "N left" and sold out.

**Interfaces:**
- Consumes: `useSeatMap`, `useSeatsLeft`, `bookSeats` (Task 3); `seatLabel`, `seatsFromLabels`, `sortSeats` (Task 2); `showtimeById` and `useCatalog` (existing).
- `ShowtimeRow` gets a prop `left?: number`. Sold out when `left === 0`. "N left" is shown when `left <= 12`. `MovieDetails` calls `useSeatsLeft` once for the showtime ids it renders and passes `left` to each row.

- [ ] **Step 1: Seat map**
  - `SeatMap` renders rows from `seats`, grouped by `row` in `ROW_LETTERS` order, with seats 1–5, the aisle gap, then 6–10.
  - A seat is taken if `taken.has(seat.id)`, and VIP if `seat.vip`.
  - The selection holds seat labels. The checkout href stays `?seats=E4,E5`.
  - "Sold out" or "not available": when the showtime isn't in the catalogue, or every seat is taken.
- [ ] **Step 2: Checkout**
  - **Seats:** resolve them with `seatsFromLabels`. Invalid when null, empty, above `MAX_SEATS`, or any seat is taken. Keep the existing `NotFoundNote`.
  - **Confirm:** call `bookSeats` while showing the existing dialog. Remove the 1.8s timer.
  - **Success:** `router.replace(\`/tickets/${ref}?new=1\`)`.
  - **`seats_taken`:** show `NotFoundNote` titled "Those seats were just taken", linking back to `/book/<id>`. The seat map is already refreshed by `bookSeats`.
  - **Other errors:** an inline message ("Couldn't confirm your booking. Try again.") with the button enabled again.
  - **Text:** delete "Seats are held for 10 minutes."
- [ ] **Step 3: Add a test** in `booking-view.test.ts`: `seatsFromLabels(["A1","B1"], seatsOfOneRowA)` → null, covering a label for a row the room doesn't have. Run `npx tsx --test src/lib/booking-view.test.ts`. Expected: PASS.
- [ ] **Step 4: Verify**

  Run: `cd frontend/web-app && npx tsc --noEmit -p . && npx eslint src && npx next build`
  Expected: the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/web-app/src/components
git commit -m "Book seats through the database"
```

---

### Task 5: Tickets, My Tickets and cancellation; remove local bookings

**Files:**
- Modify: `frontend/web-app/src/components/screens/tickets.tsx`
- Modify: `frontend/web-app/src/app/(app)/my-tickets/page.tsx`
- Modify: `frontend/web-app/src/lib/store.ts`: remove `bookings` from `AppState`, `initial()` and `fromMockIds`, and remove `actions.addBooking`.
- Modify: `frontend/web-app/src/lib/data.ts`: remove `Booking`, `BookingStatus`, `takenSeats`, `unavailableSeats`, `seatsLeft` and `isVipSeat`, and anything else left unused.

**Interfaces:**
- Consumes: `useMyBookings`, `cancelBooking`, `Booking` (Task 3); `bookingError` (Task 2).

- [ ] **Step 1: Ticket page**
  - **Booking:** found by `ref` in `useMyBookings().data`. Show `ScreenFallback` while loading, `LoadError` on error, and the existing `NotFoundNote` when it's missing.
  - **Cards:** one per ticket.
  - **Stamp:** ticket `used` shows USED, `cancelled` shows CANCELLED. The current `Stamp` component is unchanged.
  - **Cancel booking:** for `upcoming` bookings only, a button under Download and Share. It opens the `Modal`:
    - Title: "Cancel booking?"
    - Body: "Are you sure you want to cancel this booking for *{movie title}* on {date} at {start}?"
    - Buttons: "Keep booking" and a red "Cancel booking".
  - **On success:** `say("Booking cancelled")`, and the page shows it as cancelled from the refreshed data.
  - **On error:** show "This booking can no longer be cancelled" for `booking_not_cancellable`, and "Couldn't cancel. Try again." otherwise.
- [ ] **Step 2: My Tickets**
  - Lists come from `useMyBookings()`. Upcoming is `upcoming === true`; Past is the rest.
  - Badges: CONFIRMED for upcoming. In Past, CANCELLED (tone `err`) or COMPLETED (tone `muted`).
  - Show the poster in the existing poster slot through `Poster`.
- [ ] **Step 3: Remove local bookings** from `store.ts` and `data.ts` as listed above. Old localStorage `bookings` are ignored, because `fromMockIds` no longer reads them.
- [ ] **Step 4: Verify**

  Run: `cd frontend/web-app && npx tsx --test src/lib/booking-view.test.ts && npx tsc --noEmit -p . && npx eslint src && npx next build`
  Expected: everything passes, and `grep -rn "bookings\|addBooking\|takenSeats\|isVipSeat" src` shows no leftovers outside `lib/booking.ts`.

- [ ] **Step 5: Re-run Task 1's integration test** to confirm the database side is unchanged: `cd backend && npm run -s test:booking`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/web-app/src
git commit -m "Read tickets from the database and add cancellation"
```

---

### Task 6: Manual check and PR

- [ ] **Step 1: Ask the user to try it in the browser**, using their dev server and login:
  1. Book 2 seats, and check the ticket page.
  2. Check My Tickets → Upcoming.
  3. Cancel the booking, and check that it shows as CANCELLED in Past.
  4. Check that the same seats are free on the seat map again.
- [ ] **Step 2: Push the branch** and open a PR into `main` describing the migration, the functions, the screens and the test commands.
