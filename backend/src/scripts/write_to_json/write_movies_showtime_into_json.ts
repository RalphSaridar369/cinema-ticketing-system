import fs from "fs/promises";

interface Movie {
  id: number;
  title: string;
  genre_ids: number[];
  vote_average: number;
  popularity: number;
}

interface Room {
  id: number;
  branch_id: number;
  name: string;
  capacity: number;
  room_type: "standard" | "vip" | "imax";
  screen_type: "2D" | "3D" | "IMAX";
  created_at: string;
}

interface Showtime {
  id: number;
  movie_id: number;
  room_id: number;
  starts_at: string;
  ends_at: string;
  price: number;
  created_at: string;
}

interface ScheduledShowtime {
  movie_id: number;
  room_id: number;
  starts_at: Date;
  ends_at: Date;
}

const DAYS_TO_GENERATE = 14;

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

function selectMoviesForDay(
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

function movieAlreadyScheduledTooManyTimes(
  movieId: number,
  roomId: number,
  date: string,
  schedule: ScheduledShowtime[]
): boolean {
  const count = schedule.filter((showtime) => {
    const showtimeDate = showtime.starts_at.toISOString().split("T")[0];

    return (
      showtime.movie_id === movieId &&
      showtime.room_id === roomId &&
      showtimeDate === date
    );
  }).length;

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

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
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

  let showtimeId = 1;

  for (let day = 0; day < DAYS_TO_GENERATE; day++) {
    const currentDate = addDays(startDate, day);

    const date = formatDate(currentDate);

    console.log(`Generating schedule for ${date}...`);

    const minimumMovies = Math.min(
      movies.length,
      Math.max(20, Math.floor(movies.length * 0.08))
    );

    const maximumMovies = Math.min(
      movies.length,
      Math.max(40, Math.floor(movies.length * 0.18))
    );

    const moviesForToday = selectMoviesForDay(
      movies,
      minimumMovies,
      maximumMovies
    );
    const shuffledRooms = shuffle(rooms);

    for (const movie of moviesForToday) {
      const weight = getMovieWeight(movie);

      let numberOfScreenings = 1;

      if (weight > 8) {
        numberOfScreenings = randomInt(3, 5);
      } else if (weight > 5) {
        numberOfScreenings = randomInt(2, 4);
      } else if (weight > 3) {
        numberOfScreenings = randomInt(1, 3);
      }

      const slots = shuffle(SHOWTIME_SLOTS);

      let screeningsCreated = 0;

      for (const slot of slots) {
        if (screeningsCreated >= numberOfScreenings) {
          break;
        }
        const roomsForScreening = shuffle(shuffledRooms);

        for (const room of roomsForScreening) {
          if (!canMoviePlayInRoom(movie, room)) {
            continue;
          }

          if (
            movieAlreadyScheduledTooManyTimes(movie.id, room.id, date, schedule)
          ) {
            continue;
          }

          const runtime = generateRuntime();

          const startsAt = createDate(date, slot);

          const endsAt = new Date(startsAt.getTime() + runtime * 60 * 1000);

          const conflict = schedule.some((existing) => {
            if (existing.room_id !== room.id) {
              return false;
            }

            return hasConflict(startsAt, endsAt, existing);
          });

          if (conflict) {
            continue;
          }

          schedule.push({
            movie_id: movie.id,
            room_id: room.id,
            starts_at: startsAt,
            ends_at: endsAt,
          });

          screeningsCreated++;

          break;
        }
      }
    }

    console.log(
      `  Created ${
        schedule.filter((showtime) =>
          showtime.starts_at.toISOString().startsWith(date)
        ).length
      } showtimes.`
    );
  }

  const showtimes: Showtime[] = schedule
    .sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime())
    .map((showtime) => ({
      id: showtimeId++,
      movie_id: showtime.movie_id,
      room_id: showtime.room_id,
      starts_at: showtime.starts_at.toISOString(),
      ends_at: showtime.ends_at.toISOString(),

      price: getPrice(rooms.find((room) => room.id === showtime.room_id)!),

      created_at: new Date().toISOString(),
    }));

  await fs.writeFile(
    "data/showtimes.json",
    JSON.stringify(showtimes, null, 2),
    "utf-8"
  );

  console.log("");
  console.log(`Finished! Generated ${showtimes.length} showtimes.`);
  console.log(`Schedule covers ${DAYS_TO_GENERATE} days.`);
  console.log("Saved to showtimes.json");

  return showtimes;
}

generateShowtimes().catch((error) => {
  console.error("Failed to generate showtimes:", error);

  process.exit(1);
});
