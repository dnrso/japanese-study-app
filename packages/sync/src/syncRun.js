// The pull-merge-push sequence behind syncNow(), kept free of any Supabase
// import so tests can drive it with fake pull/push functions.
//
// Local data is deliberately NOT exported before the pull: the merge runs
// inside storage.applyRemoteSnapshot() against the rows as they are when the
// pull finishes, so a write made while the network request was in flight is
// merged instead of being overwritten by a stale pre-pull export.
export async function runSnapshotSync({ storage, mergeSnapshots, pull, push }) {
  const remote = await pull();

  let applied;
  if (remote?.snapshot) {
    applied = await storage.applyRemoteSnapshot(remote.snapshot, mergeSnapshots);
  } else {
    const exported = (await storage.exportData()).data;
    applied = { data: exported, state: await storage.getState(exported.selectedDate) };
  }

  await push(applied.data);
  return { skipped: false, state: applied.state };
}
