// 문장 tab word rows: per-kanji info and 품사 from core.sentenceWordInfo, and
// the row / popover markup that links them to their 단어·한자 cards.
import { describe, it, expect } from "vitest";
import * as core from "@nihongo-study/core";
import { badgeClassByKind, kindLabels, noteCardPopover, sentenceWordRow } from "@nihongo-study/ui";

const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const items = [
  { id: "k1", kind: "kanji", title: "疲", meaning: "피곤할 피", reading: "음 ヒ / 훈 つかれる" },
  { id: "k2", kind: "kanji", title: "今", meaning: "이제 금(카드)" },
  { id: "w1", kind: "word", title: "疲れる", reading: "つかれる", meaning: "피곤하다", part: "동사" }
];
const helpers = {
  badgeClassByKind,
  core,
  escapeHtml,
  highlight: escapeHtml,
  kindLabels,
  wordInfo: word => core.sentenceWordInfo(word, items)
};

describe("parseWordKanjiField", () => {
  it("maps each single kanji to its meaning", () => {
    const meanings = core.parseWordKanjiField("今 (이제 금), 日（날 일）, 今日 (오늘)");
    expect([...meanings]).toEqual([["今", "이제 금"], ["日", "날 일"]]);
  });

  it("is empty for a missing field", () => {
    expect(core.parseWordKanjiField(undefined).size).toBe(0);
  });
});

describe("sentenceWordInfo", () => {
  it("splits the title into kana runs and kanji with their meanings and cards", () => {
    const info = core.sentenceWordInfo({ title: "今日は", parsed: { kanji: "今 (이제 금), 日 (날 일)", part: "명사" } }, items);
    expect(info.part).toBe("명사");
    expect(info.card).toBeNull();
    expect(info.segments.map(segment => segment.text)).toEqual(["今", "日", "は"]);
    // The word's own 한자= field wins over the registered card's 뜻.
    expect(info.segments[0].kanji).toMatchObject({ char: "今", meaning: "이제 금" });
    expect(info.segments[0].kanji.card.id).toBe("k2");
    expect(info.segments[1].kanji).toMatchObject({ char: "日", meaning: "날 일", card: null });
    expect(info.segments[2].kanji).toBeUndefined();
  });

  it("falls back to the registered word card for 품사 and to the kanji card for 뜻", () => {
    const info = core.sentenceWordInfo({ title: "疲れる", parsed: {} }, items);
    expect(info.card.id).toBe("w1");
    expect(info.part).toBe("동사");
    expect(info.segments[0].kanji.meaning).toBe("피곤할 피");
    expect(info.segments[1]).toEqual({ text: "れる" });
  });

  it("does not treat 々 as a kanji of its own", () => {
    const info = core.sentenceWordInfo({ title: "人々" }, items);
    expect(info.segments.map(segment => Boolean(segment.kanji))).toEqual([true, false]);
  });
});

describe("sentenceWordRow", () => {
  it("makes each kanji a preview button and links the registered word card", () => {
    const html = sentenceWordRow({ title: "疲れる", reading: "つかれる", meaning: "피곤하다", parsed: { part: "동사" } }, helpers);
    expect(html).toContain('class="sentence-word-kanji" data-note-card-kind="kanji" data-note-card-title="疲" data-note-card-meaning="피곤할 피"');
    expect(html).toContain('<span class="sentence-word-part">동사</span>');
    expect(html).toContain('data-note-card-open-kind="word" data-note-card-open-title="疲れる"');
    expect(html).toContain("れる");
  });

  it("marks unregistered kanji and leaves out the card link without a word card", () => {
    const html = sentenceWordRow({ title: "日", meaning: "해", parsed: { kanji: "日 (날 일)" } }, helpers);
    expect(html).toContain("sentence-word-kanji is-unregistered");
    expect(html).not.toContain("data-note-card-open-title");
    expect(html).not.toContain("sentence-word-part");
  });

  it("renders the plain title without a wordInfo helper", () => {
    const html = sentenceWordRow({ title: "<疲>", meaning: "m" }, { escapeHtml, highlight: escapeHtml });
    expect(html).toContain("&lt;疲&gt;");
    expect(html).not.toContain("sentence-word-kanji");
  });
});

describe("noteCardPopover meaning fallback", () => {
  it("shows the known meaning of an unregistered kanji", () => {
    const html = noteCardPopover({ title: "日", item: null, meaning: "날 일", helpers });
    expect(html).toContain("날 일");
    expect(html).toContain("등록된 카드가 없습니다.");
  });
});
