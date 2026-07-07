import { getSupabaseClient } from "./client.js";
import {
  getSession as getSupabaseSession,
  onAuthChange as onSupabaseAuthChange,
  signInWithOAuth as signInWithSupabaseOAuth
} from "./auth.js";
import { pullSnapshot, pushSnapshot } from "./snapshot.js";

export { getSupabaseClient } from "./client.js";
export { getSupabaseConfig, isConfigured } from "./config.js";
export { getSession, onAuthChange, signInWithOAuth } from "./auth.js";
export { pullSnapshot, pushSnapshot } from "./snapshot.js";

async function readErrorResponseData(error) {
  const response = error?.context;
  if (!response || typeof response.json !== "function") {
    return null;
  }
  try {
    // The Response body can only be read once; `context` is a fresh
    // Response supplied by supabase-js specifically for this purpose, so
    // consuming it here is safe.
    return await response.clone().json();
  } catch {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
}

export function createSupabaseSync({ storage, mergeSnapshots }) {
  const supabase = getSupabaseClient();
  const isEnabled = Boolean(supabase);

  async function getSession() {
    if (!isEnabled) {
      return null;
    }
    return getSupabaseSession(supabase);
  }

  function onAuthChange(cb) {
    if (!isEnabled) {
      Promise.resolve().then(() => cb(null));
      return () => {};
    }
    return onSupabaseAuthChange(supabase, cb);
  }

  async function syncNow() {
    if (!isEnabled) {
      return { skipped: true, reason: "disabled" };
    }

    try {
      const session = await getSession();
      if (!session) {
        return { skipped: true, reason: "no-session" };
      }

      const userId = session.user.id;
      const local = await storage.exportData();
      const remote = await pullSnapshot(supabase, userId);

      let merged;
      if (remote && remote.snapshot) {
        const result = mergeSnapshots(local.data, remote.snapshot);
        merged = result.data;
        await storage.importFullBackup({ data: merged });
      } else {
        merged = local.data;
      }

      await pushSnapshot(supabase, userId, merged);

      const state = await storage.getState(merged.selectedDate);
      return { skipped: false, state };
    } catch (error) {
      return { skipped: true, reason: "error", error };
    }
  }

  async function signInWithGoogle() {
    if (!isEnabled) {
      return { skipped: true, reason: "disabled" };
    }

    try {
      const { error } = await signInWithSupabaseOAuth(supabase, {
        provider: "google",
        redirectTo: window.location.origin
      });
      if (error) {
        return { skipped: true, reason: "error", error };
      }
      return { skipped: false };
    } catch (error) {
      return { skipped: true, reason: "error", error };
    }
  }

  async function signOut() {
    if (!isEnabled) {
      return;
    }
    await supabase.auth.signOut();
  }

  async function invokeFunction(name, body) {
    if (!isEnabled) {
      return { skipped: true, reason: "disabled" };
    }

    try {
      const session = await getSession();
      if (!session) {
        return { skipped: true, reason: "no-session" };
      }

      const { data, error } = await supabase.functions.invoke(name, { body });
      if (error) {
        // On a non-2xx response, supabase-js returns `data: null` and an
        // error (e.g. FunctionsHttpError) whose `.context` is the raw
        // Response object — the JSON body (with our {ok, reason, message}
        // shape) hasn't been parsed yet. Parse it here so callers can still
        // read `reason`/`message` from a failed invoke just like they would
        // from a successful one.
        const errorData = await readErrorResponseData(error);
        if (errorData) {
          return { skipped: false, data: errorData };
        }
        return { skipped: true, reason: "error", error };
      }
      return { skipped: false, data };
    } catch (error) {
      return { skipped: true, reason: "error", error };
    }
  }

  return {
    isEnabled,
    getSession,
    onAuthChange,
    syncNow,
    signInWithGoogle,
    signOut,
    invokeFunction
  };
}
