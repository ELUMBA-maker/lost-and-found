import { createClient } from "@supabase/supabase-js";

let supabase;

export function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  if (!supabase) {
    supabase = createClient(url, serviceRoleKey);
  }

  return supabase;
}