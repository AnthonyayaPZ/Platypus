CREATE INDEX `group_words_group_idx` ON `group_words` (`user_id`,`group_id`);--> statement-breakpoint
CREATE INDEX `review_sessions_status_idx` ON `review_sessions` (`user_id`,`group_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_tasks_position_idx` ON `review_tasks` (`session_id`,`position`);--> statement-breakpoint
CREATE INDEX `user_words_review_idx` ON `user_words` (`user_id`,`next_review`);