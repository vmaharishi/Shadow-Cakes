CREATE TABLE quote_banners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  blob_key TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
ALTER TABLE settings ADD COLUMN selected_banner_id TEXT;
