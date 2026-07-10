export const defaultGeminiModel = "gemini-3.1-flash-lite";
export const geminiInteractionsEndpoint = "https://generativelanguage.googleapis.com/v1beta/interactions";

// Enforced input length cap (source of truth, copied verbatim into
// supabase/functions/_shared/ai.js for the edge function). packages/core's
// AI_ANALYSIS_LIMITS.maxChars is a display-only copy shown next to the
// client's AI 문장 분석 checkbox - keep all three in sync by hand.
export const maxSentenceLength = 300;

export const aiSentenceAnalysisMessages = Object.freeze({
  emptySentence: "분석할 일본어 문장을 입력하세요.",
  tooLong: "문장은 300자 이내로 입력해 주세요.",
  missingApiKey: "Gemini API 키를 먼저 설정하세요.",
  unsupportedFetch: "이 환경에서는 AI 요청을 보낼 수 없습니다.",
  emptyResponse: "Gemini API 응답에서 분석 결과를 찾지 못했습니다."
});

export const japaneseSentenceAnalysisSystemPrompt = `당신은 일본어 학습용 분석 도우미입니다. 
사용자가 일본어 문장이나 한국어 문장을 제공하면,
만약 한국어 문장이라면 일본어로 자연스럽게 번역한 뒤 아래 형식에 맞춰 분석합니다.

출력 형식:
# 일본어 원문
읽기 히라가나 읽기
해석 한국어 해석
단어장
\`표제어\` (읽기) 뜻 | 한자=한자와 한국식 한자 뜻 | 품사=품사 | 문자=문자분류
문법
\`문법 항목\` 문법 설명
표현
\`표현 항목\` 표현/관용구/회화적 뉘앙스 설명

작성 규칙:

1. 원문이 여러 문장이면 문장 단위로 나누어 각각 같은 형식으로 분석합니다.
2. 단어장은 학습 가치가 있는 핵심 단어만 선정합니다.
3. 조사, 조동사, 접속사는 문법적으로 중요할 때만 단어장에 포함합니다.
4. 활용된 단어는 기본형을 표제어로 씁니다.
   * 예: した → \`する\`
   * 예: 考えなくて → \`考える\`
   * 예: 遊ばず → \`遊ぶ\`

5. 관용구나 굳어진 표현은 단어장에 개별 단어로만 쪼개지 말고 표현 단위도 함께 다룹니다.
   * 예: 気に障る
   * 예: 大人しくする

6. 문법 항목에는 활용, 조사, 조동사, 축약형, 부정형, 의문형, 종조사 등을 설명합니다.
7. 문법 항목은 해당 문장에만 맞춘 해석 설명이 아니라, 다른 예문에도 적용 가능한 일반 문법 규칙으로 설명합니다.
8. 문벙 항목 설명 시 필요하면 마지막에 “이 문장에서는 … 정도의 뉘앙스입니다”처럼 짧게 적용 예시를 덧붙입니다.
9. 표현 항목에는 직역만으로 이해하기 어려운 회화체, 관용구, 강조 표기, 말투, 뉘앙스를 설명합니다.
10. 문법과 표현이 겹칠 경우:
   * 구조 설명은 문법에 작성합니다.
   * 실제 회화적 의미와 뉘앙스는 표현에 작성합니다.

11. 해당 항목이 없으면 생략하고 적지 않습니다.
12. 일본어 읽기는 전부 히라가나로 씁니다.
13. 읽기에는 자연스러운 단어 단위 띄어쓰기를 넣습니다.
14. 해석은 직역보다 자연스러운 한국어를 우선합니다.
15. 단, 원문의 생략, 반말, 말투, 감정은 가능한 한 살립니다.

품사 분류는 아래 목록 중 하나만 사용합니다.
* 명사
* 대명사
* 동사
* い형용사
* な형용사
* 부사
* 조사
* 조동사
* 접속사
* 감탄사
* 표현
* 동사표현
* 형용사표현
* 부사표현
* 문법표현
* サ변동사

문자 분류는 아래 목록 중 하나만 사용합니다.
* 한자
* 히라가나
* 가타카나
* 한자+히라가나
* 한자+가타카나
* 혼합

한자 표기 규칙:
* 표제어에 한자가 있으면 \`한자=\` 항목을 반드시 씁니다.
* 한자가 없는 단어는 한자항목을 생략합니다.
* 한자 뜻은 가능한 한 한국식 음훈으로 씁니다.
  예: 気 (기운 기), 障 (막을 장)
* 단어에 여러 한자가 있으면 모두 풀이합니다.

예시 출력:
# 私なんか気に障ることしたかな…
읽기 わたし なんか きに さわる こと したかな…
해석 나 같은 게 기분 상할 만한 일을 한 걸까…
단어장
\`私\` (わたし) 나, 저 | 한자=私 (나 사) | 품사=대명사 | 문자=한자
\`なんか\` (なんか) ~같은 것, ~따위 | 한자=없음 | 품사=조사 | 문자=히라가나
\`気に障る\` (きにさわる) 기분을 상하게 하다, 비위에 거슬리다 | 한자=気 (기운 기), 障 (막을 장) | 품사=동사표현 | 문자=한자+히라가나
\`こと\` (こと) 일, 것 | 한자=없음 | 품사=명사 | 문자=히라가나
\`する\` (する) 하다 | 한자=없음 | 품사=동사 | 문자=히라가나
문법
\`したかな\` 동사 \`する\`의 과거형 \`した\`에 자문이나 부드러운 의문을 나타내는 종조사 \`かな\`가 붙은 형태입니다. 자신의 행동을 되돌아보며 “했나?”라고 혼잣말처럼 생각하는 뉘앙스입니다.
표현
\`私なんか\` 자신을 낮추거나 가볍게 표현하는 말투입니다. 문맥에 따라 “나 같은 게”, “나 따위가” 정도로 해석할 수 있습니다.
\`気に障る\` 직역하면 “기분에 걸리다”에 가깝지만, 실제로는 “기분을 상하게 하다”, “비위를 거스르다”라는 관용적 표현입니다.`;

export async function analyzeJapaneseSentence({
  sentence,
  apiKey,
  model = defaultGeminiModel,
  endpoint = geminiInteractionsEndpoint,
  fetchImpl = globalThis.fetch
} = {}) {
  const input = normalizeJapaneseSentenceInput(sentence);
  const key = normalizeApiKey(apiKey);
  if (!input) {
    throw new Error(aiSentenceAnalysisMessages.emptySentence);
  }
  if (!key) {
    throw new Error(aiSentenceAnalysisMessages.missingApiKey);
  }
  if (typeof fetchImpl !== "function") {
    throw new Error(aiSentenceAnalysisMessages.unsupportedFetch);
  }

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key
    },
    body: JSON.stringify({
      model,
      system_instruction: japaneseSentenceAnalysisSystemPrompt,
      input,
      generation_config: {
        temperature: 0.2
      }
    })
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(errorMessageFromPayload(payload) || `Gemini API 요청 실패 (${response.status})`);
  }

  const text = responseTextFromPayload(payload);
  if (!text) {
    throw new Error(aiSentenceAnalysisMessages.emptyResponse);
  }
  return text;
}

export async function analyzeJapaneseSentenceForStudy({
  sentence,
  apiKey,
  model = defaultGeminiModel,
  analyzer = analyzeJapaneseSentence,
  ...options
} = {}) {
  const input = normalizeJapaneseSentenceInput(sentence);
  if (!input) {
    return {
      ok: false,
      reason: "emptySentence",
      message: aiSentenceAnalysisMessages.emptySentence,
      rawText: "",
      sourceSentence: ""
    };
  }
  if (input.length > maxSentenceLength) {
    return {
      ok: false,
      reason: "too-long",
      message: aiSentenceAnalysisMessages.tooLong,
      rawText: "",
      sourceSentence: input
    };
  }
  if (!normalizeApiKey(apiKey)) {
    return {
      ok: false,
      reason: "missingApiKey",
      message: aiSentenceAnalysisMessages.missingApiKey,
      rawText: "",
      sourceSentence: input
    };
  }

  const rawText = await analyzer({
    sentence: input,
    apiKey,
    model,
    ...options
  });

  return {
    ok: true,
    reason: "",
    message: "",
    rawText,
    sourceSentence: input,
    model
  };
}

export function normalizeJapaneseSentenceInput(value) {
  return String(value || "").trim();
}

export function normalizeApiKey(value) {
  return String(value || "").trim();
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function errorMessageFromPayload(payload) {
  return [
    payload?.error?.message,
    payload?.message,
    payload?.status
  ].map(value => String(value || "").trim()).find(Boolean) || "";
}

function responseTextFromPayload(payload) {
  const direct = [payload?.output_text, payload?.outputText]
    .map(value => String(value || "").trim())
    .find(Boolean);
  if (direct) {
    return direct;
  }

  const candidatesText = collectText(payload?.candidates).trim();
  if (candidatesText) {
    return candidatesText;
  }

  return collectText(payload?.steps).trim();
}

function collectText(value) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(collectText).filter(Boolean).join("\n");
  }
  if (typeof value !== "object") {
    return "";
  }

  const directText = [
    value.text,
    value.output_text,
    value.outputText,
    value.delta?.text
  ].map(item => String(item || "").trim()).find(Boolean);
  if (directText) {
    return directText;
  }

  return [
    value.content,
    value.contents,
    value.parts,
    value.output,
    value.response,
    value.candidate,
    value.message
  ].map(collectText).filter(Boolean).join("\n");
}
