CREATE TABLE quote_items (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  recipe_name TEXT NOT NULL,
  variant_name TEXT NOT NULL,
  category TEXT,
  price REAL NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
