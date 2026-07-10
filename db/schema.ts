import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const wordGroups = sqliteTable("word_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#f28c52"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const savedWords = sqliteTable("saved_words", {
  word: text("word").notNull(),
  groupId: text("group_id").notNull().references(() => wordGroups.id, { onDelete: "cascade" }),
  addedAt: text("added_at").notNull(),
  ease: integer("ease").notNull().default(250),
  intervalDays: integer("interval_days").notNull().default(0),
  repetitions: integer("repetitions").notNull().default(0),
  nextReview: text("next_review").notNull(),
  lastReviewed: text("last_reviewed"),
}, (table) => [primaryKey({ columns: [table.word, table.groupId] })]);
