import { createClient } from "@supabase/supabase-js";

// Browser client. The anon key is public by design; row level security in the
// database decides what each user can read and write.
export const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
