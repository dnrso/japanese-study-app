NihonGo Study Web
=================

GitHub Pages에서 서비스하기 위한 일본어 공부 웹 앱입니다.
로그인과 서버 동기화 없이 시작하며, 학습 데이터는 현재 브라우저의 IndexedDB에 저장합니다.


실행 및 배포
-----------

정적 배포 산출물은 아래 명령으로 `docs/`에 생성합니다.

```bash
npm run build
```

GitHub Pages 설정은 이 브랜치의 `/docs` 폴더를 Source로 사용하는 구성을 기준으로 합니다.
현재 프로젝트는 웹 표준 API만 사용하며 런타임 npm 의존성이 없습니다.


현재 저장 방식
--------------

- 앱 데이터
  IndexedDB `nihongo-study` 데이터베이스에 snapshot 형태로 저장합니다.

- 로그인/동기화
  아직 제공하지 않습니다. 데이터는 브라우저와 프로필에 귀속됩니다.

- 백업
  현재는 JSON 다운로드 내보내기만 제공합니다.
  JSON 가져오기, CSV 가져오기, 서버 동기화는 이후 단계에서 확정합니다.

- 기존 웹 초안 데이터
  이전 `localStorage` 기반 초안 데이터가 있으면 첫 실행 시 IndexedDB로 1회 마이그레이션합니다.


현재 파일 구조
--------------

루트

- `package.json`
  정적 웹 빌드 스크립트를 관리합니다.

- `package-lock.json`
  현재 의존성 없는 npm 프로젝트 상태를 고정합니다.

- `.gitignore`
  `node_modules`, 로그, OS 메타데이터 등 Git에 포함하지 않을 파일을 정의합니다.

- `README.md`
  웹 버전 구조와 배포 방향을 설명합니다.

- `docs/`
  GitHub Pages 배포 루트입니다.
  `npm run build` 실행 시 `src/renderer`의 정적 앱 파일이 복사됩니다.


빌드 스크립트

- `scripts/build-web.js`
  `docs/`를 재생성하고 `.nojekyll`과 배포용 README를 함께 생성합니다.


웹 앱

- `src/renderer/index.html`
  전체 화면 구조, 페이지 섹션, 모달, 설정 UI, 스크립트 로딩 순서를 정의합니다.

- `src/renderer/app.js`
  앱 시작점입니다. 저장 경로와 초기 상태를 불러온 뒤 이벤트를 바인딩합니다.

- `src/renderer/api.js`
  `window.browserDataStore`를 렌더러 내부에서 쓰기 쉬운 `dataApi` 객체로 감쌉니다.

- `src/renderer/browserDataStore.js`
  IndexedDB 기반 데이터 저장소입니다.
  학습일, 문장, 할 일, 학습 항목, 복습 상태, 퀴즈 결과 저장을 담당합니다.

- `src/renderer/state.js`
  전역 상태, 선택 날짜, 검색어, 정렬 상태, 퀴즈 상태, 복습 큐 임시 상태를 관리합니다.

- `src/renderer/render.js`
  홈, 오늘 공부, 자료, 단어, 문법, 표현, 한자, 퀴즈, 복습, 통계, 설정 화면을 렌더링합니다.

- `src/renderer/actions.js`
  페이지 이동, 문장 이동, 다이얼로그 열기/저장, 항목 삭제, 복습 상태 변경, 한자 연결 단어 검색 같은 사용자 동작을 처리합니다.

- `src/renderer/events.js`
  탭, 검색, 캘린더, 항목 CRUD, 퀴즈, 복습, 내보내기, 단축키 등 DOM 이벤트를 바인딩합니다.

- `src/renderer/config.js`
  페이지 목차, 항목 라벨, 배지 색상, 품사/문자 옵션, 수동 입력 placeholder 같은 UI 설정값을 관리합니다.

- `src/renderer/domUtils.js`
  DOM 조회, HTML escape, 빈 상태 마크업, 날짜 키 생성 같은 공통 유틸리티를 제공합니다.

- `src/renderer/tts.js`
  브라우저 기본 Web Speech API 기반 일본어 음성 재생을 담당합니다.


스타일

- `src/renderer/styles.css`
  CSS entry 파일입니다.

- `src/renderer/styles/base.css`
  CSS 변수, 기본 태그, 입력 요소, 전역 포커스 스타일을 담당합니다.

- `src/renderer/styles/layout.css`
  topbar, tabbar, sidebar, main layout, hero layout 등 앱 전체 배치를 담당합니다.

- `src/renderer/styles/components.css`
  버튼, 패널, 카드, 테이블, 배지, 모달, 퀴즈 패널 등 재사용 UI 컴포넌트 스타일을 담당합니다.

- `src/renderer/styles/pages.css`
  오늘 공부, 캘린더, 문장 카드, 후보 항목, 학습 항목, 반응형 규칙 등 페이지 전용 스타일을 담당합니다.


현재 기능
---------

- GitHub Pages 정적 웹 앱 구조
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
- 복습 예정일 자동 계산
- 예정일이 지난 복습 항목 자동 오늘 전환
- 단어 4지선다 퀴즈
- 한자 4지선다 퀴즈
- 퀴즈 정답/오답 횟수 저장
- 퀴즈 정답 시 복습 상태 자동 변경 옵션
- 전체 검색
- 학습 통계 표시
- IndexedDB 저장
- JSON 백업 다운로드
- 브라우저 기본 TTS 기반 일본어 음성 재생


제외된 범위
-----------

- 데스크톱 앱 런타임
- 서버 로그인
- 서버 동기화
- 외부 음성 합성 엔진 연동
- 네이티브 데이터베이스
- Windows 패키징


예정 또는 확장 후보
-------------------

- JSON 백업 가져오기
- CSV 가져오기/내보내기 UX 확정
- 서버 계정/동기화 여부 결정
- 문법/표현 퀴즈 구현
- SRS 간격 반복 알고리즘 고도화
- 데이터 편집 UX 개선
- 중복 항목 처리 UI 개선
- 테스트/검증 스크립트 추가
