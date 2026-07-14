CREATE TABLE `dictionary_entries` (
	`word` text PRIMARY KEY NOT NULL,
	`phonetic` text NOT NULL,
	`part` text NOT NULL,
	`meaning` text NOT NULL,
	`summary` text NOT NULL,
	`example` text NOT NULL,
	`example_zh` text NOT NULL,
	`synonyms` text NOT NULL,
	`antonyms` text NOT NULL,
	`source` text DEFAULT 'demo-dictionary' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `group_words` (
	`user_id` text NOT NULL,
	`group_id` text NOT NULL,
	`word` text NOT NULL,
	`added_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `group_id`, `word`),
	FOREIGN KEY (`group_id`) REFERENCES `word_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`word`) REFERENCES `dictionary_entries`(`word`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`task_id` text NOT NULL,
	`word` text NOT NULL,
	`question_type` text NOT NULL,
	`is_correct` integer NOT NULL,
	`answered_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `review_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `review_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`word`) REFERENCES `dictionary_entries`(`word`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `review_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`group_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`word_count` integer NOT NULL,
	`total_tasks` integer NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`group_id`) REFERENCES `word_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `review_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`word` text NOT NULL,
	`question_type` text NOT NULL,
	`position` integer NOT NULL,
	`options` text NOT NULL,
	`correct_answer` text NOT NULL,
	`selected_answer` text,
	`is_correct` integer,
	`answered_at` text,
	FOREIGN KEY (`session_id`) REFERENCES `review_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`word`) REFERENCES `dictionary_entries`(`word`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_words` (
	`user_id` text NOT NULL,
	`word` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`first_saved_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`ease` integer DEFAULT 250 NOT NULL,
	`interval_days` integer DEFAULT 0 NOT NULL,
	`repetitions` integer DEFAULT 0 NOT NULL,
	`next_review` text NOT NULL,
	`last_reviewed` text,
	PRIMARY KEY(`user_id`, `word`),
	FOREIGN KEY (`word`) REFERENCES `dictionary_entries`(`word`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `word_groups` ADD `user_id` text DEFAULT 'local-demo' NOT NULL;