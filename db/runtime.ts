import { assertDatabaseConfiguration, pool } from "./index";
import { dictionary, type WordEntry } from "../lib/dictionary";
import { relationDetails, type RelationDetail } from "../lib/relations";

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

// ---------------------------------------------------------------------------
// Transaction helper – runs an array of queries atomically
// ---------------------------------------------------------------------------
async function batch(queries: { text: string; values: unknown[] }[]) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const q of queries) {
      await client.query(q.text, q.values);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Lazy initialisation – run once on first API call
// ---------------------------------------------------------------------------
let databaseReady: Promise<void> | null = null;

export function ensureDatabase() {
  if (!databaseReady) {
    databaseReady = initializeDatabase().catch((error) => {
      databaseReady = null;
      throw error;
    });
  }
  return databaseReady;
}

async function initializeDatabase() {
  assertDatabaseConfiguration();
  // seed dictionary entries from the demo word list
  const timestamp = nowIso();
  const dictInsert = dictionary.map((entry) => ({
    text: `INSERT INTO dictionary_entries
      (word, phonetic, part, meaning, summary, example, example_zh, synonyms, antonyms, source, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'demo-dictionary', $10, $11)
      ON CONFLICT(word) DO UPDATE SET
        phonetic = EXCLUDED.phonetic, part = EXCLUDED.part,
        meaning = EXCLUDED.meaning, summary = EXCLUDED.summary,
        example = EXCLUDED.example, example_zh = EXCLUDED.example_zh,
        synonyms = EXCLUDED.synonyms, antonyms = EXCLUDED.antonyms,
        updated_at = EXCLUDED.updated_at`,
    values: [
      entry.word, entry.phonetic, entry.part, entry.meaning,
      entry.summary, entry.example, entry.exampleZh,
      JSON.stringify(entry.synonyms), JSON.stringify(entry.antonyms),
      timestamp, timestamp,
    ],
  }));
  await batch(dictInsert);

  // seed word relations
  const relInsert = Object.entries(relationDetails).flatMap(
    ([sourceWord, relations]) =>
      relations.map((relation, sortOrder) => ({
        text: `INSERT INTO word_relations
          (source_word, related_word, relation_type, comparison, usage, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT(source_word, related_word, relation_type)
          DO UPDATE SET comparison = EXCLUDED.comparison, usage = EXCLUDED.usage, sort_order = EXCLUDED.sort_order`,
        values: [
          sourceWord, relation.word, relation.type,
          relation.comparison, relation.usage, sortOrder,
        ],
      })),
  );
  if (relInsert.length > 0) await batch(relInsert);

  // create default groups if none exist
  const { rows: groupRows } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM word_groups WHERE user_id = $1",
    [DEMO_USER_ID],
  );
  if (!groupRows[0]?.count) {
    await batch([
      {
        text: "INSERT INTO word_groups (id, user_id, name, color, is_default, created_at) VALUES ($1, $2, $3, $4, 1, $5)",
        values: ["default", DEMO_USER_ID, "默认收藏", "#f28c52", timestamp],
      },
      {
        text: "INSERT INTO word_groups (id, user_id, name, color, is_default, created_at) VALUES ($1, $2, $3, $4, 0, $5)",
        values: ["cet6", DEMO_USER_ID, "CET-6 冲刺", "#2f6f62", timestamp],
      },
      {
        text: "INSERT INTO word_groups (id, user_id, name, color, is_default, created_at) VALUES ($1, $2, $3, $4, 0, $5)",
        values: ["work", DEMO_USER_ID, "工作表达", "#6f67a8", timestamp],
      },
    ]);
  }

  // migrate legacy saved_words → user_words + group_words
  await pool.query(
    `INSERT INTO user_words
      (user_id, word, note, first_saved_at, updated_at, ease, interval_days, repetitions, next_review, last_reviewed)
      SELECT $1, word, '', MIN(added_at), $2,
        MAX(ease), MAX(interval_days), MAX(repetitions), MIN(next_review), MAX(last_reviewed)
      FROM saved_words GROUP BY word
      ON CONFLICT DO NOTHING`,
    [DEMO_USER_ID, timestamp],
  );
  await pool.query(
    `INSERT INTO group_words (user_id, group_id, word, added_at)
      SELECT $1, group_id, word, added_at FROM saved_words
      ON CONFLICT DO NOTHING`,
    [DEMO_USER_ID],
  );

  // seed default group with first 20 demo words if still empty
  const { rows: membershipRows } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM group_words WHERE user_id = $1",
    [DEMO_USER_ID],
  );
  if (!membershipRows[0]?.count) {
    const seedBatch = dictionary.slice(0, 20).flatMap((entry) => [
      {
        text: `INSERT INTO user_words
          (user_id, word, note, first_saved_at, updated_at, next_review)
          VALUES ($1, $2, '', $3, $4, $5) ON CONFLICT DO NOTHING`,
        values: [DEMO_USER_ID, entry.word, timestamp, timestamp, today()],
      },
      {
        text: "INSERT INTO group_words (user_id, group_id, word, added_at) VALUES ($1, 'default', $2, $3) ON CONFLICT DO NOTHING",
        values: [DEMO_USER_ID, entry.word, timestamp],
      },
    ]);
    await batch(seedBatch);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseEntry(row: Record<string, unknown>, relations: RelationDetail[] = []): WordEntry {
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
    relations,
  };
}

function normalizeRelation(row: Record<string, unknown>): RelationDetail {
  return {
    word: String(row.related_word),
    type: String(row.relation_type) as RelationDetail["type"],
    comparison: String(row.comparison),
    usage: String(row.usage),
  };
}

function relationMap(rows: Record<string, unknown>[]) {
  const map = new Map<string, RelationDetail[]>();
  for (const row of rows) {
    const source = String(row.source_word);
    map.set(source, [...(map.get(source) ?? []), normalizeRelation(row)]);
  }
  return map;
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

function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Dictionary search
// ---------------------------------------------------------------------------
export async function searchDictionary(query: string) {
  await ensureDatabase();
  const { rows: entryRows } = await pool.query(
    "SELECT * FROM dictionary_entries WHERE word = $1",
    [query],
  );
  if (!entryRows.length) return null;
  const row = entryRows[0] as Record<string, unknown>;

  const [metaRow, relResult] = await Promise.all([
    pool.query(
      `SELECT uw.*, COALESCE(STRING_AGG(gw.group_id, ',' ORDER BY gw.group_id), '') AS group_ids
      FROM user_words uw
      LEFT JOIN group_words gw ON gw.user_id = uw.user_id AND gw.word = uw.word
      WHERE uw.user_id = $1 AND uw.word = $2
      GROUP BY uw.user_id, uw.word`,
      [DEMO_USER_ID, String(row.word)],
    ),
    pool.query(
      "SELECT * FROM word_relations WHERE source_word = $1 ORDER BY sort_order",
      [String(row.word)],
    ),
  ]);

  return {
    entry: parseEntry(row, (relResult.rows as Record<string, unknown>[]).map(normalizeRelation)),
    meta: metaRow.rows[0] ? normalizeMeta(metaRow.rows[0] as Record<string, unknown>) : null,
  };
}

export async function suggestDictionary(prefix: string, limit = 8) {
  await ensureDatabase();
  const safeLimit = Math.min(12, Math.max(1, Math.trunc(limit)));
  const { rows } = await pool.query(
    `SELECT word, phonetic, meaning
    FROM dictionary_entries
    WHERE word LIKE $1
    ORDER BY LENGTH(word), word
    LIMIT $2`,
    [`${prefix}%`, safeLimit],
  );
  return rows.map((row: Record<string, unknown>) => ({
    word: String(row.word),
    phonetic: String(row.phonetic),
    meaning: String(row.meaning),
  }));
}

export async function saveDictionaryEntry(entry: WordEntry, source = "llm") {
  await ensureDatabase();
  const timestamp = nowIso();

  const queries: { text: string; values: unknown[] }[] = [
    {
      text: `INSERT INTO dictionary_entries
        (word, phonetic, part, meaning, summary, example, example_zh, synonyms, antonyms, source, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT(word) DO UPDATE SET
          phonetic = EXCLUDED.phonetic, part = EXCLUDED.part,
          meaning = EXCLUDED.meaning, summary = EXCLUDED.summary,
          example = EXCLUDED.example, example_zh = EXCLUDED.example_zh,
          synonyms = EXCLUDED.synonyms, antonyms = EXCLUDED.antonyms,
          source = EXCLUDED.source, updated_at = EXCLUDED.updated_at`,
      values: [
        entry.word, entry.phonetic, entry.part, entry.meaning,
        entry.summary, entry.example, entry.exampleZh,
        JSON.stringify(entry.synonyms), JSON.stringify(entry.antonyms),
        source, timestamp, timestamp,
      ],
    },
    {
      text: "DELETE FROM word_relations WHERE source_word = $1",
      values: [entry.word],
    },
    ...entry.relations.map((relation, sortOrder) => ({
      text: `INSERT INTO word_relations
        (source_word, related_word, relation_type, comparison, usage, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6)`,
      values: [entry.word, relation.word, relation.type, relation.comparison, relation.usage, sortOrder],
    })),
  ];
  await batch(queries);
}

// ---------------------------------------------------------------------------
// State / load
// ---------------------------------------------------------------------------
export async function loadState() {
  await ensureDatabase();

  const [groupsRes, membershipsRes, metasRes, relationsRes] = await Promise.all([
    pool.query(
      `SELECT g.*, COUNT(gw.word)::int AS word_count,
        COALESCE(SUM(CASE WHEN uw.next_review <= $1 THEN 1 ELSE 0 END), 0)::int AS due_count
      FROM word_groups g
      LEFT JOIN group_words gw ON gw.group_id = g.id AND gw.user_id = g.user_id
      LEFT JOIN user_words uw ON uw.user_id = gw.user_id AND uw.word = gw.word
      WHERE g.user_id = $2
      GROUP BY g.id
      ORDER BY g.is_default DESC, g.created_at ASC`,
      [today(), DEMO_USER_ID],
    ),
    pool.query(
      `SELECT gw.word, gw.group_id, gw.added_at, uw.note, uw.first_saved_at,
        uw.repetitions, uw.next_review, uw.last_reviewed,
        d.phonetic, d.part, d.meaning, d.summary, d.example, d.example_zh, d.synonyms, d.antonyms
      FROM group_words gw
      JOIN user_words uw ON uw.user_id = gw.user_id AND uw.word = gw.word
      JOIN dictionary_entries d ON d.word = gw.word
      WHERE gw.user_id = $1
      ORDER BY gw.added_at DESC, gw.word ASC`,
      [DEMO_USER_ID],
    ),
    pool.query(
      `SELECT uw.*, COALESCE(STRING_AGG(gw.group_id, ',' ORDER BY gw.group_id), '') AS group_ids
      FROM user_words uw
      LEFT JOIN group_words gw ON gw.user_id = uw.user_id AND gw.word = uw.word
      WHERE uw.user_id = $1
      GROUP BY uw.user_id, uw.word
      ORDER BY uw.first_saved_at DESC`,
      [DEMO_USER_ID],
    ),
    pool.query(
      "SELECT * FROM word_relations ORDER BY source_word, sort_order",
    ),
  ]);

  const relationsByWord = relationMap(relationsRes.rows as Record<string, unknown>[]);

  return {
    groups: groupsRes.rows.map((g: Record<string, unknown>) => ({
      ...g,
      word_count: Number(g.word_count),
      due_count: Number(g.due_count),
    })),
    savedWords: membershipsRes.rows.map((row: Record<string, unknown>) => ({
      word: String(row.word),
      group_id: String(row.group_id),
      added_at: String(row.added_at),
      note: String(row.note ?? ""),
      first_saved_at: String(row.first_saved_at),
      repetitions: Number(row.repetitions ?? 0),
      next_review: String(row.next_review),
      last_reviewed: row.last_reviewed ? String(row.last_reviewed) : null,
      entry: parseEntry(row, relationsByWord.get(String(row.word)) ?? []),
    })),
    wordMeta: metasRes.rows.map((row: Record<string, unknown>) => normalizeMeta(row)),
  };
}

// ---------------------------------------------------------------------------
// Review session
// ---------------------------------------------------------------------------
export async function getReviewSession(sessionId: string) {
  const { rows: sessionRows } = await pool.query(
    "SELECT * FROM review_sessions WHERE id = $1 AND user_id = $2",
    [sessionId, DEMO_USER_ID],
  );
  if (!sessionRows.length) return null;
  const session = sessionRows[0] as Record<string, unknown>;

  const { rows: taskRows } = await pool.query(
    `SELECT t.*, d.phonetic, d.meaning, d.summary
    FROM review_tasks t
    JOIN dictionary_entries d ON d.word = t.word
    WHERE t.session_id = $1
    ORDER BY t.position`,
    [sessionId],
  );

  return {
    ...session,
    word_count: Number(session.word_count),
    total_tasks: Number(session.total_tasks),
    tasks: (taskRows as ReviewTaskRow[]).map((task) => ({
      ...task,
      position: Number(task.position),
      options: JSON.parse(task.options) as string[],
      is_correct: task.is_correct === null ? null : Boolean(task.is_correct),
    })),
  };
}

function taskOptions(type: QuestionType, entry: WordEntry, entries: WordEntry[]) {
  const useMeaning = type === "word-meaning";
  const correct = useMeaning ? entry.meaning : entry.word;
  const distractors = shuffle(entries.filter((item) => item.word !== entry.word))
    .slice(0, 3).map((item) => (useMeaning ? item.meaning : item.word));
  return { correct, options: shuffle([correct, ...distractors]) };
}

export async function beginReviewSession(groupId: string) {
  await ensureDatabase();
  const { rows: groupRows } = await pool.query(
    "SELECT id FROM word_groups WHERE id = $1 AND user_id = $2",
    [groupId, DEMO_USER_ID],
  );
  if (!groupRows.length) throw new Error("单词分组不存在");

  const { rows: activeRows } = await pool.query(
    `SELECT id FROM review_sessions
    WHERE user_id = $1 AND group_id = $2 AND status = 'active'
    ORDER BY created_at DESC LIMIT 1`,
    [DEMO_USER_ID, groupId],
  );
  if (activeRows.length) return getReviewSession(activeRows[0].id);

  const { rows: dueRows } = await pool.query(
    `SELECT d.* FROM group_words gw
    JOIN user_words uw ON uw.user_id = gw.user_id AND uw.word = gw.word
    JOIN dictionary_entries d ON d.word = gw.word
    WHERE gw.user_id = $1 AND gw.group_id = $2 AND uw.next_review <= $3
    ORDER BY uw.next_review ASC, uw.first_saved_at ASC LIMIT 10`,
    [DEMO_USER_ID, groupId, today()],
  );
  if (!dueRows.length) return null;

  const entries: WordEntry[] = dueRows.map((row: Record<string, unknown>) => parseEntry(row));
  const { rows: distractorRows } = await pool.query(
    `SELECT * FROM dictionary_entries
    WHERE NOT (word = ANY($1::text[]))
    ORDER BY word
    LIMIT 50`,
    [entries.map((entry) => entry.word)],
  );
  const allEntries: WordEntry[] = [
    ...entries,
    ...distractorRows.map((row: Record<string, unknown>) => parseEntry(row)),
  ];

  const tasks: { word: string; type: QuestionType; options: string[]; correct: string }[] = [];
  for (let round = 0; round < 3; round += 1) {
    const roundTasks = shuffle(entries.map((entry, index) => {
      const secondType: QuestionType = index % 2 === 0 ? "word-meaning" : "meaning-word";
      const type: QuestionType =
        round === 0 ? "audio-word"
        : round === 1 ? secondType
        : secondType === "word-meaning" ? "meaning-word" : "word-meaning";
      return { word: entry.word, type, ...taskOptions(type, entry, allEntries) };
    }));
    if (tasks.length && roundTasks[0]?.word === tasks.at(-1)?.word && roundTasks.length > 1) {
      [roundTasks[0], roundTasks[1]] = [roundTasks[1], roundTasks[0]];
    }
    tasks.push(...roundTasks);
  }

  const sessionId = `session-${crypto.randomUUID()}`;
  const timestamp = nowIso();

  await batch([
    {
      text: `INSERT INTO review_sessions
        (id, user_id, group_id, status, word_count, total_tasks, created_at)
        VALUES ($1, $2, $3, 'active', $4, $5, $6)`,
      values: [sessionId, DEMO_USER_ID, groupId, entries.length, tasks.length, timestamp],
    },
    ...tasks.map((task, position) => ({
      text: `INSERT INTO review_tasks
        (id, session_id, word, question_type, position, options, correct_answer)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      values: [
        `task-${crypto.randomUUID()}`, sessionId, task.word, task.type,
        position, JSON.stringify(task.options), task.correct,
      ],
    })),
  ]);

  return getReviewSession(sessionId);
}

export async function answerReviewTask(sessionId: string, taskId: string, selectedAnswer: string) {
  await ensureDatabase();
  const timestamp = nowIso();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: taskRows } = await client.query(
      `UPDATE review_tasks AS t
      SET selected_answer = $1,
        is_correct = CASE WHEN t.correct_answer = $1 THEN 1 ELSE 0 END,
        answered_at = $2
      FROM review_sessions AS s
      WHERE t.id = $3 AND t.session_id = $4 AND t.answered_at IS NULL
        AND s.id = t.session_id AND s.user_id = $5 AND s.status = 'active'
      RETURNING t.*`,
      [selectedAnswer, timestamp, taskId, sessionId, DEMO_USER_ID],
    );
    if (!taskRows.length) {
      const { rows: existingRows } = await client.query(
        `SELECT t.answered_at FROM review_tasks AS t
        JOIN review_sessions AS s ON s.id = t.session_id
        WHERE t.id = $1 AND t.session_id = $2 AND s.user_id = $3`,
        [taskId, sessionId, DEMO_USER_ID],
      );
      if (!existingRows[0]?.answered_at) {
        throw new Error("复习题目不存在或会话已经结束");
      }
      await client.query("COMMIT");
      return { session: await getReviewSession(sessionId), state: await loadState() };
    }

    const task = taskRows[0] as ReviewTaskRow;
    const isCorrect = Boolean(task.is_correct);
    await client.query(
      `INSERT INTO review_events
        (id, user_id, session_id, task_id, word, question_type, is_correct, answered_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        `event-${crypto.randomUUID()}`, DEMO_USER_ID, sessionId, taskId,
        task.word, task.question_type, isCorrect ? 1 : 0, timestamp,
      ],
    );

    const { rows: scoreRows } = await client.query(
      `SELECT COUNT(answered_at)::int AS answered,
        COALESCE(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END), 0)::int AS correct
      FROM review_tasks WHERE session_id = $1 AND word = $2`,
      [sessionId, task.word],
    );
    const wordScore = scoreRows[0] as { answered: number; correct: number } | undefined;

    if (Number(wordScore?.answered) === 3) {
      const { rows: currentRows } = await client.query(
        `SELECT ease, interval_days, repetitions FROM user_words
        WHERE user_id = $1 AND word = $2 FOR UPDATE`,
        [DEMO_USER_ID, task.word],
      );
      if (currentRows.length) {
        const current = currentRows[0] as { ease: number; interval_days: number; repetitions: number };
        const correct = Number(wordScore?.correct ?? 0);
        const quality = correct === 3 ? 5 : correct === 2 ? 4 : correct === 1 ? 2 : 1;
        const repetitions = quality < 3 ? 0 : current.repetitions + 1;
        const interval =
          quality < 3 ? 1
          : repetitions === 1 ? 1
          : repetitions === 2 ? 3
          : Math.max(4, Math.round(current.interval_days * (current.ease / 100)));
        const ease = Math.max(
          130,
          Math.round(current.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)) * 100),
        );
        await client.query(
          `UPDATE user_words SET ease = $1, interval_days = $2, repetitions = $3,
            next_review = $4, last_reviewed = $5, updated_at = $6
          WHERE user_id = $7 AND word = $8`,
          [ease, interval, repetitions, datePlusDays(interval), timestamp, timestamp, DEMO_USER_ID, task.word],
        );
      }
    }

    const { rows: remainingRows } = await client.query(
      "SELECT COUNT(*)::int AS count FROM review_tasks WHERE session_id = $1 AND answered_at IS NULL",
      [sessionId],
    );
    if (!remainingRows[0]?.count) {
      await client.query(
        "UPDATE review_sessions SET status = 'completed', completed_at = $1 WHERE id = $2",
        [timestamp, sessionId],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return { session: await getReviewSession(sessionId), state: await loadState() };
}

export async function cancelReviewSession(sessionId: string) {
  await ensureDatabase();
  await pool.query(
    `UPDATE review_sessions SET status = 'cancelled', completed_at = $1
    WHERE id = $2 AND user_id = $3 AND status = 'active'`,
    [nowIso(), sessionId, DEMO_USER_ID],
  );
  return loadState();
}
