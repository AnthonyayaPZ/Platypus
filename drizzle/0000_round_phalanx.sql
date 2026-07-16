CREATE TABLE "dictionary_entries" (
	"word" text PRIMARY KEY NOT NULL,
	"phonetic" text NOT NULL,
	"part" text NOT NULL,
	"meaning" text NOT NULL,
	"summary" text NOT NULL,
	"example" text NOT NULL,
	"example_zh" text NOT NULL,
	"synonyms" text NOT NULL,
	"antonyms" text NOT NULL,
	"source" text DEFAULT 'demo-dictionary' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_words" (
	"user_id" text NOT NULL,
	"group_id" text NOT NULL,
	"word" text NOT NULL,
	"added_at" text NOT NULL,
	CONSTRAINT "group_words_user_id_group_id_word_pk" PRIMARY KEY("user_id","group_id","word")
);
--> statement-breakpoint
CREATE TABLE "saved_words" (
	"word" text NOT NULL,
	"group_id" text NOT NULL,
	"added_at" text NOT NULL,
	"ease" integer DEFAULT 250 NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"next_review" text NOT NULL,
	"last_reviewed" text,
	CONSTRAINT "saved_words_word_group_id_pk" PRIMARY KEY("word","group_id")
);
--> statement-breakpoint
CREATE TABLE "review_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"task_id" text NOT NULL,
	"word" text NOT NULL,
	"question_type" text NOT NULL,
	"is_correct" integer NOT NULL,
	"answered_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"group_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"word_count" integer NOT NULL,
	"total_tasks" integer NOT NULL,
	"created_at" text NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "review_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"word" text NOT NULL,
	"question_type" text NOT NULL,
	"position" integer NOT NULL,
	"options" text NOT NULL,
	"correct_answer" text NOT NULL,
	"selected_answer" text,
	"is_correct" integer,
	"answered_at" text
);
--> statement-breakpoint
CREATE TABLE "user_words" (
	"user_id" text NOT NULL,
	"word" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"first_saved_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"ease" integer DEFAULT 250 NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"next_review" text NOT NULL,
	"last_reviewed" text,
	CONSTRAINT "user_words_user_id_word_pk" PRIMARY KEY("user_id","word")
);
--> statement-breakpoint
CREATE TABLE "word_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text DEFAULT 'local-demo' NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#f28c52' NOT NULL,
	"is_default" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_relations" (
	"source_word" text NOT NULL,
	"related_word" text NOT NULL,
	"relation_type" text NOT NULL,
	"comparison" text NOT NULL,
	"usage" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "word_relations_source_word_related_word_relation_type_pk" PRIMARY KEY("source_word","related_word","relation_type")
);
--> statement-breakpoint
ALTER TABLE "group_words" ADD CONSTRAINT "group_words_group_id_word_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."word_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_words" ADD CONSTRAINT "group_words_word_dictionary_entries_word_fk" FOREIGN KEY ("word") REFERENCES "public"."dictionary_entries"("word") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_words" ADD CONSTRAINT "saved_words_group_id_word_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."word_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_session_id_review_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."review_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_task_id_review_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."review_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_word_dictionary_entries_word_fk" FOREIGN KEY ("word") REFERENCES "public"."dictionary_entries"("word") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_sessions" ADD CONSTRAINT "review_sessions_group_id_word_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."word_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_session_id_review_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."review_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_word_dictionary_entries_word_fk" FOREIGN KEY ("word") REFERENCES "public"."dictionary_entries"("word") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_words" ADD CONSTRAINT "user_words_word_dictionary_entries_word_fk" FOREIGN KEY ("word") REFERENCES "public"."dictionary_entries"("word") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_relations" ADD CONSTRAINT "word_relations_source_word_dictionary_entries_word_fk" FOREIGN KEY ("source_word") REFERENCES "public"."dictionary_entries"("word") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_words_group_idx" ON "group_words" USING btree ("user_id","group_id");--> statement-breakpoint
CREATE INDEX "review_sessions_status_idx" ON "review_sessions" USING btree ("user_id","group_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "review_tasks_position_idx" ON "review_tasks" USING btree ("session_id","position");--> statement-breakpoint
CREATE INDEX "user_words_review_idx" ON "user_words" USING btree ("user_id","next_review");--> statement-breakpoint
CREATE INDEX "word_relations_source_idx" ON "word_relations" USING btree ("source_word","sort_order");