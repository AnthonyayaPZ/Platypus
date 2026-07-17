CREATE INDEX "dictionary_entries_word_prefix_idx" ON "dictionary_entries" USING btree ("word" text_pattern_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "review_events_task_idx" ON "review_events" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "word_groups_user_name_idx" ON "word_groups" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "word_groups_one_default_idx" ON "word_groups" USING btree ("user_id") WHERE "word_groups"."is_default" = 1;