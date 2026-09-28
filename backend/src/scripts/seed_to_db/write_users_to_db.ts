import { createClient } from "@supabase/supabase-js";
import users from "../../../data/users.json";
import "dotenv/config";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seedUsers() {
  console.log(`Seeding ${users.length} users...`);

  for (const user of users) {
    // 1. Create Supabase Auth user
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        id: user.id,
        email: user.email,
        password: "Cinema123!",
        email_confirm: true,
      });

    if (authError) {
      console.error(`Auth failed: ${user.email}`, authError.message);
      continue;
    }

    // 2. Create corresponding profile
    const { error: profileError } = await supabase.from("profile").insert({
      id: authData.user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      date_of_birth: user.date_of_birth,
      gender: user.gender,
      city: user.city,
      created_at: user.created_at,
      last_login_at: user.last_login_at,
      is_active: user.is_active,
    });

    if (profileError) {
      console.error(`Profile failed: ${user.email}`, profileError.message);
      continue;
    }

    console.log(`✓ ${user.id} ${user.email}`);
  }

  console.log("Finished seeding users.");
}

seedUsers();
