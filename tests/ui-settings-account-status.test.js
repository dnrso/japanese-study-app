import { describe, expect, it } from "vitest";
import { renderAccountStatusPage, renderQuizSettingsPage } from "@nihongo-study/ui";

const helpers = { escapeHtml: value => String(value).replaceAll("<", "&lt;") };
const session = { user: { email: "a@example.com" } };

function render(state) {
  return renderAccountStatusPage({ state: { syncEnabled: true, session: null, authenticated: false, ...state }, helpers });
}

describe("renderAccountStatusPage", () => {
  it("disables sign-in and retry when login is unavailable", () => {
    const patch = render({ syncEnabled: false });
    expect(patch.html.accountStatus).toContain("이 환경에서는 로그인을 사용할 수 없습니다.");
    expect(patch.disabled).toEqual({ googleSignInBtn: true, syncRetryBtn: true });
    expect(patch.hidden.syncLastSuccess).toBe(true);
  });

  it("shows the signed-out state with sign-in enabled", () => {
    const patch = render({});
    expect(patch.html.accountStatus).toContain("로그인 안 됨");
    expect(patch.html.accountStatus).toContain("이 기기에만 저장");
    expect(patch.disabled).toEqual({ googleSignInBtn: false, syncRetryBtn: true });
    expect(patch.hidden).toMatchObject({ googleSignInBtn: false, googleSignOutBtn: true });
  });

  it("shows the signed-in state with the escaped email and a readable last sync", () => {
    const patch = render({ session: { user: { email: "<a>@example.com" } }, authenticated: true, status: "success", lastSuccessAt: "2026-01-02T03:04:05Z" });
    expect(patch.html.accountStatus).toContain("로그인됨");
    expect(patch.html.accountStatus).toContain("&lt;a>@example.com · 동기화 켜짐");
    expect(patch.text.syncLastSuccess).toMatch(/^마지막 동기화: .+/);
    expect(patch.hidden).toMatchObject({ syncLastSuccess: false, googleSignInBtn: true, googleSignOutBtn: false });
    expect(patch.disabled.syncRetryBtn).toBe(false);
  });

  it("maps syncing, error and expired-session states", () => {
    expect(render({ session, authenticated: true, status: "syncing" }).disabled.syncRetryBtn).toBe(true);
    const error = render({ session, authenticated: true, status: "error", error: new Error("boom") });
    expect(error.html.accountStatus).toContain("동기화 오류");
    expect(error.html.accountStatus).toContain("boom");
    expect(error.disabled.syncRetryBtn).toBe(false);
    const expired = render({ session, authenticated: false });
    expect(expired.html.accountStatus).toContain("다시 로그인 필요");
    expect(expired.disabled.syncRetryBtn).toBe(true);
    expect(expired.hidden.syncLastSuccess).toBe(true);
  });
});

describe("renderQuizSettingsPage", () => {
  it("disables and dims the dependent review row when the checkbox is off", () => {
    const patch = renderQuizSettingsPage({
      quizQuestionFontSize: 40,
      quizReviewOnCorrect: false,
      quizCorrectReview: "내일",
      scheduledReviewOptions: ["내일"],
      helpers
    });
    expect(patch.disabled.quizCorrectReviewSelect).toBe(true);
    expect(patch.classToggle.quizCorrectReviewRow).toEqual({ "is-disabled": true });
    expect(patch.style.quizQuestionFontSizePreview.fontSize).toBe("40px");
    expect(patch.text.quizQuestionFontSizeValue).toBe("40px");
  });
});
