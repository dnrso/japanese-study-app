// The one "샘플 데이터" seed used by storage-idb's resetSampleData().
//
// The content is plain data with no host dependencies. apps/web still injects
// it explicitly via `seedState` - that indirection is deliberate, it lets a
// host override the seed - it just re-exports this factory.
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
    // No studyDays row here on purpose: storage-idb synthesizes a zeroed-out
    // row for the seeded entry's date (normalizeStudyDays / ensureStudyDayPayload),
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
