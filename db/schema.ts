import { pgTable, text, integer, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const dictionaryEntries = pgTable("dictionary_entries", {
  word: text("word").primaryKey(),
  phonetic: text("phonetic").notNull(),
  part: text("part").notNull(),
  meaning: text("meaning").notNull(),
  summary: text("summary").notNull(),
  example: text("example").notNull(),
  exampleZh: text("example_zh").notNull(),
  synonyms: text("synonyms").notNull(),
  antonyms: text("antonyms").notNull(),
  source: text("source").notNull().default("demo-dictionary"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("dictionary_entries_word_prefix_idx").on(table.word.asc().op("text_pattern_ops")),
]);

export const wordRelations = pgTable("word_relations", {
  sourceWord: text("source_word").notNull().references(() => dictionaryEntries.word, { onDelete: "cascade" }),
  relatedWord: text("related_word").notNull(),
  relationType: text("relation_type").notNull(),
  comparison: text("comparison").notNull(),
  usage: text("usage").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.sourceWord, table.relatedWord, table.relationType] }),
  index("word_relations_source_idx").on(table.sourceWord, table.sortOrder),
]);

export const wordGroups = pgTable("word_groups", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default("local-demo"),
  name: text("name").notNull(),
  color: text("color").notNull().default("#f28c52"),
  isDefault: integer("is_default").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("word_groups_user_name_idx").on(table.userId, table.name),
  uniqueIndex("word_groups_one_default_idx").on(table.userId).where(sql`${table.isDefault} = 1`),
]);

export const userWords = pgTable("user_words", {
  userId: text("user_id").notNull(),
  word: text("word").notNull().references(() => dictionaryEntries.word, { onDelete: "cascade" }),
  note: text("note").notNull().default(""),
  firstSavedAt: text("first_saved_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  ease: integer("ease").notNull().default(250),
  intervalDays: integer("interval_days").notNull().default(0),
  repetitions: integer("repetitions").notNull().default(0),
  nextReview: text("next_review").notNull(),
  lastReviewed: text("last_reviewed"),
}, (table) => [
  primaryKey({ columns: [table.userId, table.word] }),
  index("user_words_review_idx").on(table.userId, table.nextReview),
]);

export const groupWords = pgTable("group_words", {
  userId: text("user_id").notNull(),
  groupId: text("group_id").notNull().references(() => wordGroups.id, { onDelete: "cascade" }),
  word: text("word").notNull().references(() => dictionaryEntries.word, { onDelete: "cascade" }),
  addedAt: text("added_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.groupId, table.word] }),
  index("group_words_group_idx").on(table.userId, table.groupId),
]);

export const reviewSessions = pgTable("review_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  groupId: text("group_id").notNull().references(() => wordGroups.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("active"),
  wordCount: integer("word_count").notNull(),
  totalTasks: integer("total_tasks").notNull(),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
}, (table) => [index("review_sessions_status_idx").on(table.userId, table.groupId, table.status)]);

export const reviewTasks = pgTable("review_tasks", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => reviewSessions.id, { onDelete: "cascade" }),
  word: text("word").notNull().references(() => dictionaryEntries.word, { onDelete: "cascade" }),
  questionType: text("question_type").notNull(),
  position: integer("position").notNull(),
  options: text("options").notNull(),
  correctAnswer: text("correct_answer").notNull(),
  selectedAnswer: text("selected_answer"),
  isCorrect: integer("is_correct"),
  answeredAt: text("answered_at"),
}, (table) => [uniqueIndex("review_tasks_position_idx").on(table.sessionId, table.position)]);

export const reviewEvents = pgTable("review_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sessionId: text("session_id").notNull().references(() => reviewSessions.id, { onDelete: "cascade" }),
  taskId: text("task_id").notNull().references(() => reviewTasks.id, { onDelete: "cascade" }),
  word: text("word").notNull().references(() => dictionaryEntries.word, { onDelete: "cascade" }),
  questionType: text("question_type").notNull(),
  isCorrect: integer("is_correct").notNull(),
  answeredAt: text("answered_at").notNull(),
}, (table) => [uniqueIndex("review_events_task_idx").on(table.taskId)]);

// Kept during the transition so existing local and deployed data can be migrated
// into user_words and group_words without being discarded.
export const legacySavedWords = pgTable("saved_words", {
  word: text("word").notNull(),
  groupId: text("group_id").notNull().references(() => wordGroups.id, { onDelete: "cascade" }),
  addedAt: text("added_at").notNull(),
  ease: integer("ease").notNull().default(250),
  intervalDays: integer("interval_days").notNull().default(0),
  repetitions: integer("repetitions").notNull().default(0),
  nextReview: text("next_review").notNull(),
  lastReviewed: text("last_reviewed"),
}, (table) => [primaryKey({ columns: [table.word, table.groupId] })]);
