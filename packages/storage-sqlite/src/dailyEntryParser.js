function itemToRawText(item) {
  const parts = [`### ${text(item.title)}`];
  if (item.reading) parts.push(`- **읽기**: ${item.reading}`);
  if (item.meaning) parts.push(`- **해석**: ${item.meaning}`);
  if (item.kanji) parts.push(`- **한자**: ${item.kanji}`);
  if (item.part) parts.push(`- **품사**: ${item.part}`);
  if (item.script) parts.push(`- **문자**: ${item.script}`);
  if (item.note && item.note !== item.meaning) parts.push(`- **메모**: ${item.note}`);
  return parts.join("\n");
}


function parseDailyEntry(kind, rawText) {
  const normalizedKind = normalizeDailyKind(kind);
  const raw = text(rawText).trim();
  const title = firstMatch(raw, /^#{1,6}\s*(.+)$/m) || firstMatch(raw, /`([^`]+)`/) || raw.split(/\r?\n/)[0] || "";
  const reading = firstMatch(raw, /^읽기\s+(.+)$/m) || firstMatch(raw, /\*\*읽기\*\*\s*:\s*(.+)/) || firstMatch(raw, /`[^`]+`\s*\(([^)]+)\)/) || "";
  const meaning = firstMatch(raw, /^해석\s+(.+)$/m) || firstMatch(raw, /\*\*해석\*\*\s*:\s*(.+)/) || inlineMeaning(raw) || "";

  return {
    kind: normalizedKind,
    title: title.trim(),
    reading: reading.trim(),
    meaning: meaning.trim(),
    words: parseWordLines(raw),
    grammar: parseGrammarLines(raw),
    expressions: parseExpressionLines(raw),
    note: raw
  };
}

function sectionedBulletLines(raw) {
  const result = [];
  let section = "";

  raw.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (/^(?:-\s*)?(?:\*\*)?단어장(?:\*\*)?$/.test(trimmed)) section = "word";
    if (/^(?:-\s*)?(?:\*\*)?문법(?:\*\*)?$/.test(trimmed)) section = "grammar";
    if (/^(?:-\s*)?(?:\*\*)?표현(?:\*\*)?$/.test(trimmed)) section = "expression";
    if (/^(?:-\s*)?`.+`/.test(trimmed)) {
      result.push({ section, line: trimmed });
    }
  });

  return result;
}

function parseWordLines(raw) {
  return sectionedBulletLines(raw)
    .filter(item => item.section === "word" || /품사=|문자=|한자=/.test(item.line))
    .map(item => {
      const line = item.line;
      const title = firstMatch(line, /`([^`]+)`/) || "";
      const reading = firstMatch(line, /`[^`]+`\s*\(([^)]+)\)/) || "";
      const meaning = inlineMeaning(line) || "";
      return {
        kind: "word",
        title,
        reading,
        meaning: meaning.trim(),
        kanji: fieldValue(line, "한자"),
        part: fieldValue(line, "품사"),
        script: fieldValue(line, "문자")
      };
    });
}

function parseGrammarLines(raw) {
  return sectionedBulletLines(raw)
    .filter(item => item.section === "grammar")
    .map(item => ({
      kind: "grammar",
      title: firstMatch(item.line, /`([^`]+)`/) || "",
      reading: "",
      meaning: inlineDescription(item.line) || "",
      note: inlineDescription(item.line) || ""
    }));
}

function parseExpressionLines(raw) {
  return sectionedBulletLines(raw)
    .filter(item => item.section === "expression")
    .map(item => ({
      kind: "expression",
      title: firstMatch(item.line, /`([^`]+)`/) || "",
      reading: firstMatch(item.line, /`[^`]+`\s*\(([^)]+)\)/) || "",
      meaning: inlineMeaning(item.line) || "",
      note: inlineDescription(item.line) || ""
    }));
}

function inlineMeaning(line) {
  return firstMatch(text(line), /`[^`]+`\s*(?:\([^)]+\))?\s*:?\s*([^|\n]+)/).trim();
}

function inlineDescription(line) {
  return firstMatch(text(line), /`[^`]+`\s*(?:\([^)]+\))?\s*:?\s*(.+)$/).trim();
}

function dailyEntryToItems(kind, parsed) {
  if (kind === "sentence") {
    return [
      {
        kind: "sentence",
        title: parsed.title,
        reading: parsed.reading,
        meaning: parsed.meaning,
        part: "문장",
        script: "혼합",
        note: parsed.note
      }
    ];
  }

  if (kind === "word") {
    const inlineWord = parseWordLines(parsed.note || "")[0];
    return [{
      kind: "word",
      title: parsed.title,
      reading: parsed.reading,
      meaning: parsed.meaning,
      kanji: parsed.kanji || "",
      part: parsed.part || "",
      script: parsed.script || "",
      note: parsed.note,
      ...inlineWord
    }];
  }

  if (kind === "grammar") {
    return [{ kind: "grammar", title: parsed.title, reading: parsed.reading, meaning: parsed.meaning, part: "문법", script: "혼합", note: parsed.note }];
  }

  if (kind === "expression") {
    return [{ kind: "expression", title: parsed.title, reading: parsed.reading, meaning: parsed.meaning, part: "표현", script: "혼합", note: parsed.note }];
  }

  return [];
}

function withKanjiItems(items) {
  return items.flatMap(item => [item, ...kanjiItemsFromWord(item)]);
}

function kanjiItemsFromWord(item) {
  if (item.kind !== "word" || !text(item.kanji).trim()) {
    return [];
  }

  return splitOutsideParens(item.kanji)
    .map(parseKanjiToken)
    .filter(Boolean)
    .map(kanji => ({
      kind: "kanji",
      title: kanji.title,
      reading: "",
      meaning: kanji.meaning,
      level: item.level || "",
      part: "한자",
      script: "한자",
      source: item.title,
      note: `${item.title}${item.reading ? ` (${item.reading})` : ""}`
    }));
}

function splitOutsideParens(value) {
  const result = [];
  let depth = 0;
  let current = "";

  for (const char of text(value)) {
    if (char === "(" || char === "（") {
      depth += 1;
    } else if ((char === ")" || char === "）") && depth > 0) {
      depth -= 1;
    }

    if ((char === "," || char === "、") && depth === 0) {
      if (current.trim()) {
        result.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

function parseKanjiToken(value) {
  const token = text(value).trim();
  const match = token.match(/^([一-龯々〆ヵヶ]+)\s*[（(]([^）)]+)[）)]/u);
  if (match) {
    return { title: match[1], meaning: match[2].trim() };
  }

  const title = firstMatch(token, /([一-龯々〆ヵヶ]+)/u);
  if (!title) {
    return null;
  }

  return { title, meaning: token.replace(title, "").trim() };
}


function normalizeDailyKind(kind) {
  return ["sentence", "word", "grammar", "expression"].includes(kind) ? kind : "sentence";
}

function firstMatch(value, pattern) {
  return value.match(pattern)?.[1] || "";
}

function fieldValue(line, fieldName) {
  return firstMatch(line, new RegExp(`${fieldName}=([^|]+)`)).trim();
}

function text(value) {
  return String(value ?? "");
}

module.exports = {
  parseDailyEntry,
  dailyEntryToItems,
  withKanjiItems,
  itemToRawText
};
