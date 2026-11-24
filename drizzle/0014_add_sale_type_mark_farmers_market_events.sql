ALTER TABLE `sales` ADD COLUMN `sale_type` text DEFAULT 'customer' NOT NULL;
--> statement-breakpoint
UPDATE `sales` SET `sale_type` = 'event' WHERE substr(`sale_date`, 1, 10) = '2026-08-02' AND `customer_name` LIKE 'Farmer%Market%';
