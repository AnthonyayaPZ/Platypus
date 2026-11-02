import { pgTable, text, integer, jsonb, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { SubtitleSentence, WordSource } from "../lib/video-study";

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
});

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

export const videoStudyDocuments = pgTable("video_study_documents", {
  id: text("id").primaryKey(),
  videoId: text("video_id").notNull().default(""),
  title: text("title").notNull().default("正在获取字幕"),
  channel: text("channel").notNull().default(""),
  duration: text("duration").notNull().default(""),
  url: text("url").notNull().default(""),
  thumbnail: text("thumbnail").notNull().default(""),
  status: text("status").notNull().default("queued"),
  sentences: jsonb("sentences").$type<SubtitleSentence[]>().notNull().default([]),
  error: text("error").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const videoStudyJobs = pgTable("video_study_jobs", {
  id: text("id").primaryKey(),
  requestKey: text("request_key").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("queued"),
  documentId: text("document_id"),
  groupId: text("group_id").notNull().default(""),
  groupName: text("group_name").notNull().default(""),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  payloadHash: text("payload_hash").notNull(),
  workerId: text("worker_id").notNull().default(""),
  leaseUntil: text("lease_until").notNull().default(""),
  error: text("error").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("video_study_jobs_request_idx").on(table.requestKey), index("video_study_jobs_queue_idx").on(table.status, table.leaseUntil)]);

export const videoStudyJobItems = pgTable("video_study_job_items", {
  jobId: text("job_id").notNull().references(() => videoStudyJobs.id, { onDelete: "cascade" }),
  word: text("word").notNull(),
  status: text("status").notNull().default("waiting"),
  sources: jsonb("sources").$type<WordSource[]>().notNull().default([]),
  error: text("error").notNull().default(""),
}, (table) => [primaryKey({ columns: [table.jobId, table.word] })]);

export const videoWordSources = pgTable("video_word_sources", {
  groupId: text("group_id").notNull().references(() => wordGroups.id, { onDelete: "cascade" }),
  word: text("word").notNull().references(() => dictionaryEntries.word, { onDelete: "cascade" }),
  documentId: text("document_id").notNull().references(() => videoStudyDocuments.id, { onDelete: "cascade" }),
  sentenceId: text("sentence_id").notNull(),
  title: text("title").notNull(),
  time: text("time").notNull(),
  english: text("english").notNull(),
}, (table) => [primaryKey({ columns: [table.groupId, table.word, table.documentId, table.sentenceId] })]);

export const videoStudyWorkers = pgTable("video_study_workers", {
  id: text("id").primaryKey(),
  lastSeen: text("last_seen").notNull(),
});
