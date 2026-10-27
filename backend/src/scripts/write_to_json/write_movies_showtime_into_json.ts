import { randomUUID } from "crypto";
import fs from "fs/promises";

interface Movie {
  id: string;
  title: string;
  genre_ids: number[];
  vote_average: number;
  popularity: number;
}

interface Room {
  id: string;
  branch_id: string;
  name: string;
  capacity: number;
  room_type: "standard" | "vip" | "imax";
  screen_type: "2D" | "3D" | "IMAX";
  created_at: string;
}

interface Showtime {
  id: string;
  movie_id: string;
  room_id: string;
  starts_at: string;
  ends_at: string;
  price: number;
  created_at: string;
}

interface ScheduledShowtime {
  movie_id: string;
  room_id: string;
  starts_at: Date;
  ends_at: Date;
}

const LINEUP_SIZE = 30;

const DAYS_PER_LINEUP = 7;

const SHOWTIME_SLOTS = ["10:00", "12:30", "15:00", "17:30", "20:00", "22:30"];

const CLEANUP_TIME_MINUTES = 20;

const MIN_RUNTIME = 90;
const MAX_RUNTIME = 160;

const MAX_SCREENINGS_PER_MOVIE_PER_ROOM = 2;

const PRICES = {
  standard2D: 8,
  standard3D: 10,
  vip: 15,
  imax: 18,
};

async function readJson<T>(fileName: string): Promise<T> {
  const file = await fs.readFile(fileName, "utf-8");

  return JSON.parse(file) as T;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRuntime(): number {
  const runtime = randomInt(MIN_RUNTIME, MAX_RUNTIME);

  return Math.round(runtime / 5) * 5;
}

function getMovieWeight(movie: Movie): number {
  const popularityWeight = Math.min(movie.popularity / 20, 10);

  const ratingWeight = movie.vote_average / 2;

  return popularityWeight + ratingWeight;
}

function selectMovies(
  movies: Movie[],
  minimumMovies: number,
  maximumMovies: number
): Movie[] {
  const numberOfMovies = randomInt(minimumMovies, maximumMovies);

  const availableMovies = [...movies];
  const selectedMovies: Movie[] = [];

  while (selectedMovies.length < numberOfMovies && availableMovies.length > 0) {
    const totalWeight = availableMovies.reduce(
      (sum, movie) => sum + getMovieWeight(movie),
      0
    );

    let random = Math.random() * totalWeight;

    let selectedIndex = 0;

    for (let i = 0; i < availableMovies.length; i++) {
      random -= getMovieWeight(availableMovies[i]);

      if (random <= 0) {
        selectedIndex = i;
        break;
      }
    }

    const [selectedMovie] = availableMovies.splice(selectedIndex, 1);

    selectedMovies.push(selectedMovie);
  }

  return selectedMovies;
}

function canMoviePlayInRoom(movie: Movie, room: Room): boolean {
  if (room.room_type === "imax") {
    return true;
  }

  return true;
}

function getPrice(room: Room): number {
  if (room.room_type === "vip") {
    return PRICES.vip;
  }

  if (room.room_type === "imax") {
    return PRICES.imax;
  }

  if (room.screen_type === "3D") {
    return PRICES.standard3D;
  }

  return PRICES.standard2D;
}

function hasConflict(
  start: Date,
  end: Date,
  existing: ScheduledShowtime
): boolean {
  const existingEndWithCleanup = new Date(
    existing.ends_at.getTime() + CLEANUP_TIME_MINUTES * 60 * 1000
  );

  const newEndWithCleanup = new Date(
    end.getTime() + CLEANUP_TIME_MINUTES * 60 * 1000
  );

  return (
    start < existingEndWithCleanup && newEndWithCleanup > existing.starts_at
  );
}

// `roomDay` holds the showtimes already in one room on one day.
function movieAlreadyScheduledTooManyTimes(
  movieId: string,
  roomDay: ScheduledShowtime[]
): boolean {
  const count = roomDay.filter((showtime) => showtime.movie_id === movieId).length;

  return count >= MAX_SCREENINGS_PER_MOVIE_PER_ROOM;
}

function createDate(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);

  result.setDate(result.getDate() + days);

  return result;
}

// Local calendar date, to match createDate(), which reads times as local.
function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

function shuffle<T>(array: T[]): T[] {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

async function generateShowtimes(): Promise<Showtime[]> {
  const [movies, rooms] = await Promise.all([
    readJson<Movie[]>("data/movies.json"),
    readJson<Room[]>("data/rooms.json"),
  ]);

  if (movies.length === 0) {
    throw new Error("movies.json is empty.");
  }

  if (rooms.length === 0) {
    throw new Error("rooms.json is empty.");
  }

  console.log(`Loaded ${movies.length} movies.`);
  console.log(`Loaded ${rooms.length} rooms.`);

  const startDate = new Date();

  const schedule: ScheduledShowtime[] = [];

  const roomsByBranch = new Map<string, Room[]>();

  for (const room of rooms) {
    roomsByBranch.set(room.branch_id, [
      ...(roomsByBranch.get(room.branch_id) ?? []),
      room,
    ]);
  }

  // Showtimes per room per day, so conflict checks don't scan the whole
  // schedule. Shows end before the next day's first slot, so a room's days
  // never overlap.
  const byRoomDay = new Map<string, ScheduledShowtime[]>();

  // Each block of DAYS_PER_LINEUP days screens one lineup of LINEUP_SIZE
  // movies at every branch, and no movie returns in a later block. Blocks
  // continue until every movie has had one; the last lineup takes whatever
  // is left.
  const usedMovieIds = new Set<string>();

  let lineup: Movie[] = [];

  let days = 0;

  for (let day = 0; ; day++) {
    const currentDate = addDays(startDate, day);

    const date = formatDate(currentDate);

    if (day % DAYS_PER_LINEUP === 0) {
      const available = movies.filter((movie) => !usedMovieIds.has(movie.id));

      if (available.length === 0) {
        break;
      }

      const size = Math.min(LINEUP_SIZE, available.length);

      lineup = selectMovies(available, size, size);

      lineup.forEach((movie) => usedMovieIds.add(movie.id));

      console.log(`Lineup from ${date}: ${lineup.length} movies.`);
    }

    days++;

    const createdBefore = schedule.length;

    for (const branchRooms of roomsByBranch.values()) {
      for (const movie of shuffle(lineup)) {
        const weight = getMovieWeight(movie);

        let numberOfScreenings = 2;

        if (weight > 8) {
          numberOfScreenings = randomInt(3, 4);
        } else if (weight > 5) {
          numberOfScreenings = randomInt(2, 3);
        }

        const slots = shuffle(SHOWTIME_SLOTS);

        let screeningsCreated = 0;

        for (const slot of slots) {
          if (screeningsCreated >= numberOfScreenings) {
            break;
          }

          for (const room of shuffle(branchRooms)) {
            if (!canMoviePlayInRoom(movie, room)) {
              continue;
            }

            const roomDayKey = `${room.id}|${date}`;

            const roomDay = byRoomDay.get(roomDayKey) ?? [];

            if (movieAlreadyScheduledTooManyTimes(movie.id, roomDay)) {
              continue;
            }

            const runtime = generateRuntime();

            const startsAt = createDate(date, slot);

            const endsAt = new Date(startsAt.getTime() + runtime * 60 * 1000);

            const conflict = roomDay.some((existing) =>
              hasConflict(startsAt, endsAt, existing)
            );

            if (conflict) {
              continue;
            }

            const showtime = {
              movie_id: movie.id,
              room_id: room.id,
              starts_at: startsAt,
              ends_at: endsAt,
            };

            schedule.push(showtime);

            byRoomDay.set(roomDayKey, [...roomDay, showtime]);

            screeningsCreated++;

            break;
          }
        }
      }
    }

    console.log(`${date}: created ${schedule.length - createdBefore} showtimes.`);
  }

  const showtimes: Showtime[] = schedule
    .sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime())
    .map((showtime) => ({
      id: randomUUID(),
      movie_id: showtime.movie_id,
      room_id: showtime.room_id,
      starts_at: showtime.starts_at.toISOString(),
      ends_at: showtime.ends_at.toISOString(),

      price: getPrice(rooms.find((room) => room.id === showtime.room_id)!),

      created_at: new Date().toISOString(),
    }));

  // Keep earlier showtimes, which reservations and tickets point at, and
  // replace everything from the start of the new schedule onwards.
  const cutoff = createDate(formatDate(startDate), "00:00");

  const existing = await readJson<Showtime[]>("data/showtimes.json").catch(
    () => [] as Showtime[]
  );

  const past = existing.filter(
    (showtime) => new Date(showtime.starts_at) < cutoff
  );

  await fs.writeFile(
    "data/showtimes.json",
    JSON.stringify([...past, ...showtimes], null, 2),
    "utf-8"
  );

  console.log("");
  console.log(`Finished! Generated ${showtimes.length} showtimes.`);
  console.log(`Schedule covers ${days} days from ${cutoff.toISOString()}.`);
  console.log(`Kept ${past.length} earlier showtimes.`);
  console.log("Saved to showtimes.json");

  return showtimes;
}

generateShowtimes().catch((error) => {
  console.error("Failed to generate showtimes:", error);

  process.exit(1);
});
