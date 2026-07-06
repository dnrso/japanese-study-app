function readEnv() {
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return import.meta.env;
  }
  return {};
}

export function getSupabaseConfig() {
  const env = readEnv();
  return {
    url: String(env.VITE_SUPABASE_URL || "").trim(),
    anonKey: String(env.VITE_SUPABASE_ANON_KEY || "").trim()
  };
}

export function isConfigured(config = getSupabaseConfig()) {
  return Boolean(config.url && config.anonKey);
}
