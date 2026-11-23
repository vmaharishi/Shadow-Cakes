CREATE TABLE `cost_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`recipe_name` text NOT NULL,
	`variant_id` text NOT NULL,
	`variant_name` text NOT NULL,
	`total_cost` real NOT NULL,
	`ingredient_cost` real DEFAULT 0 NOT NULL,
	`packaging_cost` real DEFAULT 0 NOT NULL,
	`component_cost` real DEFAULT 0 NOT NULL,
	`labour_cost` real DEFAULT 0 NOT NULL,
	`utility_cost` real DEFAULT 0 NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`captured_at` text NOT NULL
);
