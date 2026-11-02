CREATE TABLE "video_study_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"video_id" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '正在获取字幕' NOT NULL,
	"channel" text DEFAULT '' NOT NULL,
	"duration" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"thumbnail" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"sentences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_study_job_items" (
	"job_id" text NOT NULL,
	"word" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	CONSTRAINT "video_study_job_items_job_id_word_pk" PRIMARY KEY("job_id","word")
);
--> statement-breakpoint
CREATE TABLE "video_study_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"request_key" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"document_id" text,
	"group_id" text DEFAULT '' NOT NULL,
	"group_name" text DEFAULT '' NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"worker_id" text DEFAULT '' NOT NULL,
	"lease_until" text DEFAULT '' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_study_workers" (
	"id" text PRIMARY KEY NOT NULL,
	"last_seen" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_word_sources" (
	"group_id" text NOT NULL,
	"word" text NOT NULL,
	"document_id" text NOT NULL,
	"sentence_id" text NOT NULL,
	"title" text NOT NULL,
	"time" text NOT NULL,
	"english" text NOT NULL,
	CONSTRAINT "video_word_sources_group_id_word_document_id_sentence_id_pk" PRIMARY KEY("group_id","word","document_id","sentence_id")
);
--> statement-breakpoint
ALTER TABLE "video_study_job_items" ADD CONSTRAINT "video_study_job_items_job_id_video_study_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."video_study_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_word_sources" ADD CONSTRAINT "video_word_sources_group_id_word_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."word_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_word_sources" ADD CONSTRAINT "video_word_sources_word_dictionary_entries_word_fk" FOREIGN KEY ("word") REFERENCES "public"."dictionary_entries"("word") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_word_sources" ADD CONSTRAINT "video_word_sources_document_id_video_study_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."video_study_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "video_study_jobs_request_idx" ON "video_study_jobs" USING btree ("request_key");--> statement-breakpoint
CREATE INDEX "video_study_jobs_queue_idx" ON "video_study_jobs" USING btree ("status","lease_until");