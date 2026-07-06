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
