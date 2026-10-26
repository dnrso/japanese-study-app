import { empty, icon, speakerButton, studyCard } from "../components/index.js";

export function homeSummaryPanel() {
  return `<div class="panel home-summary" id="homeSummary"></div>`;
}

export function homeProgressPanel() {
  return `
    <div class="panel home-progress" id="home-progress">
      <div class="progress-ring" id="progressRing">
        <div class="progress-ring-inner"><strong id="progressPercent">0%</strong><span>오늘 목표</span></div>
      </div>
      <div class="home-progress-text">
        <strong id="progressMinutes">0분 / 90분</strong>
        <span id="progressText"></span>
      </div>
    </div>
  `;
}

export function homeSentencePanel() {
  return `
    <section class="panel section home-sentence-panel" id="home-sentence">
      <div class="panel-header">
        <h2 class="panel-title">오늘의 문장</h2>
        <button class="icon-btn" id="homeSentenceRefreshBtn" type="button" title="다른 문장 보기" aria-label="다른 문장 보기">${icon("refresh")}</button>
      </div>
      <div id="homeSentenceCard"></div>
    </section>
  `;
}

export function renderHomeSentencePanel({ sentence, helpers }) {
  return {
    html: {
      homeSentenceCard: sentence
        ? homeSentenceCardMarkup(sentence, helpers)
        : empty("아직 등록된 문장이 없습니다.")
    }
  };
}

function homeSentenceCardMarkup(entry, helpers) {
  return `
    <article class="home-sentence-card">
      <h3 class="home-sentence-title" lang="ja">${speakerButton(entry.title, helpers)}<span>${helpers.highlight(entry.title)}</span></h3>
      <details class="home-sentence-details">
        <summary>읽기 · 해석 보기</summary>
        <div class="daily-reading-meaning">
          <section>
            <span>읽기</span>
            <p lang="ja">${helpers.highlight(entry.reading || "-")}</p>
          </section>
          <section>
            <span>해석</span>
            <p>${helpers.highlight(entry.meaning || "-")}</p>
          </section>
        </div>
      </details>
    </article>
  `;
}

function homeSummaryMarkup(overview) {
  if (overview.isFirstRun) {
    return `
      <div class="eyebrow">시작하기</div>
      <h1>첫 문장을 기록해 보세요</h1>
      <p class="lead">오늘 공부 탭에 문장을 입력하면 단어장, 복습 큐, 퀴즈에서 이어서 활용할 수 있습니다.</p>
      <div class="hero-actions">
        <button class="primary-btn" type="button" data-open-page="today">오늘 공부 기록하기</button>
      </div>
    `;
  }

  const reviewCount = overview.reviewItemCount;
  const recordButton = `<button class="${reviewCount ? "ghost-btn" : "primary-btn"}" type="button" data-open-page="today">오늘 공부 기록하기</button>`;
  const reviewButton = `<button class="${reviewCount ? "primary-btn" : "ghost-btn"}" type="button" data-open-page="review">복습 시작</button>`;
  return `
    <div class="eyebrow">오늘의 학습</div>
    <h1>${reviewCount ? `오늘 복습할 항목 ${reviewCount}개` : "복습할 항목을 모두 정리했어요"}</h1>
    <p class="lead">${reviewCount ? "복습을 먼저 끝내고 새 문장을 기록해 보세요." : "오늘 공부한 문장을 기록해 보세요."}</p>
    <div class="hero-actions">
      ${reviewCount ? reviewButton + recordButton : recordButton + reviewButton}
    </div>
  `;
}

function statCard({ label, value, note, accent = false }) {
  const classes = ["stat-card", accent && value ? "stat-card--accent" : "", value ? "" : "is-zero"].filter(Boolean).join(" ");
  return `<div class="${classes}"><div class="stat-label">${label}</div><div class="stat-value">${value}개</div><div class="stat-note">${note}</div></div>`;
}

export function renderHomePage({ overview, helpers }) {
  const groups = overview.reviewSummary.map(({ kind, count }) =>
    `<tr><td>${helpers.kindLabels[kind]}</td><td>${count}</td><td><span class="badge ${count ? "red" : "green"}">${count ? "복습 필요" : "정리됨"}</span></td></tr>`
  );

  return {
    text: {
      progressPercent: `${overview.progress}%`,
      progressMinutes: `${overview.minutes}분 / ${overview.goalMinutes}분`,
      progressText: overview.progress >= 100 ? "오늘 목표를 달성했습니다." : `목표까지 ${overview.remainingMinutes}분 남았습니다.`,
      focusText: overview.focusText
    },
    html: {
      homeSummary: homeSummaryMarkup(overview),
      "home-stats": [
        statCard({ label: "복습 대기", value: overview.reviewItemCount, note: "오늘/대기 복습 대상", accent: true }),
        statCard({ label: "오늘 입력한 문장", value: overview.todaySentenceCount, note: "오늘 공부 탭 기준" }),
        statCard({ label: "오늘 복습 완료", value: overview.reviewedTodayCount, note: "단어 · 문법 · 표현 · 한자" }),
        statCard({ label: "전체 학습 항목", value: overview.newItemCount, note: "단어 · 문법 · 표현 · 한자" })
      ].join(""),
      recentItems: overview.recentItems.length
        ? overview.recentItems.map(item => studyCard(item, helpers)).join("")
        : empty("최근 추가 항목이 없습니다."),
      reviewSummary: groups.join("")
    },
    hidden: {
      // The seeded instructional sentence repeats the getting-started guide.
      "home-sentence": overview.isFirstRun
    },
    style: {
      progressRing: {
        background: `conic-gradient(var(--accent) ${overview.progress * 3.6}deg, var(--line) 0deg)`
      }
    }
  };
}

export function renderTasksPage({ tasks, helpers }) {
  return {
    html: {
      taskList: tasks.length ? tasks.map(task => `
        <div class="task ${task.done ? "done" : ""}" data-task-id="${helpers.escapeHtml(task.id)}">
          <button class="check" data-toggle-task="${helpers.escapeHtml(task.id)}" aria-label="완료 전환"></button>
          <div><strong>${helpers.highlight(task.title)}</strong><span>${helpers.highlight(task.note)}</span></div>
          <span class="badge ${task.done ? "green" : "red"}">${helpers.escapeHtml(task.tag)}</span>
        </div>
      `).join("") : empty("오늘 할 일이 없습니다.")
    }
  };
}

export function renderQuickFiltersPage({ counts }) {
  return {
    text: {
      reviewFilterCount: counts.review,
      sourceFilterCount: counts.source,
      pendingFilterCount: counts.pending
    }
  };
}
