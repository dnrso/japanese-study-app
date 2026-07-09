export async function getSession(supabase) {
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    return null;
  }
  return data?.session || null;
}

export function onAuthChange(supabase, cb) {
  if (!supabase) {
    Promise.resolve().then(() => cb(null));
    return () => {};
  }

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session || null);
  });

  return () => {
    data?.subscription?.unsubscribe();
  };
}

export async function signInWithOAuth(supabase, { provider, redirectTo, skipBrowserRedirect } = {}) {
  if (!supabase) {
    return null;
  }
  return supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect }
  });
}

// Completes a PKCE OAuth redirect: exchanges the `code` query param (from
// the native deep-link callback, or a web PKCE redirect) for a session.
export async function exchangeCodeForSession(supabase, code) {
  if (!supabase) {
    return { data: null, error: null };
  }
  return supabase.auth.exchangeCodeForSession(code);
}

// Completes an implicit-flow OAuth redirect: sets the session directly from
// the access/refresh tokens found in the URL fragment. Kept as a fallback in
// case flowType is ever changed away from "pkce".
export async function setSessionFromTokens(supabase, { access_token, refresh_token }) {
  if (!supabase) {
    return { data: null, error: null };
  }
  return supabase.auth.setSession({ access_token, refresh_token });
}
