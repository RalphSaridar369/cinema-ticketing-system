import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

type Seat = {
  id: string;
  room_id: string;
  row_label: string;
  seat_number: number;
  seat_type: "standard" | "vip";
};

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

async function seedSeats() {
  console.log("Seeding seats...");

  const file = await fs.readFile(
    "data/seats.json",
    "utf-8"
  );

  const seats: Seat[] = JSON.parse(file);

  console.log(`Found ${seats.length} seats.`);

  const BATCH_SIZE = 1000;

  for (let i = 0; i < seats.length; i += BATCH_SIZE) {
    const batch = seats.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from("seat")
      .insert(batch);

    if (error) {
      console.error(
        `Failed to insert seats ${i + 1}-${i + batch.length}:`
      );
      console.error(error);
      process.exit(1);
    }

    console.log(
      `Inserted ${Math.min(i + BATCH_SIZE, seats.length)}/${seats.length} seats.`
    );
  }

  console.log("Seats seeded successfully.");
}

seedSeats().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});