CREATE TABLE `word_relations` (
	`source_word` text NOT NULL,
	`related_word` text NOT NULL,
	`relation_type` text NOT NULL,
	`comparison` text NOT NULL,
	`usage` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`source_word`, `related_word`, `relation_type`),
	FOREIGN KEY (`source_word`) REFERENCES `dictionary_entries`(`word`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `word_relations_source_idx` ON `word_relations` (`source_word`,`sort_order`);