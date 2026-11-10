import {
  createSupabaseSync,
  createSyncCoordinator as createSyncCoordinatorImpl,
  createSyncingStorage as createSyncingStorageImpl
} from "@nihongo-study/sync";
import { applyPagePatch, renderAccountStatusPage } from "@nihongo-study/ui";
import { escapeHtml } from "./templates.js";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";

// Sync/account integration. These functions close over mutable state that
// lives in main.js (accountSession, aiSentenceAnalysisEnabled, etc.), so
// callers pass a small `ctx` object exposing getters/setters instead of
// module-level bindings. This keeps the functions here free of main.js's
// module scope while preserving identical behavior byte-for-byte.
//
// Expected `ctx` shape:
// {
//   byId, sync, syncCoordinator,
//   getAccountSession, setAccountSession,
//   getAiSentenceAnalysisEnabled, setAiSentenceAnalysisEnabled,
//   updateDailyEntryPlaceholder
// }

// Custom URL scheme Supabase redirects back to after Google OAuth completes
// on native (Android) builds. Must match:
//  - the intent-filter in apps/web/android/app/src/main/AndroidManifest.xml
//  - an entry in the Supabase project's Auth > URL Configuration >
//    "Redirect URLs" allowlist
// scheme = appId (see apps/web/capacitor.config.json), host = "auth-callback".
const NATIVE_AUTH_CALLBACK_URL = "io.github.dnrso.nihongostudy://auth-callback";

function isNativePlatform() {
  return Boolean(Capacitor?.isNativePlatform?.());
}

export function createSync({ storage, mergeSnapshots }) {
  return createSupabaseSync({ storage, mergeSnapshots });
}

// Sync stand-in for the desktop app: same surface as createSupabaseSync() but
// permanently disabled, so no Supabase client is ever created.
export function createDisabledSync() {
  return {
    isEnabled: false,
    getSession: async () => null,
    onAuthChange: callback => {
      Promise.resolve().then(() => callback(null));
      return () => {};
    },
    syncNow: async () => ({ skipped: true, reason: "disabled" }),
    signInWithGoogle: async () => ({ skipped: true, reason: "disabled" }),
    handleAuthCallback: async () => ({ skipped: true, reason: "disabled" }),
    signOut: async () => ({ skipped: true, reason: "disabled" }),
    invokeFunction: async () => ({ skipped: true, reason: "disabled" })
  };
}

export function createSyncCoordinator(options) {
  return createSyncCoordinatorImpl(options);
}

export function createSyncingStorage(storage, options) {
  return createSyncingStorageImpl(storage, options);
}

export function renderAccountStatus(ctx) {
  const { byId } = ctx;
  if (!ctx.getAccountSession() && ctx.getAiSentenceAnalysisEnabled()) {
    ctx.setAiSentenceAnalysisEnabled(false);
    const checkbox = byId("aiSentenceAnalysisCheckbox");
    if (checkbox) {
      checkbox.checked = false;
    }
    ctx.updateDailyEntryPlaceholder();
  }

  if (!byId("accountStatus")) {
    return;
  }
  const coordinatorState = ctx.syncCoordinator.getState();
  applyPagePatch(renderAccountStatusPage({
    state: {
      syncEnabled: Boolean(ctx.sync.isEnabled),
      session: ctx.getAccountSession(),
      authenticated: Boolean(coordinatorState.authenticated),
      status: coordinatorState.status,
      error: coordinatorState.error,
      lastSuccessAt: coordinatorState.lastSuccessAt
    },
    helpers: { escapeHtml }
  }), { getElementById: byId });
}

export async function signInWithGoogle(ctx) {
  const { byId, sync } = ctx;
  let result;
  try {
    if (isNativePlatform()) {
      // Native: skip Supabase's default WebView redirect and instead open
      // the returned OAuth URL in the system browser, which can complete the
      // Google login and deep-link back into the app via the custom scheme
      // intent-filter (handled by wireAuthCallback/App "appUrlOpen").
      result = await sync.signInWithGoogle({
        redirectTo: NATIVE_AUTH_CALLBACK_URL,
        skipBrowserRedirect: true
      });
      if (!result?.skipped && result?.data?.url) {
        await Browser.open({ url: result.data.url });
      }
    } else {
      result = await sync.signInWithGoogle();
    }
  } catch (error) {
    console.error("Google 로그인 처리 중 예외 발생:", error);
    const message = `Google 로그인 실패: ${error?.message || error}`;
    window.alert(message);
    const status = byId("accountStatus");
    if (status) {
      status.textContent = message;
    }
    return;
  }
  if (result?.skipped) {
    if (result.reason === "error") {
      console.error("Google 로그인 실패:", result.error);
    }
    const message = result.reason === "disabled"
      ? "이 환경에서는 로그인을 사용할 수 없습니다."
      : `Google 로그인 실패: ${result.error?.message || result.reason}`;
    window.alert(message);
    const status = byId("accountStatus");
    if (status) {
      status.textContent = message;
    }
  }
}

export async function signOutOfAccount(ctx) {
  const { sync } = ctx;
  try {
    await sync.signOut();
  } catch (error) {
    console.error("로그아웃 처리 중 예외 발생:", error);
  }
  ctx.setAccountSession(null);
  ctx.syncCoordinator.setSession(null);
  ctx.renderAccountStatus();
}

// Wires sync.onAuthChange to update accountSession and run the coordinator's
// initial pull/merge when a new authenticated user appears. Successful state
// refreshes are handled by the coordinator callback configured in main.js.
// Applies a successful syncNow() result to the UI. Background syncs keep the
// user's browsed date and transient UI (result.state is always for today, so it
// is reloaded for the browsed date instead); a new account resets both.
// `ctx` needs: setState, renderAll, plus resetTransientUiState (resetUi) or
// getSelectedDate and loadState (background).
export async function applySyncResult(ctx, result, { resetUi = false } = {}) {
  if (!result || result.skipped || !result.state) {
    return false;
  }
  if (resetUi) {
    ctx.setState(result.state);
    ctx.resetTransientUiState();
  } else {
    ctx.setState(await ctx.loadState(ctx.getSelectedDate()));
  }
  ctx.renderAll();
  return true;
}

export function wireAuthChange(ctx) {
  const { sync } = ctx;
  sync.onAuthChange(async session => {
    const previousUserId = ctx.getAccountSession()?.user?.id || null;
    ctx.setAccountSession(session);
    ctx.syncCoordinator.setSession(session);
    ctx.renderAccountStatus();
    if (!session) {
      return;
    }
    if (previousUserId !== session.user?.id) {
      const result = await ctx.syncCoordinator.syncNow();
      await applySyncResult(ctx, result, { resetUi: true });
    }
  });
}

export async function retrySync(ctx) {
  return ctx.syncCoordinator.syncNow();
}

// Native-only: listens for the OAuth redirect deep link (Capacitor's
// "appUrlOpen" event, fired when the system browser hands control back to
// MainActivity via the custom-scheme intent-filter) and forwards matching
// URLs to sync.handleAuthCallback so it can complete the PKCE code exchange.
// A no-op on web, where the OAuth redirect is a normal page load handled by
// supabase-js itself. `ctx` needs: sync.
export function wireAuthCallback(ctx) {
  if (!isNativePlatform()) {
    return () => {};
  }

  const { sync } = ctx;
  let listenerHandle;
  App.addListener("appUrlOpen", async ({ url }) => {
    if (!url || !url.startsWith(NATIVE_AUTH_CALLBACK_URL)) {
      return;
    }
    try {
      await sync.handleAuthCallback(url);
    } catch (error) {
      console.error("OAuth 콜백 처리 중 예외 발생:", error);
    }
  }).then(handle => {
    listenerHandle = handle;
  });

  return () => {
    listenerHandle?.remove();
  };
}
