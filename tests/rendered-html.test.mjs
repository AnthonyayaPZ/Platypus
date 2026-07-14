import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the product UI instead of the starter preview", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
  ]);

  assert.match(page, /useState\(""\)/, "the search field should start empty");
  assert.match(page, /platypus-sidebar/);
  assert.match(page, /WordLearningContent/);
  assert.match(page, /开始一组/);
  assert.match(page, /answerTask/);
  assert.match(layout, /鸭嘴兽单词/);
  assert.doesNotMatch(page, /SkeletonPreview|Codex is working/);
});

test("keeps personal notes, group membership, and review history separate", async () => {
  const [schema, runtime] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/runtime.ts", root), "utf8"),
  ]);

  for (const table of ["dictionary_entries", "user_words", "group_words", "review_sessions", "review_tasks", "review_events"]) {
    assert.match(schema, new RegExp(table));
  }
  assert.match(runtime, /LIMIT 10/);
  assert.match(runtime, /for \(let round = 0; round < 3/);
  assert.match(runtime, /correct === 3 \? 5 : correct === 2 \? 4/);
  assert.match(runtime, /Asia\/Shanghai/);
});

test("packages every database migration for deployment", async () => {
  await Promise.all([
    access(new URL("dist/.openai/drizzle/0000_majestic_harrier.sql", root)),
    access(new URL("dist/.openai/drizzle/0001_familiar_miracleman.sql", root)),
    access(new URL("dist/.openai/drizzle/0002_giant_black_crow.sql", root)),
  ]);
});
