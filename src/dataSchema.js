const databaseSchema = `
    CREATE TABLE IF NOT EXISTS study_log (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      minutes INTEGER NOT NULL DEFAULT 0,
      summary TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      total_minutes INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS study_days (
      study_date TEXT PRIMARY KEY,
      minutes INTEGER NOT NULL DEFAULT 0,
      summary TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_entries (
      id TEXT PRIMARY KEY,
      study_date TEXT NOT NULL,
      parent_id TEXT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      reading TEXT NOT NULL DEFAULT '',
      meaning TEXT NOT NULL DEFAULT '',
      raw_text TEXT NOT NULL DEFAULT '',
      parsed_json TEXT NOT NULL DEFAULT '{}',
      registered INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_entry_links (
      entry_id TEXT NOT NULL,
      sentence_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (entry_id, sentence_id),
      FOREIGN KEY (entry_id) REFERENCES daily_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (sentence_id) REFERENCES daily_entries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      tag TEXT NOT NULL DEFAULT '',
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      reading TEXT NOT NULL DEFAULT '',
      meaning TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL DEFAULT '',
      part TEXT NOT NULL DEFAULT '',
      script TEXT NOT NULL DEFAULT '',
      review TEXT NOT NULL DEFAULT '',
      kanji TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      quiz_correct_count INTEGER NOT NULL DEFAULT 0,
      quiz_wrong_count INTEGER NOT NULL DEFAULT 0,
      last_quizzed_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_items_kind ON items(kind);
    CREATE INDEX IF NOT EXISTS idx_items_review ON items(review);
    CREATE INDEX IF NOT EXISTS idx_daily_entries_date ON daily_entries(study_date);
    CREATE INDEX IF NOT EXISTS idx_daily_entries_kind_title ON daily_entries(kind, title);
    CREATE INDEX IF NOT EXISTS idx_daily_entry_links_sentence ON daily_entry_links(sentence_id);
`;

module.exports = { databaseSchema };
