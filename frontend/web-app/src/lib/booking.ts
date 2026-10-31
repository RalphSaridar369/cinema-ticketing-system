import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingError, bookingStatus, bookingVisible, seatLabel, sortSeats } from "./booking-view";
import type { BookingError, BookingStatus, SeatRef } from "./booking-view";
import { clock, refresh, roomFormat, useResource } from "./catalog";
import type { Resource } from "./catalog";
import { MO, WD } from "./data";
import { getState } from "./store";
import { supabase } from "./supabase";

// Seat maps, bookings and the booking actions, backed by the database functions
// the /api payment routes, showtime_taken_seats and showtime_seats_left.

export type SeatMap = { seats: SeatRef[]; taken: Set<string> };

// `movie.poster` is a TMDB path, like Movie.poster; render it with Poster.
export type Booking = {
  ref: string;
  showtime: string;
  movie: { id: string; title: string; poster: string | null };
  branchName: string;
  city: string;
  room: string;
  format: string;
  startsAt: Date;
  date: string;
  start: string;
  end: string;
  price: number;
  total: number;
  // Amount paid by card, once a payment succeeded (also after a refund).
  paid: number | null;
  refund: "refunding" | "refunded" | null;
  status: BookingStatus;
  upcoming: boolean;
  tickets: { label: string; status: "held" | "confirmed" | "used" | "cancelled" }[];
};

export const bookingsKey = (userId: string) => `bookings:${userId}`;
export const seatMapKey = (showtimeId: string) => `seatmap:${showtimeId}`;
// Showtime of each loaded booking, so cancelling can refresh its seat map.
const showtimeOf = new Map<string, string>();
const SEATS_LEFT = "seats-left:";

function check<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

type SeatRow = { id: string; row_label: string; seat_number: number; seat_type: string };

export async function loadSeatMap(showtimeId: string, roomId: string, db: SupabaseClient = supabase): Promise<SeatMap> {
  const [seats, taken] = await Promise.all([
    db.from("seat").select("id, row_label, seat_number, seat_type").eq("room_id", roomId).then(check),
    db.rpc("showtime_taken_seats", { p_showtime: showtimeId }).then(check),
  ]);
  return {
    seats: sortSeats(
      (seats as SeatRow[]).map((s) => ({ id: s.id, row: s.row_label, number: s.seat_number, vip: s.seat_type === "vip" })),
    ),
    taken: new Set(taken as string[]),
  };
}

async function loadSeatsLeft(showtimeIds: string[]): Promise<Map<string, number>> {
  if (!showtimeIds.length) return new Map();
  const rows = check(await supabase.rpc("showtime_seats_left", { p_showtimes: showtimeIds })) as { showtime_id: string; seats_left: number }[];
  return new Map(rows.map((r) => [r.showtime_id, Number(r.seats_left)]));
}

const BOOKING_SELECT =
  "ref, showtime_id, status, total_amount, showtime(starts_at, ends_at, price, movie(id, title, poster_path), room(name, room_type, screen_type, branch(name, city))), ticket(status, seat(row_label, seat_number)), payment(status, amount)";

type BookingRow = {
  ref: string;
  showtime_id: string;
  status: string;
  total_amount: number;
  showtime: {
    starts_at: string;
    ends_at: string;
    price: number;
    movie: { id: string; title: string; poster_path: string | null };
    room: { name: string; room_type: string; screen_type: string; branch: { name: string; city: string } };
  };
  ticket: { status: Booking["tickets"][number]["status"]; seat: { row_label: string; seat_number: number } }[];
  payment: { status: string; amount: number }[];
};

// The payment that actually took money, if any.
const paidPayment = (r: BookingRow) =>
  r.payment.find((p) => p.status === "succeeded" || p.status === "refunding" || p.status === "refunded");

export function toBooking(r: BookingRow, now = new Date()): Booking {
  const st = r.showtime;
  const paid = paidPayment(r);
  const startsAt = new Date(st.starts_at);
  return {
    ref: r.ref,
    showtime: r.showtime_id,
    movie: { id: st.movie.id, title: st.movie.title, poster: st.movie.poster_path },
    branchName: st.room.branch.name,
    city: st.room.branch.city,
    room: st.room.name,
    format: roomFormat(st.room.room_type, st.room.screen_type),
    startsAt,
    date: `${WD[startsAt.getDay()]} ${startsAt.getDate()} ${MO[startsAt.getMonth()]}`,
    start: clock(startsAt),
    end: clock(new Date(st.ends_at)),
    price: Number(st.price),
    total: Number(r.total_amount),
    paid: paid ? Number(paid.amount) : null,
    refund: paid?.status === "refunding" || paid?.status === "refunded" ? paid.status : null,
    ...bookingStatus(r.status, startsAt, now),
    tickets: sortSeats(
      r.ticket.map((t) => ({ row: t.seat.row_label, number: t.seat.seat_number, status: t.status })),
    ).map((t) => ({ label: seatLabel(t), status: t.status })),
  };
}

// Filtered by user so a reload under another session returns [] rather than that session's rows.
export async function loadMyBookings(userId: string, db: SupabaseClient = supabase): Promise<Booking[]> {
  const rows = check(
    await db.from("reservation").select(BOOKING_SELECT).eq("user_id", userId).order("reserved_at", { ascending: false }),
  ) as unknown as BookingRow[];
  const now = new Date();
  const bookings = rows
    .filter((r) => bookingVisible(r.status, (paidPayment(r) ?? r.payment[0])?.status ?? null))
    .map((r) => toBooking(r, now));
  for (const b of bookings) showtimeOf.set(b.ref, b.showtime);
  return bookings;
}

export const useSeatMap = (showtimeId: string, roomId: string): Resource<SeatMap> =>
  useResource(seatMapKey(showtimeId), () => loadSeatMap(showtimeId, roomId));

export const useSeatsLeft = (showtimeIds: string[]): Resource<Map<string, number>> => {
  const ids = [...showtimeIds].sort();
  return useResource(SEATS_LEFT + ids.join(","), () => loadSeatsLeft(ids));
};

// Keyed by user so a second sign-in in the same page session never sees the first user's bookings.
export const useMyBookings = (userId: string | null): Resource<Booking[]> =>
  useResource(userId && bookingsKey(userId), () => loadMyBookings(userId!));

// Only the signed-in user's bookings are reloaded.
const refreshBookings = () => {
  const { userId } = getState();
  return userId ? refresh(bookingsKey(userId)) : Promise.resolve();
};

async function refreshAfterBooking(showtimeId: string) {
  await Promise.all([refreshBookings(), refresh(seatMapKey(showtimeId)), refresh(SEATS_LEFT)]);
}

type ApiResult = Record<string, unknown>;

// Posts to a payment route as the signed-in user; errors come back as { error }.
async function postApi(path: string, body: unknown): Promise<ApiResult> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return { error: "not_signed_in" };
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) return { error: bookingError(typeof data?.error === "string" ? data.error : undefined) };
    return data ?? {};
  } catch {
    return { error: "network" };
  }
}

const errorOf = (r: ApiResult): BookingError | null => ("error" in r ? (r.error as BookingError) : null);

// Holds the seats and returns the Stripe Checkout URL.
export async function startCheckout(showtimeId: string, seatIds: string[]): Promise<{ url: string } | { error: BookingError }> {
  const res = await postApi("/api/checkout", { showtimeId, seatIds });
  const error = errorOf(res);
  if (error) {
    // Someone else got there first: the cached map is stale.
    if (error === "seats_taken") await Promise.all([refresh(seatMapKey(showtimeId)), refresh(SEATS_LEFT)]);
    return { error };
  }
  return typeof res.url === "string" ? { url: res.url } : { error: "network" };
}

// Gives the held seats back after the user leaves Stripe.
export async function releaseCheckout(ref: string): Promise<void> {
  await postApi("/api/checkout/release", { ref });
}

// Asks for the outcome of a paid session, then reloads whatever it changed.
export async function confirmCheckout(sessionId: string): Promise<"confirmed" | "refunded" | "pending" | "error"> {
  const res = await postApi("/api/checkout/confirm", { sessionId });
  if (errorOf(res)) return "error";
  const outcome = res.outcome;
  if (outcome !== "confirmed" && outcome !== "refunded" && outcome !== "pending") return "error";
  await Promise.all([refreshBookings(), refresh("seatmap:"), refresh(SEATS_LEFT)]);
  return outcome;
}

// Resolves once the refreshed bookings and seat maps have landed.
export async function cancelBooking(ref: string): Promise<{ refunded: number | null } | { error: BookingError }> {
  const res = await postApi("/api/bookings/cancel", { ref });
  const error = errorOf(res);
  const showtime = showtimeOf.get(ref);
  if (error) {
    // Already cancelled or started: the cached booking is stale. A pending refund means it is cancelled.
    if (error === "booking_not_cancellable" || error === "refund_pending") await refreshBookings();
    if (error === "refund_pending" && showtime) await Promise.all([refresh(seatMapKey(showtime)), refresh(SEATS_LEFT)]);
    return { error };
  }
  if (showtime) await refreshAfterBooking(showtime);
  else await Promise.all([refreshBookings(), refresh("seatmap:"), refresh(SEATS_LEFT)]);
  return { refunded: typeof res.refunded === "number" ? res.refunded : null };
}
