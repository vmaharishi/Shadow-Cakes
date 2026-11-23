UPDATE `component_recipes`
SET `variants` = (
  SELECT json_group_array(json(je.`value`))
  FROM json_each(`component_recipes`.`variants`) AS je
)
WHERE json_type(`variants`, '$[0]') = 'text';
