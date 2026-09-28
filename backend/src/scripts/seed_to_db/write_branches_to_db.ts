import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

type Branch = {
  id: string;
  name: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  phone: string;
  created_at: string;
};

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

async function seedBranches() {
  console.log("Seeding branches...");

  const file = await fs.readFile(
    "data/branches.json",
    "utf-8"
  );

  const branches: Branch[] = JSON.parse(file);

  console.log(`Found ${branches.length} branches.`);

  const { error } = await supabase
    .from("branch")
    .insert(branches);

  if (error) {
    console.error("Failed to seed branches:");
    console.error(error);
    process.exit(1);
  }

  console.log(
    `Successfully seeded ${branches.length} branches.`
  );
}

seedBranches().catch((error) => {
  console.error(error);
  process.exit(1);
});