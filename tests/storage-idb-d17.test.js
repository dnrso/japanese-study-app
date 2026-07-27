import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createIdbStorage } from "@nihongo-study/storage-idb";

const studyDate = "2026-07-27";

function sentenceRawText(title, sections) {
  return [
    `# ${title}`,
    "읽기 いぬのぶん",
    "해석 dog sentence",
    ...sections
  ].join("\n");
}

describe("storage-idb D17 daily-candidate deduplication", () => {
  let storage;

  beforeEach(async () => {
    storage = createIdbStorage({
      dbName: `storage-idb-d17-${Math.random().toString(16).slice(2)}`
    });
    await storage.initDatabase();
  });

  it("merges repeated candidates, enriches blank fields and accumulates distinct sentence links", async () => {
    const firstState = await storage.addDailyEntry({
      studyDate,
      kind: "sentence",
      rawText: sentenceRawText("첫 문장", [
        "단어장",
        "`犬`: 개 | 품사=명사"
      ])
    });
    const firstCandidate = firstState.dailyEntries.find(entry => entry.kind === "word" && entry.title === "犬");

    expect(firstCandidate).toBeTruthy();
    const registered = await storage.registerDailyEntries([firstCandidate.id], studyDate);
    expect(registered.state.dailyEntries.find(entry => entry.id === firstCandidate.id)?.registered).toBe(true);

    const secondState = await storage.addDailyEntry({
      studyDate,
      kind: "sentence",
      rawText: sentenceRawText("둘째 문장", [
        "단어장",
        "`犬` (いぬ): dog | 한자=犬(개 견) | 문자=한자",
        "` 犬 ` (いぬ): dog"
      ])
    });
    const candidates = secondState.dailyEntries.filter(entry => entry.kind === "word" && entry.title === "犬");

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: firstCandidate.id,
      reading: "いぬ",
      meaning: "개",
      registered: true
    });
    expect(candidates[0].parsed).toMatchObject({
      reading: "いぬ",
      meaning: "개",
      kanji: "犬(개 견)",
      part: "명사",
      script: "한자"
    });
    expect(candidates[0].sourceSentences.map(sentence => sentence.title).sort()).toEqual([
      "둘째 문장",
      "첫 문장"
    ]);

    const exported = await storage.exportData();
    const activeLinks = exported.data.dailyEntryLinks.filter(
      link => link.entryId === firstCandidate.id && !link.deletedAt
    );
    expect(activeLinks).toHaveLength(2);
    expect(new Set(activeLinks.map(link => link.sentenceId)).size).toBe(2);
  });

  it("keeps candidates separate when either the study date or kind differs", async () => {
    await storage.addDailyEntry({
      studyDate,
      kind: "sentence",
      rawText: sentenceRawText("종류 경계", [
        "단어장",
        "`犬` (いぬ): 개",
        "문법",
        "`犬`: 문법 이름"
      ])
    });
    const nextDate = "2026-07-28";
    const nextDateState = await storage.addDailyEntry({
      studyDate: nextDate,
      kind: "sentence",
      rawText: sentenceRawText("날짜 경계", [
        "단어장",
        "`犬` (いぬ): 개"
      ])
    });
    const candidates = nextDateState.allDailyEntries.filter(entry => entry.title === "犬");

    expect(candidates).toHaveLength(3);
    expect(candidates.map(entry => `${entry.studyDate}:${entry.kind}`).sort()).toEqual([
      `${studyDate}:grammar`,
      `${studyDate}:word`,
      `${nextDate}:word`
    ]);
  });

  it("serializes concurrent sentence additions without creating duplicate candidates", async () => {
    await Promise.all([
      storage.addDailyEntry({
        studyDate,
        kind: "sentence",
        rawText: sentenceRawText("동시 문장 A", [
          "단어장",
          "`猫` (ねこ): 고양이"
        ])
      }),
      storage.addDailyEntry({
        studyDate,
        kind: "sentence",
        rawText: sentenceRawText("동시 문장 B", [
          "단어장",
          "`猫` (ねこ): cat"
        ])
      })
    ]);

    const state = await storage.getState(studyDate);
    const candidates = state.dailyEntries.filter(entry => entry.kind === "word" && entry.title === "猫");

    expect(candidates).toHaveLength(1);
    expect(candidates[0].sourceSentences).toHaveLength(2);
  });
});
