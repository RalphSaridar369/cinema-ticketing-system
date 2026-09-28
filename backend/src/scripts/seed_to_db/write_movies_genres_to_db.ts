import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

type GenreMovie = {
  id: string;
  tmdb_id: number;
  name: string;
  movieIds: string[];
};

type GenreMovieRow = {
  genre_id: string;
  movie_id: string;
};

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

async function seedGenreMovies() {
  console.log("Seeding genre-movie relationships...");

  const file = await fs.readFile(
    "data/genreMovies.json",
    "utf-8"
  );

  const genresMovies: GenreMovie[] = JSON.parse(file);

  const rows: GenreMovieRow[] = [];

  for (const genre of genresMovies) {
    for (const movieId of genre.movieIds) {
      rows.push({
        genre_id: genre.id,
        movie_id: movieId,
      });
    }
  }

  console.log(
    `Found ${rows.length} genre-movie relationships.`
  );

  const BATCH_SIZE = 1000;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from("movie_genre")
      .insert(batch);

    if (error) {
      console.error(
        `Failed to insert relationships ${i + 1}-${i + batch.length}:`
      );
      console.error(error);
      process.exit(1);
    }

    console.log(
      `Inserted ${Math.min(
        i + BATCH_SIZE,
        rows.length
      )}/${rows.length} relationships.`
    );
  }

  console.log(
    "Genre-movie relationships seeded successfully."
  );
}

seedGenreMovies().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});