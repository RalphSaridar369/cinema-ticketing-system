import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

type Showtime = {
  id: string;
  movie_id: string;
  room_id: string;
  start_time: string;
  end_time: string;
  price: number;
  created_at: string;
};

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

async function seedShowtimes() {
  console.log("Seeding showtimes...");

  const file = await fs.readFile(
    "data/showtimes.json",
    "utf-8"
  );

  const showtimes: Showtime[] = JSON.parse(file);

  console.log(`Found ${showtimes.length} showtimes.`);

  const BATCH_SIZE = 1000;

  for (let i = 0; i < showtimes.length; i += BATCH_SIZE) {
    const batch = showtimes.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from("showtime")
      .insert(batch);

    if (error) {
      console.error(
        `Failed to insert showtimes ${i + 1}-${i + batch.length}:`
      );
      console.error(error);
      process.exit(1);
    }

    console.log(
      `Inserted ${Math.min(
        i + BATCH_SIZE,
        showtimes.length
      )}/${showtimes.length} showtimes.`
    );
  }

  console.log("Showtimes seeded successfully.");
}

seedShowtimes().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});