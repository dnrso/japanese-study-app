import { describe, expect, it } from "vitest";
import { hasValidSentenceBlockStructure as clientCheck } from "@nihongo-study/core";
import { hasValidSentenceBlockStructure as serverCheck } from "../supabase/functions/_shared/ai.js";

// The client (packages/core) and the Supabase edge function
// (supabase/functions/_shared/ai.js) each carry their own copy of this check,
// because the edge function cannot import from the workspace packages. This
// test fails if the two copies ever disagree.
const block = (...lines) => lines.join("\n");

const cases = [
  ["valid block", block("# 犬が好きです", "읽기 いぬがすきです", "해석 개를 좋아합니다")],
  ["valid block with CRLF", block("# 犬", "읽기 いぬ", "해석 개").replace(/\n/g, "\r\n")],
  ["valid block with blank lines and indentation", block("", "  # 犬", "", "  읽기 いぬ", "해석 개", "")],
  ["valid block with bulleted-free extra sections", block("# 犬", "읽기 いぬ", "해석 개", "- 단어: 犬")],
  ["missing reading", block("# 犬", "해석 개")],
  ["missing meaning", block("# 犬", "읽기 いぬ")],
  ["missing heading", block("읽기 いぬ", "해석 개")],
  ["heading without space after #", block("#犬", "읽기 いぬ", "해석 개")],
  ["heading not first", block("서론", "# 犬", "읽기 いぬ", "해석 개")],
  ["conversational reply", "물론이죠! 이 문장은 이렇게 해석할 수 있습니다."],
  ["only heading", "# 犬"],
  ["whitespace only", "  \n \n"],
  ["empty string", ""],
  ["null", null],
  ["undefined", undefined]
];

describe("hasValidSentenceBlockStructure client/server sync", () => {
  it.each(cases)("agrees on: %s", (_label, input) => {
    expect(clientCheck(input)).toBe(serverCheck(input));
  });

  it("accepts the valid cases and rejects the invalid ones (guards against both copies breaking together)", () => {
    expect(cases.filter(([label]) => label.startsWith("valid")).every(([, input]) => clientCheck(input))).toBe(true);
    expect(cases.filter(([label]) => !label.startsWith("valid")).some(([, input]) => clientCheck(input))).toBe(false);
  });
});
