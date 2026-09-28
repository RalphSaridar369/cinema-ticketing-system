import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

type UserMovieInteraction = {
  id: string;
  user_id: string;
  movie_id: string;
  interaction_type:
    | "view"
    | "click"
    | "favorite"
    | "watchlist";
  created_at: string;
};

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

async function seedUserMovieInteractions() {
  console.log("Seeding user-movie interactions...");

  const file = await fs.readFile(
    "data/userMovieInteractions.json",
    "utf-8"
  );

  const interactions: UserMovieInteraction[] =
    JSON.parse(file);

  console.log(
    `Found ${interactions.length} user-movie interactions.`
  );

  const BATCH_SIZE = 1000;

  for (let i = 0; i < interactions.length; i += BATCH_SIZE) {
    const batch = interactions.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from("user_movie_interaction")
      .insert(batch);

    if (error) {
      console.error(
        `Failed to insert interactions ${i + 1}-${i + batch.length}:`
      );
      console.error(error);
      process.exit(1);
    }

    console.log(
      `Inserted ${Math.min(
        i + BATCH_SIZE,
        interactions.length
      )}/${interactions.length} interactions.`
    );
  }

  console.log(
    "User-movie interactions seeded successfully."
  );
}

seedUserMovieInteractions().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});