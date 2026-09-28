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

type InteractionType =
  | "view"
  | "click"
  | "favorite"
  | "watchlist";

interface UserMovieInteraction {
  id: string;
  user_id: string;
  movie_id: string;
  interaction_type: InteractionType;
  created_at: string;
}

async function loadJson<T>(file: string): Promise<T> {
  const content = await fs.readFile(file, "utf-8");
  return JSON.parse(content) as T;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start: Date, end: Date): string {
  const timestamp =
    start.getTime() +
    Math.random() * (end.getTime() - start.getTime());

  return new Date(timestamp).toISOString();
}

function weightedInteractionType(): InteractionType {
  const random = Math.random();

  if (random < 0.50) return "view";
  if (random < 0.70) return "click";
  if (random < 0.82) return "watchlist";
  return "favorite";

}

function getInteractionCount(): number {
  const random = Math.random();

  // Long-tail behavior:
  // Most users interact with relatively few movies.
  if (random < 0.45) return randomInt(10, 30);
  if (random < 0.80) return randomInt(30, 70);
  if (random < 0.95) return randomInt(70, 130);

  return randomInt(130, 220);
}

function calculateMovieScore(movie: Movie): number {
  const popularityScore = Math.min(movie.popularity / 100, 1);
  const ratingScore = movie.vote_average / 10;

  return popularityScore * 0.4 + ratingScore * 0.6;
}

function weightedMovieSelection(
  movies: Movie[],
  count: number
): Movie[] {
  const selected: Movie[] = [];
  const available = [...movies];

  while (selected.length < count && available.length > 0) {
    const weights = available.map((movie) => {
      const score = calculateMovieScore(movie);

      // Small random component prevents everyone
      // from interacting with exactly the same popular movies.
      return 0.2 + score + Math.random() * 0.3;
    });

    const totalWeight = weights.reduce(
      (sum, weight) => sum + weight,
      0
    );

    let random = Math.random() * totalWeight;
    let selectedIndex = 0;

    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];

      if (random <= 0) {
        selectedIndex = i;
        break;
      }
    }

    selected.push(available[selectedIndex]);
    available.splice(selectedIndex, 1);
  }

  return selected;
}

async function generateUserMovieInteractions() {
  console.log("Loading users...");
  const users = await loadJson<User[]>("data/users.json");

  console.log("Loading movies...");
  const movies = await loadJson<Movie[]>("data/movies.json");

  if (users.length === 0) {
    throw new Error("users.json contains no users.");
  }

  if (movies.length === 0) {
    throw new Error("movies.json contains no movies.");
  }

  console.log(`Found ${users.length} users.`);
  console.log(`Found ${movies.length} movies.`);

  const interactions: UserMovieInteraction[] = [];
  let nextInteractionId = 1;

  for (const user of users) {
    const interactionCount = getInteractionCount();

    const selectedMovies = weightedMovieSelection(
      movies,
      Math.min(interactionCount, movies.length)
    );

    const userCreatedAt = new Date(user.created_at);
    const now = new Date();

    for (const movie of selectedMovies) {
      const interactionType = weightedInteractionType();

      const createdAt = randomDate(
        userCreatedAt,
        now
      );

      interactions.push({
        id: randomUUID(),
        user_id: user.id,
        movie_id: movie.id,
        interaction_type: interactionType,
        created_at: createdAt,
      });
    }
  }

  await fs.writeFile(
    "data/userMovieInteractions.json",
    JSON.stringify(interactions, null, 2),
    "utf-8"
  );

  console.log("");
  console.log(
    `Generated ${interactions.length} user-movie interactions.`
  );

  const counts = interactions.reduce(
    (acc, interaction) => {
      acc[interaction.interaction_type] =
        (acc[interaction.interaction_type] || 0) + 1;

      return acc;
    },
    {} as Record<string, number>
  );

  console.log("");
  console.log("Interaction breakdown:");

  for (const [type, count] of Object.entries(counts)) {
    console.log(`${type}: ${count}`);
  }

  const uniqueUsers = new Set(
    interactions.map((interaction) => interaction.user_id)
  ).size;

  const uniqueMovies = new Set(
    interactions.map((interaction) => interaction.movie_id)
  ).size;

  console.log("");
  console.log(`Users represented: ${uniqueUsers}`);
  console.log(`Movies interacted with: ${uniqueMovies}`);
  console.log("Saved to data/userMovieInteractions.json");
}

generateUserMovieInteractions().catch((error) => {
  console.error(
    "Failed to generate user movie interactions:",
    error
  );

  process.exit(1);
});