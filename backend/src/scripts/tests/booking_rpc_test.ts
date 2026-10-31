// Integration test for the booking functions (hold_seats, cancel_booking,
// showtime_taken_seats, showtime_seats_left) against the live project.
// Bookings are made the way the web app does it: hold the seats, then confirm
// a fake Stripe payment as the service client.
// It creates two temporary auth users and deletes them at the end; their
// reservations and tickets go with them through the foreign key cascades.
//
// Run from backend/: npm run -s test:booking

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
let pastShowtime: Showtime;
let roomSeatIds: string[] = [];
let freeSeats: string[] = [];
let otherRoomSeatId: string;
let pastShowtimeSeatId: string;

// Free seats are handed out in order so tests never collide with each other.
let nextFree = 0;
function takeFreeSeats(n: number): string[] {
  const seats = freeSeats.slice(nextFree, nextFree + n);
  if (seats.length < n) throw new Error("not enough free seats on the test showtime");
  nextFree += n;
  return seats;
}

async function createUser(): Promise<{ client: SupabaseClient; id: string }> {
  const email = `booking-test-${randomUUID().slice(0, 8)}@example.com`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: "Booking", last_name: "Test" },
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

async function reservationCount(client: SupabaseClient): Promise<number> {
  const { count, error } = await client
    .from("reservation")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

// Holds the seats, then confirms a fake paid session; resolves with the ref.
// The payment intent of the fake payment is returned for refund tests.
async function book(client: SupabaseClient, seats: string[], showtimeId = showtime.id) {
  const held = await client.rpc("hold_seats", { p_showtime: showtimeId, p_seats: seats });
  if (held.error) return { data: null, error: held.error, paymentIntent: null };
  const { reservation_id, ref } = held.data[0];

  const session = `cs_test_fake_${randomUUID()}`;
  const paymentIntent = `pi_test_fake_${randomUUID()}`;
  const created = await service.rpc("create_payment", { p_reservation: reservation_id, p_session_id: session });
  if (created.error) throw created.error;
  const confirmed = await service.rpc("confirm_payment", { p_session_id: session, p_payment_intent: paymentIntent });
  if (confirmed.error) throw confirmed.error;
  assert.equal(confirmed.data[0].outcome, "confirmed");
  return { data: ref as string, error: null, paymentIntent };
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

  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: past, error: pastError } = await service
    .from("showtime")
    .select("id, room_id, price, starts_at")
    .gt("starts_at", yesterday)
    .lt("starts_at", new Date().toISOString())
    .limit(1)
    .single();
  if (pastError) throw pastError;
  pastShowtime = { ...past, price: Number(past.price) };

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

  const { data: other, error: otherError } = await service
    .from("seat")
    .select("id")
    .neq("room_id", showtime.room_id)
    .limit(1)
    .single();
  if (otherError) throw otherError;
  otherRoomSeatId = other.id;

  const { data: pastSeat, error: pastSeatError } = await service
    .from("seat")
    .select("id")
    .eq("room_id", pastShowtime.room_id)
    .limit(1)
    .single();
  if (pastSeatError) throw pastSeatError;
  pastShowtimeSeatId = pastSeat.id;
});

// Always remove the temporary users, even when setup or a test fails.
after(async () => {
  for (const id of createdUserIds) {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) console.error(`could not delete test user ${id}: ${error.message}`);
  }
});

test("books seats and returns a ref", async () => {
  const seats = takeFreeSeats(2);
  const { data: ref, error } = await book(userA, seats);
  assert.equal(error, null);
  assert.match(ref, /^VLR-[2-9A-HJ-NP-Z]{6}$/);

  const { data: rows, error: readError } = await userA
    .from("reservation")
    .select("status, party_size, total_amount, ticket(price, status, seat_id)")
    .eq("ref", ref);
  assert.equal(readError, null);
  assert.equal(rows!.length, 1);
  const reservation = rows![0];
  assert.equal(reservation.status, "confirmed");
  assert.equal(reservation.party_size, 2);
  assert.equal(Number(reservation.total_amount), 2 * showtime.price);
  assert.equal(reservation.ticket.length, 2);
  for (const t of reservation.ticket) {
    assert.equal(Number(t.price), showtime.price);
    assert.equal(t.status, "confirmed");
  }
  assert.deepEqual(reservation.ticket.map((t) => t.seat_id).sort(), [...seats].sort());
});

test("taken seats and seats left", async () => {
  const seats = takeFreeSeats(2);
  const { error } = await book(userA, seats);
  assert.equal(error, null);

  const { data: taken, error: takenError } = await anon.rpc("showtime_taken_seats", {
    p_showtime: showtime.id,
  });
  assert.equal(takenError, null);
  for (const seat of seats) assert.ok(taken.includes(seat), `seat ${seat} should be taken`);

  const { data: left, error: leftError } = await anon.rpc("showtime_seats_left", {
    p_showtimes: [showtime.id],
  });
  assert.equal(leftError, null);
  const active = await activeTicketSeats(showtime.id);
  assert.deepEqual(left, [{ showtime_id: showtime.id, seats_left: roomSeatIds.length - active.length }]);
});

test("concurrent bookings of one seat", async () => {
  const seats = takeFreeSeats(1);
  const results = await Promise.all([book(userA, seats), book(userB, seats)]);
  const ok = results.filter((r) => r.error === null);
  const failed = results.filter((r) => r.error !== null);
  assert.equal(ok.length, 1);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].error!.message, "seats_taken");
});

test("rejects invalid seat lists", async () => {
  const before = await reservationCount(userA);
  const free = freeSeats.slice(nextFree);
  const elevenSeats = roomSeatIds.slice(0, 11);
  assert.equal(elevenSeats.length, 11);

  const cases: [string, string[]][] = [
    ["empty", []],
    ["eleven seats", elevenSeats],
    ["repeated seat", [free[0], free[0]]],
    ["seat from another room", [free[0], otherRoomSeatId]],
  ];
  for (const [label, seats] of cases) {
    const { error } = await book(userA, seats);
    assert.equal(error?.message, "invalid_seats", label);
  }
  assert.equal(await reservationCount(userA), before);
});

test("rejects past showtime", async () => {
  const { error } = await book(userA, [pastShowtimeSeatId], pastShowtime.id);
  assert.equal(error?.message, "showtime_unavailable");
});

test("other users can't read or cancel", async () => {
  const { data: refA, error } = await book(userA, takeFreeSeats(1));
  assert.equal(error, null);

  const { data: rows, error: readError } = await userB.from("reservation").select("id").eq("ref", refA);
  assert.equal(readError, null);
  assert.equal(rows!.length, 0);

  const { error: cancelError } = await userB.rpc("cancel_booking", { p_ref: refA });
  assert.equal(cancelError?.message, "booking_not_found");
});

test("cancel frees seats", async () => {
  const seats = takeFreeSeats(2);
  const { data: ref, error } = await book(userA, seats);
  assert.equal(error, null);

  const { error: cancelError } = await userA.rpc("cancel_booking", { p_ref: ref });
  assert.equal(cancelError, null);

  const { data: rows } = await userA
    .from("reservation")
    .select("status, ticket(status)")
    .eq("ref", ref);
  assert.equal(rows![0].status, "cancelled");
  assert.equal(rows![0].ticket.length, 2);
  for (const t of rows![0].ticket) assert.equal(t.status, "cancelled");

  const { data: taken } = await anon.rpc("showtime_taken_seats", { p_showtime: showtime.id });
  for (const seat of seats) assert.ok(!taken.includes(seat), `seat ${seat} should be free`);

  const { data: again, error: againError } = await book(userA, seats);
  assert.equal(againError, null);
  assert.match(again, /^VLR-[2-9A-HJ-NP-Z]{6}$/);
});

test("cancel rules", async () => {
  const { data: ref, error, paymentIntent } = await book(userA, takeFreeSeats(1));
  assert.equal(error, null);
  const { error: first } = await userA.rpc("cancel_booking", { p_ref: ref });
  assert.equal(first, null);
  // Once the refund is done there is nothing left to cancel.
  const { error: refundError } = await service.rpc("mark_refunded", {
    p_payment_intent: paymentIntent,
    p_refund_id: `re_test_fake_${randomUUID()}`,
  });
  assert.equal(refundError, null);
  const { error: second } = await userA.rpc("cancel_booking", { p_ref: ref });
  assert.equal(second?.message, "booking_not_cancellable");

  // A confirmed booking whose showtime has already started.
  const { data: pastRef, error: refError } = await service.rpc("new_booking_ref");
  assert.equal(refError, null);
  const { error: insertError } = await service.from("reservation").insert({
    user_id: userAId,
    showtime_id: pastShowtime.id,
    reserved_at: new Date().toISOString(),
    party_size: 1,
    status: "confirmed",
    total_amount: pastShowtime.price,
    ref: pastRef,
  });
  assert.equal(insertError, null);
  const { error: lateError } = await userA.rpc("cancel_booking", { p_ref: pastRef });
  assert.equal(lateError?.message, "booking_not_cancellable");
});

test("signed out", async () => {
  const { error } = await anon.rpc("hold_seats", {
    p_showtime: showtime.id,
    p_seats: [freeSeats[freeSeats.length - 1]],
  });
  assert.ok(error, "anon should not be able to call hold_seats");
  assert.match(error.message, /permission denied/);
});
