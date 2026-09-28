import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

type Reservation = {
  id: string;
  user_id: string;
  showtime_id: string;
  reserved_at: string;
  party_size: number;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  total_amount: number;
  created_at: string;
};

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

async function seedReservations() {
  console.log("Seeding reservations...");

  const file = await fs.readFile(
    "data/reservations.json",
    "utf-8"
  );

  const reservations: Reservation[] = JSON.parse(file);

  console.log(`Found ${reservations.length} reservations.`);

  const BATCH_SIZE = 1000;

  for (let i = 0; i < reservations.length; i += BATCH_SIZE) {
    const batch = reservations.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from("reservation")
      .insert(batch);

    if (error) {
      console.error(
        `Failed to insert reservations ${i + 1}-${i + batch.length}:`
      );
      console.error(error);
      process.exit(1);
    }

    console.log(
      `Inserted ${Math.min(
        i + BATCH_SIZE,
        reservations.length
      )}/${reservations.length} reservations.`
    );
  }

  console.log("Reservations seeded successfully.");
}

seedReservations().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});