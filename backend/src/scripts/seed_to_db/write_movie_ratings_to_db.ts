import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

type MovieRating = {
  id: string;
  user_id: string;
  movie_id: string;
  rating: number;
  created_at: string;
};

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

async function seedMovieRatings() {
  console.log("Seeding movie ratings...");

  const file = await fs.readFile(
    "data/movieRatings.json",
    "utf-8"
  );

  const ratings: MovieRating[] = JSON.parse(file);

  console.log(`Found ${ratings.length} movie ratings.`);

  const BATCH_SIZE = 1000;

  for (let i = 0; i < ratings.length; i += BATCH_SIZE) {
    const batch = ratings.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from("movie_rating")
      .insert(batch);

    if (error) {
      console.error(
        `Failed to insert ratings ${i + 1}-${i + batch.length}:`
      );
      console.error(error);
      process.exit(1);
    }

    console.log(
      `Inserted ${Math.min(
        i + BATCH_SIZE,
        ratings.length
      )}/${ratings.length} ratings.`
    );
  }

  console.log("Movie ratings seeded successfully.");
}

seedMovieRatings().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
