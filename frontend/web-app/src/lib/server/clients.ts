import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

// Server-only clients. Never import this from a client component.
// Built on first use so the build works without keys.

let stripeClient: Stripe | undefined;

export function stripe(): Stripe {
  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY!);
  return stripeClient;
}

let service: SupabaseClient | undefined;

// Service role: bypasses row level security. Only for the payment functions and reads the user can't make.
export function serviceDb(): SupabaseClient {
  service ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return service;
}

// Acts as the caller: their access token goes to the database, so auth.uid() and row level security apply.
export function userDb(req: Request): SupabaseClient | null {
  const header = req.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: header } },
  });
}
