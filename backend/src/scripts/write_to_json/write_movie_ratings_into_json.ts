import { randomUUID } from "crypto";
import fs from "fs/promises";

interface User {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  password: string;
  date_of_birth: string;
  gender: "male" | "female";
  city: string;
  created_at: string;
  last_login_at: string | null;
  is_active: boolean;
}

interface Movie {
  adult: boolean;
  backdrop_path: string | null;
  genre_ids: number[];
  id: string;
  title: string;
  original_language: string;
  original_title: string;
  overview: string;
  popularity: number;
  poster_path: string | null;
  release_date: string;
  softcore: boolean;
  video: boolean;
  vote_average: number;
  vote_count: number;
}

interface MovieRating {
  id: string;
  user_id: string;
  movie_id: string;
  rating: number;
  created_at: string;
}

async function loadJson<T>(file: string): Promise<T> {
  const content = await fs.readFile(file, "utf-8");
  return JSON.parse(content) as T;
}

function randomDate(start: Date, end: Date): string {
  const timestamp =
    start.getTime() +
    Math.random() * (end.getTime() - start.getTime());

  return new Date(timestamp).toISOString();
}

function getRatingCount(): number {
  const random = Math.random();

  // Most users rate relatively few movies.
  if (random < 0.55) return randomInt(3, 10);
  if (random < 0.85) return randomInt(10, 20);
  if (random < 0.97) return randomInt(20, 35);

  return randomInt(35, 50);
}

function randomInt(min: number, max: number): number {
  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;
}

function calculateRating(movie: Movie): number {
  /*
   * TMDB vote_average acts as a weak signal.
   * We intentionally add noise so that users don't
   * all give the same movie exactly the same rating.
   */

  const baseRating = movie.vote_average;

  const userPreferenceNoise =
    (Math.random() - 0.5) * 3;

  let rating =
    baseRating + userPreferenceNoise;

  // Occasionally create stronger positive/negative opinions.
  const extremeOpinion = Math.random();

  if (extremeOpinion < 0.08) {
    rating += Math.random() < 0.5
      ? -2
      : 2;
  }

  // Clamp to 1–5.
  rating = Math.max(1, Math.min(5, rating / 2));

  // Round to nearest 0.5.
  rating = Math.round(rating * 2) / 2;

  return rating;
}

function calculateMovieWeight(movie: Movie): number {
  const popularityScore =
    Math.min(movie.popularity / 100, 1);

  const ratingScore =
    movie.vote_average / 10;

  return (
    0.2 +
    popularityScore * 0.4 +
    ratingScore * 0.6
  );
}

function selectMoviesForRating(
  movies: Movie[],
  count: number
): Movie[] {
  const selected: Movie[] = [];
  const available = [...movies];

  while (
    selected.length < count &&
    available.length > 0
  ) {
    const weights = available.map(
      calculateMovieWeight
    );

    const totalWeight = weights.reduce(
      (sum, weight) => sum + weight,
      0
    );

    let random =
      Math.random() * totalWeight;

    let selectedIndex = 0;

    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];

      if (random <= 0) {
        selectedIndex = i;
        break;
      }
    }

    selected.push(
      available[selectedIndex]
    );

    available.splice(selectedIndex, 1);
  }

  return selected;
}

async function generateMovieRatings() {
  console.log("Loading users...");
  const users = await loadJson<User[]>(
    "data/users.json"
  );

  console.log("Loading movies...");
  const movies = await loadJson<Movie[]>(
    "data/movies.json"
  );

  if (users.length === 0) {
    throw new Error(
      "users.json contains no users."
    );
  }

  if (movies.length === 0) {
    throw new Error(
      "movies.json contains no movies."
    );
  }

  console.log(`Found ${users.length} users.`);
  console.log(`Found ${movies.length} movies.`);

  const ratings: MovieRating[] = [];

  let nextRatingId = 1;

  for (const user of users) {
    const ratingCount =
      getRatingCount();

    const selectedMovies =
      selectMoviesForRating(
        movies,
        Math.min(
          ratingCount,
          movies.length
        )
      );

    const userCreatedAt =
      new Date(user.created_at);

    const now = new Date();

    for (const movie of selectedMovies) {
      ratings.push({
        id: randomUUID(),
        user_id: user.id,
        movie_id: movie.id,
        rating: calculateRating(movie),
        created_at: randomDate(
          userCreatedAt,
          now
        ),
      });
    }
  }

  await fs.writeFile(
    "data/movieRatings.json",
    JSON.stringify(
      ratings,
      null,
      2
    ),
    "utf-8"
  );

  console.log("");
  console.log(
    `Generated ${ratings.length} movie ratings.`
  );

  const ratingDistribution =
    ratings.reduce(
      (acc, rating) => {
        const key =
          rating.rating.toString();

        acc[key] =
          (acc[key] || 0) + 1;

        return acc;
      },
      {} as Record<string, number>
    );

  console.log("");
  console.log(
    "Rating distribution:"
  );

  for (
    const rating of Object.keys(
      ratingDistribution
    ).sort(
      (a, b) =>
        Number(a) - Number(b)
    )
  ) {
    console.log(
      `${rating}: ${ratingDistribution[rating]}`
    );
  }

  const uniqueUsers =
    new Set(
      ratings.map(
        (rating) =>
          rating.user_id
      )
    ).size;

  const uniqueMovies =
    new Set(
      ratings.map(
        (rating) =>
          rating.movie_id
      )
    ).size;

  console.log("");
  console.log(
    `Users represented: ${uniqueUsers}`
  );

  console.log(
    `Movies rated: ${uniqueMovies}`
  );

  console.log(
    "Saved to data/movieRatings.json"
  );
}

generateMovieRatings().catch(
  (error) => {
    console.error(
      "Failed to generate movie ratings:",
      error
    );

    process.exit(1);
  }
);