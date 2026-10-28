// Pure helpers for bookings (no Supabase) so they can be unit tested.

import { ROW_LETTERS } from "./data";

export type BookingStatus = "Confirmed" | "Completed" | "Cancelled";

export type BookingError =
  | "not_signed_in"
  | "showtime_unavailable"
  | "invalid_seats"
  | "seats_taken"
  | "booking_not_found"
  | "booking_not_cancellable"
  | "network";

export type SeatRef = { id: string; row: string; number: number; vip: boolean };

// A confirmed booking whose showtime has passed reads as completed.
export const bookingStatus = (
  reservationStatus: string,
  startsAt: Date,
  now: Date,
): { status: BookingStatus; upcoming: boolean } => {
  if (reservationStatus === "cancelled") return { status: "Cancelled", upcoming: false };
  const upcoming = reservationStatus === "confirmed" && startsAt.getTime() > now.getTime();
  return { status: upcoming ? "Confirmed" : "Completed", upcoming };
};

// Messages raised by the database functions; anything else is a network problem.
const ERRORS: BookingError[] = [
  "not_signed_in",
  "showtime_unavailable",
  "invalid_seats",
  "seats_taken",
  "booking_not_found",
  "booking_not_cancellable",
];

export const bookingError = (message: string | undefined): BookingError =>
  ERRORS.find((e) => e === message) ?? "network";

export const seatLabel = (s: { row: string; number: number }) => `${s.row}${s.number}`;

export const sortSeats = <T extends { row: string; number: number }>(seats: T[]): T[] =>
  [...seats].sort((a, b) => ROW_LETTERS.indexOf(a.row) - ROW_LETTERS.indexOf(b.row) || a.number - b.number);

// Resolves labels like "E4" to seats; null if any is unknown or repeated.
export const seatsFromLabels = (labels: string[], seats: SeatRef[]): SeatRef[] | null => {
  if (new Set(labels).size !== labels.length) return null;
  const byLabel = new Map(seats.map((s) => [seatLabel(s), s]));
  const found = labels.map((l) => byLabel.get(l));
  return found.every((s): s is SeatRef => !!s) ? found : null;
};
