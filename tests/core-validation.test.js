// Ported from scratchpad test-validation.mjs.
import { describe, it, expect } from "vitest";
import { diagnoseSentenceBlockStructure, hasValidSentenceBlockStructure, looksLikeSentenceBlockAttempt } from "@nihongo-study/core";

const validBlock = `# 私なんか気に障ることしたかな…
읽기 わたし なんか きに さわる こと したかな…
해석 나 같은 게 기분 상할 만한 일을 한 걸까…
단어장
\`私\` (わたし) 나, 저 | 한자=私 (나 사) | 품사=대명사 | 문자=한자
문법
\`したかな\` 동사 する의 과거형에 종조사 かな가 붙은 형태입니다.`;

const conversationalReply = `네, 알겠습니다. 일본어 문장 5개를 선정하여 분석해 드리겠습니다.
잠시만 기다려 주세요.`;

const missingReading = `# 私なんか気に障ることしたかな…
해석 나 같은 게 기분 상할 만한 일을 한 걸까…`;

const missingMeaning = `# 私なんか気に障ることしたかな…
읽기 わたし なんか きに さわる こと したかな…`;

const noHeading = `私なんか気に障ることしたかな…
읽기 わたし なんか きに さわる こと したかな…
해석 나 같은 게 기분 상할 만한 일을 한 걸까…`;

const headingWithoutSpace = `#私なんか
읽기 わたし
해석 나`;

describe("hasValidSentenceBlockStructure", () => {
  it("(a) accepts a valid sentence block", () => {
    expect(hasValidSentenceBlockStructure(validBlock)).toBe(true);
  });

  it("(b) rejects a conversational reply (bug report case)", () => {
    expect(hasValidSentenceBlockStructure(conversationalReply)).toBe(false);
  });

  it("(c) rejects an empty string", () => {
    expect(hasValidSentenceBlockStructure("")).toBe(false);
  });

  it("rejects a block missing the 읽기 line", () => {
    expect(hasValidSentenceBlockStructure(missingReading)).toBe(false);
  });

  it("rejects a block missing the 해석 line", () => {
    expect(hasValidSentenceBlockStructure(missingMeaning)).toBe(false);
  });

  it("rejects text without a leading '# ' heading", () => {
    expect(hasValidSentenceBlockStructure(noHeading)).toBe(false);
  });

  it("rejects a malformed heading ('#' without a following space)", () => {
    expect(hasValidSentenceBlockStructure(headingWithoutSpace)).toBe(false);
  });
});

describe("diagnoseSentenceBlockStructure", () => {
  it("is valid with nothing missing for a well-formed block", () => {
    expect(diagnoseSentenceBlockStructure(validBlock)).toEqual({ valid: true, missing: [] });
  });

  it("reports only 읽기 missing when just the reading line is absent", () => {
    expect(diagnoseSentenceBlockStructure(missingReading)).toEqual({
      valid: false,
      missing: ["읽기"]
    });
  });

  it("reports only 해석 missing when just the meaning line is absent", () => {
    expect(diagnoseSentenceBlockStructure(missingMeaning)).toEqual({
      valid: false,
      missing: ["해석"]
    });
  });

  it("reports only the heading missing when 읽기/해석 are both present but there's no '# ' line", () => {
    expect(diagnoseSentenceBlockStructure(noHeading)).toEqual({
      valid: false,
      missing: ["원문(#으로 시작)"]
    });
  });

  it("reports the heading missing for a malformed '#' heading (no following space)", () => {
    expect(diagnoseSentenceBlockStructure(headingWithoutSpace)).toEqual({
      valid: false,
      missing: ["원문(#으로 시작)"]
    });
  });

  it("reports all three parts missing for an empty string", () => {
    expect(diagnoseSentenceBlockStructure("")).toEqual({
      valid: false,
      missing: ["원문(#으로 시작)", "읽기", "해석"]
    });
  });

  it("reports all three parts missing for a conversational (non-block) reply", () => {
    expect(diagnoseSentenceBlockStructure(conversationalReply)).toEqual({
      valid: false,
      missing: ["원문(#으로 시작)", "읽기", "해석"]
    });
  });

  it("stays consistent with hasValidSentenceBlockStructure (implemented in terms of this diagnostic)", () => {
    [validBlock, conversationalReply, "", missingReading, missingMeaning, noHeading, headingWithoutSpace].forEach(sample => {
      expect(hasValidSentenceBlockStructure(sample)).toBe(diagnoseSentenceBlockStructure(sample).valid);
    });
  });
});

describe("looksLikeSentenceBlockAttempt", () => {
  it("is false for plain single-line free text (legitimate quick-entry, no markers at all)", () => {
    expect(looksLikeSentenceBlockAttempt("私は学生です")).toBe(false);
  });

  it("is false for an empty string", () => {
    expect(looksLikeSentenceBlockAttempt("")).toBe(false);
  });

  it("is true once a '#' heading line is present, even without a following space", () => {
    expect(looksLikeSentenceBlockAttempt("#私は学生です")).toBe(true);
  });

  it("is true once a 읽기 or 해석 line is present, even with no '#' heading", () => {
    expect(looksLikeSentenceBlockAttempt("私は学生です\n읽기 わたしはがくせいです")).toBe(true);
    expect(looksLikeSentenceBlockAttempt("私は学生です\n해석 나는 학생입니다")).toBe(true);
  });

  it("is true for a well-formed block", () => {
    expect(looksLikeSentenceBlockAttempt(validBlock)).toBe(true);
  });
});
