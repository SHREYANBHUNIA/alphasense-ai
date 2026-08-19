CREATE TABLE `aiAnalysisRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`analysisType` enum('recommendation','news','chat') NOT NULL,
	`symbol` varchar(20),
	`requestContext` text NOT NULL,
	`responseText` text NOT NULL,
	`dataAsOf` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiAnalysisRecords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `aiAnalysisRecords` ADD CONSTRAINT `aiAnalysisRecords_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ai_analysis_records_user_created_index` ON `aiAnalysisRecords` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `ai_analysis_records_symbol_index` ON `aiAnalysisRecords` (`symbol`);