import {
  homeSentencePanel,
  homeSummaryPanel,
  icon,
  SENTENCE_PERIOD_FILTERS,
  SENTENCE_STATUS_FILTERS,
  sentenceEntryPanel
} from "@nihongo-study/ui";
import { DEFAULT_LIST_PAGE_SIZES, LIST_PAGE_SIZE_OPTIONS } from "@nihongo-study/core";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderAppShell(byId) {
  byId("app").innerHTML = `
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
          <button class="tab active" type="button" data-page="home">홈</button>
          <button class="tab" type="button" data-page="today">오늘 공부</button>
          <button class="tab" type="button" data-page="sources">자료</button>
          <button class="tab" type="button" data-page="sentences">문장</button>
          <button class="tab" type="button" data-page="words">단어</button>
          <button class="tab" type="button" data-page="grammar">문법</button>
          <button class="tab" type="button" data-page="expressions">표현</button>
          <button class="tab" type="button" data-page="kanji">한자</button>
          <button class="tab" type="button" data-page="quiz">퀴즈</button>
          <button class="tab" type="button" data-page="review">복습 큐</button>
          <button class="tab" type="button" data-page="stats">통계</button>
          <button class="tab" type="button" data-page="settings">설정</button>
        </nav>

        <label class="search" aria-label="전체 검색">
          <span class="search-icon">${icon("search")}</span>
          <input id="globalSearch" placeholder="단어, 문법, 표현, 자료 검색" />
          <span class="shortcut">Ctrl K</span>
        </label>

        <div class="top-actions">
          <div class="date-chip" id="todayDate"></div>
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
              <button class="toc-item filter-btn" type="button" data-filter="review"><span>복습 필요</span><span class="count" id="reviewFilterCount">0</span></button>
              <button class="toc-item filter-btn" type="button" data-filter="source"><span>문장 연결 단어</span><span class="count" id="sourceFilterCount">0</span></button>
              <button class="toc-item filter-btn" type="button" data-filter="pending"><span>미완료</span><span class="count" id="pendingFilterCount">0</span></button>
            </div>
          </div>

          <div class="mini-card">
            <strong>오늘의 초점</strong>
            <p id="focusText">새 항목을 추가하고 복습 큐를 정리하세요.</p>
          </div>
        </aside>

        <!-- Temporary mobile-only ad placeholder (see mobile.css). Shared
             across every tab since the layout shell renders once; hidden
             on desktop and positioned between main content and the
             sidebar/TOC via CSS order once the layout stacks on narrow
             screens. Single content-free element so a future AdMob/ad
             network integration can swap in real content without
             touching the shell markup. -->
        <div id="mobileAdSlot" class="mobile-ad-slot" aria-hidden="true">광고</div>

        <main class="main">
          ${homePageTemplate()}
          ${todayPageTemplate()}
          ${sourcesPageTemplate()}
          ${sentencesPageTemplate()}
          ${wordsPageTemplate()}
          ${cardPageTemplate("grammar", "grammar-detail", "문법 노트", "grammarCards", "+ 문법 추가")}
          ${cardPageTemplate("expression", "expressions-list", "표현 · 관용구", "expressionCards", "+ 표현 추가", "expressions")}
          ${noteDialogTemplate()}
          ${kanjiPageTemplate()}
          ${quizPageTemplate()}
          ${reviewPageTemplate()}
          ${statsPageTemplate()}
          ${settingsPageTemplate()}
        </main>
      </div>
    </div>
  `;
}

function homePageTemplate() {
  return `
    <section class="page" id="home">
      <div class="hero" id="home-overview">
        ${homeSummaryPanel()}
        <div class="stat-grid" id="home-stats"></div>
      </div>

      ${homeSentencePanel()}

      <div class="content-grid">
        <div>
          <section class="panel section" id="home-today">
            <div class="panel-header">
              <h2 class="panel-title">오늘 할 일</h2>
              <button class="ghost-btn" id="addTaskBtn" type="button">+ 할 일 추가</button>
            </div>
            <div class="task-list" id="taskList"></div>
          </section>

          <section class="panel section" id="home-recent">
            <div class="panel-header">
              <h2 class="panel-title">최근 추가 항목</h2>
              <button class="ghost-btn" type="button" data-open-page="words">전체 보기</button>
            </div>
            <div class="cards" id="recentItems"></div>
          </section>
        </div>

        <div>
          <section class="panel section" id="home-queue">
            <div class="panel-header">
              <h2 class="panel-title">복습 큐</h2>
              <button class="ghost-btn" type="button" data-open-page="review">복습 보기</button>
            </div>
            <div class="table-scroll">
              <table class="table">
                <thead><tr><th>유형</th><th>개수</th><th>상태</th></tr></thead>
                <tbody id="reviewSummary"></tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </section>
  `;
}

function todayPageTemplate() {
  return `
    <section class="page hidden-page" id="today">
      <div class="today-top-grid">
        ${sentenceEntryPanel()}

        <section class="panel section" id="today-calendar">
          <div class="panel-header">
            <h2 class="panel-title" id="calendarTitle">학습 캘린더</h2>
            <div class="calendar-actions">
              <button class="ghost-btn calendar-nav-btn" id="prevMonthBtn" type="button" title="이전 달" aria-label="이전 달">${icon("chevronLeft")}</button>
              <button class="ghost-btn" id="todayBtn" type="button">오늘</button>
              <button class="ghost-btn calendar-nav-btn" id="nextMonthBtn" type="button" title="다음 달" aria-label="다음 달">${icon("chevronRight")}</button>
              <button class="icon-btn calendar-toggle-btn" id="calendarToggleBtn" type="button" aria-expanded="true" aria-label="캘린더 접기/펼치기">⌄</button>
            </div>
          </div>
          <div class="calendar-body" id="calendarBody">
            <div class="calendar-weekdays"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>
            <div class="calendar-grid" id="calendarGrid"></div>
            <div class="calendar-legend">
              <span><i class="calendar-dot studied"></i>공부한 날</span>
              <span><i class="calendar-dot pending"></i>등록 필요</span>
            </div>
          </div>
        </section>
      </div>

      <div class="today-register-bar" id="todayRegisterBar" hidden>
        <p><strong>등록 안 된 항목 <span id="todayUnregisteredCount">0</span>개</strong><span>등록하면 단어장 · 복습 큐 · 퀴즈에서 이어서 쓸 수 있습니다.</span></p>
        <button class="primary-btn" id="registerLearnedBtn" type="button">전체 등록</button>
      </div>

      <section class="panel section" id="today-sentences">
        <div class="panel-header"><h2 class="panel-title">저장된 문장 카드</h2></div>
        <div class="cards daily-entry-list" id="dailyEntryCards"></div>
      </section>

      <section class="panel section" id="today-learned">
        <div class="panel-header">
          <h2 class="panel-title">오늘 배운 항목</h2>
        </div>
        <div class="learned-grid">
          <section class="learned-section"><h3>새 단어</h3><div class="cards compact-cards" id="learnedWordCards"></div></section>
          <section class="learned-section"><h3>새 문법</h3><div class="cards compact-cards" id="learnedGrammarCards"></div></section>
          <section class="learned-section"><h3>새 표현</h3><div class="cards compact-cards" id="learnedExpressionCards"></div></section>
        </div>
      </section>
    </section>
  `;
}

function sourcesPageTemplate() {
  return `
    <section class="page hidden-page" id="sources">
      <section class="panel section" id="sources-library">
        <div class="panel-header">
          <h2 class="panel-title">자료 라이브러리</h2>
          <button class="primary-btn" type="button" data-kind="source" data-add-item>+ 자료 추가</button>
        </div>
        <div class="cards" id="sourceCards"></div>
      </section>
    </section>
  `;
}

function sentencesPageTemplate() {
  const filterGroup = (name, filters) => `
    <div class="segmented" role="group">
      ${filters.map(([value, label], index) => `<button class="segmented-btn ${index ? "" : "active"}" type="button" data-sentence-${name}="${value}" aria-pressed="${index ? "false" : "true"}">${label}</button>`).join("")}
    </div>
  `;
  return `
    <section class="page hidden-page" id="sentences">
      <section class="panel section" id="sentences-list">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">문장 노트</h2>
            <p class="muted sentence-summary" id="sentencePageDate"></p>
          </div>
          <button class="primary-btn" type="button" data-open-page="today">+ 문장 추가</button>
        </div>
        <div class="sentence-toolbar">
          ${filterGroup("status", SENTENCE_STATUS_FILTERS)}
          ${filterGroup("period", SENTENCE_PERIOD_FILTERS)}
          <label class="sentence-hide-toggle"><input id="sentenceHideMeaning" type="checkbox" /> 해석 가리기</label>
        </div>
        <div class="today-register-bar" id="sentenceRegisterBar" hidden>
          <p><strong>등록 안 된 문장 <span id="sentenceUnregisteredCount">0</span>개</strong><span>문장과 연결된 단어 · 문법 · 표현을 한 번에 등록합니다.</span></p>
          <button class="primary-btn" id="registerSentencesBtn" type="button">전체 등록</button>
        </div>
        <div class="sentence-list" id="sentenceCards"></div>
        <div id="sentencePagination"></div>
      </section>
    </section>
  `;
}

function wordsPageTemplate() {
  const sortHeader = (key, label, className = "") => `<th${className ? ` class="${className}"` : ""}><button class="sort-btn" data-word-sort="${key}" type="button">${label} <span data-word-sort-indicator="${key}">↕</span></button></th>`;
  return `
    <section class="page hidden-page" id="words">
      <section class="panel section" id="words-list">
        <div class="panel-header">
          <h2 class="panel-title">단어장 <span class="panel-count" id="wordTotalCount"></span></h2>
          <button class="primary-btn" type="button" data-kind="word" data-add-item>+ 단어 추가</button>
        </div>
        <div class="table-tools">
          <select id="wordPartFilter" aria-label="품사"><option value="">전체 품사</option></select>
          <select id="wordScriptFilter" aria-label="문자"><option value="">전체 문자</option></select>
          <select id="wordReviewFilter" aria-label="복습"><option value="">전체 복습</option></select>
          <select id="wordSourceFilter" aria-label="출처">
            <option value="">전체 출처</option>
            <option value="sentence">문장에서 등록</option>
            <option value="manual">직접 추가</option>
          </select>
          <p class="table-tools-summary"><span id="wordFilterSummary"></span><button class="link-btn" id="wordFilterResetBtn" type="button" hidden>필터 초기화</button></p>
        </div>
        <div class="table-scroll">
          <table class="table word-table">
            <thead>
              <tr>
                ${sortHeader("title", "단어")}
                <th>읽기</th>
                ${sortHeader("meaning", "뜻", "word-meaning-col")}
                ${sortHeader("kanji", "한자")}
                ${sortHeader("part", "품사 · 문자", "word-meta-col")}
                ${sortHeader("sourceSentence", "원본 문장")}
                <th class="word-review-col">복습</th>
                <th class="word-edit-col">수정</th>
              </tr>
            </thead>
            <tbody id="wordRows"></tbody>
          </table>
        </div>
        <div id="wordsPagination"></div>
      </section>
    </section>

    <dialog class="item-dialog" id="wordDialog" aria-labelledby="wordDialogTitle">
      <form method="dialog" id="wordDialogForm">
        <h2 class="panel-title" id="wordDialogTitle">단어 추가</h2>
        <div id="wordDialogFields"></div>
        <div class="item-dialog-actions">
          <button class="ghost-btn" type="button" value="cancel" id="wordDialogCancel">취소</button>
          <button class="primary-btn" type="submit" value="save">저장</button>
        </div>
      </form>
    </dialog>
  `;
}

function cardPageTemplate(kind, sectionId, title, targetId, buttonLabel, pageId = kind) {
  return `
    <section class="page hidden-page" id="${pageId}">
      <section class="panel section" id="${sectionId}">
        <div class="panel-header">
          <h2 class="panel-title">${title} <span class="panel-count" id="${kind}TotalCount"></span></h2>
          <button class="primary-btn" type="button" data-kind="${kind}" data-add-item>${buttonLabel}</button>
        </div>
        <div class="table-tools">
          <select id="${kind}ReviewFilter" aria-label="복습"><option value="">전체 복습 상태</option></select>
          <select id="${kind}SourceFilter" aria-label="출처">
            <option value="">전체 출처</option>
            <option value="sentence">문장 연결</option>
            <option value="manual">직접 추가</option>
          </select>
          <p class="table-tools-summary"><span id="${kind}FilterSummary"></span><button class="link-btn" id="${kind}FilterResetBtn" type="button" hidden>필터 초기화</button></p>
        </div>
        <div class="cards study-card-grid" id="${targetId}"></div>
        <div id="${kind}Pagination"></div>
      </section>
    </section>
  `;
}

// One add/edit dialog shared by 문법 and 표현 (fields are filled per kind).
function noteDialogTemplate() {
  return `
    <dialog class="item-dialog" id="noteDialog" aria-labelledby="noteDialogTitle">
      <form method="dialog" id="noteDialogForm">
        <h2 class="panel-title" id="noteDialogTitle">문법 추가</h2>
        <div id="noteDialogFields"></div>
        <div class="item-dialog-actions">
          <button class="ghost-btn" type="button" value="cancel" id="noteDialogCancel">취소</button>
          <button class="primary-btn" type="submit" value="save">저장</button>
        </div>
      </form>
    </dialog>
  `;
}

function kanjiPageTemplate() {
  return `
    <section class="page hidden-page" id="kanji">
      <section class="panel section" id="kanji-grid">
        <div class="panel-header">
          <h2 class="panel-title">한자 노트</h2>
          <button class="primary-btn" type="button" data-kind="kanji" data-add-item>+ 한자 추가</button>
        </div>
        <div class="kanji-grid" id="kanjiCards"></div>
        <div id="kanjiPagination"></div>
      </section>
    </section>
  `;
}

function quizPageTemplate() {
  return `
    <section class="page hidden-page" id="quiz">
      <section class="panel section" id="quiz-select">
        <div class="panel-header">
          <h2 class="panel-title">퀴즈</h2>
          <div class="panel-header-actions">
            <button class="ghost-btn compact-action-btn" id="quizExitBtn" type="button" hidden>목록으로</button>
            <span class="badge yellow">샘플 데이터</span>
          </div>
        </div>
        <div class="quiz-grid" id="quizSelectGrid">
          <article class="quiz-card word-quiz-card">
            <span class="badge red">단어</span><strong>단어 퀴즈</strong><span>4지선다</span>
            <div class="quiz-mode-options" aria-label="단어 퀴즈 유형">
              <label><input type="radio" name="wordQuizMode" value="random" checked /> 완전 랜덤</label>
              <label><input type="radio" name="wordQuizMode" value="jpToMeaning" /> 일본어 → 뜻</label>
              <label><input type="radio" name="wordQuizMode" value="meaningToJp" /> 뜻 → 일본어</label>
            </div>
            <button class="primary-btn quiz-start-btn" type="button" data-quiz-kind="word">시작</button>
          </article>
          <button class="quiz-card" type="button" data-quiz-kind="grammar"><span class="badge blue">문법</span><strong>문법 퀴즈</strong><span>다음 단계</span></button>
          <button class="quiz-card" type="button" data-quiz-kind="expression"><span class="badge green">표현</span><strong>표현 퀴즈</strong><span>다음 단계</span></button>
          <article class="quiz-card kanji-quiz-card">
            <span class="badge yellow">한자</span><strong>한자 퀴즈</strong><span>4지선다</span>
            <div class="quiz-mode-options" aria-label="한자 퀴즈 유형">
              <label><input type="radio" name="kanjiQuizMode" value="random" checked /> 완전 랜덤</label>
              <label><input type="radio" name="kanjiQuizMode" value="kanjiToMeaning" /> 한자 → 뜻</label>
              <label><input type="radio" name="kanjiQuizMode" value="meaningToKanji" /> 뜻 → 한자</label>
            </div>
            <button class="primary-btn quiz-start-btn" type="button" data-quiz-kind="kanji">시작</button>
          </article>
          <button class="quiz-card" type="button" data-quiz-kind="sentence-meaning"><span class="badge purple">문장</span><strong>문장 뜻 고르기</strong><span>4지선다</span></button>
          <button class="quiz-card" type="button" data-quiz-kind="sentence-listen"><span class="badge purple">문장</span><strong>듣고 문장 고르기</strong><span>4지선다</span></button>
        </div>
        <p class="muted quiz-status" id="quizStatus">샘플 데이터로 단어/한자 퀴즈를 실행할 수 있습니다.</p>
        <div class="word-quiz-panel" id="wordQuizPanel" hidden></div>
        <div class="word-quiz-panel kanji-quiz-panel" id="kanjiQuizPanel" hidden></div>
        <div class="word-quiz-panel sentence-quiz-panel" id="sentenceQuizPanel" hidden></div>
      </section>
    </section>
  `;
}

function reviewPageTemplate() {
  return `
    <section class="page hidden-page" id="review">
      <section class="panel section" id="review-queue">
        <div class="panel-header">
          <h2 class="panel-title">복습 큐</h2>
          <button class="primary-btn" id="completeReviewBtn" type="button">선택 복습 완료</button>
        </div>
        <div class="table-tools">
          <select id="reviewKindFilter" aria-label="복습 종류 필터"><option value="">전체 종류</option></select>
        </div>
        <div class="cards" id="reviewCards"></div>
      </section>
    </section>
  `;
}

function statsPageTemplate() {
  return `
    <section class="page hidden-page" id="stats">
      <section class="panel section" id="stats-overview">
        <div class="panel-header"><h2 class="panel-title">학습 통계</h2><span class="muted">샘플 state</span></div>
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-label">총 공부 시간</div><div class="stat-value" id="totalMinutes">0분</div><div class="stat-note">누적 기록</div></div>
          <div class="stat-card"><div class="stat-label">등록 단어</div><div class="stat-value" id="totalWords">0</div><div class="stat-note">단어장 기준</div></div>
          <div class="stat-card"><div class="stat-label">문법/표현</div><div class="stat-value" id="totalGrammarExpression">0</div><div class="stat-note">노트 기준</div></div>
          <div class="stat-card"><div class="stat-label">완료 자료</div><div class="stat-value" id="completedSources">0</div><div class="stat-note">진행률 100%</div></div>
        </div>
      </section>
    </section>
  `;
}

// One labeled <select> per paginated list view, for the 설정 tab's
// "목록 표시" section - each view gets its own override (기본값 falls back
// to that view's constant from packages/core's DEFAULT_LIST_PAGE_SIZES).
// Wired up in apps/web/src/main.js via the shared data-list-page-size-view
// attribute (see bindEvents()).
function listPageSizeSelect(view, label) {
  const defaultValue = DEFAULT_LIST_PAGE_SIZES[view];
  const options = LIST_PAGE_SIZE_OPTIONS.map(size => `<option value="${size}">${size}</option>`).join("");
  return `
    <label>${escapeHtml(label)}
      <select id="listPageSize-${view}" data-list-page-size-view="${view}">
        <option value="">기본값 (${defaultValue})</option>
        ${options}
      </select>
    </label>
  `;
}

function settingsPageTemplate() {
  return `
    <section class="page hidden-page" id="settings">
      <section class="panel section" id="settings-general">
        <div class="panel-header">
          <h2 class="panel-title">설정</h2>
          <button class="primary-btn" id="resetDataBtn" type="button">샘플 데이터 초기화</button>
        </div>
        <div class="table-scroll">
          <table class="table">
            <tbody>
              <tr><th>저장소</th><td id="storageLocation">IndexedDB (nihongo-study)</td></tr>
              <tr><th>JSON 백업</th><td>현재 브라우저의 일본어 공부 데이터를 파일로 저장하거나 백업 파일에서 복원합니다.</td></tr>
              <tr><th>다음 단계</th><td>storage-cloud 또는 동기화 계층</td></tr>
            </tbody>
          </table>
        </div>
        <div class="settings-actions">
          <button class="ghost-btn" id="downloadBackupBtn" type="button">백업 다운로드</button>
          <button class="ghost-btn" id="loadBackupBtn" type="button">백업 불러오기</button>
          <button class="ghost-btn" id="mergeBackupBtn" type="button">백업 추가하기</button>
          <input id="backupFileInput" type="file" accept="application/json,.json" hidden />
          <input id="mergeBackupFileInput" type="file" accept="application/json,.json" hidden />
        </div>
        <p class="muted" id="storageStatus"></p>
      </section>

      <section class="panel section" id="settings-account">
        <div class="panel-header"><h2 class="panel-title">계정 및 동기화</h2></div>
        <p class="muted">로그인하면 데이터가 Supabase에 동기화됩니다.</p>
        <div class="settings-actions">
          <button class="ghost-btn" id="googleSignInBtn" type="button">Google로 로그인</button>
          <button class="ghost-btn" id="googleSignOutBtn" type="button" hidden>로그아웃</button>
          <button class="ghost-btn" id="syncRetryBtn" type="button" disabled>동기화 재시도</button>
        </div>
        <p class="muted" id="accountStatus"></p>
        <p class="muted" id="syncStatus" aria-live="polite">동기화 대기</p>
        <p class="muted" id="syncLastSuccess">마지막 성공: 없음</p>
      </section>

      <section class="panel section" id="settings-list-page-size">
        <div class="panel-header"><h2 class="panel-title">목록 표시</h2></div>
        <div class="settings-grid">
          ${listPageSizeSelect("sentences", "문장 페이지당 항목 수")}
          ${listPageSizeSelect("words", "단어 페이지당 항목 수")}
          ${listPageSizeSelect("grammar", "문법 페이지당 항목 수")}
          ${listPageSizeSelect("expression", "표현 페이지당 항목 수")}
          ${listPageSizeSelect("kanji", "한자 페이지당 항목 수")}
        </div>
        <p class="muted">문장 · 단어 · 문법 · 표현 · 한자 탭에 각각 따로 적용됩니다.</p>
      </section>

      <section class="panel section" id="settings-quiz">
        <div class="panel-header"><h2 class="panel-title">퀴즈 표시 및 복습</h2></div>
        <div class="settings-grid">
          <label>문제 텍스트 크기 <span id="quizQuestionFontSizeValue">32px</span><input id="quizQuestionFontSizeRange" type="range" min="24" max="64" step="1" value="32" /></label>
          <label class="settings-check"><input id="quizReviewOnCorrectCheckbox" type="checkbox" checked /><span>정답 시 복습 상태 변경</span></label>
          <label>정답 후 복습 상태<select id="quizCorrectReviewSelect"></select></label>
        </div>
        <p class="muted">퀴즈 설정은 현재 브라우저 세션에 반영됩니다.</p>
      </section>

      <section class="panel section" id="settings-tts">
        <div class="panel-header"><h2 class="panel-title">음성 재생</h2></div>
        <p class="muted" id="ttsDescription">스피커 버튼은 브라우저 기본 SpeechSynthesis로 일본어를 재생합니다.</p>
      </section>

      <section class="panel section" id="settings-voicevox" hidden>
        <div class="panel-header"><h2 class="panel-title">VOICEVOX 음성 (데스크톱)</h2></div>
        <p class="muted">로컬 VOICEVOX 엔진이 실행 중이면 스피커 버튼이 VOICEVOX로 재생됩니다. 연결할 수 없으면 브라우저 음성으로 대체됩니다.</p>
        <div class="settings-grid">
          <label>엔진 URL<input id="voicevoxBaseUrlInput" type="text" spellcheck="false" placeholder="http://127.0.0.1:50021" /></label>
        </div>
        <div class="settings-actions">
          <button class="ghost-btn" id="voicevoxSaveUrlBtn" type="button">URL 저장</button>
          <button class="ghost-btn" id="voicevoxRecheckBtn" type="button">연결 다시 확인</button>
        </div>
        <p class="muted tts-status" id="voicevoxUrlStatus" aria-live="polite"></p>
        <p class="muted tts-status" id="voicevoxHealthStatus" aria-live="polite"></p>
        <div class="settings-grid">
          <label>Speaker<select id="voicevoxSpeakerSelect"></select></label>
          <label>재생 속도 <span id="voicevoxRateValue">1.0</span><input id="voicevoxRateRange" type="range" min="0.5" max="2" step="0.1" value="1" /></label>
        </div>
        <div class="settings-actions">
          <button class="ghost-btn" id="voicevoxTestBtn" type="button">테스트 재생</button>
        </div>
        <p class="muted tts-status" id="voicevoxTestStatus" aria-live="polite"></p>
      </section>

    </section>
  `;
}
