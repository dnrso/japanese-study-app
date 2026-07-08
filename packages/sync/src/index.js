import { getSupabaseClient } from "./client.js";
import {
  getSession as getSupabaseSession,
  onAuthChange as onSupabaseAuthChange,
  signInWithOAuth as signInWithSupabaseOAuth,
  exchangeCodeForSession as exchangeSupabaseCodeForSession,
  setSessionFromTokens as setSupabaseSessionFromTokens
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

  // `redirectTo` defaults to the web origin (existing behavior). Native
  // (Capacitor) callers pass a custom-scheme redirectTo and
  // `skipBrowserRedirect: true` so the returned `data.url` can be opened in
  // the system browser (via @capacitor/browser) instead of navigating the
  // in-app WebView away from the app.
  async function signInWithGoogle({ redirectTo = window.location.origin, skipBrowserRedirect = false } = {}) {
    if (!isEnabled) {
      return { skipped: true, reason: "disabled" };
    }

    try {
      const { data, error } = await signInWithSupabaseOAuth(supabase, {
        provider: "google",
        redirectTo,
        skipBrowserRedirect
      });
      if (error) {
        return { skipped: true, reason: "error", error };
      }
      return { skipped: false, data };
    } catch (error) {
      return { skipped: true, reason: "error", error };
    }
  }

  // Completes the OAuth redirect on native platforms: called by the
  // Capacitor `appUrlOpen` glue in apps/web with the full deep-link URL
  // (e.g. "io.github.dnrso.nihongostudy://auth-callback?code=..."). Handles
  // the configured PKCE flow (?code=) and falls back to the implicit flow
  // (#access_token=&refresh_token=) in case flowType is ever changed.
  // On success, supabase's onAuthStateChange fires and the existing
  // onAuthChange wiring picks up the new session.
  async function handleAuthCallback(url) {
    if (!isEnabled) {
      return { skipped: true, reason: "disabled" };
    }

    try {
      const parsed = new URL(url);
      const code = parsed.searchParams.get("code");
      if (code) {
        const { data, error } = await exchangeSupabaseCodeForSession(supabase, code);
        if (error) {
          return { skipped: true, reason: "error", error };
        }
        return { skipped: false, data };
      }

      const fragment = parsed.hash ? parsed.hash.slice(1) : "";
      const fragmentParams = new URLSearchParams(fragment);
      const access_token = fragmentParams.get("access_token");
      const refresh_token = fragmentParams.get("refresh_token");
      if (access_token && refresh_token) {
        const { data, error } = await setSupabaseSessionFromTokens(supabase, { access_token, refresh_token });
        if (error) {
          return { skipped: true, reason: "error", error };
        }
        return { skipped: false, data };
      }

      const errorDescription = parsed.searchParams.get("error_description") || fragmentParams.get("error_description");
      return { skipped: true, reason: errorDescription ? "error" : "no-params", error: errorDescription ? new Error(errorDescription) : undefined };
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
    handleAuthCallback,
    signOut,
    invokeFunction
  };
}
