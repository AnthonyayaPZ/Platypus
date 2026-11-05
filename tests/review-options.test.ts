import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parseReviewOptions, planReviewQuestions, selectReviewRows, silencePendingAudio } from "../lib/server/review-options";
import type { SqlExecutor } from "../lib/server/sql";

test("review options reject malformed input and preserve priority order without duplicates", () => {
  assert.deepEqual(parseReviewOptions({}), { includeAudio: true, priorityWords: [] });
  assert.deepEqual(parseReviewOptions({ includeAudio: false, priorityWords: ["priority", "other", "priority"] }), { includeAudio: false, priorityWords: ["priority", "other"] });
  for (const input of [{ includeAudio: "false" }, { priorityWords: "word" }, { priorityWords: ["invalid input"] }, { priorityWords: Array(201).fill("word") }]) assert.throws(() => parseReviewOptions(input));
});

test("each word receives three questions, priority words lead each round, and silent mode has no audio", () => {
  const entries = ["ordinary", "urgent", "other"].map((word) => ({ word, meaning: `释义 ${word}` }));
  for (const includeAudio of [true, false]) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const tasks = planReviewQuestions(entries, [...entries, { word: "extra", meaning: "额外" }], { includeAudio, priorityWords: ["urgent", "other"] });
      assert.equal(tasks.length, 9);
      for (let round = 0; round < 3; round++) assert.deepEqual(tasks.slice(round * 3, round * 3 + 2).map((task) => task.word), ["urgent", "other"]);
      for (const entry of entries) assert.equal(tasks.filter((task) => task.word === entry.word).length, 3);
      assert.equal(tasks.filter((task) => task.type === "audio-word").length, includeAudio ? 3 : 0);
      for (const task of tasks) { assert.ok(task.options.includes(task.correct)); assert.equal(new Set(task.options).size, task.options.length); }
    }
  }
});

async function database() {
  const db = new PGlite();
  const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) await db.exec(await readFile(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  const sql: SqlExecutor = { query: async (text, values) => ({ rows: (await db.query<Record<string, unknown>>(text, values)).rows }) };
  await sql.query("INSERT INTO word_groups(id,user_id,name,color,is_default,created_at) VALUES('group','local-demo','Test','#abc',1,'now'),('elsewhere','local-demo','Other','#abc',0,'now')");
  const add = async (word: string, date: string, group = "group") => {
    await sql.query(`INSERT INTO dictionary_entries(word,phonetic,part,meaning,summary,example,example_zh,synonyms,antonyms,source,created_at,updated_at)
      VALUES($1,'/test/','n.',$2,'summary','Example.','例句','[]','[]','test','now','now')`, [word, `释义 ${word}`]);
    await sql.query("INSERT INTO user_words(user_id,word,note,first_saved_at,updated_at,next_review) VALUES('local-demo',$1,'preserve note','now','now',$2)", [word, date]);
    await sql.query("INSERT INTO group_words(user_id,group_id,word,added_at) VALUES('local-demo',$1,$2,'now')", [group, word]);
  };
  return { db, sql, add };
}

test("priority selection includes not-yet-due saved words, respects group ownership, and stays within ten", async () => {
  const { db, sql, add } = await database();
  try {
    await add("future", "2099-01-01"); await add("outside", "2099-01-01", "elsewhere");
    for (let i = 0; i < 12; i++) await add(`due${String.fromCharCode(97 + i)}`, "2020-01-01");
    const before = (await sql.query("SELECT * FROM user_words ORDER BY word")).rows;
    const selected = await selectReviewRows(sql, "local-demo", "group", "2026-11-05", ["outside", "future", "missing"]);
    assert.equal(selected.length, 10); assert.equal(selected[0].word, "future"); assert.ok(selected.every((row) => row.word !== "outside"));
    assert.equal((await selectReviewRows(sql, "different-user", "group", "2026-11-05", ["future"])).length, 0);
    assert.deepEqual((await sql.query("SELECT * FROM user_words ORDER BY word")).rows, before);
  } finally { await db.close(); }
});

test("silencing an active round only rewrites unanswered audio tasks and preserves IDs, positions and grades", async () => {
  const { db, sql, add } = await database();
  try {
    await add("target", "2020-01-01"); await add("extra", "2020-01-01");
    await sql.query("INSERT INTO review_sessions(id,user_id,group_id,status,word_count,total_tasks,created_at) VALUES('session','local-demo','group','active',1,3,'now')");
    for (let i = 0; i < 3; i++) await sql.query("INSERT INTO review_tasks(id,session_id,word,question_type,position,options,correct_answer) VALUES($1,'session','target','audio-word',$2,'[\"target\",\"extra\"]','target')", [`task-${i}`, i]);
    await sql.query("UPDATE review_tasks SET selected_answer='target',is_correct=1,answered_at='answered' WHERE id='task-0'");
    const answered = (await sql.query("SELECT * FROM review_tasks WHERE id='task-0'")).rows[0];
    await silencePendingAudio(sql, "other-user", "session");
    assert.equal((await sql.query("SELECT * FROM review_tasks WHERE question_type='audio-word'")).rows.length, 3);
    await silencePendingAudio(sql, "local-demo", "session");
    const tasks = (await sql.query("SELECT * FROM review_tasks ORDER BY position")).rows;
    assert.deepEqual(tasks[0], answered);
    assert.ok(tasks.slice(1).every((task) => task.question_type !== "audio-word" && task.answered_at === null));
    assert.deepEqual(tasks.map((task) => [task.id, task.position]), [["task-0", 0], ["task-1", 1], ["task-2", 2]]);
    assert.equal((await sql.query("SELECT total_tasks FROM review_sessions WHERE id='session'")).rows[0].total_tasks, 3);
    const after = JSON.stringify(tasks); await silencePendingAudio(sql, "local-demo", "session");
    assert.equal(JSON.stringify((await sql.query("SELECT * FROM review_tasks ORDER BY position")).rows), after);
  } finally { await db.close(); }
});
