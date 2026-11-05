import type { WordEntry } from "../dictionary";
import { VideoStudyError, type SqlExecutor } from "./sql";

export type ReviewOptions = { includeAudio: boolean; priorityWords: string[] };
export type ReviewQuestion = { word: string; type: "audio-word" | "word-meaning" | "meaning-word"; options: string[]; correct: string };
type ReviewEntry = Pick<WordEntry, "word" | "meaning">;

export function parseReviewOptions(input: { includeAudio?: unknown; priorityWords?: unknown }): ReviewOptions {
  if (input.includeAudio !== undefined && typeof input.includeAudio !== "boolean") throw new VideoStudyError("听力选项必须为布尔值");
  const words = input.priorityWords ?? [];
  if (!Array.isArray(words) || words.length > 200 || words.some((word) => typeof word !== "string" || !/^[a-z][a-z'-]{0,47}$/.test(word))) {
    throw new VideoStudyError("优先练习列表无效，每次最多200个已收藏单词");
  }
  return { includeAudio: input.includeAudio !== false, priorityWords: [...new Set<string>(words)] };
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}

function optionsFor(type: ReviewQuestion["type"], entry: ReviewEntry, entries: ReviewEntry[]) {
  const correct = type === "word-meaning" ? entry.meaning : entry.word;
  const distractors = [...new Set(shuffle(entries.filter((item) => item.word !== entry.word))
    .map((item) => type === "word-meaning" ? item.meaning : item.word).filter((value) => value && value !== correct))].slice(0, 3);
  return { correct, options: shuffle([correct, ...distractors]) };
}

export function planReviewQuestions(entries: ReviewEntry[], allEntries: ReviewEntry[], options: ReviewOptions): ReviewQuestion[] {
  const priority = new Map(options.priorityWords.map((word, index) => [word, index]));
  const rank = (word: string) => priority.get(word) ?? Number.MAX_SAFE_INTEGER;
  const tasks: ReviewQuestion[] = [];
  for (let round = 0; round < 3; round += 1) {
    const roundTasks = shuffle(entries.map((entry, index): ReviewQuestion => {
      const secondType = index % 2 === 0 ? "word-meaning" : "meaning-word";
      const opposite = secondType === "word-meaning" ? "meaning-word" : "word-meaning";
      const type = options.includeAudio ? (round === 0 ? "audio-word" : round === 1 ? secondType : opposite)
        : round % 2 === 0 ? secondType : opposite;
      return { word: entry.word, type, ...optionsFor(type, entry, allEntries) };
    })).sort((a, b) => rank(a.word) - rank(b.word));
    if (tasks.length && roundTasks.length > 1 && tasks.at(-1)?.word === roundTasks[0].word && rank(roundTasks[0].word) === rank(roundTasks[1].word)) {
      [roundTasks[0], roundTasks[1]] = [roundTasks[1], roundTasks[0]];
    }
    tasks.push(...roundTasks);
  }
  return tasks;
}

export async function selectReviewRows(sql: SqlExecutor, userId: string, groupId: string, day: string, priorityWords: string[]) {
  return (await sql.query(`SELECT d.* FROM group_words gw
    JOIN user_words uw ON uw.user_id=gw.user_id AND uw.word=gw.word
    JOIN dictionary_entries d ON d.word=gw.word
    WHERE gw.user_id=$1 AND gw.group_id=$2 AND (uw.next_review <= $3 OR gw.word=ANY($4::text[]))
    ORDER BY CASE WHEN gw.word=ANY($4::text[]) THEN 0 ELSE 1 END,
      array_position($4::text[],gw.word) NULLS LAST,uw.next_review ASC,uw.first_saved_at ASC,gw.word ASC LIMIT 10`,
  [userId, groupId, day, priorityWords])).rows;
}

/** Caller holds the session row lock. Do not delete tasks or touch answered work. */
export async function silencePendingAudio(sql: SqlExecutor, userId: string, sessionId: string) {
  const pending = (await sql.query(`SELECT t.id,t.word,t.position FROM review_tasks t JOIN review_sessions s ON s.id=t.session_id
    WHERE t.session_id=$1 AND s.user_id=$2 AND s.status='active' AND t.question_type='audio-word' AND t.answered_at IS NULL`, [sessionId, userId])).rows;
  if (!pending.length) return;
  const rows = (await sql.query(`SELECT word,meaning FROM dictionary_entries WHERE word=ANY($1::text[])
    UNION SELECT word,meaning FROM (SELECT word,meaning FROM dictionary_entries ORDER BY word LIMIT 50) AS distractors`, [pending.map((row) => String(row.word))])).rows;
  const entries = rows.map((row) => ({ word: String(row.word), meaning: String(row.meaning) }));
  for (const task of pending) {
    const entry = entries.find((item) => item.word === task.word);
    if (!entry) throw new VideoStudyError("复习词条不存在", 404);
    const type = Number(task.position) % 2 === 0 ? "word-meaning" : "meaning-word";
    const question = optionsFor(type, entry, entries);
    await sql.query(`UPDATE review_tasks SET question_type=$1,options=$2,correct_answer=$3
      WHERE id=$4 AND session_id=$5 AND answered_at IS NULL`, [type, JSON.stringify(question.options), question.correct, task.id, sessionId]);
  }
}
