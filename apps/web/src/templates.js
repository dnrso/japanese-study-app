import {
  homeWelcomePanel,
  manualEntryPlaceholders,
  sentenceEntryPanel
} from "@nihongo-study/ui";

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
          <span>⌕</span>
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

export function homePageTemplate() {
  return `
    <section class="page" id="home">
      <div class="hero" id="home-overview">
        ${homeWelcomePanel()}
      </div>

      <div class="stat-grid" id="home-stats">
        <div class="stat-card"><div class="stat-label">오늘 공부 항목</div><div class="stat-value" id="todayDoneCount">0개</div><div class="stat-note">완료한 할 일 기준</div></div>
        <div class="stat-card"><div class="stat-label">새 항목</div><div class="stat-value" id="newItemCount">0개</div><div class="stat-note">단어 · 문법 · 표현 · 한자</div></div>
        <div class="stat-card"><div class="stat-label">복습 항목</div><div class="stat-value" id="reviewItemCount">0개</div><div class="stat-note">오늘/대기 복습 대상</div></div>
        <div class="stat-card"><div class="stat-label">오늘 복습한 단어</div><div class="stat-value" id="reviewedWordCount">0개</div><div class="stat-note">오늘 복습 완료 기준</div></div>
        <div class="stat-card"><div class="stat-label">오늘 복습한 한자</div><div class="stat-value" id="reviewedKanjiCount">0개</div><div class="stat-note">오늘 복습 완료 기준</div></div>
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

export function todayPageTemplate() {
  return `
    <section class="page hidden-page" id="today">
      <div class="today-top-grid">
        ${sentenceEntryPanel()}

        <section class="panel section" id="today-manual-entry">
          <div class="panel-header">
            <h2 class="panel-title">새 항목 추가</h2>
            <button class="primary-btn" id="addManualEntryBtn" type="button" hidden>추가</button>
          </div>
          <div class="daily-kind-radios">
            <label><input type="radio" name="dailyManualKind" value="word" /> 새 단어</label>
            <label><input type="radio" name="dailyManualKind" value="grammar" /> 새 문법</label>
            <label><input type="radio" name="dailyManualKind" value="expression" /> 새 표현</label>
          </div>
          <textarea id="manualEntryInput" class="daily-entry-input manual-entry-input" placeholder="${escapeHtml(manualEntryPlaceholders.word)}" hidden></textarea>
        </section>

        <section class="panel section" id="today-calendar">
          <div class="panel-header">
            <h2 class="panel-title" id="calendarTitle">학습 캘린더</h2>
            <div class="calendar-actions">
              <button class="ghost-btn" id="prevMonthBtn" type="button">이전달</button>
              <button class="ghost-btn" id="todayBtn" type="button">오늘</button>
              <button class="ghost-btn" id="nextMonthBtn" type="button">다음달</button>
              <button class="icon-btn calendar-toggle-btn" id="calendarToggleBtn" type="button" aria-expanded="true" aria-label="캘린더 접기/펼치기">⌄</button>
            </div>
          </div>
          <div class="calendar-body" id="calendarBody">
            <div class="calendar-weekdays"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>
            <div class="calendar-grid" id="calendarGrid"></div>
          </div>
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

export function sourcesPageTemplate() {
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

export function sentencesPageTemplate() {
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

export function wordsPageTemplate() {
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
        <div class="table-scroll">
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
        </div>
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

export function cardPageTemplate(kind, sectionId, title, targetId, buttonLabel, pageId = kind) {
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

export function kanjiPageTemplate() {
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

export function quizPageTemplate() {
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
        </div>
        <p class="muted quiz-status" id="quizStatus">샘플 데이터로 단어/한자 퀴즈를 실행할 수 있습니다.</p>
        <div class="word-quiz-panel" id="wordQuizPanel" hidden></div>
        <div class="word-quiz-panel kanji-quiz-panel" id="kanjiQuizPanel" hidden></div>
      </section>
    </section>
  `;
}

export function reviewPageTemplate() {
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

export function statsPageTemplate() {
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

export function settingsPageTemplate() {
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
              <tr><th>저장 방식</th><td>브라우저 IndexedDB</td></tr>
              <tr><th>데이터 폴더</th><td id="appDataPath">-</td></tr>
              <tr><th>SQLite</th><td id="sqlitePath">-</td></tr>
              <tr><th>Export</th><td id="exportPath">-</td></tr>
              <tr><th>Backup</th><td id="backupPath">-</td></tr>
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
        </div>
        <p class="muted" id="accountStatus"></p>
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

    </section>
  `;
}
