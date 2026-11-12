export function renderQuizSettingsPage({ quizQuestionFontSize }) {
  return {
    value: {
      quizQuestionFontSizeRange: String(quizQuestionFontSize)
    },
    text: {
      quizQuestionFontSizeValue: `${quizQuestionFontSize}px`
    },
    style: {
      quizQuestionFontSizePreview: { fontSize: `${quizQuestionFontSize}px` }
    }
  };
}

function formatLastSync(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

// One status line for 계정 및 동기화: a badge + short text, plus an optional
// "마지막 동기화" line. `state` is { syncEnabled, session, authenticated,
// status, error, lastSuccessAt } (session = the Supabase session or null).
export function renderAccountStatusPage({ state, helpers }) {
  const { syncEnabled, session, authenticated, status, error, lastSuccessAt } = state;
  const email = session?.user?.email || "";
  let badge;
  let tone;
  let text;
  if (!syncEnabled) {
    badge = "사용 불가";
    tone = "";
    text = "이 환경에서는 로그인을 사용할 수 없습니다.";
  } else if (!session) {
    badge = "로그인 안 됨";
    tone = "";
    text = "이 기기에만 저장";
  } else if (!authenticated) {
    badge = "다시 로그인 필요";
    tone = "yellow";
    text = `${email} · 로그인 세션이 만료되어 동기화가 멈췄습니다`;
  } else if (status === "error") {
    badge = "동기화 오류";
    tone = "red";
    text = `${email} · ${error?.message || error || "알 수 없는 오류"}`;
  } else if (status === "syncing") {
    badge = "동기화 중";
    tone = "blue";
    text = email;
  } else {
    badge = "로그인됨";
    tone = "green";
    text = `${email} · ${status === "success" ? "동기화 켜짐" : "동기화 대기 중"}`;
  }
  const lastSync = session && authenticated ? formatLastSync(lastSuccessAt) : "";
  return {
    html: {
      accountStatus: `<span class="badge ${tone}">${helpers.escapeHtml(badge)}</span><span class="account-status-text">${helpers.escapeHtml(text)}</span>`
    },
    text: {
      syncLastSuccess: lastSync ? `마지막 동기화: ${lastSync}` : ""
    },
    hidden: {
      syncLastSuccess: !lastSync,
      googleSignInBtn: Boolean(session),
      googleSignOutBtn: !session
    },
    disabled: {
      googleSignInBtn: !syncEnabled,
      syncRetryBtn: !(syncEnabled && session && authenticated) || status === "syncing"
    }
  };
}
