// Mock catalogue ported from the Velour prototype. Showtimes and seat
// availability are generated deterministically so every screen is reproducible.

export const ROW_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXY";
export const MAX_SEATS = 10;

export type City = "Beirut" | "Jounieh" | "Tripoli";
export const CITIES: City[] = ["Beirut", "Jounieh", "Tripoli"];

export type Branch = {
  id: number;
  slug: string;
  name: string;
  city: City;
  addr: string;
  phone: string;
};

export const BRANCHES: Branch[] = [
  { id: 0, slug: "hamra", name: "Hamra", city: "Beirut", addr: "Hamra St., Saroulla Bldg", phone: "+961 1 345 678" },
  { id: 1, slug: "verdun", name: "Verdun", city: "Beirut", addr: "Rashid Karami St., Verdun 730", phone: "+961 1 789 012" },
  { id: 2, slug: "achrafieh", name: "Achrafieh", city: "Beirut", addr: "Sassine Square, Level 2", phone: "+961 1 456 789" },
  { id: 3, slug: "kaslik", name: "Kaslik", city: "Jounieh", addr: "Kaslik Main Rd., Marina Center", phone: "+961 9 234 567" },
  { id: 4, slug: "mina", name: "Mina", city: "Tripoli", addr: "Port Rd., El Mina", phone: "+961 6 345 210" },
];

export type Movie = {
  id: number;
  slug: string;
  title: string;
  original: string;
  lang: string;
  genres: string[];
  rating: number;
  votes: string;
  adult: boolean;
  released: string;
  runtime: number;
  overview: string;
};

export const MOVIES: Movie[] = [
  { id: 0, slug: "iron-coast", title: "Iron Coast", original: "Côte de Fer", lang: "French", genres: ["Action", "Sci-Fi"], rating: 7.9, votes: "12,480", adult: true, released: "9 Oct 2026", runtime: 128, overview: "When a storm knocks out every lighthouse on the Atlantic coast, a disgraced harbour pilot has one night to guide a stranded convoy home through waters that no longer match any chart." },
  { id: 1, slug: "the-long-night", title: "The Long Night", original: "The Long Night", lang: "English", genres: ["Drama", "Thriller"], rating: 8.1, votes: "8,902", adult: true, released: "25 Sep 2026", runtime: 141, overview: "A night-shift nurse begins to suspect that the quiet patient in room 14 knows more about the city’s blackouts than anyone else." },
  { id: 2, slug: "paper-moons", title: "Paper Moons", original: "Lunes de Papier", lang: "French", genres: ["Romance", "Comedy"], rating: 7.4, votes: "5,311", adult: false, released: "2 Oct 2026", runtime: 112, overview: "Two rival stationery shop owners in Lyon are forced to share a window display for one Christmas season." },
  { id: 3, slug: "small-wonders", title: "Small Wonders", original: "Small Wonders", lang: "English", genres: ["Animation", "Family"], rating: 8.4, votes: "21,067", adult: false, released: "16 Oct 2026", runtime: 94, overview: "A tiny clockwork mouse sets out across a sleeping toy shop to wind up the old clock before morning." },
  { id: 4, slug: "blue-hour", title: "Blue Hour", original: "L’Heure Bleue", lang: "French", genres: ["Mystery", "Drama"], rating: 6.8, votes: "3,140", adult: false, released: "18 Sep 2026", runtime: 106, overview: "A photographer finds the same stranger in the background of every picture she took the summer her brother disappeared." },
  { id: 5, slug: "northbound", title: "Northbound", original: "Northbound", lang: "English", genres: ["Adventure"], rating: 7.2, votes: "6,725", adult: false, released: "11 Sep 2026", runtime: 118, overview: "Three estranged sisters drive their late father’s truck from Texas to the Arctic Circle to scatter his ashes." },
  { id: 6, slug: "ashes-of-byblos", title: "Ashes of Byblos", original: "رماد جبيل", lang: "Arabic", genres: ["Drama", "History"], rating: 7.7, votes: "4,208", adult: false, released: "1 Oct 2026", runtime: 131, overview: "A fisherman’s son and a merchant’s daughter are caught on opposite sides as an ancient port city rebuilds after a great fire." },
];

export const GENRES = ["All", "Action", "Drama", "Comedy", "Romance", "Thriller", "Animation", "Mystery", "Adventure", "History"];
export const RECOMMENDED = [0, 3, 1, 6, 2, 5];
export const POPULAR = [3, 1, 0, 6, 5, 2, 4];

export type RoomKey = "r2d" | "r3d" | "vip" | "imax";
export type Room = { name: string; format: string; rows: number; price: number };

export const ROOMS: Record<RoomKey, Room> = {
  r2d: { name: "Hall 1", format: "Standard 2D", rows: 12, price: 8 },
  r3d: { name: "Hall 2", format: "Standard 3D", rows: 14, price: 10 },
  vip: { name: "VIP Lounge", format: "VIP", rows: 8, price: 18 },
  imax: { name: "IMAX Hall", format: "IMAX", rows: 25, price: 12 },
};

const SLOTS: [string, RoomKey][] = [
  ["12:15", "r2d"], ["14:30", "r2d"], ["16:00", "vip"], ["17:45", "r3d"], ["19:30", "imax"], ["21:15", "imax"], ["22:30", "r2d"],
];

// Which movies each branch is screening, indexed by branch id.
const AT_BRANCH = [[0, 1, 2, 3, 4, 6], [0, 1, 3, 5], [0, 2, 3, 4, 6], [0, 3, 5, 6], [1, 3, 5]];

export const branchBySlug = (slug: string) => BRANCHES.find((b) => b.slug === slug);
export const movieBySlug = (slug: string) => MOVIES.find((m) => m.slug === slug);

export const plays = (branch: number | null, movie: number) => branch == null || AT_BRANCH[branch].includes(movie);

export const money = (p: number) => "$" + p.toFixed(2);
export const runtime = (m: number) => Math.floor(m / 60) + "h " + String(m % 60).padStart(2, "0") + "m";
export const genreLine = (m: Movie) => m.genres.join(" · ");

const addMinutes = (t: string, m: number) => {
  const [h, mm] = t.split(":").map(Number);
  const x = (h * 60 + mm + m) % 1440;
  return String(Math.floor(x / 60)).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0");
};

export const seatSort = (a: string[]) =>
  [...a].sort((x, y) => ROW_LETTERS.indexOf(x[0]) - ROW_LETTERS.indexOf(y[0]) || +x.slice(1) - +y.slice(1));

export type Day = { index: number; weekday: string; date: number; label: string };

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The booking window: today plus the next six days. Only call from client code.
export function getDays(): Day[] {
  const now = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    return { index: i, weekday: i === 0 ? "Today" : WD[d.getDay()], date: d.getDate(), label: `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}` };
  });
}

export type Showtime = {
  id: string;
  branch: number;
  movie: number;
  day: number;
  start: string;
  end: string;
  roomKey: RoomKey;
  room: Room;
  soldOut: boolean;
};

export function showtimes(branch: number, movie: number, day: number): Showtime[] {
  if (!plays(branch, movie) || (movie === 4 && day === 1)) return [];
  let idx: number[];
  if (movie === 0) idx = [1, 2, 3, 5];
  else {
    idx = SLOTS.map((_, i) => i).filter((i) => (branch * 3 + movie * 5 + day * 7 + i * 2) % 5 < 2);
    if (!idx.length) idx = [(branch + movie + day) % 7];
    idx = idx.slice(0, 4);
  }
  return idx.map((i) => {
    const [start, roomKey] = SLOTS[i];
    return {
      id: `${branch}-${movie}-${day}-${i}`,
      branch,
      movie,
      day,
      start,
      end: addMinutes(start, MOVIES[movie].runtime),
      roomKey,
      room: ROOMS[roomKey],
      soldOut: movie === 0 && day === 0 && start === "17:45",
    };
  });
}

export function showtimeById(id: string): Showtime | null {
  const parts = id.split("-").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0)) return null;
  const [b, m, d] = parts;
  if (!BRANCHES[b] || !MOVIES[m] || d > 6) return null;
  return showtimes(b, m, d).find((s) => s.id === id) ?? null;
}

export function takenSeats(st: Showtime): Set<string> {
  const seed = [...st.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);
  const pct = st.soldOut ? 101 : st.roomKey === "vip" ? 89 : 30;
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
  st.roomKey === "vip" || (row >= st.room.rows - 2 && n >= 3 && n <= 8);

export type BookingStatus = "Confirmed" | "Completed" | "Cancelled";

export type Booking = {
  ref: string;
  showtime?: string;
  movie: number;
  branch: number;
  date: string;
  start: string;
  end: string;
  roomKey: RoomKey;
  seats: string[];
  price: number;
  status: BookingStatus;
};

export const PAST_BOOKINGS: Booking[] = [
  { ref: "VLR-2B8QX", movie: 1, branch: 1, date: "Sat 10 Oct", start: "19:00", end: "21:21", roomKey: "r2d", seats: ["E4", "E5"], price: 8, status: "Completed" },
  { ref: "VLR-9K1LP", movie: 2, branch: 0, date: "Sat 3 Oct", start: "16:00", end: "17:52", roomKey: "vip", seats: ["B7"], price: 18, status: "Cancelled" },
];

export const ticketCount = (n: number) => n + (n === 1 ? " ticket" : " tickets");
