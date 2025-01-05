import "jsr:@std/dotenv/load";
import { createClient } from "jsr:@supabase/supabase-js@2";

export const supabase = createClient(
  Deno.env.get("GEMIMIW_SUPABASE_URL") ?? "",
  Deno.env.get("GEMIMIW_SUPABASE_KEY") ?? ""
);
