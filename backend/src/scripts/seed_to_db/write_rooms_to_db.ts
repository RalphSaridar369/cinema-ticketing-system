import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

type Room = {
  id: string;
  branch_id: string;
  name: string;
  capacity: number;
  room_type: "standard" | "vip" | "imax";
  screen_type: "2D" | "3D" | "IMAX";
  created_at: string;
};

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

async function seedRooms() {
  console.log("Seeding rooms...");

  const file = await fs.readFile(
    "data/rooms.json",
    "utf-8"
  );

  const rooms: Room[] = JSON.parse(file);

  console.log(`Found ${rooms.length} rooms.`);

  const BATCH_SIZE = 1000;

  for (let i = 0; i < rooms.length; i += BATCH_SIZE) {
    const batch = rooms.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from("room")
      .insert(batch);

    if (error) {
      console.error(
        `Failed to insert rooms ${i + 1}-${i + batch.length}:`
      );
      console.error(error);
      process.exit(1);
    }

    console.log(
      `Inserted ${Math.min(i + BATCH_SIZE, rooms.length)}/${rooms.length} rooms.`
    );
  }

  console.log("Rooms seeded successfully.");
}

seedRooms().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});