import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

type Ticket = {
  id: string;
  reservation_id: string;
  showtime_id: string;
  seat_id: string;
  price: number;
  status: "reserved" | "used" | "cancelled";
  created_at: string;
};

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

async function seedTickets() {
  console.log("Seeding tickets...");

  const file = await fs.readFile(
    "data/tickets.json",
    "utf-8"
  );

  const tickets: Ticket[] = JSON.parse(file);

  console.log(`Found ${tickets.length} tickets.`);

  const BATCH_SIZE = 1000;

  for (let i = 0; i < tickets.length; i += BATCH_SIZE) {
    const batch = tickets.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from("ticket")
      .insert(batch);

    if (error) {
      console.error(
        `Failed to insert tickets ${i + 1}-${i + batch.length}:`
      );
      console.error(error);
      process.exit(1);
    }

    console.log(
      `Inserted ${Math.min(
        i + BATCH_SIZE,
        tickets.length
      )}/${tickets.length} tickets.`
    );
  }

  console.log("Tickets seeded successfully.");
}

seedTickets().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});