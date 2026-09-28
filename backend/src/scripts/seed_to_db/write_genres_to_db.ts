import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

type Genre = {
  id: string;
  name: string;
};

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

async function seedGenres() {
  console.log("Seeding genres...");

  const file = await fs.readFile(
    "data/genres.json",
    "utf-8"
  );

  const genres: Genre[] = JSON.parse(file);

  console.log(`Found ${genres.length} genres.`);

  const { error } = await supabase
    .from("genre")
    .insert(genres);

  if (error) {
    console.error("Failed to seed genres:");
    console.error(error);
    process.exit(1);
  }

  console.log(
    `Successfully seeded ${genres.length} genres.`
  );
}

seedGenres().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});