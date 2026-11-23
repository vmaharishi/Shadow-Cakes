ALTER TABLE `sales` ADD COLUMN `customer_first_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `sales` ADD COLUMN `customer_last_name` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `sales` SET
  `customer_first_name` = CASE WHEN instr(`customer_name`, ' ') > 0 THEN substr(`customer_name`, 1, instr(`customer_name`, ' ') - 1) ELSE `customer_name` END,
  `customer_last_name` = CASE WHEN instr(`customer_name`, ' ') > 0 THEN substr(`customer_name`, instr(`customer_name`, ' ') + 1) ELSE '' END;
--> statement-breakpoint
ALTER TABLE `component_recipes` ADD COLUMN `variants` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
UPDATE `component_recipes` SET `variants` = json_array(json_object(
  'id', `id`,
  'name', CASE WHEN instr(`name`, ' — ') > 0 THEN substr(`name`, instr(`name`, ' — ') + 3) ELSE 'Standard' END,
  'batch_yield_grams', `batch_yield_grams`,
  'ingredients', json(`ingredients`),
  'packaging', json(`packaging`),
  'prep_time_minutes', `prep_time_minutes`,
  'utility_time_minutes', `utility_time_minutes`,
  'notes', NULL
));
--> statement-breakpoint
UPDATE `component_recipes` SET `variants` = (
  SELECT json_group_array(json(`value`)) FROM (
    SELECT je.`value` AS `value`
    FROM `component_recipes` AS c2
    JOIN json_each(c2.`variants`) AS je
    WHERE (CASE WHEN instr(c2.`name`, ' — ') > 0 THEN substr(c2.`name`, 1, instr(c2.`name`, ' — ') - 1) ELSE c2.`name` END)
        = (CASE WHEN instr(`component_recipes`.`name`, ' — ') > 0 THEN substr(`component_recipes`.`name`, 1, instr(`component_recipes`.`name`, ' — ') - 1) ELSE `component_recipes`.`name` END)
    ORDER BY c2.`rowid`
  )
)
WHERE `rowid` IN (
  SELECT MIN(c3.`rowid`) FROM `component_recipes` AS c3
  GROUP BY (CASE WHEN instr(c3.`name`, ' — ') > 0 THEN substr(c3.`name`, 1, instr(c3.`name`, ' — ') - 1) ELSE c3.`name` END)
);
--> statement-breakpoint
DELETE FROM `component_recipes` WHERE `rowid` NOT IN (
  SELECT MIN(`rowid`) FROM `component_recipes`
  GROUP BY (CASE WHEN instr(`name`, ' — ') > 0 THEN substr(`name`, 1, instr(`name`, ' — ') - 1) ELSE `name` END)
);
--> statement-breakpoint
UPDATE `component_recipes` SET `name` = (CASE WHEN instr(`name`, ' — ') > 0 THEN substr(`name`, 1, instr(`name`, ' — ') - 1) ELSE `name` END);
