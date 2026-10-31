// Integration test for the payment functions (hold_seats, release_hold,
// expire_holds, create_payment, confirm_payment, expire_payment,
// cancel_booking, mark_refunded) against the live project. Stripe is faked:
// session ids and payment intents are made-up strings.
// It creates two temporary auth users and deletes them at the end; their
// reservations, tickets and payments go with them through the foreign key
// cascades.
//
// Run from backend/: npm run -s test:payment

import "dotenv/config";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// The anon key lives with the web app; SUPABASE_ANON_KEY overrides it.
function readAnonKey(): string {
  if (process.env.SUPABASE_ANON_KEY) return process.env.SUPABASE_ANON_KEY;
  const envFile = path.resolve(__dirname, "../../../../frontend/web-app/.env.local");
  const line = fs
    .readFileSync(envFile, "utf-8")
    .split("\n")
    .find((l) => l.startsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY="));
  if (!line) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY not found in frontend/web-app/.env.local");
  return line.slice("NEXT_PUBLIC_SUPABASE_ANON_KEY=".length).trim().replace(/^["']|["']$/g, "");
}

const anonKey = readAnonKey();
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

const service = createClient(supabaseUrl, serviceKey, clientOptions);
const anon = createClient(supabaseUrl, anonKey, clientOptions);

const createdUserIds: string[] = [];
let userA: SupabaseClient;
let userB: SupabaseClient;
let userAId: string;

type Showtime = { id: string; room_id: string; price: number; starts_at: string };
let showtime: Showtime;
let roomSeatIds: string[] = [];
let freeSeats: string[] = [];

// Free seats are handed out in order so tests never collide with each other.
let nextFree = 0;
function takeFreeSeats(n: number): string[] {
  const seats = freeSeats.slice(nextFree, nextFree + n);
  if (seats.length < n) throw new Error("not enough free seats on the test showtime");
  nextFree += n;
  return seats;
}

async function createUser(): Promise<{ client: SupabaseClient; id: string }> {
  const email = `payment-test-${randomUUID().slice(0, 8)}@example.com`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: "Payment", last_name: "Test" },
  });
  if (error) throw error;
  createdUserIds.push(data.user.id);

  const client = createClient(supabaseUrl, anonKey, clientOptions);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { client, id: data.user.id };
}

async function activeTicketSeats(showtimeId: string): Promise<string[]> {
  const { data, error } = await service
    .from("ticket")
    .select("seat_id")
    .eq("showtime_id", showtimeId)
    .neq("status", "cancelled");
  if (error) throw error;
  return data.map((t) => t.seat_id);
}

before(async () => {
  const a = await createUser();
  const b = await createUser();
  userA = a.client;
  userAId = a.id;
  userB = b.client;

  // An upcoming showtime a day or two out, so it can't start during the run.
  const soon = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const later = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
  const { data: upcoming, error: upcomingError } = await service
    .from("showtime")
    .select("id, room_id, price, starts_at")
    .gt("starts_at", soon)
    .lt("starts_at", later)
    .limit(1)
    .single();
  if (upcomingError) throw upcomingError;
  showtime = { ...upcoming, price: Number(upcoming.price) };

  const { data: seats, error: seatsError } = await service
    .from("seat")
    .select("id")
    .eq("room_id", showtime.room_id)
    .order("row_label")
    .order("seat_number");
  if (seatsError) throw seatsError;
  roomSeatIds = seats.map((s) => s.id);

  const taken = new Set(await activeTicketSeats(showtime.id));
  freeSeats = roomSeatIds.filter((id) => !taken.has(id));
});

// Always remove the temporary users, even when setup or a test fails.
after(async () => {
  for (const id of createdUserIds) {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) console.error(`could not delete test user ${id}: ${error.message}`);
  }
});


type Hold = { reservation_id: string; ref: string; seat_count: number; unit_price: number; released_sessions: string[] };

async function hold(client: SupabaseClient, seats: string[], showtimeId = showtime.id) {
  const { data, error } = await client.rpc("hold_seats", { p_showtime: showtimeId, p_seats: seats });
  return { hold: (data?.[0] ?? null) as Hold | null, error };
}

async function mustHold(client: SupabaseClient, seats: string[]): Promise<Hold> {
  const { hold: h, error } = await hold(client, seats);
  assert.equal(error, null);
  return h!;
}

async function createPayment(reservationId: string): Promise<string> {
  const session = `cs_test_fake_${randomUUID()}`;
  const { error } = await service.rpc("create_payment", { p_reservation: reservationId, p_session_id: session });
  assert.equal(error, null);
  return session;
}

async function confirm(session: string, intent = `pi_test_fake_${randomUUID()}`) {
  const { data, error } = await service.rpc("confirm_payment", { p_session_id: session, p_payment_intent: intent });
  assert.equal(error, null);
  return { row: data[0] as { outcome: string; payment_id: string; payment_intent: string }, intent };
}

async function readReservation(id: string) {
  const { data, error } = await service
    .from("reservation")
    .select("status, hold_expires_at, total_amount, ticket(status, seat_id)")
    .eq("id", id)
    .single();
  assert.equal(error, null);
  return data!;
}

async function readPayment(session: string) {
  const { data, error } = await service
    .from("payment")
    .select("status, amount, user_id, stripe_payment_intent_id, stripe_refund_id, paid_at, refunded_at")
    .eq("stripe_checkout_session_id", session)
    .single();
  assert.equal(error, null);
  return data!;
}

// Move a hold's deadline into the past, as if its 10 minutes had run out.
async function expireNow(reservationId: string) {
  const { error } = await service
    .from("reservation")
    .update({ hold_expires_at: new Date(Date.now() - 60 * 1000).toISOString() })
    .eq("id", reservationId);
  assert.equal(error, null);
}

async function takenSeats(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client.rpc("showtime_taken_seats", { p_showtime: showtime.id });
  assert.equal(error, null);
  return data;
}

test("hold blocks seats and creates a pending reservation", async () => {
  const seats = takeFreeSeats(2);
  const h = await mustHold(userA, seats);
  assert.equal(h.seat_count, 2);
  assert.equal(Number(h.unit_price), showtime.price);
  assert.match(h.ref, /^VLR-[2-9A-HJ-NP-Z]{6}$/);

  const reservation = await readReservation(h.reservation_id);
  assert.equal(reservation.status, "pending");
  const minutesAhead = (new Date(reservation.hold_expires_at!).getTime() - Date.now()) / 60000;
  assert.ok(minutesAhead > 9 && minutesAhead <= 10.1, `hold expires in ${minutesAhead} minutes`);
  assert.equal(Number(reservation.total_amount), 2 * showtime.price);
  assert.equal(reservation.ticket.length, 2);
  for (const t of reservation.ticket) assert.equal(t.status, "held");

  const { error } = await hold(userB, [seats[0]]);
  assert.equal(error?.message, "seats_taken");
});

test("held seats are taken for others, not for the holder", async () => {
  const seats = takeFreeSeats(2);
  await mustHold(userA, seats);

  const asB = await takenSeats(userB);
  for (const seat of seats) assert.ok(asB.includes(seat), `seat ${seat} should be taken for B`);
  const asA = await takenSeats(userA);
  for (const seat of seats) assert.ok(!asA.includes(seat), `seat ${seat} should not be taken for A`);
});

test("a new hold releases the caller's previous hold", async () => {
  const first = await mustHold(userA, takeFreeSeats(2));
  const session = await createPayment(first.reservation_id);

  const second = await mustHold(userA, takeFreeSeats(1));
  assert.ok(second.released_sessions.includes(session));

  const reservation = await readReservation(first.reservation_id);
  assert.equal(reservation.status, "expired");
  for (const t of reservation.ticket) assert.equal(t.status, "cancelled");
  assert.equal((await readPayment(session)).status, "expired");
});

test("release_hold frees seats and returns the session", async () => {
  const seats = takeFreeSeats(2);
  const h = await mustHold(userA, seats);
  const session = await createPayment(h.reservation_id);

  const { data, error } = await userA.rpc("release_hold", { p_ref: h.ref });
  assert.equal(error, null);
  assert.equal(data, session);

  const reservation = await readReservation(h.reservation_id);
  assert.equal(reservation.status, "expired");
  for (const t of reservation.ticket) assert.equal(t.status, "cancelled");
  assert.equal((await readPayment(session)).status, "expired");
  const taken = await takenSeats(userB);
  for (const seat of seats) assert.ok(!taken.includes(seat), `seat ${seat} should be free`);

  // Nothing pending any more: a no-op.
  const { data: again, error: againError } = await userA.rpc("release_hold", { p_ref: h.ref });
  assert.equal(againError, null);
  assert.equal(again, null);
});

test("release_hold ignores other users' refs", async () => {
  const h = await mustHold(userA, takeFreeSeats(1));
  const session = await createPayment(h.reservation_id);

  const { data, error } = await userB.rpc("release_hold", { p_ref: h.ref });
  assert.equal(error, null);
  assert.equal(data, null);
  assert.equal((await readReservation(h.reservation_id)).status, "pending");
  assert.equal((await readPayment(session)).status, "pending");
});

test("expire_holds expires holds past their time", async () => {
  const seats = takeFreeSeats(2);
  const h = await mustHold(userA, seats);
  await expireNow(h.reservation_id);

  const { data: count, error } = await service.rpc("expire_holds");
  assert.equal(error, null);
  assert.ok(count >= 1);

  const reservation = await readReservation(h.reservation_id);
  assert.equal(reservation.status, "expired");
  for (const t of reservation.ticket) assert.equal(t.status, "cancelled");
  const taken = await takenSeats(userB);
  for (const seat of seats) assert.ok(!taken.includes(seat), `seat ${seat} should be free`);
});

test("hold_seats expires stale holds on the showtime first", async () => {
  const seats = takeFreeSeats(1);
  const a = await mustHold(userA, seats);
  await expireNow(a.reservation_id);

  const b = await mustHold(userB, seats);
  assert.equal(b.seat_count, 1);
  assert.equal((await readReservation(a.reservation_id)).status, "expired");
  assert.equal((await readReservation(b.reservation_id)).status, "pending");
});

test("confirm_payment confirms a pending hold", async () => {
  const h = await mustHold(userA, takeFreeSeats(2));
  const session = await createPayment(h.reservation_id);

  const { row, intent } = await confirm(session);
  assert.equal(row.outcome, "confirmed");
  assert.equal(row.payment_intent, intent);

  const reservation = await readReservation(h.reservation_id);
  assert.equal(reservation.status, "confirmed");
  assert.equal(reservation.hold_expires_at, null);
  for (const t of reservation.ticket) assert.equal(t.status, "confirmed");

  const payment = await readPayment(session);
  assert.equal(payment.status, "succeeded");
  assert.equal(Number(payment.amount), Number(reservation.total_amount));
  assert.equal(payment.user_id, userAId);
  assert.equal(payment.stripe_payment_intent_id, intent);
  assert.ok(payment.paid_at);
});

test("confirm_payment is idempotent", async () => {
  const h = await mustHold(userA, takeFreeSeats(1));
  const session = await createPayment(h.reservation_id);
  const first = await confirm(session);
  const before = await readPayment(session);

  const second = await confirm(session, `pi_test_fake_${randomUUID()}`);
  assert.equal(second.row.outcome, "confirmed");
  assert.equal(second.row.payment_id, first.row.payment_id);
  assert.deepEqual(await readPayment(session), before);
  assert.equal((await readReservation(h.reservation_id)).status, "confirmed");
});

test("confirm_payment fails for an unknown session", async () => {
  const { error } = await service.rpc("confirm_payment", {
    p_session_id: `cs_test_fake_${randomUUID()}`,
    p_payment_intent: "pi_test_fake_none",
  });
  assert.equal(error?.message, "payment_not_found");
});

test("confirm after expiry needs refund", async () => {
  const h = await mustHold(userA, takeFreeSeats(1));
  const session = await createPayment(h.reservation_id);
  await expireNow(h.reservation_id);
  const { error: expireError } = await service.rpc("expire_holds");
  assert.equal(expireError, null);

  const { row, intent } = await confirm(session);
  assert.equal(row.outcome, "refund_needed");
  assert.equal(row.payment_intent, intent);
  assert.equal((await readPayment(session)).status, "refunding");
  assert.equal((await readReservation(h.reservation_id)).status, "expired");

  const again = await confirm(session);
  assert.equal(again.row.outcome, "refund_needed");

  const refundId = `re_test_fake_${randomUUID()}`;
  const { error: refundError } = await service.rpc("mark_refunded", {
    p_payment_intent: intent,
    p_refund_id: refundId,
  });
  assert.equal(refundError, null);
  const payment = await readPayment(session);
  assert.equal(payment.status, "refunded");
  assert.equal(payment.stripe_refund_id, refundId);
  assert.ok(payment.refunded_at);

  const last = await confirm(session);
  assert.equal(last.row.outcome, "refunded");
});

test("expire_payment expires a pending hold", async () => {
  const seats = takeFreeSeats(1);
  const h = await mustHold(userA, seats);
  const session = await createPayment(h.reservation_id);

  const { error } = await service.rpc("expire_payment", { p_session_id: session });
  assert.equal(error, null);
  assert.equal((await readPayment(session)).status, "expired");
  const reservation = await readReservation(h.reservation_id);
  assert.equal(reservation.status, "expired");
  for (const t of reservation.ticket) assert.equal(t.status, "cancelled");
  assert.ok(!(await takenSeats(userB)).includes(seats[0]));

  // A paid session is left alone.
  const paid = await mustHold(userA, takeFreeSeats(1));
  const paidSession = await createPayment(paid.reservation_id);
  await confirm(paidSession);
  const { error: paidError } = await service.rpc("expire_payment", { p_session_id: paidSession });
  assert.equal(paidError, null);
  assert.equal((await readPayment(paidSession)).status, "succeeded");
  assert.equal((await readReservation(paid.reservation_id)).status, "confirmed");
});

test("cancel_booking returns the paid payment and marks it refunding", async () => {
  const h = await mustHold(userA, takeFreeSeats(2));
  const session = await createPayment(h.reservation_id);
  const { row, intent } = await confirm(session);

  const { data: first, error } = await userA.rpc("cancel_booking", { p_ref: h.ref });
  assert.equal(error, null);
  assert.equal(first.length, 1);
  assert.equal(first[0].payment_id, row.payment_id);
  assert.equal(first[0].payment_intent, intent);
  assert.equal(Number(first[0].amount), 2 * showtime.price);
  assert.equal((await readPayment(session)).status, "refunding");
  assert.equal((await readReservation(h.reservation_id)).status, "cancelled");

  // Cancelling again, while the refund is outstanding, returns the same row.
  const { data: second, error: secondError } = await userA.rpc("cancel_booking", { p_ref: h.ref });
  assert.equal(secondError, null);
  assert.deepEqual(second, first);

  const { error: refundError } = await service.rpc("mark_refunded", {
    p_payment_intent: intent,
    p_refund_id: `re_test_fake_${randomUUID()}`,
  });
  assert.equal(refundError, null);
  const { error: third } = await userA.rpc("cancel_booking", { p_ref: h.ref });
  assert.equal(third?.message, "booking_not_cancellable");

  // A confirmed booking nobody paid for has nothing to refund.
  const { data: ref, error: refError } = await service.rpc("new_booking_ref");
  assert.equal(refError, null);
  const { error: insertError } = await service.from("reservation").insert({
    user_id: userAId,
    showtime_id: showtime.id,
    reserved_at: new Date().toISOString(),
    party_size: 1,
    status: "confirmed",
    total_amount: showtime.price,
    ref,
  });
  assert.equal(insertError, null);
  const { data: unpaid, error: unpaidError } = await userA.rpc("cancel_booking", { p_ref: ref });
  assert.equal(unpaidError, null);
  assert.deepEqual(unpaid, []);
});

test("users can't call service functions", async () => {
  const calls: [string, Record<string, unknown>][] = [
    ["create_payment", { p_reservation: randomUUID(), p_session_id: "cs_test_fake_x" }],
    ["confirm_payment", { p_session_id: "cs_test_fake_x", p_payment_intent: "pi_test_fake_x" }],
    ["expire_payment", { p_session_id: "cs_test_fake_x" }],
    ["mark_refunded", { p_payment_intent: "pi_test_fake_x", p_refund_id: "re_test_fake_x" }],
    ["expire_holds", {}],
  ];
  for (const [name, args] of calls) {
    const { error } = await userA.rpc(name, args);
    assert.ok(error, `${name} should fail for a signed-in user`);
    assert.match(error.message, /permission denied/, name);
  }
});

test("users read only their own payments", async () => {
  const h = await mustHold(userA, takeFreeSeats(1));
  const session = await createPayment(h.reservation_id);

  const { data: own, error } = await userA.from("payment").select("id").eq("stripe_checkout_session_id", session);
  assert.equal(error, null);
  assert.equal(own!.length, 1);

  const { data, error: otherError } = await userB.from("payment").select("id");
  assert.equal(otherError, null);
  assert.deepEqual(data, []);
});
