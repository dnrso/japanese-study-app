import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig, isConfigured } from "./config.js";

let memoizedClient;
let memoizedKey = "";

export function getSupabaseClient() {
  const config = getSupabaseConfig();
  if (!isConfigured(config)) {
    return null;
  }

  const cacheKey = `${config.url}::${config.anonKey}`;
  if (memoizedClient && memoizedKey === cacheKey) {
    return memoizedClient;
  }

  memoizedClient = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
  memoizedKey = cacheKey;
  return memoizedClient;
}
