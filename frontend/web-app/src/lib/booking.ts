import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingError, bookingStatus, seatLabel, sortSeats } from "./booking-view";
import type { BookingError, BookingStatus, SeatRef } from "./booking-view";
import { clock, refresh, roomFormat, useResource } from "./catalog";
import type { Resource } from "./catalog";
import { MO, WD } from "./data";
import { getState } from "./store";
import { supabase } from "./supabase";

// Seat maps, bookings and the booking actions, backed by the database functions
// book_seats, cancel_booking, showtime_taken_seats and showtime_seats_left.

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
  status: BookingStatus;
  upcoming: boolean;
  tickets: { label: string; status: "confirmed" | "used" | "cancelled" }[];
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
  "ref, showtime_id, status, total_amount, showtime(starts_at, ends_at, price, movie(id, title, poster_path), room(name, room_type, screen_type, branch(name, city))), ticket(status, seat(row_label, seat_number))";

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
};

export function toBooking(r: BookingRow, now = new Date()): Booking {
  const st = r.showtime;
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
  const bookings = rows.map((r) => toBooking(r, now));
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

// Resolves once the refreshed data has landed.
export async function bookSeats(showtimeId: string, seatIds: string[]): Promise<{ ref: string } | { error: BookingError }> {
  try {
    const { data, error } = await supabase.rpc("book_seats", { p_showtime: showtimeId, p_seats: seatIds });
    if (error) {
      const code = bookingError(error.message);
      // Someone else got there first: the cached map is stale.
      if (code === "seats_taken") await Promise.all([refresh(seatMapKey(showtimeId)), refresh(SEATS_LEFT)]);
      return { error: code };
    }
    await refreshAfterBooking(showtimeId);
    return { ref: data as string };
  } catch {
    return { error: "network" };
  }
}

// Resolves once the refreshed bookings and seat maps have landed.
export async function cancelBooking(ref: string): Promise<BookingError | null> {
  try {
    const { error } = await supabase.rpc("cancel_booking", { p_ref: ref });
    if (error) {
      const code = bookingError(error.message);
      // Already cancelled or started: the cached booking is stale.
      if (code === "booking_not_cancellable") await refreshBookings();
      return code;
    }
    const showtime = showtimeOf.get(ref);
    if (showtime) await refreshAfterBooking(showtime);
    else await Promise.all([refreshBookings(), refresh("seatmap:"), refresh(SEATS_LEFT)]);
    return null;
  } catch {
    return "network";
  }
}
