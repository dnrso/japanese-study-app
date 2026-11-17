// 노트 퀴즈 (quiz from a note), app/UI half: the notes reader's quiz row and
// row-menu items, the quiz panel's scope label / 노트로 돌아가기 button, and
// apps/web's scoped startQuiz (every askable card once, kept for 다시 풀기).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as core from "@nihongo-study/core";
import { badgeClassByKind, kindLabels, renderKanjiQuizPage, renderNotesPage, renderWordQuizPage } from "@nihongo-study/ui";
import { emptyQuiz, emptySentenceQuiz, exitQuizSession, nextQuizQuestion, quizScopeOf, startQuiz } from "../apps/web/src/quiz.js";

const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const helpers = { badgeClassByKind, core, escapeHtml, highlight: escapeHtml, kindLabels };

const note = { id: "n1", title: "청소", body: "掃除", updatedAt: "2026-11-17T10:00:00.000Z" };

function readPatch(quiz, extra = {}) {
  return renderNotesPage({ view: "read", notes: [note], total: 1, note, rendered: { html: "" }, quizFor: () => quiz, helpers, ...extra });
}

describe("notes reader quiz row", () => {
  it("shows one button per kind with askable cards and its count", () => {
    const patch = readPatch([
      { kind: "kanji", askable: 25, linked: 25 },
      { kind: "word", askable: 4, linked: 4 }
    ]);
    expect(patch.hidden.notesReadQuiz).toBe(false);
    const html = patch.html.notesReadQuiz;
    expect(html.match(/data-note-quiz-kind=/g)).toHaveLength(2);
    expect(html).toContain('data-note-quiz-kind="kanji" data-note-quiz-note="n1"');
    expect(html).toContain('data-note-quiz-kind="word" data-note-quiz-note="n1"');
    expect(html.replace(/<[^>]+>/g, "")).toContain("한자 퀴즈 25");
    expect(html.replace(/<[^>]+>/g, "")).toContain("단어 퀴즈 4");
    expect(html).not.toContain("출제 가능");
  });

  it("hints how many linked cards can be asked, in 자 for kanji and 개 for words", () => {
    const html = readPatch([
      { kind: "kanji", askable: 25, linked: 27 },
      { kind: "word", askable: 4, linked: 6 }
    ]).html.notesReadQuiz;
    expect(html).toContain("27자 중 25자 출제 가능");
    expect(html).toContain("6개 중 4개 출제 가능");
  });

  it("skips kinds with nothing askable and hides the row when no kind has any", () => {
    const one = readPatch([{ kind: "kanji", askable: 0, linked: 3 }, { kind: "word", askable: 2, linked: 2 }]);
    expect(one.html.notesReadQuiz).not.toContain('data-note-quiz-kind="kanji"');
    expect(one.html.notesReadQuiz).toContain('data-note-quiz-kind="word"');

    const none = readPatch([{ kind: "kanji", askable: 0, linked: 3 }, { kind: "word", askable: 0, linked: 0 }]);
    expect(none.hidden.notesReadQuiz).toBe(true);
    expect(none.html.notesReadQuiz).toBe("");
    // quizFor defaults to "nothing".
    const fallback = renderNotesPage({ view: "read", notes: [note], total: 1, note, rendered: { html: "" }, helpers });
    expect(fallback.hidden.notesReadQuiz).toBe(true);
  });

  it("escapes a hostile note id", () => {
    const hostile = { ...note, id: '"><img src=x onerror=alert(1)>' };
    const patch = renderNotesPage({ view: "read", notes: [hostile], total: 1, note: hostile, rendered: { html: "" }, quizFor: () => [{ kind: "kanji", askable: 1, linked: 1 }], helpers });
    expect(patch.html.notesReadQuiz).not.toContain("<img");
    expect(patch.html.notesReadQuiz).toContain("data-note-quiz-note=\"&quot;&gt;&lt;img src=x onerror=alert(1)&gt;\"");
    expect(patch.html.notesList).not.toContain("<img");
  });
});

describe("notes list row menu quiz items", () => {
  const menuOf = html => html.slice(html.indexOf('<div class="notebook-menu-list">'), html.indexOf("</div>", html.indexOf('<div class="notebook-menu-list">')));

  it("adds 한자 퀴즈 / 단어 퀴즈 after 수정 only for kinds with askable cards", () => {
    const html = renderNotesPage({ notes: [note], total: 1, quizFor: () => [{ kind: "kanji", askable: 3, linked: 3 }, { kind: "word", askable: 0, linked: 1 }], helpers }).html.notesList;
    const menu = menuOf(html);
    expect(menu).toContain('<button type="button" data-note-quiz-kind="kanji" data-note-quiz-note="n1">한자 퀴즈</button>');
    expect(menu).not.toContain("단어 퀴즈");
    expect(menu.indexOf("data-edit-note")).toBeLessThan(menu.indexOf("data-note-quiz-kind"));
    expect(menu.indexOf("data-note-quiz-kind")).toBeLessThan(menu.indexOf("data-duplicate-note"));
  });

  it("has no quiz items without askable cards", () => {
    const html = renderNotesPage({ notes: [note], total: 1, helpers }).html.notesList;
    expect(html).not.toContain("data-note-quiz-kind");
  });
});

describe("quiz panel scope", () => {
  const item = { id: "k1", kind: "kanji", title: "掃", meaning: "쓸 소" };
  const question = { item, choices: ["쓸 소", "덜 제", "비 우", "물 수"], correctAnswer: "쓸 소", answerType: "meaning", mode: "kanjiToMeaning" };
  const running = { ...emptyQuiz(), question, session: core.createQuizSession(2, 2) };
  const finished = { ...running, session: { ...running.session, finished: true } };
  const scope = { noteId: '"><b>n1', title: "<script>청소</script>", questionIds: ["k1"] };

  it("labels a scoped run with its note title, escaped", () => {
    const html = renderKanjiQuizPage({ quiz: { ...running, scope }, helpers }).html.kanjiQuizPanel;
    expect(html).toContain('class="quiz-session-scope"');
    expect(html).toContain("&lt;script&gt;청소&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html.replace(/<[^>]+>/g, "")).toContain("노트 · ");
  });

  it("renders an unscoped run exactly as before (no label, no 노트로 돌아가기)", () => {
    const question = renderKanjiQuizPage({ quiz: running, helpers }).html.kanjiQuizPanel;
    expect(question).not.toContain("quiz-session-scope");
    expect(question.trimStart().startsWith('<div class="quiz-session-header">')).toBe(true);
    const result = renderWordQuizPage({ quiz: finished, helpers }).html.wordQuizPanel;
    expect(result).not.toContain("quiz-session-scope");
    expect(result).not.toContain("data-quiz-open-note");
    expect(result).toContain('data-quiz-kind="word"');
  });

  it("offers 노트로 돌아가기 on a scoped run's result", () => {
    const html = renderKanjiQuizPage({ quiz: { ...finished, scope }, helpers }).html.kanjiQuizPanel;
    expect(html).toContain('data-quiz-open-note="&quot;&gt;&lt;b&gt;n1"');
    expect(html).toContain("노트로 돌아가기");
    expect(html).toContain('data-quiz-kind="kanji"');
    expect(html).not.toContain("<b>");
  });
});

describe("scoped startQuiz (apps/web quiz.js)", () => {
  const kanji = ["掃", "除", "雨", "水", "火", "木", "金", "土"].map((title, index) => ({ id: `k${index}`, kind: "kanji", title, meaning: `뜻${index}` }));

  function createCtx(overrides = {}) {
    let wordQuiz = emptyQuiz();
    let kanjiQuiz = emptyQuiz();
    let sentenceQuiz = emptySentenceQuiz();
    const state = { items: kanji, allDailyEntries: [] };
    const scrollIntoView = vi.fn();
    return {
      byId: () => ({ scrollIntoView }),
      getState: () => state,
      setState: vi.fn(),
      kanjiQuizMode: "kanjiToMeaning",
      wordQuizMode: "jpToMeaning",
      quizSessionSize: 2,
      quizWeakOnly: false,
      getWordQuiz: () => wordQuiz,
      setWordQuiz: next => { wordQuiz = next; },
      getKanjiQuiz: () => kanjiQuiz,
      setKanjiQuiz: next => { kanjiQuiz = next; },
      getSentenceQuiz: () => sentenceQuiz,
      setSentenceQuiz: next => { sentenceQuiz = next; },
      speak: vi.fn(),
      renderWordQuiz: vi.fn(),
      renderKanjiQuiz: vi.fn(),
      renderSentenceQuiz: vi.fn(),
      renderAll: vi.fn(),
      ...overrides
    };
  }

  beforeEach(() => {
    vi.stubGlobal("window", { setTimeout: () => 0 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the 퀴즈 문제 수 setting and no scope for an unscoped run", () => {
    const ctx = createCtx();
    startQuiz("kanji", ctx);
    expect(ctx.getKanjiQuiz().session.total).toBe(2);
    expect(ctx.getKanjiQuiz().scope).toBeUndefined();
    expect(quizScopeOf("kanji", ctx)).toBeNull();
  });

  it("asks every askable card in the scope once, ignoring the session size", () => {
    const ctx = createCtx();
    const scope = { noteId: "n1", title: "청소", questionIds: ["k0", "k1", "k2"] };
    startQuiz("kanji", ctx, { scope });
    const quiz = ctx.getKanjiQuiz();
    expect(quiz.session.total).toBe(3);
    expect([...quiz.plan].sort()).toEqual(["k0", "k1", "k2"]);
    expect(quiz.questionIds).toEqual(["k0", "k1", "k2"]);
    expect(quizScopeOf("kanji", ctx)).toBe(scope);

    // The scope survives 다음 문제 and only scoped cards are asked.
    const asked = [quiz.question.item.id];
    for (let step = 0; step < 2; step += 1) {
      ctx.setKanjiQuiz({ ...ctx.getKanjiQuiz(), answered: true, session: core.recordQuizAnswer(ctx.getKanjiQuiz().session, ctx.getKanjiQuiz().question, true, "") });
      nextQuizQuestion("kanji", ctx);
      asked.push(ctx.getKanjiQuiz().question.item.id);
      expect(ctx.getKanjiQuiz().scope).toBe(scope);
    }
    expect(asked.sort()).toEqual(["k0", "k1", "k2"]);

    exitQuizSession(ctx);
    expect(quizScopeOf("kanji", ctx)).toBeNull();
  });

  it("intersects the scope with the weak-only restriction", () => {
    const items = kanji.map((item, index) => index === 1 ? { ...item, quizWrongCount: 2, quizCorrectStreak: 0 } : item);
    const ctx = createCtx({ getState: () => ({ items, allDailyEntries: [] }), quizWeakOnly: true });
    const weak = core.weakQuizQuestionIds({ items, entries: [], quizKind: "kanji" });
    startQuiz("kanji", ctx, { scope: { noteId: "n1", title: "청소", questionIds: ["k0", "k1", "k2"] } });
    const expected = core.intersectQuestionIds(weak, ["k0", "k1", "k2"]);
    expect(expected).toEqual(["k1"]);
    expect(ctx.getKanjiQuiz().questionIds).toEqual(expected);
    expect(ctx.getKanjiQuiz().session?.total ?? 0).toBe(expected.length);
  });
});
