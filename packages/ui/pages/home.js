import { empty, studyCard } from "../components/index.js";

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
