NihonGo Study
=============

문장 중심의 개인 일본어 공부 앱입니다.
오늘 공부한 일본어 문장을 저장하고, 문장에서 단어, 문법, 표현, 한자를 정리해 단어장과 복습 큐로 관리합니다.

현재 프로젝트는 npm workspaces 기반 monorepo입니다. Electron 데스크톱 앱과 Vite 웹 앱을 `apps/`에 두고, 공통 로직과 UI, 저장소, TTS는 `packages/`로 분리하고 있습니다.


실행 및 빌드
-----------

의존성 설치:

```powershell
npm.cmd install
```

Electron 데스크톱 앱 실행:

```powershell
npm.cmd start
```

Windows unpacked 데스크톱 빌드:

```powershell
npm.cmd run build
```

웹 앱 개발 서버:

```powershell
npm.cmd run web:dev
```

웹 앱 빌드:

```powershell
npm.cmd run web:build
```

웹 앱 빌드 결과 미리보기:

```powershell
npm.cmd run web:preview
```

테스트:

```powershell
npm.cmd test
```

`vitest`로 `packages/*`와 `apps/web`의 공통 로직을 검증합니다. `storage-sqlite` 테스트는 `better-sqlite3` 네이티브 바인딩이 현재 Node ABI와 맞지 않으면(데스크톱 앱이 Electron용으로 다시 빌드해 둔 경우 등) 자동으로 skip되고 안내 메시지를 출력합니다 — 로컬에서 이 스위트까지 실행하려면 `npm rebuild better-sqlite3`를 먼저 실행하세요. CI는 매번 `npm ci`로 새로 설치하므로 이 문제가 없습니다.

의존성을 추가하거나 workspace 패키지를 새로 추가하는 경우에만 `package-lock.json`을 함께 갱신합니다.


안드로이드 앱 빌드
-----------------

`apps/web`은 Capacitor로 감싸 안드로이드 네이티브 앱으로 빌드합니다. 네이티브 프로젝트는 `apps/web/android/`에 있습니다.

### 사전 준비

- Android Studio (최신 stable) — Android SDK, Platform Tools 포함
- JDK 21
- Gradle/AGP는 프로젝트에 고정되어 있어 별도 설치 불필요 (Gradle 8.14.3, AGP 8.13.0, wrapper가 자동 다운로드)
- `compileSdk`/`targetSdk` 36, `minSdk` 24 (`apps/web/android/variables.gradle`)

### 환경변수 설정 (빌드 전 필수)

Supabase 연동(`packages/sync`)을 쓰려면 `apps/web/.env`를 만들고 `apps/web/.env.example`을 참고해 값을 채웁니다.

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Vite는 빌드 시점에 이 값을 번들에 굽습니다. 안드로이드 앱은 **빌드할 때 사용한 값으로 고정**되므로, 값을 바꾸면 웹 빌드부터 다시 해야 합니다.

마이그레이션, Edge Function 배포, 인증 리다이렉트 URL 등 Supabase 프로젝트 자체를 설정하는 방법은 아래 "Supabase 연동 설정" 참고.

### 빌드 & 동기화

```powershell
npm.cmd install
npm.cmd run web:build
npm.cmd --workspace @nihongo-study/web run cap:sync
```

`cap:sync`는 `apps/web/dist`(Vite 빌드 결과물)를 `android/app/src/main/assets/public`으로 복사하고 Capacitor 플러그인을 안드로이드 프로젝트에 반영합니다. 웹 코드를 고칠 때마다 `web:build` → `cap:sync` 순서를 다시 실행해야 합니다(핫리로드 없음).

### Android Studio에서 실행

```powershell
npm.cmd --workspace @nihongo-study/web run cap:open
```

또는 Android Studio에서 `apps/web/android` 폴더를 직접 엽니다. 최초로 열면 `local.properties`가 자동 생성되어 로컬 SDK 경로(`sdk.dir`)가 채워집니다(gitignore 처리, 커밋되지 않음). 이후 에뮬레이터나 USB 디버깅 기기를 연결해 Run 하면 됩니다.

### 참고

- `google-services.json`은 선택 사항입니다. 없어도 정상 빌드되며, 있으면 Google Services 플러그인이 자동 적용됩니다(현재 Push Notifications 등 관련 기능은 미사용이라 불필요).
- 현재 release 빌드 타입에는 서명 설정(signingConfig)이 없어 **서명되지 않은 빌드**입니다. 배포용 서명 빌드가 필요해지면 keystore 생성과 signingConfig 추가가 별도로 필요합니다(`*.keystore`/`*.jks`는 이미 `.gitignore`에 등록되어 있음).


Supabase 연동 설정
-----------------

Google 로그인, 기기 간 데이터 동기화, AI 문장 분석은 Supabase 프로젝트가 있어야 동작합니다. 설정하지 않아도 로컬 IndexedDB 저장, 단어장, 퀴즈 등 나머지 기능은 그대로 사용할 수 있습니다. Supabase CLI가 로컬에 설치되어 있어야 합니다.

### 환경변수

`apps/web/.env.example`을 복사해 `apps/web/.env`를 만들고 값을 채웁니다.

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

개발 전용 플래그도 같은 파일에서 설정합니다.

```
VITE_SHOW_AD_PLACEHOLDER=
```

`true`로 설정하면 모바일 레이아웃에 광고 자리 표시용 placeholder 배너가 보입니다. 실제 광고 SDK 연동 전 임시 UI이며, 값이 없거나 `false`면 항상 숨겨집니다(릴리스 빌드 기본값).

### 데이터베이스 마이그레이션

```powershell
supabase db push
```

`supabase/migrations/`의 내용을 반영합니다.

- `study_snapshots`: 사용자별 전체 백업 스냅샷(JSON) 저장, RLS로 본인 행만 조회/수정 가능
- `ai_usage`: 사용자별 AI 문장 분석 사용량(분당/일별) 기록, service role(Edge Function)만 접근

### Edge Function 배포

```powershell
supabase functions deploy analyze-sentence
supabase secrets set GEMINI_API_KEY=발급받은-키
```

`supabase/functions/analyze-sentence`가 Gemini로 일본어 문장을 분석하며, 사용자별 **분당 1회 · 하루 100회 · 입력 300자** 제한을 서버에서 강제합니다(같은 제한값이 클라이언트에도 안내용으로 표시됩니다 — `packages/core`의 `AI_ANALYSIS_LIMITS` 참고). 로컬 개발 시 API 키는 `supabase/functions/.env.example`을 참고해 `supabase/functions/.env`에 넣습니다.

### 인증 리다이렉트 URL

Supabase 프로젝트의 Authentication > URL Configuration에 아래 리다이렉트 URL을 등록합니다.

- 웹: 배포 origin (예: GitHub Pages 주소)
- 안드로이드 앱: `io.github.dnrso.nihongostudy://auth-callback` (Capacitor 딥링크로 Google 로그인 콜백을 앱으로 되돌립니다)


프로젝트 구조
-------------

```text
japanese-study-app/
├─ apps/
│  ├─ desktop/             # Electron 무설치 데스크톱 앱
│  └─ web/                 # Vite 기반 웹 앱 + Capacitor 안드로이드 앱, GitHub Pages 배포 대상
│
├─ packages/
│  ├─ ai/                  # Gemini 기반 일본어 문장 분석 공통 로직 (Supabase Edge Function에 복사되어 사용)
│  ├─ core/                # 검색, 필터링, 복습, 퀴즈, 통계 등 공통 계산
│  ├─ ui/                  # 공통 UI 렌더러, 컴포넌트, 스타일, 설정
│  ├─ storage/             # 저장소 adapter 런타임 계약
│  ├─ storage-sqlite/      # 데스크톱 SQLite 저장소 구현
│  ├─ storage-idb/         # 웹 IndexedDB 저장소 구현
│  ├─ sync/                # Supabase 로그인/동기화/Edge Function 호출 공통 로직
│  └─ tts/                 # 브라우저 TTS와 VOICEVOX 공통 로직
│
├─ supabase/
│  ├─ functions/           # Supabase Edge Functions (analyze-sentence 등)
│  └─ migrations/          # Supabase Postgres 마이그레이션 (study_snapshots, ai_usage)
│
├─ .github/workflows/
│  └─ static.yml           # GitHub Pages 웹 앱 배포 workflow
│
├─ package.json            # npm workspaces, 공통 scripts, Electron Builder 설정
├─ package-lock.json       # npm lockfile
└─ README.md
```


앱
---

### `apps/desktop`

Electron 데스크톱 앱입니다.

- `src/main.js`: Electron 앱 생명주기, BrowserWindow 생성, IPC 등록
- `src/preload.js`: renderer에 안전한 `window.studyData`, `window.ttsApi`, `window.appInfo` 노출
- `src/dataStore.js`: `packages/storage-sqlite`를 생성하고 `packages/storage` 계약으로 검증하는 desktop adapter
- `src/dataHandlers.js`: 데이터 IPC 요청을 storage adapter로 연결
- `src/ttsHandlers.js`: VOICEVOX IPC handler
- `src/renderer/`: 데스크톱 renderer shell, 이벤트, 상태, DOM adapter
- `scripts/build-windows.js`: Windows unpacked 빌드 및 schema 변경 시 app-data 백업

데스크톱 renderer는 아직 Electron 전용 shell을 가지고 있습니다. 다만 페이지별 동적 렌더링, 공통 스타일, config, DOM patch 적용은 `packages/ui`를 사용합니다.

### `apps/web`

Vanilla JS + Vite 웹 앱입니다.

- `index.html`: Vite entry HTML
- `src/main.js`: 웹 앱 shell, 이벤트 바인딩, IndexedDB 저장소 연결, 웹 전용 설정
- `src/templates.js`: 앱 shell과 페이지별 HTML 템플릿 조합
- `src/quiz.js`: 단어/한자/문장 퀴즈 세션 로직
- `src/syncSetup.js`: Supabase Google 로그인, 딥링크 콜백 처리, 계정 상태 UI 연결
- `src/sampleState.js`: 최초 IndexedDB 초기화 시 보여줄 안내용 문장 카드 1개 (예전에는 단어/한자/과제 등 전체 샘플 데이터를 seed했으나, 지금은 오늘 공부 탭 사용법을 안내하는 문장 카드 하나만 만듭니다)
- `vite.config.js`: GitHub Pages 호환을 위해 `base: "./"` 사용
- `dist/`: `npm run web:build` 산출물
- `android/`: Capacitor 안드로이드 네이티브 프로젝트 (Android Studio로 열어 빌드)

웹 앱은 `packages/core`, `packages/ui`, `packages/storage-idb`, `packages/sync`를 사용합니다. AI 문장 분석은 웹 앱이 Gemini를 직접 호출하지 않고 `packages/sync`로 Supabase Edge Function(`analyze-sentence`)을 호출하는 방식이며, `packages/ai`의 분석 로직은 Deno 런타임인 그 edge function에 그대로 복사되어 사용됩니다(워크스페이스 패키지를 직접 import할 수 없어서 — 자세한 내용은 위 "Supabase 연동 설정" 참고). 현재는 브라우저 IndexedDB에 데이터를 저장하며(Capacitor 안드로이드 앱도 내장 WebView의 같은 IndexedDB를 사용), GitHub Pages 배포 workflow는 `apps/web/dist`를 업로드합니다.


공통 패키지
-----------

### `packages/core`

DOM, Electron, 브라우저 저장소에 의존하지 않는 순수 계산 로직입니다.

- 홈 개요, 빠른 필터, 검색
- 단어장 정렬과 필터링
- 복습 큐 계산, 오늘 복습한 항목 수 집계(`lastReviewedAt` 기준)
- 복습 완료 대상 계산
- 단어/한자 4지선다 퀴즈 생성
- 문장 퀴즈(뜻 고르기/듣고 고르기) 문제 생성
- 문장 입력 구조 진단(원문 `#`/읽기/해석 중 누락된 부분 판별)
- 등록 필요 여부 계산(문장에 연결된 단어/문법/표현이 모두 등록됐는지), 홈 화면 오늘의 문장 랜덤 선택
- 목록 페이지네이션 계산과 탭별 페이지당 항목 수 기본값/설정값 해석
- AI 문장 분석 사용 제한 표시값(분당/일별 횟수, 최대 글자 수 — 실제 강제는 서버 쪽, 아래 "Supabase 연동 설정" 참고)
- 통계 계산

### `packages/ui`

공통 UI 렌더링 패키지입니다.

- `render.js`: UI package entry
- `config.js`: 목차, 라벨, 배지 색상, 복습 옵션, 품사/문자 옵션, placeholder
- `pages/`: 홈, 오늘 공부, 자료, 문장, 단어, 문법/표현, 한자, 퀴즈, 복습, 통계, 설정 렌더러
- `components/`: 빈 상태, 음성 버튼, 출처 링크, 카드, taxonomy chip, 퀴즈 패널, 페이지네이션 컨트롤
- `dom/applyPagePatch.js`: `{ text, html, value, style, hidden, disabled }` patch를 DOM에 적용
- `styles/`: 공통 CSS entry, base, layout, components, pages (모바일 반응형 레이아웃/하단 탭 내비게이션 포함)

현재 `packages/ui/pages`는 동적 페이지 렌더링과 일부 공통 패널을 담당합니다. 웹과 데스크톱의 전체 app shell, 이벤트 바인딩, storage/TTS/AI adapter는 각 앱에 남아 있습니다.

### `packages/storage`

저장소 adapter가 제공해야 하는 런타임 계약 패키지입니다.

- 필수 메서드 목록
- `paths` 객체 계약
- `assertStorageAdapter(store)` 검증

### `packages/storage-sqlite`

데스크톱 앱용 SQLite 저장소 구현입니다.

- SQLite DB 초기화와 schema 보정
- 마이그레이션
- 학습일, 오늘 공부 기록, 할 일, 항목, 복습, 퀴즈 결과 저장
- CSV/YAML export
- CSV import
- full-backup YAML 복원
- 문장/단어/문법/표현 입력 parser

### `packages/storage-idb`

웹 앱(+ 같은 코드를 쓰는 안드로이드 앱)용 IndexedDB 저장소 구현입니다.

- IndexedDB schema 생성 및 누락 object store 복구
- 최초 설치 seed (현재는 안내용 문장 카드 1개)
- 웹 상태 조회
- 오늘 공부 기록, 할 일, 항목, 복습, 퀴즈 결과 저장
- 문장/단어/문법/표현 입력 parser (AI 분석 결과와 수동 입력 모두 동일 형식으로 파싱)
- JSON 백업 export
- JSON 백업 전체 로드
- JSON 백업 병합 로드, 중복 제외

### `packages/ai`

AI 문장 분석 공통 패키지입니다.

- 일본어 학습용 분석 시스템 프롬프트
- Gemini REST client
- 기본 모델: `gemini-3.1-flash-lite`
- `analyzeJapaneseSentenceForStudy()` 공통 분석 흐름
- 빈 문장, API 키 누락, API 응답 오류 처리

현재 웹 앱은 브라우저에 Gemini API 키나 모델명을 저장하지 않으며, 설정 화면에도 Gemini API 설정을 노출하지 않습니다. 이 패키지는 웹/데스크톱 앱이 직접 import하지 않고, `supabase/functions/_shared/ai.js`에 그대로 복사되어 Edge Function(Deno) 안에서만 실행됩니다 — 두 파일은 손으로 동기화해야 하며, 각 파일 상단에 서로를 가리키는 주석이 있습니다.

### `packages/sync`

웹 앱의 Supabase 연동(로그인, 데이터 동기화, Edge Function 호출) 공통 로직입니다.

- Supabase client 생성, `.env`의 `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` 유무로 기능 활성화 여부 판단
- Google OAuth 로그인/로그아웃, 세션 조회, 세션 변경 구독
- 안드로이드 딥링크(`io.github.dnrso.nihongostudy://auth-callback`)로 돌아온 인증 콜백 처리(PKCE 코드 교환, 구버전 implicit flow 대비)
- 전체 백업 스냅샷 pull/push (`study_snapshots` 테이블) 후 로컬 데이터와 병합
- Edge Function 호출(`invokeFunction`) — 현재 `analyze-sentence` 하나에 사용

### `packages/tts`

TTS 공통 패키지입니다.

- 브라우저 Web Speech API용 일본어 음성 선택 로직
- VOICEVOX speaker option 생성
- VOICEVOX client
- TTS 설정 정규화


데이터 저장 위치
----------------

### 데스크톱

개발 실행 시 프로젝트 루트 기준으로 아래 폴더가 생성됩니다.

- `app-data/nihongo.sqlite`: SQLite 메인 DB
- `app-data/exports/`: CSV/YAML export 파일
- `app-data/backups/full-backup.yaml`: 전체 백업 YAML
- `user-data/`: Electron/Chromium profile, localStorage, cache, session data

Windows unpacked 빌드에서는 실행 파일이 있는 폴더 기준으로 `app-data`와 `user-data`를 사용합니다. 이 폴더를 앱과 함께 보관하면 무설치 앱처럼 사용할 수 있습니다.

### 웹

웹 앱 데이터는 브라우저 IndexedDB에 저장됩니다. Capacitor 안드로이드 앱도 별도 네이티브 저장소 없이 내장 WebView의 같은 IndexedDB를 사용합니다.

- 브라우저 사이트 데이터를 삭제하면 앱 데이터도 삭제됩니다.
- 설정 탭에서 JSON 백업 다운로드, 전체 로드, 병합 추가 로드를 사용할 수 있습니다.
- 로그인 후에는 Supabase에도 전체 백업 스냅샷이 동기화됩니다(기기 간 이어보기용, 로컬 IndexedDB가 항상 원본).


현재 기능
---------

- Electron 데스크톱 앱
- Vite 웹 앱
- Capacitor 기반 안드로이드 앱
- 모바일 반응형 레이아웃, 하단 탭 내비게이션
- GitHub Pages 정적 배포 workflow
- 최초 실행 시 문장 추가 방법을 안내하는 예시 문장 카드 1개만 표시(과거의 전체 샘플 데모 데이터는 제거)
- 홈 대시보드
- 홈 화면 오늘의 문장 위젯(랜덤 표시, 새로고침 버튼)
- 날짜별 오늘 공부 기록
- 학습 캘린더
- 문장 입력 및 문장 카드 표시
- 문장 탭에서 저장된 문장 목록 표시
- 문장 입력 구조 진단(원문 `#`/읽기/해석 중 빠진 부분 안내, 저장 전 차단)
- 문장에서 단어, 문법, 표현 후보 파싱
- 새 단어/문법/표현 직접 추가
- 웹 Google 로그인, Supabase 데이터 동기화(기기 간 백업 병합)
- 웹 AI 문장 분석(Gemini, Supabase Edge Function 경유, Google 로그인 필요, 분당 1회 · 하루 100회 · 최대 300자 제한, 제한값 화면 표시)
- 오늘 배운 항목 전체 등록
- 등록 필요 항목 표시(문장/오늘 배운 항목 배지, 캘린더 미등록 날짜 표시)
- 자료 라이브러리
- 단어장 관리, 검색, 필터, 정렬
- 문법 노트
- 표현/관용구 노트
- 한자 노트
- 문장/단어/문법/표현/한자 목록 페이지네이션, 설정 탭에서 탭별 페이지당 항목 수 조정
- 원본 문장 연결 표시 및 이동
- 복습 큐
- 날짜 기반 복습 상태 관리
- 예정일이 지난 복습 항목 자동 오늘 전환
- 오늘 복습한 단어/한자 수 집계
- 단어 4지선다 퀴즈
- 한자 4지선다 퀴즈
- 문장 뜻 고르기 퀴즈
- 듣고 문장 고르기 퀴즈
- 퀴즈 정답/오답 횟수 저장
- 퀴즈 정답 시 복습 상태 자동 변경 옵션
- 퀴즈 문제 텍스트 크기 설정
- 학습 통계
- 데스크톱 SQLite 저장
- 데스크톱 CSV/YAML export/import
- 데스크톱 full-backup YAML 복원
- 웹 IndexedDB 저장
- 웹 JSON 백업 다운로드
- 웹 JSON 백업 전체 로드
- 웹 JSON 백업 병합 추가 로드, 중복 제외
- 브라우저 기본 TTS 기반 일본어 음성 재생
- 데스크톱 VOICEVOX 기반 일본어 음성 재생
- Windows unpacked 빌드
- 데스크톱 schema 변경 시 기존 앱 데이터 백업


GitHub Pages 배포
-----------------

`.github/workflows/static.yml`은 `main` 브랜치 push 또는 수동 실행 시 웹 앱을 빌드하고 `apps/web/dist`를 GitHub Pages artifact로 업로드합니다.

현재 workflow trigger path는 아래 변경을 감지합니다.

- `apps/web/**`
- `packages/core/**`
- `packages/ui/**`
- `packages/ai/**`
- `packages/storage-idb/**`
- `.github/workflows/static.yml`
- `package*.json`

웹 배포에 영향을 주는 패키지를 더 분리할 경우(예: `packages/sync`도 현재 이 목록에는 없습니다) workflow path도 함께 갱신해야 합니다.


주요 의존성
-----------

런타임:

- `better-sqlite3`: 데스크톱 SQLite 저장소
- `yaml`: 데스크톱 CSV/YAML import/export
- `@supabase/supabase-js`: `packages/sync`의 로그인/동기화/Edge Function 호출 (웹 앱)
- `@capacitor/core`, `@capacitor/android`, `@capacitor/app`, `@capacitor/browser`, `@capacitor/cli`: 안드로이드 네이티브 wrapper, 딥링크, 시스템 브라우저 로그인 (웹 앱)

개발/빌드:

- `electron`: 데스크톱 앱 실행 환경
- `electron-builder`: Windows unpacked 빌드
- `@electron/asar`: 빌드 스크립트의 packaged schema 확인
- `vite`: 웹 앱 개발 서버와 번들링
- `vitest`: 테스트 러너 (`npm test`)
- `fake-indexeddb`: 테스트에서 `storage-idb`를 브라우저 없이 실행


확장 후보
---------

- 안드로이드 릴리스 서명(signingConfig) 및 스토어 배포 파이프라인 구성
- 문법/표현 퀴즈 구현
- SRS 알고리즘 고도화
- 중복 항목 처리 UI 개선
- 테스트/검증 스크립트 추가
