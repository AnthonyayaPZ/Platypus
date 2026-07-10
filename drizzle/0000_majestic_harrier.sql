CREATE TABLE `saved_words` (
	`word` text NOT NULL,
	`group_id` text NOT NULL,
	`added_at` text NOT NULL,
	`ease` integer DEFAULT 250 NOT NULL,
	`interval_days` integer DEFAULT 0 NOT NULL,
	`repetitions` integer DEFAULT 0 NOT NULL,
	`next_review` text NOT NULL,
	`last_reviewed` text,
	PRIMARY KEY(`word`, `group_id`),
	FOREIGN KEY (`group_id`) REFERENCES `word_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `word_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#f28c52' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
