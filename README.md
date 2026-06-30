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

- `app-data/`
  개발 실행 시 생성되는 SQLite, export, backup 데이터 폴더입니다. 운영 데이터로 취급합니다.

- `dist/`
  빌드 산출물 폴더입니다.

- `node_modules/`
  설치된 npm 패키지 폴더입니다.


빌드 스크립트

- `scripts/build-windows.js`
  Windows unpacked 빌드를 생성합니다.
  빌드 전 기존 앱 데이터 잠금 상태를 확인하고, schema 변경 시 `dist/app-data-backup`에 백업을 남깁니다.
  packaged 앱의 영구 데이터는 `dist/app-data`에 보존되도록 구성합니다.


메인 프로세스

- `src/main.js`
  Electron 앱 생명주기, BrowserWindow 생성, 데이터 저장 경로 설정, IPC 핸들러 등록을 담당합니다.

- `src/ttsHandlers.js`
  VOICEVOX speaker 목록 조회와 음성 합성 IPC 핸들러를 담당합니다.

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
  `window.studyData` API를 렌더러 내부에서 쓰기 쉬운 `dataApi` 객체로 감쌉니다.

- `src/renderer/state.js`
  렌더러 전역 상태, 선택 날짜, 검색어, 정렬 상태, 퀴즈 상태, 복습 선택 상태, 공통 계산 함수를 관리합니다.

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
  VOICEVOX speaker 목록 로드, TTS 설정 저장, 음성 합성 요청, 오디오 재생, 오류 표시를 담당합니다.


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

개발 실행 시 데이터는 프로젝트 루트의 `app-data` 폴더에 저장됩니다.

- `app-data/nihongo.sqlite`
  메인 SQLite 데이터베이스입니다.

- `app-data/exports/`
  CSV와 학습 로그 YAML 내보내기 파일이 저장됩니다.

- `app-data/backups/full-backup.yaml`
  전체 백업 YAML 파일이 저장됩니다.

Windows unpacked 빌드에서는 앱 실행 파일 폴더와 분리된 `dist/app-data`를 영구 데이터 위치로 사용합니다.


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
- 복습 상태 순환 변경
- 선택한 복습 항목 완료 처리
- 단어 4지선다 퀴즈
- 한자 4지선다 퀴즈
- 퀴즈 정답/오답 횟수 저장
- 퀴즈 문제 텍스트 크기 설정
- 전체 검색
- 학습 통계 표시
- SQLite 저장
- CSV/YAML 내보내기
- CSV/YAML 가져오기
- 전체 YAML 백업 복원
- 저장 데이터 초기화
- VOICEVOX 기반 일본어 음성 재생
- Windows unpacked 빌드
- schema 변경 시 기존 앱 데이터 백업


예정 또는 확장 후보
-------------------

- 문법/표현 퀴즈 구현
- SRS 간격 반복 알고리즘 고도화
- 데이터 편집 UX 개선
- 중복 항목 처리 UI 개선
- 테스트/검증 스크립트 추가
