import { env } from "cloudflare:workers";
import { dictionary, type WordEntry } from "../lib/dictionary";

export const DEMO_USER_ID = "local-demo";
const TIME_ZONE = "Asia/Shanghai";

type QuestionType = "audio-word" | "word-meaning" | "meaning-word";

type ReviewTaskRow = {
  id: string;
  session_id: string;
  word: string;
  question_type: QuestionType;
  position: number;
  options: string;
  correct_answer: string;
  selected_answer: string | null;
  is_correct: number | null;
  answered_at: string | null;
  phonetic: string;
  meaning: string;
  summary: string;
};

const nowIso = () => new Date().toISOString();

export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function datePlusDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getD1() {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return env.DB;
}

export async function ensureDatabase() {
  const db = getD1();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS dictionary_entries (
      word TEXT PRIMARY KEY,
      phonetic TEXT NOT NULL,
      part TEXT NOT NULL,
      meaning TEXT NOT NULL,
      summary TEXT NOT NULL,
      example TEXT NOT NULL,
      example_zh TEXT NOT NULL,
      synonyms TEXT NOT NULL,
      antonyms TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'demo-dictionary',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS word_groups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'local-demo',
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#f28c52',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS saved_words (
      word TEXT NOT NULL,
      group_id TEXT NOT NULL,
      added_at TEXT NOT NULL,
      ease INTEGER NOT NULL DEFAULT 250,
      interval_days INTEGER NOT NULL DEFAULT 0,
      repetitions INTEGER NOT NULL DEFAULT 0,
      next_review TEXT NOT NULL,
      last_reviewed TEXT,
      PRIMARY KEY (word, group_id),
      FOREIGN KEY (group_id) REFERENCES word_groups(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS user_words (
      user_id TEXT NOT NULL,
      word TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      first_saved_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      ease INTEGER NOT NULL DEFAULT 250,
      interval_days INTEGER NOT NULL DEFAULT 0,
      repetitions INTEGER NOT NULL DEFAULT 0,
      next_review TEXT NOT NULL,
      last_reviewed TEXT,
      PRIMARY KEY (user_id, word),
      FOREIGN KEY (word) REFERENCES dictionary_entries(word) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS group_words (
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      word TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (user_id, group_id, word),
      FOREIGN KEY (group_id) REFERENCES word_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (word) REFERENCES dictionary_entries(word) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS review_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      word_count INTEGER NOT NULL,
      total_tasks INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (group_id) REFERENCES word_groups(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS review_tasks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      word TEXT NOT NULL,
      question_type TEXT NOT NULL,
      position INTEGER NOT NULL,
      options TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      selected_answer TEXT,
      is_correct INTEGER,
      answered_at TEXT,
      FOREIGN KEY (session_id) REFERENCES review_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (word) REFERENCES dictionary_entries(word) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS review_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      word TEXT NOT NULL,
      question_type TEXT NOT NULL,
      is_correct INTEGER NOT NULL,
      answered_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES review_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES review_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (word) REFERENCES dictionary_entries(word) ON DELETE CASCADE
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS group_words_group_idx ON group_words(user_id, group_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS user_words_review_idx ON user_words(user_id, next_review)"),
    db.prepare("CREATE INDEX IF NOT EXISTS review_sessions_status_idx ON review_sessions(user_id, group_id, status)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS review_tasks_position_idx ON review_tasks(session_id, position)"),
  ]);

  const columns = await db.prepare("PRAGMA table_info(word_groups)").all<{ name: string }>();
  if (!columns.results.some((column) => column.name === "user_id")) {
    await db.prepare("ALTER TABLE word_groups ADD COLUMN user_id TEXT NOT NULL DEFAULT 'local-demo'").run();
  }

  const timestamp = nowIso();
  await db.batch(dictionary.map((entry) => db.prepare(`INSERT INTO dictionary_entries
    (word, phonetic, part, meaning, summary, example, example_zh, synonyms, antonyms, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo-dictionary', ?, ?)
    ON CONFLICT(word) DO UPDATE SET phonetic = excluded.phonetic, part = excluded.part,
      meaning = excluded.meaning, summary = excluded.summary, example = excluded.example,
      example_zh = excluded.example_zh, synonyms = excluded.synonyms, antonyms = excluded.antonyms,
      updated_at = excluded.updated_at`)
    .bind(entry.word, entry.phonetic, entry.part, entry.meaning, entry.summary, entry.example,
      entry.exampleZh, JSON.stringify(entry.synonyms), JSON.stringify(entry.antonyms), timestamp, timestamp)));

  const groupCount = await db.prepare("SELECT COUNT(*) AS count FROM word_groups WHERE user_id = ?")
    .bind(DEMO_USER_ID).first<{ count: number }>();
  if (!groupCount?.count) {
    await db.batch([
      db.prepare("INSERT INTO word_groups (id, user_id, name, color, is_default, created_at) VALUES (?, ?, ?, ?, 1, ?)")
        .bind("default", DEMO_USER_ID, "默认收藏", "#f28c52", timestamp),
      db.prepare("INSERT INTO word_groups (id, user_id, name, color, is_default, created_at) VALUES (?, ?, ?, ?, 0, ?)")
        .bind("cet6", DEMO_USER_ID, "CET-6 冲刺", "#2f6f62", timestamp),
      db.prepare("INSERT INTO word_groups (id, user_id, name, color, is_default, created_at) VALUES (?, ?, ?, ?, 0, ?)")
        .bind("work", DEMO_USER_ID, "工作表达", "#6f67a8", timestamp),
    ]);
  }

  await db.prepare(`INSERT OR IGNORE INTO user_words
    (user_id, word, note, first_saved_at, updated_at, ease, interval_days, repetitions, next_review, last_reviewed)
    SELECT ?, word, '', MIN(added_at), ?, MAX(ease), MAX(interval_days), MAX(repetitions), MIN(next_review), MAX(last_reviewed)
    FROM saved_words GROUP BY word`).bind(DEMO_USER_ID, timestamp).run();
  await db.prepare(`INSERT OR IGNORE INTO group_words (user_id, group_id, word, added_at)
    SELECT ?, group_id, word, added_at FROM saved_words`).bind(DEMO_USER_ID).run();

  const membershipCount = await db.prepare("SELECT COUNT(*) AS count FROM group_words WHERE user_id = ?")
    .bind(DEMO_USER_ID).first<{ count: number }>();
  if (!membershipCount?.count) {
    await db.batch(dictionary.slice(0, 20).flatMap((entry) => [
      db.prepare(`INSERT OR IGNORE INTO user_words
        (user_id, word, note, first_saved_at, updated_at, next_review) VALUES (?, ?, '', ?, ?, ?)`)
        .bind(DEMO_USER_ID, entry.word, timestamp, timestamp, today()),
      db.prepare("INSERT OR IGNORE INTO group_words (user_id, group_id, word, added_at) VALUES (?, 'default', ?, ?)")
        .bind(DEMO_USER_ID, entry.word, timestamp),
    ]));
  }
}

function parseEntry(row: Record<string, unknown>): WordEntry {
  return {
    word: String(row.word),
    phonetic: String(row.phonetic),
    part: String(row.part),
    meaning: String(row.meaning),
    summary: String(row.summary),
    example: String(row.example),
    exampleZh: String(row.example_zh),
    synonyms: JSON.parse(String(row.synonyms)) as [string, string],
    antonyms: JSON.parse(String(row.antonyms)) as [string, string],
  };
}

export async function searchDictionary(query: string) {
  await ensureDatabase();
  const db = getD1();
  const exact = await db.prepare("SELECT * FROM dictionary_entries WHERE word = ?")
    .bind(query).first<Record<string, unknown>>();
  const row = exact ?? await db.prepare("SELECT * FROM dictionary_entries WHERE word LIKE ? ORDER BY length(word), word LIMIT 1")
    .bind(`%${query}%`).first<Record<string, unknown>>();
  if (!row) return null;
  const meta = await db.prepare(`SELECT uw.*, GROUP_CONCAT(gw.group_id) AS group_ids
    FROM user_words uw LEFT JOIN group_words gw ON gw.user_id = uw.user_id AND gw.word = uw.word
    WHERE uw.user_id = ? AND uw.word = ? GROUP BY uw.user_id, uw.word`)
    .bind(DEMO_USER_ID, String(row.word)).first<Record<string, unknown>>();
  return { entry: parseEntry(row), meta: meta ? normalizeMeta(meta) : null };
}

function normalizeMeta(row: Record<string, unknown>) {
  return {
    word: String(row.word),
    note: String(row.note ?? ""),
    first_saved_at: String(row.first_saved_at),
    updated_at: String(row.updated_at),
    repetitions: Number(row.repetitions ?? 0),
    next_review: String(row.next_review),
    last_reviewed: row.last_reviewed ? String(row.last_reviewed) : null,
    group_ids: row.group_ids ? String(row.group_ids).split(",") : [],
  };
}

export async function loadState() {
  await ensureDatabase();
  const db = getD1();
  const [groups, memberships, metas] = await Promise.all([
    db.prepare(`SELECT g.*, COUNT(gw.word) AS word_count,
      SUM(CASE WHEN uw.next_review <= ? THEN 1 ELSE 0 END) AS due_count
      FROM word_groups g
      LEFT JOIN group_words gw ON gw.group_id = g.id AND gw.user_id = g.user_id
      LEFT JOIN user_words uw ON uw.user_id = gw.user_id AND uw.word = gw.word
      WHERE g.user_id = ? GROUP BY g.id ORDER BY g.is_default DESC, g.created_at ASC`)
      .bind(today(), DEMO_USER_ID).all<Record<string, unknown>>(),
    db.prepare(`SELECT gw.word, gw.group_id, gw.added_at, uw.note, uw.first_saved_at,
      uw.repetitions, uw.next_review, uw.last_reviewed,
      d.phonetic, d.part, d.meaning, d.summary, d.example, d.example_zh, d.synonyms, d.antonyms
      FROM group_words gw
      JOIN user_words uw ON uw.user_id = gw.user_id AND uw.word = gw.word
      JOIN dictionary_entries d ON d.word = gw.word
      WHERE gw.user_id = ? ORDER BY gw.added_at DESC, gw.word ASC`)
      .bind(DEMO_USER_ID).all<Record<string, unknown>>(),
    db.prepare(`SELECT uw.*, GROUP_CONCAT(gw.group_id) AS group_ids
      FROM user_words uw LEFT JOIN group_words gw ON gw.user_id = uw.user_id AND gw.word = uw.word
      WHERE uw.user_id = ? GROUP BY uw.user_id, uw.word ORDER BY uw.first_saved_at DESC`)
      .bind(DEMO_USER_ID).all<Record<string, unknown>>(),
  ]);

  return {
    groups: groups.results.map((group) => ({ ...group, word_count: Number(group.word_count), due_count: Number(group.due_count) })),
    savedWords: memberships.results.map((row) => ({
      word: String(row.word),
      group_id: String(row.group_id),
      added_at: String(row.added_at),
      note: String(row.note ?? ""),
      first_saved_at: String(row.first_saved_at),
      repetitions: Number(row.repetitions ?? 0),
      next_review: String(row.next_review),
      last_reviewed: row.last_reviewed ? String(row.last_reviewed) : null,
      entry: parseEntry(row),
    })),
    wordMeta: metas.results.map(normalizeMeta),
  };
}

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function taskOptions(type: QuestionType, entry: WordEntry, entries: WordEntry[]) {
  const useMeaning = type === "word-meaning";
  const correct = useMeaning ? entry.meaning : entry.word;
  const distractors = shuffle(entries.filter((item) => item.word !== entry.word))
    .slice(0, 3).map((item) => useMeaning ? item.meaning : item.word);
  return { correct, options: shuffle([correct, ...distractors]) };
}

export async function getReviewSession(sessionId: string) {
  const db = getD1();
  const session = await db.prepare("SELECT * FROM review_sessions WHERE id = ? AND user_id = ?")
    .bind(sessionId, DEMO_USER_ID).first<Record<string, unknown>>();
  if (!session) return null;
  const tasks = await db.prepare(`SELECT t.*, d.phonetic, d.meaning, d.summary
    FROM review_tasks t JOIN dictionary_entries d ON d.word = t.word
    WHERE t.session_id = ? ORDER BY t.position`).bind(sessionId).all<ReviewTaskRow>();
  return {
    ...session,
    word_count: Number(session.word_count),
    total_tasks: Number(session.total_tasks),
    tasks: tasks.results.map((task) => ({
      ...task,
      position: Number(task.position),
      options: JSON.parse(task.options) as string[],
      is_correct: task.is_correct === null ? null : Boolean(task.is_correct),
    })),
  };
}

export async function beginReviewSession(groupId: string) {
  await ensureDatabase();
  const db = getD1();
  const group = await db.prepare("SELECT id FROM word_groups WHERE id = ? AND user_id = ?")
    .bind(groupId, DEMO_USER_ID).first();
  if (!group) throw new Error("单词分组不存在");

  const active = await db.prepare(`SELECT id FROM review_sessions
    WHERE user_id = ? AND group_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`)
    .bind(DEMO_USER_ID, groupId).first<{ id: string }>();
  if (active) return getReviewSession(active.id);

  const due = await db.prepare(`SELECT d.* FROM group_words gw
    JOIN user_words uw ON uw.user_id = gw.user_id AND uw.word = gw.word
    JOIN dictionary_entries d ON d.word = gw.word
    WHERE gw.user_id = ? AND gw.group_id = ? AND uw.next_review <= ?
    ORDER BY uw.next_review ASC, uw.first_saved_at ASC LIMIT 10`)
    .bind(DEMO_USER_ID, groupId, today()).all<Record<string, unknown>>();
  if (!due.results.length) return null;

  const entries = due.results.map(parseEntry);
  const allEntriesResult = await db.prepare("SELECT * FROM dictionary_entries ORDER BY word").all<Record<string, unknown>>();
  const allEntries = allEntriesResult.results.map(parseEntry);
  const types: QuestionType[] = ["audio-word", "word-meaning", "meaning-word"];
  const tasks: { word: string; type: QuestionType; options: string[]; correct: string }[] = [];
  for (let round = 0; round < 3; round += 1) {
    const roundTasks = shuffle(entries.map((entry, index) => {
      const type = types[(round + index) % types.length];
      return { word: entry.word, type, ...taskOptions(type, entry, allEntries) };
    }));
    if (tasks.length && roundTasks[0]?.word === tasks.at(-1)?.word && roundTasks.length > 1) {
      [roundTasks[0], roundTasks[1]] = [roundTasks[1], roundTasks[0]];
    }
    tasks.push(...roundTasks);
  }

  const sessionId = `session-${crypto.randomUUID()}`;
  const timestamp = nowIso();
  await db.prepare(`INSERT INTO review_sessions
    (id, user_id, group_id, status, word_count, total_tasks, created_at)
    VALUES (?, ?, ?, 'active', ?, ?, ?)`)
    .bind(sessionId, DEMO_USER_ID, groupId, entries.length, tasks.length, timestamp).run();
  await db.batch(tasks.map((task, position) => db.prepare(`INSERT INTO review_tasks
    (id, session_id, word, question_type, position, options, correct_answer)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(`task-${crypto.randomUUID()}`, sessionId, task.word, task.type, position,
      JSON.stringify(task.options), task.correct)));
  return getReviewSession(sessionId);
}

export async function answerReviewTask(sessionId: string, taskId: string, selectedAnswer: string) {
  await ensureDatabase();
  const db = getD1();
  const task = await db.prepare(`SELECT t.* FROM review_tasks t
    JOIN review_sessions s ON s.id = t.session_id
    WHERE t.id = ? AND t.session_id = ? AND s.user_id = ? AND s.status = 'active'`)
    .bind(taskId, sessionId, DEMO_USER_ID).first<ReviewTaskRow>();
  if (!task) throw new Error("复习题目不存在或会话已经结束");
  if (task.answered_at) return { session: await getReviewSession(sessionId), state: await loadState() };

  const timestamp = nowIso();
  const isCorrect = selectedAnswer === task.correct_answer;
  await db.batch([
    db.prepare(`UPDATE review_tasks SET selected_answer = ?, is_correct = ?, answered_at = ?
      WHERE id = ? AND answered_at IS NULL`).bind(selectedAnswer, isCorrect ? 1 : 0, timestamp, taskId),
    db.prepare(`INSERT INTO review_events
      (id, user_id, session_id, task_id, word, question_type, is_correct, answered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(`event-${crypto.randomUUID()}`, DEMO_USER_ID, sessionId, taskId, task.word,
        task.question_type, isCorrect ? 1 : 0, timestamp),
  ]);

  const wordScore = await db.prepare(`SELECT COUNT(answered_at) AS answered,
    SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct
    FROM review_tasks WHERE session_id = ? AND word = ?`)
    .bind(sessionId, task.word).first<{ answered: number; correct: number }>();
  if (Number(wordScore?.answered) === 3) {
    const current = await db.prepare(`SELECT ease, interval_days, repetitions FROM user_words
      WHERE user_id = ? AND word = ?`).bind(DEMO_USER_ID, task.word)
      .first<{ ease: number; interval_days: number; repetitions: number }>();
    if (current) {
      const correct = Number(wordScore?.correct ?? 0);
      const quality = correct === 3 ? 5 : correct === 2 ? 4 : correct === 1 ? 2 : 1;
      const repetitions = quality < 3 ? 0 : current.repetitions + 1;
      const interval = quality < 3 ? 1 : repetitions === 1 ? 1 : repetitions === 2
        ? 3 : Math.max(4, Math.round(current.interval_days * (current.ease / 100)));
      const ease = Math.max(130, Math.round(current.ease
        + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)) * 100));
      await db.prepare(`UPDATE user_words SET ease = ?, interval_days = ?, repetitions = ?,
        next_review = ?, last_reviewed = ?, updated_at = ? WHERE user_id = ? AND word = ?`)
        .bind(ease, interval, repetitions, datePlusDays(interval), timestamp, timestamp, DEMO_USER_ID, task.word).run();
    }
  }

  const remaining = await db.prepare(`SELECT COUNT(*) AS count FROM review_tasks
    WHERE session_id = ? AND answered_at IS NULL`).bind(sessionId).first<{ count: number }>();
  if (!remaining?.count) {
    await db.prepare("UPDATE review_sessions SET status = 'completed', completed_at = ? WHERE id = ?")
      .bind(timestamp, sessionId).run();
  }
  return { session: await getReviewSession(sessionId), state: await loadState() };
}

export async function cancelReviewSession(sessionId: string) {
  await ensureDatabase();
  await getD1().prepare(`UPDATE review_sessions SET status = 'cancelled', completed_at = ?
    WHERE id = ? AND user_id = ? AND status = 'active'`)
    .bind(nowIso(), sessionId, DEMO_USER_ID).run();
  return loadState();
}
