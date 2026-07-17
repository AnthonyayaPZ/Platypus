import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the product UI instead of the starter preview", async () => {
  const [page, layout, styles] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(page, /useState\(""\)/, "the search field should start empty");
  assert.match(page, /platypus-sidebar/);
  assert.match(page, /WordLearningContent/);
  assert.match(page, /开始这一组/);
  assert.match(page, /answerTask/);
  assert.match(page, /aria-expanded/);
  assert.match(page, /brand-uploaded-icon/);
  assert.match(page, /生成中…/);
  assert.match(styles, /sidebar-collapsed \.brand-copy \{ display: none !important; \}/);
  assert.match(layout, /鸭嘴兽单词/);
  assert.doesNotMatch(page, /SkeletonPreview|Codex is working/);
});

test("generates and caches dictionary misses on the server", async () => {
  const [route, llm, runtime] = await Promise.all([
    readFile(new URL("app/api/search/route.ts", root), "utf8"),
    readFile(new URL("lib/llm.ts", root), "utf8"),
    readFile(new URL("db/runtime.ts", root), "utf8"),
  ]);

  assert.match(route, /generateDictionaryEntry/);
  assert.match(route, /source: "llm-generated"/);
  assert.match(route, /\^\[a-z\]\[a-z'-\]/);
  assert.match(llm, /chat\/completions/);
  assert.match(llm, /API-KEY/);
  assert.match(llm, /relations\.length !== 4/);
  assert.match(runtime, /saveDictionaryEntry/);
  assert.match(runtime, /DELETE FROM word_relations WHERE source_word/);
});

test("keeps personal notes, group membership, and review history separate", async () => {
  const [schema, runtime] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("db/runtime.ts", root), "utf8"),
  ]);

  for (const table of ["dictionary_entries", "word_relations", "user_words", "group_words", "review_sessions", "review_tasks", "review_events"]) {
    assert.match(schema, new RegExp(table));
  }
  assert.match(runtime, /LIMIT 10/);
  assert.match(runtime, /for \(let round = 0; round < 3/);
  assert.match(runtime, /round === 0 \? "audio-word"/);
  assert.match(runtime, /correct === 3 \? 5 : correct === 2 \? 4/);
  assert.match(runtime, /Asia\/Shanghai/);
});

test("generates PostgreSQL-compatible schema and migration", async () => {
  const [schema, migration, config] = await Promise.all([
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0000_round_phalanx.sql", root), "utf8"),
    readFile(new URL("drizzle.config.ts", root), "utf8"),
  ]);

  assert.doesNotMatch(schema, /sqliteTable|drizzle-orm\/sqlite-core/);
  assert.match(schema, /pgTable|drizzle-orm\/pg-core/);
  assert.match(migration, /CREATE TABLE "dictionary_entries"/);
  assert.match(config, /postgresql/);
  assert.match(config, /DATABASE_URL/);
});

test("supports indexed search suggestions and word-library management", async () => {
  const [page, searchRoute, stateRoute, runtime, schema, migration] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/search/route.ts", root), "utf8"),
    readFile(new URL("app/api/state/route.ts", root), "utf8"),
    readFile(new URL("db/runtime.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("drizzle/0001_acoustic_agent_brand.sql", root), "utf8"),
  ]);

  assert.match(page, /role="combobox"/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /setDefaultGroup/);
  assert.match(page, /removeWord/);
  assert.match(searchRoute, /suggestDictionary/);
  assert.match(stateRoute, /deleteGroup/);
  assert.match(stateRoute, /至少需要保留一个词库/);
  assert.match(runtime, /word LIKE \$1/);
  assert.match(schema, /text_pattern_ops/);
  assert.match(schema, /word_groups_one_default_idx/);
  assert.match(migration, /dictionary_entries_word_prefix_idx/);
});

test("includes deployable PostgreSQL container configuration", async () => {
  const [compose, dockerfile, caddy, envExample] = await Promise.all([
    readFile(new URL("compose.yaml", root), "utf8"),
    readFile(new URL("Dockerfile", root), "utf8"),
    readFile(new URL("Caddyfile", root), "utf8"),
    readFile(new URL(".env.production.example", root), "utf8"),
  ]);

  assert.match(compose, /service_completed_successfully/);
  assert.match(compose, /postgres:17-alpine/);
  assert.doesNotMatch(compose, /5432:5432/);
  assert.match(dockerfile, /node:22-alpine/);
  assert.match(caddy, /reverse_proxy app:3000/);
  assert.match(envExample, /DATABASE_URL=/);
});
