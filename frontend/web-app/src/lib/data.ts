// Shared helpers and app-side types. The catalogue itself comes from Supabase
// (see catalog.ts), bookings and seat availability from booking.ts.

import type { Movie } from "./catalog";

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

export const ticketCount = (n: number) => n + (n === 1 ? " ticket" : " tickets");
