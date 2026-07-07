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
