// Parity + regression tests for the ONE daily-entry parser.
//
// Until this suite existed there were two parsers for the same text format:
// the canonical markdown/regex one in packages/storage-sqlite (used by the
// Electron desktop app) and an inline reimplementation inside
// packages/storage-idb (used by web/Android). They agreed exactly on the
// canonical AI output format (see packages/ai/src/index.js's [출력 형식]) and
// diverged on every markdown-bulleted variant of it - including the shape
// itemToRawText itself emits - so web users got corrupted cards where desktop
// users did not. The parser now lives in packages/storage-core and both
// adapters import it.
//
// These assertions are deliberately literal expected values, not "both
// parsers agree": agreement is now structural (one function), so the thing
// worth pinning down is what that function actually returns.
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { dailyEntryToItems, itemToRawText, parseDailyEntry, withKanjiItems } from "@nihongo-study/storage-core";
import { createIdbStorage } from "@nihongo-study/storage-idb";

// (a) The canonical AI output format: no bullets, meaning space-separated
// after the reading, pipe-delimited 한자/품사/문자 metadata. Trimmed down
// from the worked example in packages/ai/src/index.js.
const canonicalAiBlock = [
  "# 私なんか気に障ることしたかな…",
  "읽기 わたし なんか きに さわる こと したかな…",
  "해석 나 같은 게 기분 상할 만한 일을 한 걸까…",
  "단어장",
  "`私` (わたし) 나, 저 | 한자=私 (나 사) | 품사=대명사 | 문자=한자",
  "`気に障る` (きにさわる) 기분을 상하게 하다 | 한자=気 (기운 기), 障 (막을 장) | 품사=동사표현 | 문자=한자+히라가나",
  "문법",
  "`したかな` 과거형 `した`에 종조사 `かな`가 붙은 형태입니다.",
  "표현",
  "`私なんか` 자신을 낮추어 표현하는 말투입니다."
].join("\n");

// (b) The markdown-bulleted variant. This is what itemToRawText emits for the
// 읽기/해석 lines and what a pasted LLM reply looks like: `- ` bullets and a
// `: ` between the reading and the meaning. The old idb parser stripped the
// title and reading but left the bullet and the colon behind, producing
// meanings like "-  : 날씨".
const bulletedBlock = [
  "# 今日は天気がいいです",
  "- **읽기**: きょうはてんきがいいです",
  "- **해석**: 오늘은 날씨가 좋습니다",
  "- **단어장**",
  "- `天気` (てんき): 날씨 | 품사=명사 | 문자=한자",
  "- **문법**",
  "- `がいい`: ~이 좋다",
  "- **표현**",
  "- `いいですね` (いいですね): 좋네요"
].join("\n");

const cases = [
  {
    name: "(a) canonical AI output format",
    kind: "sentence",
    raw: canonicalAiBlock,
    expected: {
      kind: "sentence",
      title: "私なんか気に障ることしたかな…",
      reading: "わたし なんか きに さわる こと したかな…",
      meaning: "나 같은 게 기분 상할 만한 일을 한 걸까…",
      words: [
        { kind: "word", title: "私", reading: "わたし", meaning: "나, 저", kanji: "私 (나 사)", part: "대명사", script: "한자" },
        {
          kind: "word",
          title: "気に障る",
          reading: "きにさわる",
          meaning: "기분을 상하게 하다",
          kanji: "気 (기운 기), 障 (막을 장)",
          part: "동사표현",
          script: "한자+히라가나"
        }
      ],
      grammar: [
        {
          kind: "grammar",
          title: "したかな",
          reading: "",
          meaning: "과거형 `した`에 종조사 `かな`가 붙은 형태입니다.",
          note: "과거형 `した`에 종조사 `かな`가 붙은 형태입니다."
        }
      ],
      expressions: [
        {
          kind: "expression",
          title: "私なんか",
          reading: "",
          meaning: "자신을 낮추어 표현하는 말투입니다.",
          note: "자신을 낮추어 표현하는 말투입니다."
        }
      ],
      note: canonicalAiBlock
    }
  },
  {
    name: "(b) markdown-bulleted format: bullets and ': ' are not leaked into the meaning",
    kind: "sentence",
    raw: bulletedBlock,
    expected: {
      kind: "sentence",
      title: "今日は天気がいいです",
      // Bulleted `- **읽기**:` / `- **해석**:` labels are recognised. The old
      // idb parser only matched a bare line-initial "읽기"/"해석" and dropped
      // both fields entirely.
      reading: "きょうはてんきがいいです",
      meaning: "오늘은 날씨가 좋습니다",
      // Bulleted section headers (`- **단어장**`) are recognised too; the old
      // idb parser required a line equal to exactly "단어장" and so found no
      // sections at all here.
      words: [
        // meaning is "날씨", NOT "-  : 날씨".
        { kind: "word", title: "天気", reading: "てんき", meaning: "날씨", kanji: "", part: "명사", script: "한자" }
      ],
      grammar: [
        // meaning is "~이 좋다", NOT "- : ~이 좋다".
        { kind: "grammar", title: "がいい", reading: "", meaning: "~이 좋다", note: "~이 좋다" }
      ],
      expressions: [
        { kind: "expression", title: "いいですね", reading: "いいですね", meaning: "좋네요", note: "좋네요" }
      ],
      note: bulletedBlock
    }
  },
  {
    name: "(c) '- **읽기**:' style on a word entry (the itemToRawText shape)",
    kind: "word",
    raw: [
      "### 天気",
      "- **읽기**: てんき",
      "- **해석**: 날씨",
      "- **한자**: 天(하늘), 気(기운)",
      "- **품사**: 명사",
      "- **문자**: 한자",
      "- **메모**: 날씨 관련 단어"
    ].join("\n"),
    expected: {
      kind: "word",
      // The old idb parser produced title "###" (its non-backtick fallback
      // matched the heading marker), reading "하늘" (the first parenthetical
      // anywhere in the text, from the 한자 line) and a meaning that was the
      // entire remaining multi-line blob.
      title: "天気",
      reading: "てんき",
      meaning: "날씨",
      words: [],
      grammar: [],
      expressions: [],
      note: [
        "### 天気",
        "- **읽기**: てんき",
        "- **해석**: 날씨",
        "- **한자**: 天(하늘), 気(기운)",
        "- **품사**: 명사",
        "- **문자**: 한자",
        "- **메모**: 날씨 관련 단어"
      ].join("\n")
    }
  },
  {
    name: "(d) inline word entry with pipe metadata",
    kind: "word",
    raw: "`天気` (てんき) 날씨 | 한자=天 (하늘 천) | 품사=명사 | 문자=한자",
    expected: {
      kind: "word",
      title: "天気",
      reading: "てんき",
      meaning: "날씨",
      words: [
        { kind: "word", title: "天気", reading: "てんき", meaning: "날씨", kanji: "天 (하늘 천)", part: "명사", script: "한자" }
      ],
      grammar: [],
      expressions: [],
      note: "`天気` (てんき) 날씨 | 한자=天 (하늘 천) | 품사=명사 | 문자=한자"
    }
  },
  {
    name: "(e1) malformed: empty input",
    kind: "sentence",
    raw: "",
    expected: {
      // No "새 문장" placeholder - an empty title is passed through, and
      // registerDailyEntry/putDailyCandidate skip titleless candidates.
      kind: "sentence",
      title: "",
      reading: "",
      meaning: "",
      words: [],
      grammar: [],
      expressions: [],
      note: ""
    }
  },
  {
    name: "(e2) partial: plain one-line quick entry, no markers at all",
    kind: "sentence",
    raw: "  今日はいい天気です  ",
    expected: {
      kind: "sentence",
      title: "今日はいい天気です",
      reading: "",
      meaning: "",
      words: [],
      grammar: [],
      expressions: [],
      note: "今日はいい天気です"
    }
  },
  {
    name: "(e3) partial: heading and 읽기 only, no 해석 and no sections",
    kind: "sentence",
    raw: "# 明日は雨です\n읽기 あしたはあめです",
    expected: {
      kind: "sentence",
      title: "明日は雨です",
      reading: "あしたはあめです",
      meaning: "",
      words: [],
      grammar: [],
      expressions: [],
      note: "# 明日は雨です\n읽기 あしたはあめです"
    }
  },
  {
    name: "(e4) malformed: 단어장 line without a backtick-quoted headword is skipped",
    kind: "sentence",
    raw: "# 文\n읽기 ぶん\n해석 문장\n단어장\n- 天気: 날씨",
    expected: {
      kind: "sentence",
      title: "文",
      reading: "ぶん",
      meaning: "문장",
      // The old idb parser turned this into a junk candidate titled "-".
      words: [],
      grammar: [],
      expressions: [],
      note: "# 文\n읽기 ぶん\n해석 문장\n단어장\n- 天気: 날씨"
    }
  },
  {
    name: "(e5) unknown kind falls back to sentence",
    kind: "banana",
    raw: "# 文\n읽기 ぶん\n해석 문장",
    expected: {
      kind: "sentence",
      title: "文",
      reading: "ぶん",
      meaning: "문장",
      words: [],
      grammar: [],
      expressions: [],
      note: "# 文\n읽기 ぶん\n해석 문장"
    }
  }
];

describe("parseDailyEntry", () => {
  cases.forEach(({ name, kind, raw, expected }) => {
    it(name, () => {
      expect(parseDailyEntry(kind, raw)).toEqual(expected);
    });
  });
});

describe("note field", () => {
  it("carries the whole trimmed raw text on every kind, so nothing typed is lost", () => {
    ["sentence", "word", "grammar", "expression"].forEach(kind => {
      expect(parseDailyEntry(kind, `\n  ${canonicalAiBlock}  \n`).note).toBe(canonicalAiBlock);
    });
  });

  it("gives 문법/표현 candidates a note holding the full description", () => {
    const parsed = parseDailyEntry("sentence", bulletedBlock);
    expect(parsed.grammar[0].note).toBe("~이 좋다");
    expect(parsed.expressions[0].note).toBe("좋네요");
    // Word candidates carry no note of their own; the adapters fall back to
    // the meaning (sqlite) or to "" (idb).
    expect(parsed.words[0].note).toBeUndefined();
  });

  it("dailyEntryToItems puts the raw text in the item note for a directly added entry", () => {
    const parsed = parseDailyEntry("grammar", "`がいい` ~이 좋다");
    const [item] = dailyEntryToItems("grammar", parsed);
    expect(item).toMatchObject({
      kind: "grammar",
      title: "がいい",
      meaning: "~이 좋다",
      part: "문법",
      script: "혼합",
      note: "`がいい` ~이 좋다"
    });
  });
});

describe("itemToRawText round-trip", () => {
  it("re-parses its own output back into the same title/reading/meaning", () => {
    const item = { title: "天気", reading: "てんき", meaning: "날씨", kanji: "天 (하늘 천)", part: "명사", script: "한자", note: "날씨 관련" };
    const parsed = parseDailyEntry("word", itemToRawText(item));
    expect(parsed.title).toBe("天気");
    expect(parsed.reading).toBe("てんき");
    expect(parsed.meaning).toBe("날씨");
  });

  it("does NOT recover 한자/품사/문자 from '- **한자**:' lines (known shared limitation)", () => {
    // Both adapters lose these on a bulleted re-parse - the metadata is only
    // read from the pipe form (`한자=...`). Pinned so that fixing it is a
    // deliberate change to both platforms at once rather than a silent drift.
    const item = { title: "天気", reading: "てんき", meaning: "날씨", kanji: "天 (하늘 천)", part: "명사", script: "한자" };
    const [reparsed] = dailyEntryToItems("word", parseDailyEntry("word", itemToRawText(item)));
    expect(reparsed.kanji).toBe("");
    expect(reparsed.part).toBe("");
    expect(reparsed.script).toBe("");
  });
});

describe("withKanjiItems", () => {
  it("splits pipe-form 한자 metadata into separate 한자 items", () => {
    const parsed = parseDailyEntry("sentence", canonicalAiBlock);
    const kanji = withKanjiItems(parsed.words).filter(item => item.kind === "kanji");
    expect(kanji.map(item => [item.title, item.meaning])).toEqual([
      ["私", "나 사"],
      ["気", "기운 기"],
      ["障", "막을 장"]
    ]);
  });
});

describe("storage-idb uses the shared parser", () => {
  it("stores the canonical parse and builds uncorrupted candidates from bulleted input", async () => {
    const store = createIdbStorage({ dbName: `parser-parity-${Math.random().toString(16).slice(2)}` });
    await store.initDatabase();
    const studyDate = "2026-07-06";
    const state = await store.addDailyEntry({ studyDate, kind: "sentence", rawText: bulletedBlock });

    const sentence = state.dailyEntries.find(entry => entry.kind === "sentence");
    expect(sentence.title).toBe("今日は天気がいいです");
    expect(sentence.reading).toBe("きょうはてんきがいいです");
    expect(sentence.meaning).toBe("오늘은 날씨가 좋습니다");
    // The stored `parsed` blob is exactly what the shared parser returns, so
    // desktop and web backups round-trip byte-for-byte.
    expect(sentence.parsed).toEqual(parseDailyEntry("sentence", bulletedBlock));

    const word = state.allDailyEntries.find(entry => entry.parentId === sentence.id && entry.kind === "word");
    expect(word.title).toBe("天気");
    expect(word.reading).toBe("てんき");
    expect(word.meaning).toBe("날씨");

    const registered = await store.registerDailyEntries([word.id], studyDate);
    const item = registered.state.items.find(candidate => candidate.title === "天気");
    expect(item.meaning).toBe("날씨");
    expect(item.part).toBe("명사");
    expect(item.script).toBe("한자");
  });

  it("keeps 품사/문자/한자 when a word entry is added directly with pipe metadata", async () => {
    const store = createIdbStorage({ dbName: `parser-parity-${Math.random().toString(16).slice(2)}` });
    await store.initDatabase();
    const studyDate = "2026-07-06";
    const state = await store.addDailyEntry({
      studyDate,
      kind: "word",
      rawText: "`天気` (てんき) 날씨 | 한자=天 (하늘 천) | 품사=명사 | 문자=한자"
    });

    const entry = state.dailyEntries.find(candidate => candidate.kind === "word");
    expect(entry.title).toBe("天気");
    expect(entry.meaning).toBe("날씨");

    const registered = await store.registerDailyEntries([entry.id], studyDate);
    const item = registered.state.items.find(candidate => candidate.title === "天気");
    expect(item.part).toBe("명사");
    expect(item.script).toBe("한자");
    expect(item.kanji).toBe("天 (하늘 천)");
  });
});
