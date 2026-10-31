import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingStatus, bookingVisible, bookingError, sortSeats, seatsFromLabels, seatLabel, type SeatRef } from "./booking-view";

const now = new Date("2026-06-01T12:00:00Z");
const future = new Date("2026-06-02T12:00:00Z");
const past = new Date("2026-05-31T12:00:00Z");

test("bookingStatus", () => {
  assert.deepEqual(bookingStatus("cancelled", future, now), { status: "Cancelled", upcoming: false });
  assert.deepEqual(bookingStatus("confirmed", future, now), { status: "Confirmed", upcoming: true });
  assert.deepEqual(bookingStatus("confirmed", past, now), { status: "Completed", upcoming: false });
  assert.deepEqual(bookingStatus("completed", past, now), { status: "Completed", upcoming: false });
  assert.deepEqual(bookingStatus("expired", future, now), { status: "Refunded", upcoming: false });
});

test("bookingVisible", () => {
  assert.equal(bookingVisible("pending", null), false);
  assert.equal(bookingVisible("expired", null), false);
  assert.equal(bookingVisible("expired", "expired"), false);
  assert.equal(bookingVisible("expired", "refunded"), true);
  assert.equal(bookingVisible("expired", "refunding"), true);
  assert.equal(bookingVisible("confirmed", null), true);
  assert.equal(bookingVisible("cancelled", "refunded"), true);
});

test("bookingError", () => {
  assert.equal(bookingError("seats_taken"), "seats_taken");
  assert.equal(bookingError("refund_pending"), "refund_pending");
  assert.equal(bookingError("hold_expired"), "hold_expired");
  assert.equal(bookingError("JWT expired"), "network");
  assert.equal(bookingError(undefined), "network");
});

test("sortSeats", () => {
  const s = [{ row: "B", number: 2 }, { row: "A", number: 10 }, { row: "A", number: 2 }];
  assert.deepEqual(sortSeats(s).map(seatLabel), ["A2", "A10", "B2"]);
});

test("seatsFromLabels", () => {
  const seats: SeatRef[] = [
    { id: "1", row: "E", number: 4, vip: false },
    { id: "2", row: "E", number: 5, vip: true },
    { id: "3", row: "E", number: 6, vip: false },
  ];
  assert.deepEqual(seatsFromLabels(["E4", "E5"], seats), [seats[0], seats[1]]);
  assert.equal(seatsFromLabels(["E4", "E4"], seats), null);
  assert.equal(seatsFromLabels(["Z99"], seats), null);
  // A label for a row the room doesn't have.
  assert.equal(seatsFromLabels(["A1", "B1"], [{ id: "a1", row: "A", number: 1, vip: false }]), null);
});
