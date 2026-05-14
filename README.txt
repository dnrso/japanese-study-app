NihonGo Study
=============

Electron 기반 일본어 공부 앱입니다.
현재 목표는 문장 중심으로 단어, 문법, 표현, 한자를 기록하고 복습 큐와 자료를 함께 관리하는 것입니다.


실행 방법
---------

1. 의존성이 이미 설치되어 있으면 아래 명령으로 실행합니다.

   npm start

2. 현재 작업에서는 npm install을 새로 실행하지 않는 것을 원칙으로 합니다.


파일별 책임 구조
----------------

루트 파일

- package.json
  앱 이름, Electron 실행 스크립트, 의존성 정보를 관리합니다.

- package-lock.json
  설치된 npm 의존성 버전을 고정합니다.

- .gitignore
  node_modules, 빌드 산출물, 로그 파일 등 Git에 올리지 않을 파일을 정의합니다.


메인 프로세스

- src/main.js
  Electron 앱 생명주기와 BrowserWindow 생성을 담당합니다.

- src/preload.js
  렌더러에서 사용할 안전한 API(window.studyData)를 노출합니다.
  렌더러가 직접 Node.js나 DB에 접근하지 않도록 하는 경계입니다.

- src/dataChannels.js
  메인 프로세스에서 사용하는 IPC 채널 이름을 모아둔 파일입니다.

- src/dataHandlers.js
  IPC 요청을 받아 데이터 저장소 함수로 연결합니다.


데이터 계층

- src/dbBridge.js
  Electron 메인 프로세스에서 DB CLI를 호출하는 브리지입니다.

- src/dbCli.js
  DB 작업을 별도 Node 프로세스로 실행하는 CLI 진입점입니다.

- src/dataStore.js
  SQLite 데이터 CRUD와 앱 상태 조회를 담당합니다.
  할 일, 학습 일자, 학습 항목, 복습 상태 등을 읽고 씁니다.

- src/dataSchema.js
  SQLite 테이블, 인덱스 등 DB schema를 정의합니다.

- src/dailyEntryParser.js
  사용자가 입력한 문장/단어/문법/표현 텍스트를 앱 데이터 구조로 파싱합니다.

- src/dataImportExport.js
  CSV/YAML 내보내기와 가져오기를 담당합니다.


렌더러

- src/renderer/index.html
  앱 화면의 HTML 구조와 스크립트 로딩 순서를 정의합니다.

- src/renderer/app.js
  렌더러 앱 시작점입니다.
  초기 데이터 로드와 이벤트 바인딩 시작만 담당합니다.

- src/renderer/api.js
  preload에서 노출한 window.studyData API를 렌더러 내부에서 쓰기 쉽게 감싼 파일입니다.

- src/renderer/state.js
  렌더러 상태, 검색어, 선택 날짜, 복습 선택 상태, 공통 상태 계산 함수를 관리합니다.

- src/renderer/render.js
  홈, 오늘 공부, 단어장, 문법, 표현, 한자, 복습, 통계 등 화면 렌더링을 담당합니다.

- src/renderer/actions.js
  항목 저장, 삭제, 복습 상태 변경, 페이지 이동 같은 사용자 동작을 처리합니다.

- src/renderer/events.js
  버튼 클릭, 입력, 단축키 등 DOM 이벤트 바인딩을 담당합니다.

- src/renderer/config.js
  탭 목차, 항목 라벨, 배지 색상, 입력 placeholder 같은 UI 설정값을 관리합니다.

- src/renderer/domUtils.js
  DOM 조회, HTML escape, 날짜 키 생성 같은 공통 유틸리티를 제공합니다.


스타일

- src/renderer/styles.css
  CSS entry 파일입니다. 아래 CSS 파일들을 import합니다.

- src/renderer/styles/base.css
  CSS 변수, 기본 태그, 입력 요소 같은 전역 스타일을 담당합니다.

- src/renderer/styles/layout.css
  topbar, sidebar, main layout, hero layout 등 앱 전체 배치를 담당합니다.

- src/renderer/styles/components.css
  버튼, 패널, 카드, 테이블, 배지, 모달 등 재사용 UI 컴포넌트 스타일을 담당합니다.

- src/renderer/styles/pages.css
  오늘 공부, 캘린더, 문장 카드, 학습 항목, 반응형 규칙 등 페이지 전용 스타일을 담당합니다.


데이터 저장 위치
----------------

앱 데이터는 프로젝트 루트의 app-data 폴더에 저장됩니다.

- app-data/nihongo.sqlite
  메인 SQLite 데이터베이스입니다.

- app-data/exports
  CSV와 학습 로그 YAML 내보내기 파일이 저장됩니다.

- app-data/backups/full-backup.yaml
  전체 백업 YAML 파일이 저장됩니다.

현재 app-data 폴더는 앱 실행 또는 데이터 작업 시 생성됩니다.
Git에는 포함하지 않는 운영 데이터로 취급하는 것이 좋습니다.


현재 기능
---------

- Electron 앱 실행
- 홈 대시보드
- 날짜별 오늘 공부 기록
- 문장 입력 및 문장 카드 표시
- 문장에서 단어, 문법, 표현 후보 파싱
- 단어장 관리
- 문법 노트 관리
- 표현/관용구 관리
- 한자 노트 관리
- 자료 라이브러리 관리
- 복습 큐 표시
- 복습 상태 변경
- 선택한 복습 항목 완료 처리
- 전체 검색
- 단어장 품사/복습 필터
- 학습 통계 표시
- SQLite 저장
- CSV/YAML 내보내기
- CSV/YAML 가져오기
- 샘플/저장 데이터 초기화
- 음성 재생 기능

예정 기능
---------

- 퀴즈 기능
  단어 뜻 맞히기, 문법 선택 문제, 한자 읽기 문제 등을 추가할 예정입니다.

- 복습 알고리즘 개선
  현재 복습 상태는 단순 상태값 중심입니다.
  이후 SRS 간격 반복 방식으로 확장할 수 있습니다.

- 데이터 편집 UX 개선
  항목 수정 폼, 중복 처리, 검색 결과 이동 등을 더 정교하게 개선할 예정입니다.

- 테스트/검증 스크립트 추가
  현재 요청에 따라 검증 스크립트는 아직 추가하지 않았습니다.
  추후 npm install 가능 시점에 별도 스크립트로 추가할 예정입니다.
