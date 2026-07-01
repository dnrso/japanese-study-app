import { empty, studyCard } from "../components/index.js";

export function homeWelcomePanel() {
  return `
    <div class="panel welcome">
      <div class="eyebrow">공부 노트 사용 방법</div>
      <h1>오늘 공부에서 공부할 문장이나 단어를 입력하세요.</h1>
      <p class="lead">입력한 내용은 단어장, 복습 큐, 퀴즈에서 이어서 활용할 수 있습니다.</p>
      <div class="hero-actions">
        <button class="primary-btn" type="button" data-open-page="today">오늘 공부 기록하기</button>
        <button class="ghost-btn" type="button" data-open-page="review">복습 시작</button>
        <button class="ghost-btn" type="button" data-open-page="sources">자료 이어서 보기</button>
      </div>
    </div>
  `;
}

export function renderHomePage({ overview, helpers }) {
  const groups = overview.reviewSummary.map(({ kind, count }) =>
    `<tr><td>${helpers.kindLabels[kind]}</td><td>${count}</td><td><span class="badge ${count ? "red" : "green"}">${count ? "복습 필요" : "정리됨"}</span></td></tr>`
  );

  return {
    text: {
      progressPercent: `${overview.progress}%`,
      progressText: overview.progress >= 100 ? "오늘 목표를 달성했습니다." : `목표까지 ${overview.remainingMinutes}분 남았습니다.`,
      todayDoneCount: `${overview.todayEntryCount}개`,
      newItemCount: `${overview.newItemCount}개`,
      reviewItemCount: `${overview.reviewItemCount}개`,
      studyMinutes: `${overview.minutes}분`,
      focusText: overview.focusText
    },
    html: {
      recentItems: overview.recentItems.length
        ? overview.recentItems.map(item => studyCard(item, helpers)).join("")
        : empty("최근 추가 항목이 없습니다."),
      reviewSummary: groups.join("")
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
        <div class="task ${task.done ? "done" : ""}" data-task-id="${task.id}">
          <button class="check" data-toggle-task="${task.id}" aria-label="완료 전환"></button>
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
      n3FilterCount: counts.n3,
      sourceFilterCount: counts.source,
      pendingFilterCount: counts.pending
    }
  };
}
