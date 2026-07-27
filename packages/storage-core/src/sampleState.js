// The one "샘플 데이터" seed, shared by both storage adapters.
//
// This used to live only in apps/web/src/sampleState.js and reach the storage
// layer through storage-idb's `seedState` factory option, which storage-sqlite
// did not have at all - so the desktop "샘플 데이터" button wiped the database
// instead of restoring anything (tracked as D18 in
// tests/storage-conformance.test.js). The content is plain data with no host
// dependencies, so it belongs here, the one module both the CommonJS sqlite
// adapter (`require`) and the Vite-bundled ESM idb adapter (`import`) can
// reach. apps/web still injects it explicitly via `seedState` - that
// indirection is deliberate, it lets a host override the seed - it just
// re-exports this factory now instead of carrying a second copy.
//
// It used to seed a full demo dataset (sample words/kanji/grammar/
// expressions/tasks/sources) so the app didn't look empty on first run.
// That's been replaced with a single instructional sentence card: a fresh
// install should guide the user into the 오늘 공부 tab rather than hand
// them fabricated study data to sift through.
import { todayKey as defaultTodayKey } from "./dates.js";

export function createSampleState(todayKeyFn = defaultTodayKey) {
  const today = typeof todayKeyFn === "function" ? todayKeyFn() : defaultTodayKey();

  return {
    selectedDate: today,
    studyLog: {
      minutes: 0,
      totalMinutes: 0,
      summary: "",
      note: ""
    },
    // No studyDays row here on purpose: both adapters synthesize a zeroed-out
    // row for the seeded entry's date (storage-idb via normalizeStudyDays /
    // ensureStudyDayPayload, storage-sqlite via ensureStudyDay in seedFromState),
    // so the calendar/home stats render correctly without one being listed
    // explicitly here.
    studyDays: [],
    dailyEntries: [
      {
        id: "sentence-onboarding",
        kind: "sentence",
        title: "「今日の勉強」タブから、勉強する文章を追加して登録してください。",
        reading: "「きょうのべんきょう」タブから、べんきょうするぶんしょうをついかしてとうろくしてください。",
        meaning: "오늘 공부 탭에서 공부할 문장 추가를 하고 등록해주세요",
        studyDate: today
      }
    ],
    tasks: [],
    items: []
  };
}
