NihonGo Study
=============

Electron 기반 개인 일본어 공부 앱입니다.
문장 중심으로 공부 기록을 남기고, 문장에서 단어, 문법, 표현, 한자를 추출해 단어장과 복습 큐로 관리합니다.


실행 및 빌드
-----------

의존성이 이미 설치되어 있으면 아래 명령으로 실행합니다.

```bash
npm start
```

Windows용 unpacked 빌드는 아래 명령으로 생성합니다.

```bash
npm run build
```

GitHub Pages용 정적 웹 산출물 초안은 아래 명령으로 `docs/`에 생성합니다.

```bash
npm run build:web
```

현재 프로젝트는 `npm install`을 새로 실행하지 않는 것을 원칙으로 합니다.
의존성을 의도적으로 바꾸는 경우에만 `package-lock.json`을 함께 변경합니다.


사용된 패키지
------------

런타임 의존성

- `better-sqlite3`
  SQLite 데이터베이스를 동기 API로 읽고 쓰기 위해 사용합니다.

- `yaml`
  학습 로그와 전체 백업 데이터를 YAML 파일로 내보내고 가져오기 위해 사용합니다.

개발/빌드 의존성

- `electron`
  데스크톱 앱 실행 환경과 메인/렌더러 프로세스를 제공합니다.

- `electron-builder`
  Windows 빌드 산출물을 생성합니다.

- `@electron/asar`
  빌드 스크립트에서 기존 `app.asar` 안의 schema 파일을 읽고 schema 변경 여부를 확인하기 위해 사용합니다.

Node.js 내장 모듈

- `fs`, `path`, `crypto`, `child_process`
  파일 입출력, 경로 처리, ID/hash 생성, 빌드 프로세스 실행에 사용합니다.


현재 파일 구조
--------------

루트

- `package.json`
  앱 메타데이터, 실행/빌드 스크립트, 의존성, Electron Builder 설정을 관리합니다.

- `package-lock.json`
  npm 의존성 버전을 고정합니다.

- `.gitignore`
  `node_modules`, 빌드 산출물, 로그, 운영 데이터 등 Git에 포함하지 않을 파일을 정의합니다.

- `README.md`
  프로젝트 구조, 실행 방법, 기능, 패키지 정보를 설명합니다.

- `docs/`
  GitHub Pages 배포 루트 초안입니다.
  `npm run build:web` 실행 시 렌더러 공통 UI와 웹용 저장소 스캐폴딩을 복사해 생성합니다.

- `app-data/`
  개발 실행 시 생성되는 SQLite, export, backup 데이터 폴더입니다. 운영 데이터로 취급합니다.

- `user-data/`
  개발 실행 시 생성되는 Electron userData/sessionData 폴더입니다.
  localStorage, Preferences, cache 같은 Chromium 프로필 데이터를 저장합니다.

- `dist/`
  빌드 산출물 폴더입니다.

- `node_modules/`
  설치된 npm 패키지 폴더입니다.


빌드 스크립트

- `scripts/build-windows.js`
  Windows unpacked 빌드를 생성합니다.
  빌드 전 기존 앱 데이터 잠금 상태를 확인하고, schema 변경 시 `dist/app-data-backup`에 백업을 남깁니다.
  packaged 앱의 영구 데이터는 실행 파일 폴더의 `app-data`와 `user-data`를 사용합니다.

- `scripts/build-web.js`
  GitHub Pages용 `docs/` 정적 산출물을 생성합니다.
  Electron preload 없이 실행되도록 `browserDataStore.js`를 `api.js`보다 먼저 로드하는 웹용 HTML을 만듭니다.


메인 프로세스

- `src/main.js`
  Electron 앱 생명주기, BrowserWindow 생성, 포터블 저장 경로 설정, IPC 핸들러 등록을 담당합니다.

- `src/ttsHandlers.js`
  VOICEVOX speaker 목록 조회와 음성 합성 IPC 핸들러를 담당합니다.
  브라우저 기본 TTS는 렌더러의 Web Speech API를 직접 사용합니다.

- `src/preload.js`
  렌더러에서 사용할 안전한 API를 `window.studyData`, `window.ttsApi`, `window.appInfo`로 노출합니다.
  렌더러가 직접 Node.js나 SQLite에 접근하지 않도록 경계를 만듭니다.
  Electron preload 제약 때문에 로컬 모듈 import 대신 IPC 채널 이름을 파일 안에 직접 둡니다.

- `src/dataChannels.js`
  메인 프로세스에서 사용하는 데이터 IPC 채널 이름을 모아둡니다.

- `src/dataHandlers.js`
  메인 프로세스의 IPC 요청을 `dataStore` 함수로 연결합니다.


데이터 계층

- `src/dataStore.js`
  SQLite 초기화, schema 보정, 마이그레이션, 앱 상태 조회, 학습일/할 일/일일 기록/학습 항목/복습/퀴즈 결과 저장을 담당합니다.

- `src/dataSchema.js`
  SQLite 테이블과 인덱스 schema를 정의합니다.

- `src/dataImportExport.js`
  CSV/YAML 내보내기, CSV 가져오기, 전체 YAML 백업 복원을 담당합니다.

- `src/dailyEntryParser.js`
  사용자가 붙여넣은 문장/단어/문법/표현 텍스트를 앱 내부 데이터 구조로 파싱합니다.
  단어의 한자 정보를 별도 한자 항목으로 확장하는 기능도 포함합니다.

렌더러

- `src/renderer/index.html`
  전체 화면 구조, 페이지 섹션, 모달, 설정 UI, 스크립트 로딩 순서를 정의합니다.

- `src/renderer/app.js`
  렌더러 앱 시작점입니다.
  저장 경로와 초기 상태를 불러온 뒤 이벤트를 바인딩합니다.

- `src/renderer/api.js`
  Electron의 `window.studyData` 또는 웹의 `window.browserDataStore`를 렌더러 내부에서 쓰기 쉬운 `dataApi` 객체로 감쌉니다.
  렌더러 UI가 저장소 구현을 직접 알지 않도록 플랫폼 어댑터 경계를 담당합니다.

- `src/renderer/browserDataStore.js`
  웹 버전용 `localStorage` 기반 데이터 저장소 스캐폴딩입니다.
  Electron IPC/SQLite 없이도 공통 렌더러 UI가 초기 실행, 항목 CRUD, 복습, 퀴즈 카운트 저장을 수행할 수 있게 합니다.

- `src/renderer/state.js`
  렌더러 전역 상태, 선택 날짜, 검색어, 정렬 상태, 퀴즈 상태, 복습 큐 임시 상태, 공통 계산 함수를 관리합니다.

- `src/renderer/render.js`
  홈, 오늘 공부, 자료, 단어, 문법, 표현, 한자, 퀴즈, 복습, 통계, 설정 화면을 렌더링합니다.

- `src/renderer/actions.js`
  페이지 이동, 문장 이동, 다이얼로그 열기/저장, 항목 삭제, 복습 상태 변경, 한자 연결 단어 검색 같은 사용자 동작을 처리합니다.

- `src/renderer/events.js`
  탭, 검색, 캘린더, 항목 CRUD, 퀴즈, 복습, import/export, 단축키 등 DOM 이벤트를 바인딩합니다.

- `src/renderer/config.js`
  페이지 목차, 항목 라벨, 배지 색상, 품사/문자 옵션, 수동 입력 placeholder 같은 UI 설정값을 관리합니다.

- `src/renderer/domUtils.js`
  DOM 조회, HTML escape, 빈 상태 마크업, 날짜 키 생성 같은 공통 유틸리티를 제공합니다.

- `src/renderer/tts.js`
  브라우저 기본 TTS와 VOICEVOX 엔진 선택, 음성 목록 로드, TTS 설정 저장, 음성 재생, 오류 표시를 담당합니다.


스타일

- `src/renderer/styles.css`
  CSS entry 파일입니다. 아래 스타일 파일들을 import합니다.

- `src/renderer/styles/base.css`
  CSS 변수, 기본 태그, 입력 요소, 전역 포커스 스타일을 담당합니다.

- `src/renderer/styles/layout.css`
  topbar, tabbar, sidebar, main layout, hero layout 등 앱 전체 배치를 담당합니다.

- `src/renderer/styles/components.css`
  버튼, 패널, 카드, 테이블, 배지, 모달, 퀴즈 패널 등 재사용 UI 컴포넌트 스타일을 담당합니다.

- `src/renderer/styles/pages.css`
  오늘 공부, 캘린더, 문장 카드, 후보 항목, 학습 항목, 반응형 규칙 등 페이지 전용 스타일을 담당합니다.


데이터 저장 위치
----------------

앱 데이터와 Electron 프로필 데이터는 실행 기준 폴더 안에 저장됩니다.
개발 실행 시에는 프로젝트 루트를 기준으로 사용합니다.

- `app-data/nihongo.sqlite`
  메인 SQLite 데이터베이스입니다.

- `app-data/exports/`
  CSV와 학습 로그 YAML 내보내기 파일이 저장됩니다.

- `app-data/backups/full-backup.yaml`
  전체 백업 YAML 파일이 저장됩니다.

- `user-data/`
  Electron localStorage, Preferences, cache, session data가 저장됩니다.

Windows unpacked 빌드에서는 실행 파일이 있는 폴더를 기준으로 `app-data`와 `user-data`를 사용합니다.
이 폴더들을 앱과 함께 보관하면 무설치 앱처럼 사용할 수 있고, 제거할 때는 배포 폴더를 삭제하면 됩니다.


현재 기능
---------

- Electron 데스크톱 앱 실행
- 홈 대시보드
- 날짜별 오늘 공부 기록
- 학습 캘린더
- 문장 입력 및 문장 카드 표시
- 문장에서 단어, 문법, 표현 후보 자동 파싱
- 새 단어/문법/표현 직접 추가
- 오늘 배운 항목 전체 등록
- 단어장 관리
- 단어장 품사/문자/복습 필터
- 단어장 정렬
- 문법 노트 관리
- 표현/관용구 관리
- 한자 노트 관리
- 한자에서 연결 단어 검색
- 자료 라이브러리 관리
- 항목 수정/삭제
- 원본 문장 연결 표시 및 문장 위치로 이동
- 복습 큐 표시
- 날짜 기반 복습 상태 관리
- 단어장/카드 복습 상태 즉시 순환 변경
- 복습 큐에서 완료 전 임시 복습 예정 상태 선택
- 복습 큐 완료 시 큐 항목 중 대기가 아닌 예정 상태 전체 저장
- 내일/3일 후/일주일/2주일/한달 복습 예정일 자동 계산
- 예정일이 지난 복습 항목 자동 오늘 전환
- 단어 4지선다 퀴즈
- 한자 4지선다 퀴즈
- 퀴즈 정답/오답 횟수 저장
- 퀴즈 정답 시 복습 상태 자동 변경 옵션
- 퀴즈 문제 텍스트 크기 설정
- 전체 검색
- 학습 통계 표시
- SQLite 저장
- CSV/YAML 내보내기
- CSV/YAML 가져오기
- 전체 YAML 백업 복원
- 저장 데이터 초기화
- 브라우저 기본 TTS 기반 일본어 음성 재생
- 선택형 VOICEVOX 기반 일본어 음성 재생
- TTS 엔진 및 일본어 음성 감지 상태 표시
- Windows unpacked 빌드
- schema 변경 시 기존 앱 데이터 백업


웹 버전 계획
------------

현재 웹 버전은 Electron 앱을 대체하는 완성본이 아니라 GitHub Pages 배포를 위한 구조 초안입니다.

- 공통 UI
  `src/renderer/index.html`, 스타일, 렌더러 스크립트는 Electron과 웹에서 함께 쓰는 방향으로 유지합니다.
  플랫폼 차이는 `src/renderer/api.js`의 데이터 어댑터 선택으로 모읍니다.

- Electron 전용 영역
  `src/main.js`, `src/preload.js`, `src/dataStore.js`, `src/dataHandlers.js`, `src/ttsHandlers.js`는 Electron/Node/SQLite 전용으로 둡니다.
  웹 빌드에서는 이 파일들을 직접 로드하지 않습니다.

- 웹 데이터 저장소
  `src/renderer/browserDataStore.js`는 `localStorage` 기반 임시 저장소입니다.
  현재 목표는 UI 흐름 검증과 GitHub Pages 실행 가능성 확인이며, SQLite 데이터와의 정식 동기화는 이후 단계에서 결정합니다.

- 배포 구조
  `npm run build:web`은 `docs/`를 재생성하고 GitHub Pages Source를 `main` 브랜치의 `/docs`로 설정할 수 있는 형태를 만듭니다.
  웹 산출물은 정적 파일만 사용하며 추가 npm 의존성을 요구하지 않습니다.

- 남은 결정 사항
  Electron SQLite 데이터와 웹 `localStorage` 데이터의 변환 규칙, 백업/복원 UX, GitHub Pages 공개 범위, 향후 서버 저장소 사용 여부를 확정해야 합니다.


예정 또는 확장 후보
-------------------

- 문법/표현 퀴즈 구현
- SRS 간격 반복 알고리즘 고도화
- 데이터 편집 UX 개선
- 중복 항목 처리 UI 개선
- 테스트/검증 스크립트 추가
- 웹 버전 데이터 가져오기/내보내기 UX 확정
