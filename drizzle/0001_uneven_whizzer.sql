CREATE TABLE `portfolioTransactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`portfolioId` int NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`assetName` varchar(255),
	`assetType` enum('stock','etf','mutual_fund') NOT NULL,
	`side` enum('buy','sell') NOT NULL,
	`quantity` decimal(24,8) NOT NULL,
	`price` decimal(22,6) NOT NULL,
	`transactionDate` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portfolioTransactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portfolios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`baseCurrency` varchar(3) NOT NULL DEFAULT 'USD',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `portfolios_id` PRIMARY KEY(`id`),
	CONSTRAINT `portfolios_user_name_unique` UNIQUE(`userId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `watchlistItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`assetName` varchar(255),
	`assetType` enum('stock','etf','mutual_fund') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `watchlistItems_id` PRIMARY KEY(`id`),
	CONSTRAINT `watchlist_items_user_symbol_unique` UNIQUE(`userId`,`symbol`)
);
--> statement-breakpoint
ALTER TABLE `portfolioTransactions` ADD CONSTRAINT `portfolioTransactions_portfolioId_portfolios_id_fk` FOREIGN KEY (`portfolioId`) REFERENCES `portfolios`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `portfolios` ADD CONSTRAINT `portfolios_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `watchlistItems` ADD CONSTRAINT `watchlistItems_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `portfolio_transactions_portfolio_index` ON `portfolioTransactions` (`portfolioId`);--> statement-breakpoint
CREATE INDEX `portfolio_transactions_symbol_index` ON `portfolioTransactions` (`symbol`);