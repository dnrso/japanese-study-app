import { createSupabaseSync } from "@nihongo-study/sync";
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
//   byId, sync,
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
export const NATIVE_AUTH_CALLBACK_URL = "io.github.dnrso.nihongostudy://auth-callback";

function isNativePlatform() {
  return Boolean(Capacitor?.isNativePlatform?.());
}

export function createSync({ storage, mergeSnapshots }) {
  return createSupabaseSync({ storage, mergeSnapshots });
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

  const signInBtn = byId("googleSignInBtn");
  const signOutBtn = byId("googleSignOutBtn");
  const status = byId("accountStatus");
  if (!signInBtn || !signOutBtn || !status) {
    return;
  }
  const accountSession = ctx.getAccountSession();
  const email = accountSession?.user?.email || "";
  signInBtn.hidden = Boolean(accountSession);
  signOutBtn.hidden = !accountSession;
  status.textContent = accountSession
    ? `${email} 계정으로 로그인되어 있습니다.`
    : ctx.sync.isEnabled
      ? "로그인되어 있지 않습니다."
      : "Supabase 환경변수가 설정되지 않아 로그인을 사용할 수 없습니다.";
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
      ? "Supabase 환경변수가 설정되지 않았습니다."
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
  ctx.renderAccountStatus();
}

// Wires sync.onAuthChange to update accountSession, re-render account status,
// and pull a fresh sync snapshot into local state when a session appears.
// `ctx` additionally needs: getState/setState, resetTransientUiState, renderAll.
export function wireAuthChange(ctx) {
  const { sync } = ctx;
  sync.onAuthChange(async session => {
    ctx.setAccountSession(session);
    ctx.renderAccountStatus();
    if (!session) {
      return;
    }
    const result = await sync.syncNow();
    if (result && !result.skipped) {
      ctx.setState(result.state);
      ctx.resetTransientUiState();
      ctx.renderAll();
    }
  });
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
