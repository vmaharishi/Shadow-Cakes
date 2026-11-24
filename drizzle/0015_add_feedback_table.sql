CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`area` text,
	`date` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL
);
