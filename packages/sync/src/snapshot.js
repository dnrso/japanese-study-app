const tableName = "study_snapshots";

export async function pullSnapshot(supabase, userId) {
  const { data, error } = await supabase
    .from(tableName)
    .select("user_id, snapshot, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data || null;
}

export async function pushSnapshot(supabase, userId, snapshot) {
  const { error } = await supabase
    .from(tableName)
    .upsert({
      user_id: userId,
      snapshot,
      updated_at: new Date().toISOString()
    });

  if (error) {
    throw error;
  }
}
