// Drizzle schema for the Shadow Cakes Pricing Tool.
//
// Ported 1:1 from the original app's data model (FastAPI + MongoDB backend in
// the Shadow-Cakes repo): ingredients with per-vendor price history, packaging,
// recipes with size variants (ingredient / packaging / component line items),
// reusable component recipes, recorded sales, and a single settings row.
// Recipes, variants, and components keep their line items as JSON columns,
// exactly as the original stored embedded documents.

import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  labourRatePerHour: real("labour_rate_per_hour").notNull().default(10),
  utilityRatePerHour: real("utility_rate_per_hour").notNull().default(1),
  currency: text("currency").notNull().default("CAD"),
  currencySymbol: text("currency_symbol").notNull().default("$"),
  // Her target profit margin (%), set once in Settings → Costs. The
  // suggested price for a variant is its live total cost divided by
  // (1 − target/100). Defaults to 40 when never set.
  targetMarginPercent: real("target_margin_percent").notNull().default(40),
  // The quote banner she last picked on the Quote page (a quote_banners
  // row id), so the choice survives between visits. Null = no banner;
  // the quote image then falls back to the logo header.
  selectedBannerId: text("selected_banner_id"),
  // The footer text she typed on the Quote page, drawn at the bottom
  // of the generated quote image (line breaks preserved). Null = she
  // has never edited it; the image then uses "Prices in <currency>".
  quoteFooterText: text("quote_footer_text"),
});

export const ingredients = sqliteTable("ingredients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  defaultUnit: text("default_unit").notNull().default("g"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const ingredientPrices = sqliteTable("ingredient_prices", {
  id: text("id").primaryKey(),
  ingredientId: text("ingredient_id").notNull(),
  ingredientName: text("ingredient_name").notNull(),
  storeVendor: text("store_vendor").notNull(),
  purchasePrice: real("purchase_price").notNull(),
  packageSize: real("package_size").notNull(),
  unit: text("unit").notNull(),
  unitCost: real("unit_cost").notNull().default(0),
  purchaseDate: text("purchase_date").notNull(),
  isLatest: integer("is_latest", { mode: "boolean" }).notNull().default(true),
  notes: text("notes"),
});

export const packaging = sqliteTable("packaging", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  storeVendor: text("store_vendor").notNull().default(""),
  purchasePrice: real("purchase_price").notNull().default(0),
  packageSize: real("package_size").notNull().default(1),
  unitCost: real("unit_cost").notNull().default(0),
  unit: text("unit").notNull().default("piece"),
  purchaseDate: text("purchase_date").notNull().default(""),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export interface RecipeLineItem {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  price_id_override: string | null;
}

export interface PackagingLineItem {
  id: string;
  packaging_id: string;
  packaging_name: string;
  quantity: number;
}

export interface ComponentRecipeRef {
  id: string;
  component_recipe_id: string;
  component_name: string;
  quantity: number;
  use_gram_costing: boolean;
  // Which size variant of the component this line uses. Null/absent on
  // lines saved before components had variants — those resolve to the
  // variant whose id matches component_recipe_id (the pre-variants row
  // became a variant keeping its id), else the component's first variant.
  component_variant_id?: string | null;
}

export interface RecipeVariant {
  id: string;
  name: string;
  ingredients: RecipeLineItem[];
  packaging: PackagingLineItem[];
  components: ComponentRecipeRef[];
  prep_time_minutes: number;
  // Minutes the oven / utilities run for this variant, when that differs
  // from the hands-on prep time (her spreadsheets track the two separately).
  // Null means utilities are costed on the prep time, as the original tool
  // did.
  utility_time_minutes?: number | null;
  notes: string | null;
}

export const recipes = sqliteTable("recipes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category"),
  notes: text("notes"),
  // Key of the recipe's photo in blob storage (ctx.blobs), or null when the
  // recipe has no photo. A duplicate shares the source recipe's key; the
  // blob is deleted only once no recipe references it.
  photoBlobKey: text("photo_blob_key"),
  variants: text("variants", { mode: "json" })
    .notNull()
    .$type<RecipeVariant[]>(),
  createdAt: text("created_at").notNull(),
});

export interface ComponentRecipeData {
  ingredients: RecipeLineItem[];
  packaging: PackagingLineItem[];
}

// One size of a component (e.g. the 6-inch and 9-inch ganaches), housed
// under the component the way recipe variants sit under a recipe. Each
// variant carries its own batch yield, lines, and times, so each costs
// separately.
export interface ComponentVariant {
  id: string;
  name: string;
  batch_yield_grams: number;
  ingredients: RecipeLineItem[];
  packaging: PackagingLineItem[];
  prep_time_minutes: number;
  utility_time_minutes?: number | null;
  notes: string | null;
}

export const componentRecipes = sqliteTable("component_recipes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  batchYieldGrams: real("batch_yield_grams").notNull().default(0),
  ingredients: text("ingredients", { mode: "json" })
    .notNull()
    .$type<RecipeLineItem[]>(),
  packaging: text("packaging", { mode: "json" })
    .notNull()
    .$type<PackagingLineItem[]>(),
  prepTimeMinutes: real("prep_time_minutes").notNull().default(0),
  // Minutes utilities run, when tracked separately from prep time (as in
  // her spreadsheets). Null = cost utilities on the prep time.
  utilityTimeMinutes: real("utility_time_minutes"),
  notes: text("notes"),
  // Size variants of this component. The legacy columns above mirror the
  // first variant (kept in sync on every write) — they date from when a
  // component was a single batch; `variants` is the source of truth.
  variants: text("variants", { mode: "json" })
    .notNull()
    .default([])
    .$type<ComponentVariant[]>(),
  createdAt: text("created_at").notNull(),
});

export const sales = sqliteTable("sales", {
  id: text("id").primaryKey(),
  recipeId: text("recipe_id").notNull(),
  recipeName: text("recipe_name").notNull(),
  variantName: text("variant_name").notNull(),
  saleDate: text("sale_date").notNull(),
  customerName: text("customer_name").notNull().default(""),
  // Customer name split for entry: first and last are both required in
  // the sale forms. customer_name stays as the composed "First Last"
  // display/export value the server maintains on every write; rows from
  // before the split were backfilled by migration 0006.
  customerFirstName: text("customer_first_name").notNull().default(""),
  customerLastName: text("customer_last_name").notNull().default(""),
  // Whether the buyer was an individual customer or an event (a
  // market, a fair…). Event sales carry the event's name in the
  // customer fields; the dashboard's Insights rank Top customer and
  // Top event separately so the two never compete.
  saleType: text("sale_type", { enum: ["customer", "event"] })
    .notNull()
    .default("customer"),
  notes: text("notes").notNull().default(""),
  sellingPrice: real("selling_price").notNull(),
  totalCost: real("total_cost").notNull(),
  labourCost: real("labour_cost").notNull().default(0),
  profit: real("profit").notNull(),
  profitMargin: real("profit_margin").notNull(),
  createdAt: text("created_at").notNull(),
});

// The one saved customer quote (Quote page): the variants she has
// picked to quote, each with its own quote price. The price is an
// override that lives only here — it never touches the recipe's own
// pricing. Recipe/variant names and the category are snapshotted at
// pick time so the row still reads correctly between refreshes; the
// server refreshes them from the live recipe on read and prunes rows
// whose recipe or variant has been deleted.
export const quoteItems = sqliteTable("quote_items", {
  id: text("id").primaryKey(),
  recipeId: text("recipe_id").notNull(),
  variantId: text("variant_id").notNull(),
  recipeName: text("recipe_name").notNull(),
  variantName: text("variant_name").notNull(),
  category: text("category"),
  price: real("price").notNull().default(0),
  position: integer("position").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

// Banner images for the customer quote image (Quote page). She uploads
// them once, taps one to select it, and the generated quote image opens
// with the selected banner across its full width. The image bytes live
// in blob storage (ctx.blobs); only the key is kept here. The five
// banners she supplied (Fall, Menu, Spring, Summer, Winter) are seeded
// by the seedQuoteBanners action on first setup.
export const quoteBanners = sqliteTable("quote_banners", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  blobKey: text("blob_key").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

// Feedback mailbox (plumbing only — no UI anywhere reads or writes it).
// Her Muse compiles feedback she mentions while using the tool and logs
// it here via the logfeedback action; entries are read on demand later
// with listfeedback. `date` is the calendar date the feedback refers to
// (defaults to the day it was logged); createdAt orders the mailbox.
// Entries start "open"; resolvefeedback flips them to "resolved" once
// actioned — they stay in the table as history and are never deleted.
export const feedback = sqliteTable("feedback", {
  id: text("id").primaryKey(),
  text: text("text").notNull(),
  area: text("area"),
  date: text("date").notNull(),
  status: text("status", { enum: ["open", "resolved"] })
    .notNull()
    .default("open"),
  createdAt: text("created_at").notNull(),
});

// Dated cost snapshots for recipe variants. A row is written whenever a
// price, packaging cost, component, rate, or recipe change moves a
// variant's computed total cost (checked server-side after each relevant
// mutation), so the recipe view can show how its cost has drifted.
export const costSnapshots = sqliteTable("cost_snapshots", {
  id: text("id").primaryKey(),
  recipeId: text("recipe_id").notNull(),
  recipeName: text("recipe_name").notNull(),
  variantId: text("variant_id").notNull(),
  variantName: text("variant_name").notNull(),
  totalCost: real("total_cost").notNull(),
  ingredientCost: real("ingredient_cost").notNull().default(0),
  packagingCost: real("packaging_cost").notNull().default(0),
  componentCost: real("component_cost").notNull().default(0),
  labourCost: real("labour_cost").notNull().default(0),
  utilityCost: real("utility_cost").notNull().default(0),
  reason: text("reason").notNull().default(""),
  capturedAt: text("captured_at").notNull(),
});
