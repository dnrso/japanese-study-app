// Ported from scratchpad test-validation.mjs.
import { describe, it, expect } from "vitest";
import { hasValidSentenceBlockStructure } from "@nihongo-study/core";

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
