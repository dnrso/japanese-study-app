import "@nihongo-study/ui/styles";
import { analyzeJapaneseSentenceForStudy, defaultGeminiModel } from "@nihongo-study/ai";
import * as core from "@nihongo-study/core";
import { createIdbStorage } from "@nihongo-study/storage-idb";
import {
  applyPagePatch as applySharedPagePatch,
  badgeClassByKind,
  homeWelcomePanel,
  kindLabels,
  manualEntryPlaceholders,
  partOptions,
  renderCalendarPage,
  renderHomePage,
  renderKanjiPage,
  renderKanjiQuizPage,
  renderLearnedSectionsPage,
  renderQuickFiltersPage,
  renderQuizSettingsPage,
  renderReviewPage,
  renderSentencesPage,
  renderSourcesPage,
  renderStatsPage,
  renderStudyCardsPage,
  sentenceEntryPanel,
  renderTasksPage,
  renderTaxonomyPage,
  renderTodayPage,
  renderWordQuizPage,
  renderWordsPage,
  reviewOptions,
  scheduledReviewOptions,
  scriptOptions,
  tocByPage
} from "@nihongo-study/ui";
import { createSampleState } from "./sampleState.js";

const store = createIdbStorage({
  seedState: () => createSampleState(todayKey)
});
const storageNotice = "웹 데이터는 IndexedDB에 저장됩니다. 브라우저 사이트 데이터를 삭제하면 함께 삭제됩니다.";
const backupFormat = "nihongo-study-web-backup";
const backupVersion = 1;
const geminiApiKeyStorageKey = "nihongo-study.geminiApiKey";
const geminiModelStorageKey = "nihongo-study.geminiModel";

let state = createSampleState(todayKey);
let currentPage = "home";
let selectedDate = state.selectedDate;
let calendarMonth = selectedDate.slice(0, 7);
let searchTerm = "";
let wordSort = { key: "", direction: "" };
let wordQuizMode = "random";
let kanjiQuizMode = "random";
let wordQuiz = emptyQuiz();
let kanjiQuiz = emptyQuiz();
let reviewQueueDrafts = new Map();
let quizQuestionFontSize = 32;
let quizReviewOnCorrect = true;
let quizCorrectReview = "내일";
let storageStatus = storageNotice;
let aiSentenceAnalysisEnabled = false;
let aiSentenceAnalysisInProgress = false;
let geminiApiKey = readLocalSetting(geminiApiKeyStorageKey);
let geminiModel = readLocalSetting(geminiModelStorageKey) || defaultGeminiModel;

function byId(id) {
  return document.getElementById(id);
}

function renderAppShell() {
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
          <span>⌕</span>
          <input id="globalSearch" placeholder="단어, 문법, 표현, 자료 검색" />
          <span class="shortcut">Ctrl K</span>
        </label>

        <div class="top-actions">
          <div class="date-chip" id="todayDate"></div>
          <button class="primary-btn" id="quickAddBtn" type="button">+ 빠른 추가</button>
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
              <button class="toc-item filter-btn" type="button" data-filter="N3"><span>JLPT N3</span><span class="count" id="n3FilterCount">0</span></button>
              <button class="toc-item filter-btn" type="button" data-filter="source"><span>자료 연결됨</span><span class="count" id="sourceFilterCount">0</span></button>
              <button class="toc-item filter-btn" type="button" data-filter="pending"><span>미완료</span><span class="count" id="pendingFilterCount">0</span></button>
            </div>
          </div>

          <div class="mini-card">
            <strong>오늘의 초점</strong>
            <p id="focusText">새 항목을 추가하고 복습 큐를 정리하세요.</p>
          </div>
        </aside>

        <main class="main">
          ${homePageTemplate()}
          ${todayPageTemplate()}
          ${sourcesPageTemplate()}
          ${sentencesPageTemplate()}
          ${wordsPageTemplate()}
          ${cardPageTemplate("grammar", "grammar-detail", "문법 노트", "grammarCards", "+ 문법 추가")}
          ${cardPageTemplate("expression", "expressions-list", "표현 · 관용구", "expressionCards", "+ 표현 추가", "expressions")}
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
        ${homeWelcomePanel()}

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
        <div class="stat-card"><div class="stat-label">오늘 공부 항목</div><div class="stat-value" id="todayDoneCount">0개</div><div class="stat-note">완료한 할 일 기준</div></div>
        <div class="stat-card"><div class="stat-label">새 항목</div><div class="stat-value" id="newItemCount">0개</div><div class="stat-note">단어 · 문법 · 표현 · 한자</div></div>
        <div class="stat-card"><div class="stat-label">복습 항목</div><div class="stat-value" id="reviewItemCount">0개</div><div class="stat-note">오늘/대기 복습 대상</div></div>
        <div class="stat-card"><div class="stat-label">오늘 공부 시간</div><div class="stat-value" id="studyMinutes">0분</div><div class="stat-note">목표 90분</div></div>
      </div>

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
              <button class="primary-btn" type="button" data-open-page="review">복습 보기</button>
            </div>
            <table class="table">
              <thead><tr><th>유형</th><th>개수</th><th>상태</th></tr></thead>
              <tbody id="reviewSummary"></tbody>
            </table>
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

        <section class="panel section" id="today-manual-entry">
          <div class="panel-header">
            <h2 class="panel-title">새 항목 추가</h2>
            <button class="primary-btn" id="addManualEntryBtn" type="button">추가</button>
          </div>
          <div class="daily-kind-radios">
            <label><input type="radio" name="dailyManualKind" value="word" checked /> 새 단어</label>
            <label><input type="radio" name="dailyManualKind" value="grammar" /> 새 문법</label>
            <label><input type="radio" name="dailyManualKind" value="expression" /> 새 표현</label>
          </div>
          <textarea id="manualEntryInput" class="daily-entry-input manual-entry-input" placeholder="${escapeHtml(manualEntryPlaceholders.word)}"></textarea>
        </section>

        <section class="panel section" id="today-calendar">
          <div class="panel-header">
            <h2 class="panel-title" id="calendarTitle">학습 캘린더</h2>
            <div class="calendar-actions">
              <button class="ghost-btn" id="prevMonthBtn" type="button">이전</button>
              <button class="ghost-btn" id="todayBtn" type="button">오늘</button>
              <button class="ghost-btn" id="nextMonthBtn" type="button">다음</button>
            </div>
          </div>
          <div class="calendar-weekdays"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>
          <div class="calendar-grid" id="calendarGrid"></div>
        </section>
      </div>

      <section class="panel section" id="today-sentences">
        <div class="panel-header"><h2 class="panel-title">저장된 문장 카드</h2></div>
        <div class="cards daily-entry-list" id="dailyEntryCards"></div>
      </section>

      <section class="panel section" id="today-learned">
        <div class="panel-header">
          <h2 class="panel-title">오늘 배운 항목</h2>
          <button class="primary-btn compact-action-btn" id="registerLearnedBtn" type="button">전체 등록</button>
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
  return `
    <section class="page hidden-page" id="sentences">
      <section class="panel section" id="sentences-list">
        <div class="panel-header">
          <div>
            <h2 class="panel-title">문장 노트</h2>
            <p class="muted" id="sentencePageDate"></p>
          </div>
          <button class="primary-btn" type="button" data-open-page="today">+ 문장 추가</button>
        </div>
        <div class="cards daily-entry-list" id="sentenceCards"></div>
      </section>
    </section>
  `;
}

function wordsPageTemplate() {
  return `
    <section class="page hidden-page" id="words">
      <section class="panel section" id="words-list">
        <div class="panel-header">
          <h2 class="panel-title">단어장</h2>
          <button class="primary-btn" type="button" data-kind="word" data-add-item>+ 단어 추가</button>
        </div>
        <div class="table-tools">
          <select id="wordPartFilter"><option value="">전체 품사</option></select>
          <select id="wordScriptFilter"><option value="">전체 문자</option></select>
          <select id="wordReviewFilter"><option value="">전체 복습</option></select>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th><button class="sort-btn" data-word-sort="title" type="button">단어 <span data-word-sort-indicator="title"></span></button></th>
              <th>읽기</th>
              <th><button class="sort-btn" data-word-sort="meaning" type="button">뜻 <span data-word-sort-indicator="meaning"></span></button></th>
              <th><button class="sort-btn" data-word-sort="kanji" type="button">한자 <span data-word-sort-indicator="kanji"></span></button></th>
              <th><button class="sort-btn" data-word-sort="part" type="button">품사 <span data-word-sort-indicator="part"></span></button></th>
              <th><button class="sort-btn" data-word-sort="script" type="button">문자 <span data-word-sort-indicator="script"></span></button></th>
              <th><button class="sort-btn" data-word-sort="sourceSentence" type="button">원본 문장 <span data-word-sort-indicator="sourceSentence"></span></button></th>
              <th>복습</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="wordRows"></tbody>
        </table>
      </section>

      <section class="taxonomy-section" id="words-taxonomy">
        <div class="panel-header"><h3 class="panel-title">단어장 분류 체계</h3><span class="badge green">검색 · 필터 기준</span></div>
        <div class="taxonomy-grid">
          <article class="taxonomy-card"><h4>품사</h4><div class="taxonomy-chip-wrap" id="partChips"></div></article>
          <article class="taxonomy-card"><h4>문자</h4><div class="taxonomy-chip-wrap" id="scriptChips"></div></article>
        </div>
      </section>
    </section>
  `;
}

function cardPageTemplate(kind, sectionId, title, targetId, buttonLabel, pageId = kind) {
  return `
    <section class="page hidden-page" id="${pageId}">
      <section class="panel section" id="${sectionId}">
        <div class="panel-header">
          <h2 class="panel-title">${title}</h2>
          <button class="primary-btn" type="button" data-kind="${kind}" data-add-item>${buttonLabel}</button>
        </div>
        <div class="cards" id="${targetId}"></div>
      </section>
    </section>
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
      </section>
    </section>
  `;
}

function quizPageTemplate() {
  return `
    <section class="page hidden-page" id="quiz">
      <section class="panel section" id="quiz-select">
        <div class="panel-header"><h2 class="panel-title">퀴즈</h2><span class="badge yellow">샘플 데이터</span></div>
        <div class="quiz-grid">
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
        </div>
        <p class="muted quiz-status" id="quizStatus">샘플 데이터로 단어/한자 퀴즈를 실행할 수 있습니다.</p>
        <div class="word-quiz-panel" id="wordQuizPanel" hidden></div>
        <div class="word-quiz-panel kanji-quiz-panel" id="kanjiQuizPanel" hidden></div>
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

function settingsPageTemplate() {
  return `
    <section class="page hidden-page" id="settings">
      <section class="panel section" id="settings-general">
        <div class="panel-header">
          <h2 class="panel-title">설정</h2>
          <button class="primary-btn" id="resetDataBtn" type="button">샘플 데이터 초기화</button>
        </div>
        <table class="table">
          <tbody>
            <tr><th>저장 방식</th><td>브라우저 IndexedDB</td></tr>
            <tr><th>데이터 폴더</th><td id="appDataPath">-</td></tr>
            <tr><th>SQLite</th><td id="sqlitePath">-</td></tr>
            <tr><th>Export</th><td id="exportPath">-</td></tr>
            <tr><th>Backup</th><td id="backupPath">-</td></tr>
            <tr><th>JSON 백업</th><td>현재 브라우저의 일본어 공부 데이터를 파일로 저장하거나 백업 파일에서 복원합니다.</td></tr>
            <tr><th>다음 단계</th><td>storage-cloud 또는 동기화 계층</td></tr>
          </tbody>
        </table>
        <div class="settings-actions">
          <button class="ghost-btn" id="downloadBackupBtn" type="button">백업 다운로드</button>
          <button class="ghost-btn" id="loadBackupBtn" type="button">백업 불러오기</button>
          <button class="ghost-btn" id="mergeBackupBtn" type="button">백업 추가하기</button>
          <input id="backupFileInput" type="file" accept="application/json,.json" hidden />
          <input id="mergeBackupFileInput" type="file" accept="application/json,.json" hidden />
        </div>
        <p class="muted" id="storageStatus"></p>
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
        <p class="muted">스피커 버튼은 브라우저 기본 SpeechSynthesis로 일본어를 재생합니다.</p>
      </section>

      <section class="panel section" id="settings-ai">
        <div class="panel-header"><h2 class="panel-title">AI 문장 분석</h2></div>
        <div class="settings-grid">
          <label>Gemini API 키
            <input id="geminiApiKeyInput" type="password" autocomplete="off" placeholder="AIza..." />
          </label>
          <label>Gemini 모델
            <input id="geminiModelInput" type="text" autocomplete="off" placeholder="${defaultGeminiModel}" />
          </label>
        </div>
        <div class="settings-actions">
          <button class="ghost-btn" id="saveGeminiApiKeyBtn" type="button">AI 설정 저장</button>
          <button class="ghost-btn" id="clearGeminiApiKeyBtn" type="button">API 키 삭제</button>
        </div>
        <p class="muted" id="geminiApiKeyStatus"></p>
      </section>
    </section>
  `;
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => openPage(tab.dataset.page));
  });

  document.body.addEventListener("click", async event => {
    const speakTarget = event.target.closest("[data-speak-text]");
    if (speakTarget) {
      speak(speakTarget.dataset.speakText);
      return;
    }

    const openTarget = event.target.closest("[data-open-page]");
    if (openTarget) {
      openPage(openTarget.dataset.openPage);
      return;
    }

    const filterTarget = event.target.closest("[data-filter]");
    if (filterTarget) {
      applyQuickFilter(filterTarget.dataset.filter);
      return;
    }

    const calendarTarget = event.target.closest("[data-calendar-date]");
    if (calendarTarget) {
      selectedDate = calendarTarget.dataset.calendarDate;
      calendarMonth = selectedDate.slice(0, 7);
      await refreshState();
      return;
    }

    const taskTarget = event.target.closest("[data-toggle-task]");
    if (taskTarget) {
      await toggleTask(taskTarget.dataset.toggleTask);
      return;
    }

    const wordSortTarget = event.target.closest("[data-word-sort]");
    if (wordSortTarget) {
      wordSort = core.nextWordSort(wordSort, wordSortTarget.dataset.wordSort);
      renderWords();
      return;
    }

    const taxonomyTarget = event.target.closest("[data-word-taxonomy]");
    if (taxonomyTarget) {
      const select = byId(taxonomyTarget.dataset.wordTaxonomy === "part" ? "wordPartFilter" : "wordScriptFilter");
      const value = taxonomyTarget.dataset.wordTaxonomyValue;
      select.value = select.value === value ? "" : value;
      renderWords();
      renderTaxonomy();
      return;
    }

    const addTarget = event.target.closest("[data-add-item]");
    if (addTarget) {
      await promptAddItem(addTarget.dataset.kind);
      return;
    }

    const editTarget = event.target.closest("[data-edit-item]");
    if (editTarget) {
      await promptEditItem(editTarget.dataset.editItem);
      return;
    }

    const deleteTarget = event.target.closest("[data-delete-item]");
    if (deleteTarget) {
      await deleteItem(deleteTarget.dataset.deleteItem);
      return;
    }

    const cycleTarget = event.target.closest("[data-cycle-review]");
    if (cycleTarget) {
      await cycleReview(cycleTarget.dataset.cycleReview);
      return;
    }

    const reviewQueueCycleTarget = event.target.closest("[data-cycle-review-queue]");
    if (reviewQueueCycleTarget) {
      reviewQueueDrafts = core.cycleReviewQueueDraft({
        items: state.items,
        drafts: reviewQueueDrafts,
        id: reviewQueueCycleTarget.dataset.cycleReviewQueue,
        options: ["대기", ...scheduledReviewOptions]
      });
      renderReview();
      return;
    }

    const kanjiWordsTarget = event.target.closest("[data-show-kanji-words]");
    if (kanjiWordsTarget) {
      setSearch(kanjiWordsTarget.dataset.showKanjiWords);
      openPage("words");
      return;
    }

    const jumpTarget = event.target.closest("[data-jump-sentence]");
    if (jumpTarget) {
      jumpToSentence(jumpTarget.dataset.jumpSentence, jumpTarget.dataset.sourceDate || selectedDate);
      return;
    }

    const deleteDailyTarget = event.target.closest("[data-delete-daily-entry]");
    if (deleteDailyTarget) {
      await deleteDailyEntry(deleteDailyTarget.dataset.deleteDailyEntry);
      return;
    }

    const quizTarget = event.target.closest("[data-quiz-kind]");
    if (quizTarget) {
      startQuiz(quizTarget.dataset.quizKind);
      return;
    }

    const wordChoice = event.target.closest("[data-word-quiz-choice]");
    if (wordChoice && wordQuiz.question && !wordQuiz.answered) {
      await submitQuizChoice("word", wordChoice.dataset.wordQuizChoice);
      return;
    }

    const kanjiChoice = event.target.closest("[data-kanji-quiz-choice]");
    if (kanjiChoice && kanjiQuiz.question && !kanjiQuiz.answered) {
      await submitQuizChoice("kanji", kanjiChoice.dataset.kanjiQuizChoice);
      return;
    }

    if (event.target.closest("[data-next-word-quiz]")) {
      startQuiz("word");
      return;
    }

    if (event.target.closest("[data-next-kanji-quiz]")) {
      startQuiz("kanji");
    }
  });

  byId("globalSearch").addEventListener("input", event => {
    searchTerm = event.target.value.trim();
    renderAll();
  });

  byId("wordPartFilter").addEventListener("change", () => {
    renderWords();
    renderTaxonomy();
  });
  byId("wordScriptFilter").addEventListener("change", () => {
    renderWords();
    renderTaxonomy();
  });
  byId("wordReviewFilter").addEventListener("change", renderWords);

  byId("quickAddBtn").addEventListener("click", () => promptAddItem("word"));
  byId("addTaskBtn").addEventListener("click", addTask);
  byId("prevMonthBtn").addEventListener("click", () => moveCalendarMonth(-1));
  byId("nextMonthBtn").addEventListener("click", () => moveCalendarMonth(1));
  byId("todayBtn").addEventListener("click", async () => {
    selectedDate = todayKey();
    calendarMonth = selectedDate.slice(0, 7);
    await refreshState();
  });

  byId("addDailyEntryBtn").addEventListener("click", addDailyEntryFromInput);
  byId("analyzeAiSentenceBtn").addEventListener("click", analyzeSentenceFromInput);
  byId("aiSentenceAnalysisCheckbox").addEventListener("change", event => {
    aiSentenceAnalysisEnabled = event.target.checked;
    updateAiSentenceAnalysisFields();
  });
  byId("addManualEntryBtn").addEventListener("click", addManualEntryFromInput);
  byId("registerLearnedBtn").addEventListener("click", registerLearnedEntries);
  byId("completeReviewBtn").addEventListener("click", completeSelectedReview);
  byId("resetDataBtn").addEventListener("click", resetSampleData);
  byId("downloadBackupBtn").addEventListener("click", downloadBackup);
  byId("loadBackupBtn").addEventListener("click", () => byId("backupFileInput").click());
  byId("mergeBackupBtn").addEventListener("click", () => byId("mergeBackupFileInput").click());
  byId("backupFileInput").addEventListener("change", loadBackupFromFile);
  byId("mergeBackupFileInput").addEventListener("change", mergeBackupFromFile);

  document.querySelectorAll("input[name='dailyManualKind']").forEach(input => {
    input.addEventListener("change", updateManualEntryPlaceholder);
  });

  document.querySelectorAll("input[name='wordQuizMode']").forEach(input => {
    input.addEventListener("change", event => {
      wordQuizMode = event.target.value;
      wordQuiz = emptyQuiz();
      byId("quizStatus").textContent = "단어 퀴즈 유형을 선택했습니다.";
      renderWordQuiz();
    });
  });

  document.querySelectorAll("input[name='kanjiQuizMode']").forEach(input => {
    input.addEventListener("change", event => {
      kanjiQuizMode = event.target.value;
      kanjiQuiz = emptyQuiz();
      byId("quizStatus").textContent = "한자 퀴즈 유형을 선택했습니다.";
      renderKanjiQuiz();
    });
  });

  byId("quizQuestionFontSizeRange").addEventListener("input", event => {
    quizQuestionFontSize = core.clampQuizQuestionFontSize(event.target.value);
    applyQuizQuestionFontSize();
    byId("quizQuestionFontSizeValue").textContent = `${quizQuestionFontSize}px`;
  });

  byId("quizReviewOnCorrectCheckbox").addEventListener("change", event => {
    quizReviewOnCorrect = event.target.checked;
    renderQuizSettings();
  });

  byId("quizCorrectReviewSelect").addEventListener("change", event => {
    quizCorrectReview = core.resolveQuizCorrectReview(event.target.value, scheduledReviewOptions);
    renderQuizSettings();
  });

  byId("saveGeminiApiKeyBtn").addEventListener("click", saveGeminiApiKey);
  byId("clearGeminiApiKeyBtn").addEventListener("click", clearGeminiApiKey);
  renderGeminiApiKeySetting();
  updateAiSentenceAnalysisFields();

  document.addEventListener("keydown", event => {
    if (event.ctrlKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      byId("globalSearch").focus();
    }
    if (event.ctrlKey && event.key.toLowerCase() === "n") {
      event.preventDefault();
      promptAddItem("word");
    }
  });
}

function renderAll() {
  updatePageVisibility();
  renderDate();
  renderToc(currentPage);
  renderHome();
  renderTasks();
  renderCalendar();
  renderToday();
  renderLearnedSections();
  renderSources();
  renderSentences();
  renderWordFilters();
  renderWords();
  renderCards("grammar", "grammarCards");
  renderCards("expression", "expressionCards");
  renderKanji();
  renderWordQuiz();
  renderKanjiQuiz();
  renderReview();
  renderStats();
  renderTaxonomy();
  renderQuickFilters();
  renderQuizSettings();
  renderStorageStatus();
}

async function refreshState(studyDate = selectedDate) {
  state = await store.getState(studyDate);
  selectedDate = state.selectedDate;
  calendarMonth = selectedDate.slice(0, 7);
  renderAll();
}

function renderHome() {
  applyPagePatch(renderHomePage({
    overview: core.homeOverview(state, searchTerm),
    helpers: renderHelpers()
  }));
}

function renderTasks() {
  applyPagePatch(renderTasksPage({
    tasks: state.tasks.filter(task => !task.studyDate || task.studyDate === selectedDate),
    helpers: renderHelpers()
  }));
}

function renderToday() {
  updateManualEntryPlaceholder();
  const entries = dailyEntriesForSelectedDate();
  applyPagePatch(renderTodayPage({
    selectedDate,
    sentenceEntries: core.rootSentenceEntries(entries),
    helpers: {
      ...renderHelpers(),
      entryToCandidate: core.dailyEntryToCandidate,
      linkedEntriesForSentence
    }
  }));
}

function renderCalendar() {
  applyPagePatch(renderCalendarPage({
    calendarMonth,
    selectedDate,
    studyDays: state.studyDays,
    toDateKey
  }));
}

function renderLearnedSections() {
  applyPagePatch(renderLearnedSectionsPage({
    entriesByKind: {
      word: dailyEntriesByKind("word"),
      grammar: dailyEntriesByKind("grammar"),
      expression: dailyEntriesByKind("expression")
    },
    helpers: renderHelpers()
  }));
}

function renderSources() {
  applyPagePatch(renderSourcesPage({
    sources: items("source"),
    helpers: renderHelpers()
  }));
}

function renderSentences() {
  const sentenceEntries = core.rootSentenceEntries(allDailyEntriesForSentences());
  applyPagePatch(renderSentencesPage({
    caption: searchTerm ? `검색 결과 ${sentenceEntries.length}개` : `오늘 공부에서 저장한 문장 ${sentenceEntries.length}개`,
    sentences: sentenceEntries,
    helpers: {
      ...renderHelpers(),
      linkedEntriesForSentence: linkedEntriesForAnySentence
    }
  }));
}

function renderWordFilters() {
  renderSelectOptions("wordPartFilter", "전체 품사", partOptions);
  renderSelectOptions("wordScriptFilter", "전체 문자", scriptOptions);
  renderSelectOptions("wordReviewFilter", "전체 복습", reviewOptions);
}

function renderWords() {
  const part = byId("wordPartFilter").value;
  const script = byId("wordScriptFilter").value;
  const review = byId("wordReviewFilter").value;
  const rows = core.sortWords(items("word").filter(item =>
    (!part || item.part === part) &&
    (!script || item.script === script) &&
    (!review || item.review === review)
  ), wordSort);
  renderWordSortHeaders();
  applyPagePatch(renderWordsPage({ rows, helpers: renderHelpers() }));
}

function renderCards(kind, targetId) {
  applyPagePatch(renderStudyCardsPage({
    kind,
    targetId,
    list: items(kind),
    helpers: renderHelpers()
  }));
}

function renderKanji() {
  applyPagePatch(renderKanjiPage({
    kanji: items("kanji"),
    helpers: renderHelpers()
  }));
}

function renderWordQuiz() {
  applyPagePatch(renderWordQuizPage({
    quiz: wordQuiz,
    helpers: renderHelpers()
  }));
}

function renderKanjiQuiz() {
  applyPagePatch(renderKanjiQuizPage({
    quiz: kanjiQuiz,
    helpers: renderHelpers()
  }));
}

function renderReview() {
  reviewQueueDrafts = core.pruneReviewQueueDrafts({
    items: state.items,
    drafts: reviewQueueDrafts
  });
  applyPagePatch(renderReviewPage({
    reviewItems: core.reviewItems(state.items, searchTerm),
    helpers: renderHelpers()
  }));
}

function renderStats() {
  applyPagePatch(renderStatsPage({
    stats: core.studyStats(state)
  }));
}

function renderTaxonomy() {
  applyPagePatch(renderTaxonomyPage({
    partOptions,
    scriptOptions,
    selectedPart: byId("wordPartFilter").value,
    selectedScript: byId("wordScriptFilter").value,
    helpers: renderHelpers()
  }));
}

function renderQuickFilters() {
  applyPagePatch(renderQuickFiltersPage({
    counts: core.quickFilterCounts(state, searchTerm)
  }));
}

function renderQuizSettings() {
  applyQuizQuestionFontSize();
  applyPagePatch(renderQuizSettingsPage({
    quizQuestionFontSize,
    quizReviewOnCorrect,
    quizCorrectReview,
    scheduledReviewOptions,
    helpers: renderHelpers()
  }));
  byId("quizReviewOnCorrectCheckbox").checked = quizReviewOnCorrect;
}

function renderStorageStatus() {
  applyPagePatch({
    text: {
      appDataPath: store.paths.appDataDir,
      sqlitePath: "사용 안 함",
      exportPath: store.paths.exportsDir,
      backupPath: store.paths.backupsDir,
      storageStatus
    }
  });
}

function renderDate() {
  byId("todayDate").textContent = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).format(new Date());
}

function renderToc(pageId) {
  const tocItems = tocByPage[pageId] || [];
  byId("tocList").innerHTML = tocItems.map((item, index) => `
    <a class="toc-item ${index === 0 ? "active" : ""}" href="#${item[0]}">
      <span>${item[1]}</span>
      ${item[2] ? `<span class="count">${item[2]}</span>` : ""}
    </a>
  `).join("");
}

function renderSelectOptions(selectId, allLabel, options) {
  const select = byId(selectId);
  const currentValue = select.value;
  select.innerHTML = [
    `<option value="">${allLabel}</option>`,
    ...options.map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
  ].join("");
  select.value = options.includes(currentValue) ? currentValue : "";
}

function renderWordSortHeaders() {
  document.querySelectorAll("[data-word-sort]").forEach(button => {
    const isActive = button.dataset.wordSort === wordSort.key;
    button.classList.toggle("active", isActive && Boolean(wordSort.direction));
    button.setAttribute("aria-sort", isActive && wordSort.direction ? (wordSort.direction === "asc" ? "ascending" : "descending") : "none");
  });
  document.querySelectorAll("[data-word-sort-indicator]").forEach(indicator => {
    const isActive = indicator.dataset.wordSortIndicator === wordSort.key;
    indicator.textContent = isActive && wordSort.direction === "asc" ? "▲" : isActive && wordSort.direction === "desc" ? "▼" : "";
  });
}

function updatePageVisibility() {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.toggle("hidden-page", page.id !== currentPage);
  });
  document.querySelectorAll(".tab").forEach(tab => {
    const active = tab.dataset.page === currentPage;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-current", active ? "page" : "false");
  });
}

function updateManualEntryPlaceholder() {
  const kind = document.querySelector("input[name='dailyManualKind']:checked")?.value || "word";
  byId("manualEntryInput").placeholder = manualEntryPlaceholders[kind] || manualEntryPlaceholders.word;
}

function openPage(pageId) {
  if (!byId(pageId)) {
    return;
  }
  currentPage = pageId;
  renderAll();
  byId(pageId).scrollIntoView({ block: "start" });
}

function applyQuickFilter(filter) {
  if (filter === "review") {
    setSearch("");
    openPage("review");
    return;
  }
  if (filter === "N3") {
    setSearch("N3");
    openPage("words");
    return;
  }
  if (filter === "source") {
    setSearch("뉴스");
    openPage("words");
    return;
  }
  if (filter === "pending") {
    setSearch("");
    openPage("home");
    byId("home-today").scrollIntoView({ block: "start" });
  }
}

async function addTask() {
  const title = window.prompt("할 일 제목을 입력하세요.");
  if (!title) {
    return;
  }
  state = await store.addTask({
    id: nextId("task"),
    title,
    note: "웹 미리보기에서 추가한 할 일",
    tag: "일반",
    done: false,
    studyDate: selectedDate
  });
  renderAll();
}

async function toggleTask(id) {
  const task = state.tasks.find(candidate => candidate.id === id);
  if (!task) {
    return;
  }
  state = await store.updateTaskDone(task.id, !task.done, selectedDate);
  renderAll();
}

async function addDailyEntryFromInput() {
  const input = byId("dailyEntryInput");
  const aiSentenceInput = byId("aiSentenceInput");
  const rawText = input.value.trim();
  if (!rawText) {
    if (aiSentenceAnalysisEnabled && aiSentenceInput?.value.trim()) {
      setAiSentenceAnalysisStatus("먼저 AI 분석 결과를 만든 뒤 내용을 확인하고 문장 추가를 누르세요.");
    }
    input.focus();
    return;
  }
  state = await store.addDailyEntry({
    studyDate: selectedDate,
    kind: "sentence",
    rawText
  });
  state = await store.saveStudyLog({
    studyDate: selectedDate,
    minutes: Math.min(90, Number(state.studyLog.minutes || 0) + 10),
    summary: state.studyLog.summary || "오늘 추가한 문장을 복습하세요.",
    note: state.studyLog.note || ""
  });
  input.value = "";
  if (aiSentenceInput) {
    aiSentenceInput.value = "";
  }
  if (aiSentenceAnalysisEnabled) {
    setAiSentenceAnalysisStatus("문장 카드에 추가했습니다.");
  }
  renderAll();
}

async function analyzeSentenceFromInput() {
  if (aiSentenceAnalysisInProgress) {
    return;
  }
  const aiSentenceInput = byId("aiSentenceInput");
  const dailyEntryInput = byId("dailyEntryInput");
  const sentence = aiSentenceInput?.value.trim() || "";
  if (!sentence) {
    setAiSentenceAnalysisStatus("분석할 일본어 문장을 입력하세요.");
    aiSentenceInput?.focus();
    return;
  }
  setAiSentenceAnalysisBusy(true);
  setAiSentenceAnalysisStatus("AI 문장 분석 중입니다.");
  try {
    const result = await analyzeJapaneseSentenceForStudy({
      sentence,
      apiKey: geminiApiKey,
      model: geminiModel
    });
    if (!result.ok) {
      setAiSentenceAnalysisStatus(result.message);
      if (result.reason === "missingApiKey") {
        window.alert("설정에서 Gemini API 키를 먼저 저장하세요.");
        openPage("settings");
        byId("geminiApiKeyInput")?.focus();
      }
      return;
    }
    dailyEntryInput.value = result.rawText;
    dailyEntryInput.focus();
    setAiSentenceAnalysisStatus("AI 분석 결과를 입력칸에 넣었습니다. 내용을 확인한 뒤 문장 추가를 누르세요.");
  } catch (error) {
    const message = error.message || String(error);
    setAiSentenceAnalysisStatus(`AI 문장 분석 실패: ${message}`);
    window.alert(`AI 문장 분석 실패\n${message}`);
  } finally {
    setAiSentenceAnalysisBusy(false);
  }
}

async function addManualEntryFromInput() {
  const input = byId("manualEntryInput");
  const rawText = input.value.trim();
  const kind = document.querySelector("input[name='dailyManualKind']:checked")?.value || "word";
  if (!rawText) {
    return;
  }
  state = await store.addDailyEntry({
    studyDate: selectedDate,
    kind,
    rawText
  });
  input.value = "";
  renderAll();
}

async function registerLearnedEntries() {
  const targets = dailyEntriesForSelectedDate().filter(entry =>
    ["word", "grammar", "expression"].includes(entry.kind) && !entry.registered
  );
  if (!targets.length) {
    window.alert("등록할 새 단어, 새 문법, 새 표현이 없습니다.");
    return;
  }

  const response = await store.registerDailyEntries(targets.map(entry => entry.id), selectedDate);
  state = response.state;
  const registeredCount = response.result.registered.length;
  const duplicateCount = response.result.duplicates.length;
  window.alert(`등록 ${registeredCount}개${duplicateCount ? `, 중복 ${duplicateCount}개` : ""}`);
  renderAll();
}

async function promptAddItem(kind) {
  const title = window.prompt(`${kindLabels[kind] || "항목"} 제목을 입력하세요.`);
  if (!title) {
    return;
  }
  const reading = kind === "source" ? "자료" : window.prompt("읽기/분류를 입력하세요.", "") || "";
  const meaning = window.prompt("뜻/요약을 입력하세요.", "") || "";
  state = await store.upsertItem({
    id: nextId(kind),
    kind,
    title,
    reading,
    meaning,
    level: kind === "source" ? "웹" : "N3",
    part: kind === "word" ? "명사" : "",
    script: kind === "word" ? "한자+히라가나" : "",
    review: kind === "source" ? "" : "대기",
    source: kind === "source" ? window.prompt("자료 링크를 입력하세요.", "") || "" : "웹 미리보기",
    note: "",
    studyDate: selectedDate
  });
  renderAll();
  openPage(pageForKind(kind));
}

async function promptEditItem(id) {
  const item = state.items.find(candidate => candidate.id === id);
  if (!item) {
    return;
  }
  const title = window.prompt("제목을 수정하세요.", item.title);
  if (!title) {
    return;
  }
  const meaning = window.prompt("뜻/요약을 수정하세요.", item.meaning || "") || "";
  state = await store.upsertItem({
    ...item,
    title,
    meaning,
    studyDate: selectedDate
  });
  renderAll();
}

async function deleteItem(id) {
  const item = state.items.find(candidate => candidate.id === id);
  if (!item || !window.confirm(`${item.title} 항목을 삭제할까요?`)) {
    return;
  }
  state = await store.deleteItem(id, selectedDate);
  reviewQueueDrafts.delete(id);
  renderAll();
}

async function deleteDailyEntry(id) {
  const entry = (state.allDailyEntries || state.dailyEntries).find(candidate => candidate.id === id);
  if (!entry || !window.confirm(`${entry.title} 기록을 삭제할까요?`)) {
    return;
  }
  state = await store.deleteDailyEntry(id, selectedDate);
  renderAll();
}

async function cycleReview(id) {
  const item = state.items.find(candidate => candidate.id === id);
  if (!item) {
    return;
  }
  const currentIndex = reviewOptions.indexOf(item.review || "대기");
  const nextReview = reviewOptions[((currentIndex >= 0 ? currentIndex : reviewOptions.length - 1) + 1) % reviewOptions.length];
  state = await store.updateItemReview(id, nextReview, selectedDate);
  renderAll();
}

function startQuiz(kind) {
  if (kind === "grammar" || kind === "expression") {
    byId("quizStatus").textContent = `${kindLabels[kind]} 퀴즈는 다음 단계에서 구현합니다.`;
    return;
  }

  const isKanji = kind === "kanji";
  const question = core.buildQuizQuestion({
    items: state.items,
    kind: isKanji ? "kanji" : "word",
    mode: isKanji ? kanjiQuizMode : wordQuizMode,
    forwardMode: isKanji ? "kanjiToMeaning" : "jpToMeaning",
    reverseMode: isKanji ? "meaningToKanji" : "meaningToJp"
  });

  const nextQuiz = { question, answered: false, selectedAnswer: "", result: null };
  if (isKanji) {
    kanjiQuiz = nextQuiz;
    wordQuiz = emptyQuiz();
  } else {
    wordQuiz = nextQuiz;
    kanjiQuiz = emptyQuiz();
  }
  byId("quizStatus").textContent = question ? "정답을 선택하세요." : "퀴즈를 만들려면 같은 유형의 항목과 보기 후보가 4개 이상 필요합니다.";
  renderWordQuiz();
  renderKanjiQuiz();
}

async function submitQuizChoice(kind, selectedAnswer) {
  const quiz = kind === "kanji" ? kanjiQuiz : wordQuiz;
  const response = await store.submitWordQuizAnswer({
    quizKind: kind,
    itemId: quiz.question.item.id,
    selectedAnswer,
    answerType: quiz.question.answerType,
    updateReviewOnCorrect: quizReviewOnCorrect,
    correctReview: quizCorrectReview,
    studyDate: selectedDate
  });
  state = response.state;
  const item = state.items.find(candidate => candidate.id === quiz.question.item.id);
  const nextQuiz = {
    ...quiz,
    question: { ...quiz.question, item: item || quiz.question.item },
    answered: true,
    selectedAnswer,
    result: response.result
  };
  if (kind === "kanji") {
    kanjiQuiz = nextQuiz;
    renderKanjiQuiz();
  } else {
    wordQuiz = nextQuiz;
    renderWordQuiz();
  }
  renderStats();
  renderQuickFilters();
}

async function completeSelectedReview() {
  const targets = core.reviewCompletionTargets({
    items: state.items,
    drafts: reviewQueueDrafts,
    searchTerm
  });
  if (!targets.length) {
    window.alert("복습 완료로 변경할 항목을 먼저 선택하세요.");
    return;
  }
  state = await store.completeReview(targets, selectedDate);
  reviewQueueDrafts = new Map();
  renderAll();
}

async function resetSampleData() {
  if (!window.confirm("샘플 데이터를 초기 상태로 되돌릴까요?")) {
    return;
  }
  state = await store.resetSampleData();
  resetTransientUiState();
  storageStatus = "샘플 데이터로 초기화했습니다.";
  renderAll();
}

async function downloadBackup() {
  try {
    const exported = await store.exportData();
    const payload = {
      format: backupFormat,
      version: backupVersion,
      exportedAt: new Date().toISOString(),
      data: exported.data
    };
    const fileName = backupFileName();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStorageStatus(`백업 다운로드를 시작했습니다: ${fileName}`);
  } catch (error) {
    const message = error.message || String(error);
    setStorageStatus(`백업 다운로드 실패: ${message}`);
    window.alert(`백업 다운로드 실패\n${message}`);
  }
}

async function loadBackupFromFile(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  try {
    if (!window.confirm("현재 브라우저에 저장된 일본어 공부 데이터를 선택한 백업으로 교체할까요?")) {
      return;
    }
    const backup = parseBackupFile(await file.text());
    state = await store.importFullBackup(backup);
    resetTransientUiState();
    storageStatus = `백업 로드 완료: ${file.name}`;
    renderAll();
  } catch (error) {
    const message = error.message || String(error);
    setStorageStatus(`백업 로드 실패: ${message}`);
    window.alert(`백업 로드 실패\n${message}`);
  } finally {
    input.value = "";
  }
}

async function mergeBackupFromFile(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  try {
    if (!window.confirm("선택한 백업 데이터를 현재 데이터에 추가할까요? 중복 데이터는 제외됩니다.")) {
      return;
    }
    const backup = parseBackupFile(await file.text());
    const current = await store.exportData();
    const result = mergeBackupData(backupData(current), backupData(backup));
    state = await store.importFullBackup({ data: result.data });
    resetTransientUiState();
    storageStatus = `백업 추가 완료: ${file.name} · 추가 ${result.summary.added}개, 중복 제외 ${result.summary.skipped}개`;
    renderAll();
  } catch (error) {
    const message = error.message || String(error);
    setStorageStatus(`백업 추가 실패: ${message}`);
    window.alert(`백업 추가 실패\n${message}`);
  } finally {
    input.value = "";
  }
}

function resetTransientUiState() {
  selectedDate = state.selectedDate;
  calendarMonth = selectedDate.slice(0, 7);
  searchTerm = "";
  wordSort = { key: "", direction: "" };
  wordQuiz = emptyQuiz();
  kanjiQuiz = emptyQuiz();
  reviewQueueDrafts = new Map();
  byId("globalSearch").value = "";
}

function parseBackupFile(text) {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error("JSON 백업 파일을 읽을 수 없습니다.");
  }

  const data = backupData(backup);
  if (!isBackupData(data)) {
    throw new Error("일본어 공부노트 백업 파일 형식이 아닙니다.");
  }
  return backup;
}

function backupData(backup) {
  return backup?.data && typeof backup.data === "object" ? backup.data : backup;
}

function isBackupData(data) {
  return Boolean(data && typeof data === "object" && [
    "studyDays",
    "dailyEntries",
    "allDailyEntries",
    "dailyEntryLinks",
    "tasks",
    "items"
  ].some(name => Array.isArray(data[name])));
}

function mergeBackupData(currentData, importedData) {
  const idMap = new Map();
  const studyDays = mergeUniqueRows(
    rows(currentData.studyDays),
    rows(importedData.studyDays),
    studyDayKeys
  );
  const dailyEntries = mergeDailyEntries(
    rows(currentData.allDailyEntries || currentData.dailyEntries),
    rows(importedData.allDailyEntries || importedData.dailyEntries),
    idMap
  );
  const tasks = mergeUniqueRows(
    rows(currentData.tasks),
    rows(importedData.tasks),
    taskKeys
  );
  const items = mergeUniqueRows(
    rows(currentData.items),
    rows(importedData.items),
    itemKeys
  );
  const dailyEntryLinks = mergeUniqueRows(
    rows(currentData.dailyEntryLinks),
    rows(importedData.dailyEntryLinks)
      .map(link => remapDailyEntryLink(link, idMap))
      .filter(link => link.entryId && link.sentenceId),
    dailyEntryLinkKeys
  );

  return {
    data: {
      selectedDate: currentData.selectedDate || selectedDate || importedData.selectedDate || todayKey(),
      studyDays: studyDays.rows,
      dailyEntries: dailyEntries.rows,
      dailyEntryLinks: dailyEntryLinks.rows,
      tasks: tasks.rows,
      items: items.rows
    },
    summary: sumMergeSummaries([studyDays, dailyEntries, dailyEntryLinks, tasks, items])
  };
}

function mergeDailyEntries(currentRows, importedRows, idMap) {
  const existing = new Map();
  currentRows.forEach(row => {
    dailyEntryKeys(row).forEach(key => existing.set(key, row.id));
  });

  importedRows.forEach(row => {
    const matchedId = dailyEntryKeys(row).map(key => existing.get(key)).find(Boolean);
    if (matchedId && row.id) {
      idMap.set(String(row.id), matchedId);
    }
  });

  const mergedRows = [...currentRows];
  let added = 0;
  let skipped = 0;

  importedRows.forEach(rawRow => {
    const row = remapDailyEntry(rawRow, idMap);
    const keys = dailyEntryKeys(row);
    const matchedId = keys.map(key => existing.get(key)).find(Boolean);
    if (matchedId) {
      if (rawRow.id) {
        idMap.set(String(rawRow.id), matchedId);
      }
      skipped += 1;
      return;
    }

    mergedRows.push(row);
    if (rawRow.id) {
      idMap.set(String(rawRow.id), row.id);
    }
    keys.forEach(key => existing.set(key, row.id));
    added += 1;
  });

  return { rows: mergedRows, added, skipped };
}

function mergeUniqueRows(currentRows, importedRows, keyFactory) {
  const existing = new Set(currentRows.flatMap(keyFactory));
  const mergedRows = [...currentRows];
  let added = 0;
  let skipped = 0;

  importedRows.forEach(row => {
    const keys = keyFactory(row);
    if (keys.some(key => existing.has(key))) {
      skipped += 1;
      return;
    }
    mergedRows.push(row);
    keys.forEach(key => existing.add(key));
    added += 1;
  });

  return { rows: mergedRows, added, skipped };
}

function remapDailyEntry(entry, idMap) {
  const parentId = remappedId(entry.parentId, idMap);
  return {
    ...entry,
    parentId,
    sourceSentences: rows(entry.sourceSentences).map(sentence => ({
      ...sentence,
      id: remappedId(sentence.id, idMap)
    }))
  };
}

function remapDailyEntryLink(link, idMap) {
  const entryId = remappedId(link.entryId || link.entry_id, idMap);
  const sentenceId = remappedId(link.sentenceId || link.sentence_id, idMap);
  return {
    ...link,
    id: link.id || `${entryId}::${sentenceId}`,
    entryId,
    sentenceId
  };
}

function remappedId(id, idMap) {
  const key = String(id || "");
  return key ? idMap.get(key) || key : "";
}

function studyDayKeys(row) {
  return compactKeys([key("studyDay", row.studyDate)]);
}

function dailyEntryKeys(row) {
  return compactKeys([
    key("dailyEntryId", row.id),
    key("dailyEntry", row.studyDate, row.kind, row.title, row.reading, row.meaning, row.parentTitle || row.parentId)
  ]);
}

function dailyEntryLinkKeys(row) {
  return compactKeys([
    key("dailyEntryLinkId", row.id),
    key("dailyEntryLink", row.entryId || row.entry_id, row.sentenceId || row.sentence_id)
  ]);
}

function taskKeys(row) {
  return compactKeys([
    key("taskId", row.id),
    key("task", row.studyDate, row.title, row.note, row.tag)
  ]);
}

function itemKeys(row) {
  return compactKeys([
    key("itemId", row.id),
    key("item", row.kind, row.title, row.reading, row.meaning)
  ]);
}

function compactKeys(keys) {
  return keys.filter(Boolean);
}

function key(scope, ...parts) {
  const normalized = parts.map(keyPart);
  if (!normalized.some(Boolean)) {
    return "";
  }
  return `${scope}:${normalized.join("|")}`;
}

function keyPart(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function rows(value) {
  return Array.isArray(value) ? value : [];
}

function sumMergeSummaries(results) {
  return results.reduce((summary, result) => ({
    added: summary.added + result.added,
    skipped: summary.skipped + result.skipped
  }), { added: 0, skipped: 0 });
}

function backupFileName() {
  const stamp = new Date().toISOString().slice(0, 19).replace("T", "-").replaceAll(":", "");
  return `nihongo-study-backup-${stamp}.json`;
}

function setStorageStatus(message) {
  storageStatus = message;
  const element = byId("storageStatus");
  if (element) {
    element.textContent = message;
  }
}

function moveCalendarMonth(offset) {
  const [year, month] = calendarMonth.split("-").map(Number);
  const next = new Date(year, month - 1 + offset, 1);
  calendarMonth = toDateKey(next).slice(0, 7);
  renderCalendar();
}

function jumpToSentence(id, sourceDate) {
  selectedDate = sourceDate || selectedDate;
  calendarMonth = selectedDate.slice(0, 7);
  openPage("today");
  window.setTimeout(() => {
    byId(`daily-entry-${id}`)?.scrollIntoView({ block: "center" });
  }, 0);
}

function speak(text) {
  if (!window.speechSynthesis || !text) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  window.speechSynthesis.speak(utterance);
}

function applyQuizQuestionFontSize() {
  document.documentElement.style.setProperty("--quiz-question-font-size", `${quizQuestionFontSize}px`);
}

function setSearch(value) {
  searchTerm = String(value || "").trim();
  byId("globalSearch").value = searchTerm;
}

function updateAiSentenceAnalysisFields() {
  const checkbox = byId("aiSentenceAnalysisCheckbox");
  const fields = byId("aiSentenceFields");
  if (!checkbox || !fields) {
    return;
  }
  checkbox.checked = aiSentenceAnalysisEnabled;
  fields.hidden = !aiSentenceAnalysisEnabled;
  setAiSentenceAnalysisStatus(aiSentenceAnalysisEnabled ? "일본어 문장을 입력하고 AI 분석을 누르면 결과가 아래 입력칸에 표시됩니다." : "");
  if (aiSentenceAnalysisEnabled) {
    byId("aiSentenceInput")?.focus();
  }
}

function setAiSentenceAnalysisBusy(busy) {
  aiSentenceAnalysisInProgress = busy;
  const addButton = byId("addDailyEntryBtn");
  const analyzeButton = byId("analyzeAiSentenceBtn");
  const checkbox = byId("aiSentenceAnalysisCheckbox");
  if (addButton) {
    addButton.disabled = busy;
  }
  if (analyzeButton) {
    analyzeButton.disabled = busy;
    analyzeButton.textContent = busy ? "분석 중" : "AI 분석";
  }
  if (checkbox) {
    checkbox.disabled = busy;
  }
}

function setAiSentenceAnalysisStatus(message) {
  const element = byId("aiSentenceAnalysisStatus");
  if (element) {
    element.textContent = message;
  }
}

function renderGeminiApiKeySetting() {
  const input = byId("geminiApiKeyInput");
  if (input && document.activeElement !== input) {
    input.value = geminiApiKey;
  }
  const modelInput = byId("geminiModelInput");
  if (modelInput && document.activeElement !== modelInput) {
    modelInput.value = geminiModel;
  }
  const status = byId("geminiApiKeyStatus");
  if (status) {
    status.textContent = geminiApiKey
      ? `Gemini API 키가 저장되어 있습니다. 모델: ${geminiModel}`
      : `Gemini API 키가 없습니다. 모델: ${geminiModel}`;
  }
}

function saveGeminiApiKey() {
  const input = byId("geminiApiKeyInput");
  const modelInput = byId("geminiModelInput");
  const nextKey = input.value.trim();
  const nextModel = normalizeGeminiModel(modelInput?.value);
  if (!writeLocalSetting(geminiModelStorageKey, nextModel)) {
    byId("geminiApiKeyStatus").textContent = "Gemini 모델 설정을 브라우저에 저장하지 못했습니다.";
    return;
  }
  geminiModel = nextModel;
  if (!nextKey) {
    clearGeminiApiKey();
    return;
  }
  if (!writeLocalSetting(geminiApiKeyStorageKey, nextKey)) {
    byId("geminiApiKeyStatus").textContent = "Gemini API 키를 브라우저에 저장하지 못했습니다.";
    return;
  }
  geminiApiKey = nextKey;
  renderGeminiApiKeySetting();
}

function clearGeminiApiKey() {
  removeLocalSetting(geminiApiKeyStorageKey);
  geminiApiKey = "";
  renderGeminiApiKeySetting();
}

function normalizeGeminiModel(value) {
  return String(value || "").trim() || defaultGeminiModel;
}

function applyPagePatch(patch) {
  applySharedPagePatch(patch, { document });
}

function renderHelpers() {
  return {
    badgeClassByKind,
    core,
    escapeHtml,
    highlight,
    kindLabels,
    reviewQueueStatusText,
    reviewStatusText: core.reviewStatusText
  };
}

function items(kind) {
  return core.itemsByKind(state.items, kind, searchTerm);
}

function dailyEntriesForSelectedDate() {
  return state.dailyEntries.filter(entry => !entry.studyDate || entry.studyDate === selectedDate);
}

function allDailyEntriesForSentences() {
  const entries = state.allDailyEntries || state.dailyEntries;
  if (!searchTerm) {
    return entries;
  }
  const normalizedSearch = searchTerm.toLowerCase();
  return entries.filter(entry => [
    entry.title,
    entry.reading,
    entry.meaning,
    entry.studyDate
  ].some(value => String(value || "").toLowerCase().includes(normalizedSearch)));
}

function dailyEntriesByKind(kind) {
  return core.dailyEntriesByKind(dailyEntriesForSelectedDate(), kind);
}

function linkedEntriesForSentence(kind, sentenceId) {
  return core.linkedEntriesForSentence(dailyEntriesForSelectedDate(), kind, sentenceId);
}

function linkedEntriesForAnySentence(kind, sentenceId) {
  return core.linkedEntriesForSentence(state.allDailyEntries || state.dailyEntries, kind, sentenceId);
}

function reviewQueueStatusText(item) {
  return core.reviewQueueStatusText({
    item,
    drafts: reviewQueueDrafts,
    todayKey: selectedDate
  });
}

function pageForKind(kind) {
  if (kind === "source") {
    return "sources";
  }
  if (kind === "expression") {
    return "expressions";
  }
  return kind === "word" ? "words" : kind;
}

function emptyQuiz() {
  return { question: null, answered: false, selectedAnswer: "", result: null };
}

function nextId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayKey() {
  return toDateKey(new Date());
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

function readLocalSetting(keyName) {
  try {
    return globalThis.localStorage?.getItem(keyName) || "";
  } catch {
    return "";
  }
}

function writeLocalSetting(keyName, value) {
  try {
    globalThis.localStorage?.setItem(keyName, value);
    return true;
  } catch {
    return false;
  }
}

function removeLocalSetting(keyName) {
  try {
    globalThis.localStorage?.removeItem(keyName);
  } catch {
    // Local browser storage can be unavailable in restricted modes.
  }
}

async function start() {
  renderAppShell();
  bindEvents();
  try {
    await store.initDatabase();
    state = await store.getState(selectedDate);
    selectedDate = state.selectedDate;
    calendarMonth = selectedDate.slice(0, 7);
    renderAll();
  } catch (error) {
    byId("app").innerHTML = `
      <main class="main">
        <section class="panel section">
          <h1>IndexedDB 초기화 실패</h1>
          <p class="muted">${escapeHtml(error.message || String(error))}</p>
        </section>
      </main>
    `;
  }
}

start();
