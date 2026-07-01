import "@nihongo-study/ui/styles";
import * as core from "@nihongo-study/core";
import {
  applyPagePatch,
  badgeClassByKind,
  kindLabels,
  renderHomePage,
  renderQuickFiltersPage,
  renderTasksPage,
  tocByPage
} from "@nihongo-study/ui";

const sampleState = {
  selectedDate: todayKey(),
  studyLog: {
    minutes: 45,
    totalMinutes: 1280,
    summary: "뉴스 문장 3개에서 단어와 표현을 정리하세요.",
    note: ""
  },
  studyDays: [],
  dailyEntries: [
    { id: "sentence-1", kind: "sentence", title: "私なんか気に障ることしたかな", studyDate: todayKey() },
    { id: "word-1", kind: "word", title: "気に障る", parentId: "sentence-1", studyDate: todayKey() }
  ],
  tasks: [
    { id: "task-1", title: "어제 추가한 단어 복습", note: "뜻을 가리고 10개 확인", tag: "복습", done: false },
    { id: "task-2", title: "오늘 문장 2개 정리", note: "단어와 문법 후보까지 등록", tag: "입력", done: true }
  ],
  items: [
    {
      id: "item-1",
      kind: "word",
      title: "気に障る",
      reading: "きにさわる",
      meaning: "기분에 거슬리다",
      level: "N3",
      part: "동사",
      script: "한자+히라가나",
      review: "오늘",
      source: "뉴스 문장",
      note: ""
    },
    {
      id: "item-2",
      kind: "grammar",
      title: "なんか",
      reading: "",
      meaning: "자신을 낮추거나 가볍게 말할 때 쓰는 표현",
      level: "N3",
      review: "대기",
      source: "회화",
      note: "예문 속 뉘앙스를 함께 복습",
      sourceSentences: [{ id: "sentence-1", title: "私なんか気に障ることしたかな", studyDate: todayKey() }]
    },
    {
      id: "item-3",
      kind: "expression",
      title: "お疲れさまです",
      reading: "おつかれさまです",
      meaning: "수고하셨습니다",
      level: "회화",
      review: "내일",
      source: "직장 회화",
      note: ""
    },
    {
      id: "item-4",
      kind: "kanji",
      title: "私",
      reading: "わたし",
      meaning: "나, 저",
      level: "N5",
      review: "대기",
      source: "",
      note: ""
    }
  ]
};

function renderAppShell() {
  document.getElementById("app").innerHTML = `
    <div class="app">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">学</div>
          <div>
            <div class="brand-title">일본어공부노트</div>
            <div class="brand-subtitle">웹 미리보기</div>
          </div>
        </div>

        <nav class="tabbar" aria-label="주요 페이지 탭">
          <button class="tab active" type="button">홈</button>
          <button class="tab" type="button" disabled>오늘 공부</button>
          <button class="tab" type="button" disabled>자료</button>
          <button class="tab" type="button" disabled>단어</button>
          <button class="tab" type="button" disabled>퀴즈</button>
          <button class="tab" type="button" disabled>복습 큐</button>
        </nav>

        <label class="search" aria-label="전체 검색">
          <span>⌕</span>
          <input id="globalSearch" placeholder="웹 저장소 연결 예정" disabled />
        </label>

        <div class="top-actions">
          <div class="date-chip" id="todayDate"></div>
          <button class="primary-btn" type="button" disabled>+ 빠른 추가</button>
        </div>
      </header>

      <div class="layout">
        <aside class="sidebar">
          <div class="sidebar-section">
            <p class="sidebar-title">현재 페이지 목차</p>
            <div class="toc-list" id="tocList"></div>
          </div>

          <div class="sidebar-section">
            <p class="sidebar-title">빠른 필터</p>
            <div class="toc-list">
              <button class="toc-item filter-btn" type="button" disabled><span>복습 필요</span><span class="count" id="reviewFilterCount">0</span></button>
              <button class="toc-item filter-btn" type="button" disabled><span>JLPT N3</span><span class="count" id="n3FilterCount">0</span></button>
              <button class="toc-item filter-btn" type="button" disabled><span>자료 연결됨</span><span class="count" id="sourceFilterCount">0</span></button>
              <button class="toc-item filter-btn" type="button" disabled><span>미완료</span><span class="count" id="pendingFilterCount">0</span></button>
            </div>
          </div>

          <div class="mini-card">
            <strong>오늘의 초점</strong>
            <p id="focusText">새 항목을 추가하고 복습 큐를 정리하세요.</p>
          </div>
        </aside>

        <main class="main">
          <section class="page" id="home">
            <div class="hero" id="home-overview">
              <div class="panel welcome">
                <div class="eyebrow">웹 미리보기</div>
                <h1>오늘도 일본어 감각을<br />조금 더 선명하게.</h1>
                <p class="lead">공통 core/ui 패키지로 렌더링한 Home 화면입니다. IndexedDB 저장소는 다음 단계에서 연결합니다.</p>
                <div class="hero-actions">
                  <button class="primary-btn" type="button" disabled>오늘 공부 기록하기</button>
                  <button class="ghost-btn" type="button" disabled>복습 시작</button>
                  <button class="ghost-btn" type="button" disabled>자료 이어서 보기</button>
                </div>
              </div>

              <div class="panel today-panel" id="home-progress">
                <div class="panel-header">
                  <h2 class="panel-title">오늘 진행률</h2>
                  <span class="badge red">목표 90분</span>
                </div>
                <div class="progress-ring" id="progressRing">
                  <div class="progress-inner">
                    <div>
                      <strong id="progressPercent">0%</strong>
                      <span>완료</span>
                    </div>
                  </div>
                </div>
                <p class="muted" id="progressText">오늘 공부 시간을 기록하면 진행률이 갱신됩니다.</p>
              </div>
            </div>

            <div class="stat-grid" id="home-stats">
              <div class="stat-card">
                <div class="stat-label">오늘 공부 항목</div>
                <div class="stat-value" id="todayDoneCount">0개</div>
                <div class="stat-note">완료한 할 일 기준</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">새 항목</div>
                <div class="stat-value" id="newItemCount">0개</div>
                <div class="stat-note">단어 · 문법 · 표현 · 한자</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">복습 항목</div>
                <div class="stat-value" id="reviewItemCount">0개</div>
                <div class="stat-note">오늘/대기 복습 대상</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">오늘 공부 시간</div>
                <div class="stat-value" id="studyMinutes">0분</div>
                <div class="stat-note">목표 90분</div>
              </div>
            </div>

            <div class="content-grid">
              <div>
                <section class="panel section" id="home-today">
                  <div class="panel-header">
                    <h2 class="panel-title">오늘 할 일</h2>
                    <button class="ghost-btn" type="button" disabled>+ 할 일 추가</button>
                  </div>
                  <div class="task-list" id="taskList"></div>
                </section>

                <section class="panel section" id="home-recent">
                  <div class="panel-header">
                    <h2 class="panel-title">최근 추가 항목</h2>
                    <button class="ghost-btn" type="button" disabled>전체 보기</button>
                  </div>
                  <div class="cards" id="recentItems"></div>
                </section>
              </div>

              <div>
                <section class="panel section" id="home-queue">
                  <div class="panel-header">
                    <h2 class="panel-title">복습 큐</h2>
                    <button class="primary-btn" type="button" disabled>복습 보기</button>
                  </div>
                  <table class="table">
                    <thead>
                      <tr>
                        <th>유형</th>
                        <th>개수</th>
                        <th>상태</th>
                      </tr>
                    </thead>
                    <tbody id="reviewSummary"></tbody>
                  </table>
                </section>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  `;
}

function renderHome() {
  document.getElementById("todayDate").textContent = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).format(new Date());
  renderToc();
  applyPagePatch(renderHomePage({
    overview: core.homeOverview(sampleState, ""),
    helpers: renderHelpers()
  }));
  applyPagePatch(renderTasksPage({
    tasks: sampleState.tasks,
    helpers: renderHelpers()
  }));
  applyPagePatch(renderQuickFiltersPage({
    counts: core.quickFilterCounts(sampleState, "")
  }));
}

function renderToc() {
  const tocItems = tocByPage.home || [];
  document.getElementById("tocList").innerHTML = tocItems.map((item, index) => `
    <a class="toc-item ${index === 0 ? "active" : ""}" href="#${item[0]}">
      <span>${item[1]}</span>
      ${item[2] ? `<span class="count">${item[2]}</span>` : ""}
    </a>
  `).join("");
}

function renderHelpers() {
  return {
    badgeClassByKind,
    core,
    escapeHtml,
    highlight,
    kindLabels,
    reviewStatusText: core.reviewStatusText
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function highlight(value) {
  return escapeHtml(value);
}

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

renderAppShell();
renderHome();
