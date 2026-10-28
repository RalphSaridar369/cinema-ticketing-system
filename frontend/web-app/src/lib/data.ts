// Shared helpers and app-side types. The catalogue itself comes from Supabase
// (see catalog.ts); seat availability is still generated deterministically
// until bookings go through the database.

import type { Movie, Showtime } from "./catalog";

export const ROW_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXY";
export const MAX_SEATS = 10;

export type City = "Beirut" | "Jounieh" | "Tripoli";
export const CITIES: City[] = ["Beirut", "Jounieh", "Tripoli"];

// [stored value, label]. Values match profile.gender in the database.
export const GENDERS: [string, string][] = [
  ["female", "Female"],
  ["male", "Male"],
  ["unspecified", "Prefer not to say"],
];

export const money = (p: number) => "$" + p.toFixed(2);
export const genreLine = (m: Movie) => m.genres.join(" · ");

export const seatSort = (a: string[]) =>
  [...a].sort((x, y) => ROW_LETTERS.indexOf(x[0]) - ROW_LETTERS.indexOf(y[0]) || +x.slice(1) - +y.slice(1));

export type Day = { index: number; weekday: string; date: number; label: string };

export const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The booking window: today plus the next six days. Only call from client code.
export function getDays(): Day[] {
  const now = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    return { index: i, weekday: i === 0 ? "Today" : WD[d.getDay()], date: d.getDate(), label: `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}` };
  });
}

export function takenSeats(st: Showtime): Set<string> {
  const seed = [...st.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);
  const pct = st.soldOut ? 101 : st.room.kind === "vip" ? 89 : 30;
  const taken = new Set<string>();
  for (let r = 0; r < st.room.rows; r++)
    for (let i = 1; i <= 10; i++) if ((seed + r * 37 + i * 53 + r * i * 11) % 100 < pct) taken.add(ROW_LETTERS[r] + i);
  return taken;
}

// Seats taken by other customers plus any the user has already booked.
export function unavailableSeats(st: Showtime, bookings: Booking[]): Set<string> {
  const taken = takenSeats(st);
  for (const b of bookings) if (b.showtime === st.id && b.status === "Confirmed") b.seats.forEach((s) => taken.add(s));
  return taken;
}

export const seatsLeft = (st: Showtime) => st.room.rows * 10 - takenSeats(st).size;

// VIP rooms are all VIP; other rooms have a VIP block in the middle of the last two rows.
export const isVipSeat = (st: Showtime, row: number, n: number) =>
  st.room.kind === "vip" || (row >= st.room.rows - 2 && n >= 3 && n <= 8);

export type BookingStatus = "Confirmed" | "Completed" | "Cancelled";

export type Booking = {
  ref: string;
  showtime?: string;
  movie: string;
  title: string;
  branch: string;
  branchName: string;
  city: string;
  date: string;
  start: string;
  end: string;
  room: string;
  format: string;
  seats: string[];
  price: number;
  status: BookingStatus;
};

export const ticketCount = (n: number) => n + (n === 1 ? " ticket" : " tickets");
