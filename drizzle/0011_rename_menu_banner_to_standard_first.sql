UPDATE `quote_banners` SET `name` = 'Standard' WHERE `name` = 'Menu' AND NOT EXISTS (SELECT 1 FROM `quote_banners` WHERE `name` = 'Standard');
--> statement-breakpoint
UPDATE `quote_banners` SET `position` = `position` + 1 WHERE `name` IN ('Fall', 'Spring', 'Summer', 'Winter');
--> statement-breakpoint
UPDATE `quote_banners` SET `position` = 0 WHERE `name` = 'Standard';
