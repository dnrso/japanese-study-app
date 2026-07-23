// Seed state for a brand-new install (see packages/storage-idb's
// initDatabase(): this only ever runs once, when the IndexedDB "meta"
// store has no "initialized" flag yet - existing installs already have
// that flag set and are completely unaffected by changes here).
//
// This used to seed a full demo dataset (sample words/kanji/grammar/
// expressions/tasks/sources) so the app didn't look empty on first run.
// That's been replaced with a single instructional sentence card: a fresh
// install should guide the user into the 오늘 공부 tab rather than hand
// them fabricated study data to sift through.
export function createSampleState(todayKey) {
  const today = todayKey();

  return {
    selectedDate: today,
    studyLog: {
      minutes: 0,
      totalMinutes: 0,
      summary: "",
      note: ""
    },
    // No studyDays row here on purpose: storage-idb's normalizeStudyDays
    // synthesizes a zeroed-out row for `today` automatically from
    // dailyEntries/selectedDate (see normalizeStudyDays/ensureStudyDayPayload
    // in packages/storage-idb/src/index.js), so the calendar/home stats
    // render correctly without one being listed explicitly here.
    studyDays: [],
    dailyEntries: [
      {
        id: "sentence-onboarding",
        kind: "sentence",
        title: "오늘 공부 탭에서 공부할 문장 추가를 하고 등록해주세요",
        reading: "",
        meaning: "위 입력창에 예시 구조로 문장을 붙여넣으면 단어장까지 자동 정리됩니다.",
        studyDate: today
      }
    ],
    tasks: [],
    items: []
  };
}
