// Seed state for a brand-new install (see packages/storage-idb's
// initDatabase(): this only ever runs once, when the IndexedDB "meta"
// store has no "initialized" flag yet - existing installs already have
// that flag set and are completely unaffected by changes here).
//
// The content itself now lives in @nihongo-study/storage-core, because the
// desktop adapter's resetSampleData() has to restore exactly the same sample
// data (it used to just wipe the database - D18 in
// tests/storage-conformance.test.js) and packages/ cannot import from apps/.
// This module stays as the web app's injection point: main.js keeps passing
// `seedState` into createIdbStorage explicitly, so a host can still override
// the seed without touching the storage layer.
//
// Imported by relative path, not by the "@nihongo-study/storage-core" bare
// specifier, for the same reason storage-idb itself does: see that adapter's
// header.
export { createSampleState } from "../../../packages/storage-core/src/index.js";
