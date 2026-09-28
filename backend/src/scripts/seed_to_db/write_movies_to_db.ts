import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

type Movie = {
  id: string;
  title: string;
  original_language: string;
  original_title: string;
  overview: string | null;

  genre_ids:number[]

  adult: boolean;
  video: boolean;

  backdrop_path: string | null;
  poster_path: string | null;

  release_date: string | null;

  popularity: number;
  vote_average: number;
  vote_count: number;
};

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

async function seedMovies() {
  console.log("Seeding movies...");

  const file = await fs.readFile(
    "data/movies.json",
    "utf-8"
  );

  const movies: Movie[] = JSON.parse(file);

  console.log(`Found ${movies.length} movies.`);

  const BATCH_SIZE = 1000;

  for (let i = 0; i < movies.length; i += BATCH_SIZE) {
    const batch = movies
    .slice(i, i + BATCH_SIZE)
    .map(({ genre_ids, ...movie }) => movie);

    const { error } = await supabase
      .from("movie")
      .insert(batch);

    if (error) {
      console.error(
        `Failed to insert movies ${i + 1}-${i + batch.length}:`
      );
      console.error(error);
      process.exit(1);
    }

    console.log(
      `Inserted ${Math.min(
        i + BATCH_SIZE,
        movies.length
      )}/${movies.length} movies.`
    );
  }

  console.log("Movies seeded successfully.");
}

seedMovies().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});