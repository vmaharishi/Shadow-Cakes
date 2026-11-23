DROP TABLE IF EXISTS entries;
--> statement-breakpoint
CREATE TABLE settings (
  id TEXT PRIMARY KEY,
  labour_rate_per_hour REAL NOT NULL DEFAULT 10,
  utility_rate_per_hour REAL NOT NULL DEFAULT 1,
  currency TEXT NOT NULL DEFAULT 'CAD',
  currency_symbol TEXT NOT NULL DEFAULT '$'
);
--> statement-breakpoint
CREATE TABLE ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_unit TEXT NOT NULL DEFAULT 'g',
  notes TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE ingredient_prices (
  id TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL,
  ingredient_name TEXT NOT NULL,
  store_vendor TEXT NOT NULL,
  purchase_price REAL NOT NULL,
  package_size REAL NOT NULL,
  unit TEXT NOT NULL,
  unit_cost REAL NOT NULL DEFAULT 0,
  purchase_date TEXT NOT NULL,
  is_latest INTEGER NOT NULL DEFAULT 1,
  notes TEXT
);
--> statement-breakpoint
CREATE INDEX idx_prices_ingredient ON ingredient_prices (ingredient_id);
--> statement-breakpoint
CREATE TABLE packaging (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  store_vendor TEXT NOT NULL DEFAULT '',
  purchase_price REAL NOT NULL DEFAULT 0,
  package_size REAL NOT NULL DEFAULT 1,
  unit_cost REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'piece',
  purchase_date TEXT NOT NULL DEFAULT '',
  notes TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  notes TEXT,
  variants TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE component_recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  batch_yield_grams REAL NOT NULL DEFAULT 0,
  ingredients TEXT NOT NULL,
  packaging TEXT NOT NULL,
  prep_time_minutes REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL,
  recipe_name TEXT NOT NULL,
  variant_name TEXT NOT NULL,
  sale_date TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  selling_price REAL NOT NULL,
  total_cost REAL NOT NULL,
  labour_cost REAL NOT NULL DEFAULT 0,
  profit REAL NOT NULL,
  profit_margin REAL NOT NULL,
  created_at TEXT NOT NULL
);
