export function createSampleState(todayKey) {
  const today = todayKey();
  const sourceSentence = {
    id: "sentence-1",
    title: "私なんか気に障ることしたかな",
    studyDate: today
  };

  return {
    selectedDate: today,
    studyLog: {
      minutes: 45,
      totalMinutes: 1280,
      summary: "뉴스 문장 3개에서 단어와 표현을 정리하세요.",
      note: ""
    },
    studyDays: [],
    dailyEntries: [
      {
        id: "sentence-1",
        kind: "sentence",
        title: "私なんか気に障ることしたかな",
        reading: "わたし なんか きにさわる こと したかな",
        meaning: "나 따위가 기분 상할 만한 일을 한 걸까",
        studyDate: today
      },
      {
        id: "daily-word-1",
        kind: "word",
        title: "気に障る",
        reading: "きにさわる",
        meaning: "기분에 거슬리다",
        studyDate: today,
        parentId: "sentence-1",
        parentTitle: "私なんか気に障ることしたかな",
        parsed: { kanji: "気, 障", part: "동사표현", script: "한자+히라가나" },
        sourceSentences: [sourceSentence]
      },
      {
        id: "daily-grammar-1",
        kind: "grammar",
        title: "なんか",
        reading: "",
        meaning: "자신을 낮추거나 가볍게 말할 때 쓰는 표현",
        studyDate: today,
        parentId: "sentence-1",
        parentTitle: "私なんか気に障ることしたかな",
        parsed: {},
        sourceSentences: [sourceSentence]
      },
      {
        id: "daily-expression-1",
        kind: "expression",
        title: "お疲れさまです",
        reading: "おつかれさまです",
        meaning: "수고하셨습니다",
        studyDate: today,
        parentId: "sentence-1",
        parentTitle: "私なんか気に障ることしたかな",
        parsed: {},
        sourceSentences: [sourceSentence]
      }
    ],
    tasks: [
      { id: "task-1", title: "어제 추가한 단어 복습", note: "뜻을 가리고 10개 확인", tag: "복습", done: false, studyDate: today },
      { id: "task-2", title: "오늘 문장 2개 정리", note: "단어와 문법 후보까지 등록", tag: "입력", done: true, studyDate: today }
    ],
    items: [
      {
        id: "source-1",
        kind: "source",
        title: "NHK Easy News",
        reading: "뉴스",
        meaning: "짧은 기사로 어휘와 표현을 정리합니다.",
        level: "N3",
        source: "https://www3.nhk.or.jp/news/easy/",
        note: "웹 저장소 연결 전 샘플 자료"
      },
      {
        id: "item-word-1",
        kind: "word",
        title: "気に障る",
        reading: "きにさわる",
        meaning: "기분에 거슬리다",
        level: "N3",
        kanji: "気, 障",
        part: "동사표현",
        script: "한자+히라가나",
        review: "오늘",
        source: "NHK Easy News",
        note: "",
        sourceSentences: [sourceSentence]
      },
      {
        id: "item-word-2",
        kind: "word",
        title: "確かめる",
        reading: "たしかめる",
        meaning: "확인하다",
        level: "N3",
        kanji: "確",
        part: "동사",
        script: "한자+히라가나",
        review: "대기",
        source: "회화",
        note: ""
      },
      {
        id: "item-word-3",
        kind: "word",
        title: "余計",
        reading: "よけい",
        meaning: "쓸데없음, 더 많음",
        level: "N3",
        kanji: "余, 計",
        part: "な형용사",
        script: "한자",
        review: "내일",
        source: "뉴스 문장",
        note: ""
      },
      {
        id: "item-word-4",
        kind: "word",
        title: "頼もしい",
        reading: "たのもしい",
        meaning: "믿음직하다",
        level: "N2",
        kanji: "頼",
        part: "い형용사",
        script: "한자+히라가나",
        review: "대기",
        source: "드라마 대사",
        note: ""
      },
      {
        id: "item-grammar-1",
        kind: "grammar",
        title: "なんか",
        reading: "",
        meaning: "자신을 낮추거나 가볍게 말할 때 쓰는 표현",
        level: "N3",
        review: "대기",
        source: "회화",
        note: "예문 속 뉘앙스를 함께 복습",
        sourceSentences: [sourceSentence]
      },
      {
        id: "item-expression-1",
        kind: "expression",
        title: "お疲れさまです",
        reading: "おつかれさまです",
        meaning: "수고하셨습니다",
        level: "회화",
        review: "오늘",
        source: "직장 회화",
        note: ""
      },
      {
        id: "item-kanji-1",
        kind: "kanji",
        title: "私",
        reading: "わたし",
        meaning: "나, 저",
        level: "N5",
        review: "대기",
        source: "",
        note: ""
      },
      {
        id: "item-kanji-2",
        kind: "kanji",
        title: "気",
        reading: "き",
        meaning: "기운, 마음",
        level: "N5",
        review: "오늘",
        source: "",
        note: ""
      },
      {
        id: "item-kanji-3",
        kind: "kanji",
        title: "障",
        reading: "しょう",
        meaning: "가로막다",
        level: "N2",
        review: "대기",
        source: "",
        note: ""
      },
      {
        id: "item-kanji-4",
        kind: "kanji",
        title: "確",
        reading: "かく",
        meaning: "확실하다",
        level: "N3",
        review: "내일",
        source: "",
        note: ""
      }
    ]
  };
}
