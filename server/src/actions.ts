// Actions for the Shadow Cakes Pricing Tool.
//
// A faithful port of the original app's API (FastAPI backend in the
// Shadow-Cakes repo) to typed space actions: ingredients with per-vendor
// price history and per-line overrides, packaging, recipes with size
// variants, reusable component recipes, the cost-breakdown engine
// (labour $10/hr, utilities $1/hr by default, both editable in Settings),
// sales recording with dashboard summary, CSV export data, and
// replace-style spreadsheet imports. All money is CAD.

import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { asc, desc, eq, inArray } from "drizzle-orm";
import * as schema from "./schema";
import type {
ComponentRecipeRef,
ComponentVariant,
PackagingLineItem,
RecipeLineItem,
RecipeVariant,
} from "./schema";
import * as XLSX from "xlsx";
import { SEED_BANNERS } from "./banner-seed";

function getDb(ctx: Ctx) {
  return ctx.db<typeof schema>();
}
type Db = ReturnType<typeof getDb>;

// ---------- helpers ----------

const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const todayStr = () => new Date().toISOString().split("T")[0] ?? "";
const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

type SettingsRow = typeof schema.settings.$inferSelect;
type PriceRow = typeof schema.ingredientPrices.$inferSelect;
type PackagingRow = typeof schema.packaging.$inferSelect;
type ComponentRow = typeof schema.componentRecipes.$inferSelect;

async function getSettingsRow(db: Db): Promise<SettingsRow> {
  const rows = await db.select().from(schema.settings).limit(1);
  const existing = rows[0];
  if (existing) return existing;
  const fresh: SettingsRow = {
    id: "settings",
    labourRatePerHour: 10,
    utilityRatePerHour: 1,
    currency: "CAD",
    currencySymbol: "$",
    targetMarginPercent: 40,
    selectedBannerId: null,
    quoteFooterText: null,
  };
  await db.insert(schema.settings).values(fresh);
  return fresh;
}

/** Original rule: override price if set, else the price flagged latest,
 *  else the most recently purchased price for the ingredient. */
function resolvePrice(
  prices: PriceRow[],
  ingredientId: string,
  overrideId: string | null,
): PriceRow | undefined {
  if (overrideId) {
    const hit = prices.find((p) => p.id === overrideId);
    if (hit) return hit;
  }
  const mine = prices.filter((p) => p.ingredientId === ingredientId);
  const latest = mine.find((p) => p.isLatest);
  if (latest) return latest;
  return [...mine].sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))[0];
}

interface CostContext {
  settings: SettingsRow;
  prices: PriceRow[];
  packagingById: Map<string, PackagingRow>;
  componentsById: Map<string, ComponentRow>;
}

async function loadCostContext(db: Db): Promise<CostContext> {
  const settingsRow = await getSettingsRow(db);
  const prices = await db.select().from(schema.ingredientPrices);
  const pkgs = await db.select().from(schema.packaging);
  const comps = await db.select().from(schema.componentRecipes);
  return {
    settings: settingsRow,
    prices,
    packagingById: new Map(pkgs.map((p) => [p.id, p])),
    componentsById: new Map(comps.map((c) => [c.id, c])),
  };
}

/** The size variants of a component row. Rows written before variants
 *  existed (or by an older import) may carry an empty list — synthesise
 *  the single variant from the legacy columns, keeping the row's own id
 *  as the variant id so old recipe lines keep resolving. */
function componentVariantsOf(c: ComponentRow): ComponentVariant[] {
  if (c.variants && c.variants.length > 0) {
    return c.variants.map((raw) => {
      // The variants migration (0006) left the live rows with each
      // variant stored as a JSON *string* inside the array instead of
      // an object, so `v.ingredients` was undefined and every reader
      // (component list, cost engine, workbook backup) crashed on
      // `for (const l of v.ingredients)`. Migration 0007 rewrites the
      // stored values, and this parse keeps every reader safe even if
      // a string element ever slips through again.
      let v: ComponentVariant = raw;
      if (typeof raw === "string") {
        try {
          v = JSON.parse(raw) as ComponentVariant;
        } catch {
          v = {
            id: c.id,
            name: "Standard",
            batch_yield_grams: 0,
            ingredients: [],
            packaging: [],
            prep_time_minutes: 0,
            utility_time_minutes: null,
            notes: null,
          };
        }
      }
      return {
        ...v,
        ingredients: v.ingredients ?? [],
        packaging: v.packaging ?? [],
        batch_yield_grams: v.batch_yield_grams ?? 0,
        prep_time_minutes: v.prep_time_minutes ?? 0,
        utility_time_minutes: v.utility_time_minutes ?? null,
        notes: v.notes ?? null,
      };
    });
  }
  const cut = c.name.lastIndexOf(" — ");
  return [
    {
      id: c.id,
      name: cut > 0 ? c.name.slice(cut + 3) : "Standard",
      batch_yield_grams: c.batchYieldGrams,
      ingredients: c.ingredients,
      packaging: c.packaging,
      prep_time_minutes: c.prepTimeMinutes,
      utility_time_minutes: c.utilityTimeMinutes ?? null,
      notes: null,
    },
  ];
}

/** Display name for one component variant: "Dark Chocolate Ganache —
 *  6-inch"; a lone "Standard" variant reads as just the component name. */
function componentVariantLabel(
  compName: string,
  variant: ComponentVariant,
  variantCount: number,
): string {
  if (variantCount <= 1 && variant.name === "Standard") return compName;
  return `${compName} — ${variant.name}`;
}

/** Resolves a recipe's component line to the component + variant it
 *  costs from. New lines carry component_variant_id; older lines point
 *  at what was then the component row and is now a variant id inside
 *  the (possibly merged) component. */
function resolveComponentVariant(
  cx: CostContext,
  ref: ComponentRecipeRef,
): { comp: ComponentRow; variant: ComponentVariant } | undefined {
  const comp = cx.componentsById.get(ref.component_recipe_id);
  if (comp) {
    const variants = componentVariantsOf(comp);
    const variant =
      (ref.component_variant_id
        ? variants.find((v) => v.id === ref.component_variant_id)
        : undefined) ??
      variants.find((v) => v.id === ref.component_recipe_id) ??
      variants[0];
    if (variant) return { comp, variant };
    return undefined;
  }
  for (const c of cx.componentsById.values()) {
    const variant = componentVariantsOf(c).find(
      (v) => v.id === ref.component_recipe_id,
    );
    if (variant) return { comp: c, variant };
  }
  return undefined;
}

interface ComponentBatchData {
  ingredients: RecipeLineItem[];
  packaging: PackagingLineItem[];
  prep_time_minutes: number;
  utility_time_minutes?: number | null;
}

/** Full batch cost of one component variant (ingredients + packaging + time). */
function componentBatchCost(data: ComponentBatchData, cx: CostContext) {
  let ingredientTotal = 0;
  for (const item of data.ingredients) {
    const price = resolvePrice(cx.prices, item.ingredient_id, item.price_id_override);
    if (price) ingredientTotal += item.quantity * price.unitCost;
  }
  let packagingTotal = 0;
  for (const item of data.packaging) {
    const pkg = cx.packagingById.get(item.packaging_id);
    if (pkg) packagingTotal += item.quantity * pkg.unitCost;
  }
  const hours = data.prep_time_minutes / 60;
  const labour = hours * cx.settings.labourRatePerHour;
  const utility =
    ((data.utility_time_minutes ?? data.prep_time_minutes) / 60) *
    cx.settings.utilityRatePerHour;
  return {
    ingredientTotal,
    packagingTotal,
    labour,
    utility,
    batchCost: ingredientTotal + packagingTotal + labour + utility,
  };
}

/** Totals-only variant cost, using the same rounding as the variantCost
 *  action, for cost-history snapshots. */
function variantTotals(variant: RecipeVariant, cx: CostContext) {
  let totalIngredient = 0;
  for (const item of variant.ingredients) {
    const price = resolvePrice(cx.prices, item.ingredient_id, item.price_id_override);
    if (price) totalIngredient += item.quantity * price.unitCost;
  }
  let totalPackaging = 0;
  for (const item of variant.packaging) {
    const pkg = cx.packagingById.get(item.packaging_id);
    if (pkg) totalPackaging += item.quantity * pkg.unitCost;
  }
  let totalComponent = 0;
  for (const ref of variant.components) {
    const resolved = resolveComponentVariant(cx, ref);
    if (!resolved) continue;
    const cv = resolved.variant;
    const batch = componentBatchCost(cv, cx);
    const cost =
      ref.use_gram_costing && cv.batch_yield_grams > 0
        ? (batch.batchCost / cv.batch_yield_grams) * ref.quantity
        : batch.batchCost * ref.quantity;
    totalComponent += round4(cost);
  }
  const hours = variant.prep_time_minutes / 60;
  const labour = round4(hours * cx.settings.labourRatePerHour);
  const utility = round4(
    ((variant.utility_time_minutes ?? variant.prep_time_minutes) / 60) *
      cx.settings.utilityRatePerHour,
  );
  const ingredientCost = round2(totalIngredient);
  const packagingCost = round2(totalPackaging);
  const componentCost = round2(totalComponent);
  return {
    ingredientCost,
    packagingCost,
    componentCost,
    labourCost: labour,
    utilityCost: utility,
    totalCost: round2(ingredientCost + packagingCost + componentCost + labour + utility),
  };
}

/** Recomputes every variant's cost and appends a snapshot for each variant
 *  whose total moved since its last snapshot (or that has none yet).
 *  Called after any mutation that can move costs: price, packaging,
 *  component, settings-rate, recipe, and import changes. */
async function snapshotCosts(db: Db, reason: string): Promise<void> {
  const recipes = await db.select().from(schema.recipes);
  if (recipes.length === 0) return;
  const cx = await loadCostContext(db);
  const existing = await db
    .select()
    .from(schema.costSnapshots)
    .orderBy(asc(schema.costSnapshots.capturedAt));
  const latestByVariant = new Map<string, number>();
  for (const s of existing) latestByVariant.set(s.variantId, s.totalCost);
  const capturedAt = nowIso();
  for (const recipe of recipes) {
    for (const variant of recipe.variants) {
      const t = variantTotals(variant, cx);
      const prev = latestByVariant.get(variant.id);
      if (prev != null && Math.abs(prev - t.totalCost) < 0.005) continue;
      await db.insert(schema.costSnapshots).values({
        id: uid(),
        recipeId: recipe.id,
        recipeName: recipe.name,
        variantId: variant.id,
        variantName: variant.name,
        totalCost: t.totalCost,
        ingredientCost: t.ingredientCost,
        packagingCost: t.packagingCost,
        componentCost: t.componentCost,
        labourCost: t.labourCost,
        utilityCost: t.utilityCost,
        reason,
        capturedAt,
      });
    }
  }
}

// ---------- shared zod shapes ----------

const settingsShape = z.object({
  labour_rate_per_hour: z.number(),
  utility_rate_per_hour: z.number(),
  currency: z.string(),
  currency_symbol: z.string(),
  target_margin_percent: z.number(),
  // The quote image's footer text, resolved server-side: her saved
  // text, or "Prices in <currency>" when she has never edited it.
  quote_footer_text: z.string(),
});

const priceShape = z.object({
  id: z.string(),
  ingredient_id: z.string(),
  ingredient_name: z.string(),
  store_vendor: z.string(),
  purchase_price: z.number(),
  package_size: z.number(),
  unit: z.string(),
  unit_cost: z.number(),
  purchase_date: z.string(),
  is_latest: z.boolean(),
  notes: z.string().nullable(),
});

const ingredientShape = z.object({
  id: z.string(),
  name: z.string(),
  default_unit: z.string(),
  notes: z.string().nullable(),
  created_at: z.string(),
  prices: z.array(priceShape),
});

const packagingShape = z.object({
  id: z.string(),
  name: z.string(),
  store_vendor: z.string(),
  purchase_price: z.number(),
  package_size: z.number(),
  unit_cost: z.number(),
  unit: z.string(),
  purchase_date: z.string(),
  notes: z.string().nullable(),
  created_at: z.string(),
});

const lineItemShape = z.object({
  id: z.string(),
  ingredient_id: z.string(),
  ingredient_name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  price_id_override: z.string().nullable(),
});

const packagingLineShape = z.object({
  id: z.string(),
  packaging_id: z.string(),
  packaging_name: z.string(),
  quantity: z.number(),
});

const componentRefShape = z.object({
  id: z.string(),
  component_recipe_id: z.string(),
  component_name: z.string(),
  quantity: z.number(),
  use_gram_costing: z.boolean(),
  component_variant_id: z.string().nullable(),
});

const variantShape = z.object({
  id: z.string(),
  name: z.string(),
  ingredients: z.array(lineItemShape),
  packaging: z.array(packagingLineShape),
  components: z.array(componentRefShape),
  prep_time_minutes: z.number(),
  utility_time_minutes: z.number().nullable(),
  notes: z.string().nullable(),
});

const recipeShape = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  notes: z.string().nullable(),
  // Resolved blob URL for the recipe's photo, or null when it has none.
  // Only listRecipes / createRecipe / duplicateRecipe resolve it; other
  // payloads that embed a recipe (backups) leave it null.
  photo_url: z.string().nullable(),
  variants: z.array(variantShape),
  created_at: z.string(),
});

const componentVariantShape = z.object({
  id: z.string(),
  name: z.string(),
  batch_yield_grams: z.number(),
  ingredients: z.array(lineItemShape),
  packaging: z.array(packagingLineShape),
  prep_time_minutes: z.number(),
  utility_time_minutes: z.number().nullable(),
  notes: z.string().nullable(),
  batch_cost: z.number(),
  cost_per_gram: z.number(),
});

const componentShape = z.object({
  id: z.string(),
  name: z.string(),
  notes: z.string().nullable(),
  created_at: z.string(),
  variants: z.array(componentVariantShape),
});

const saleShape = z.object({
  id: z.string(),
  recipe_id: z.string(),
  recipe_name: z.string(),
  variant_name: z.string(),
  sale_date: z.string(),
  customer_name: z.string(),
  customer_first_name: z.string(),
  customer_last_name: z.string(),
  sale_type: z.enum(["customer", "event"]),
  notes: z.string(),
  selling_price: z.number(),
  total_cost: z.number(),
  labour_cost: z.number(),
  profit: z.number(),
  profit_margin: z.number(),
  created_at: z.string(),
});

const quoteItemShape = z.object({
  id: z.string(),
  recipe_id: z.string(),
  variant_id: z.string(),
  recipe_name: z.string(),
  variant_name: z.string(),
  category: z.string().nullable(),
  price: z.number(),
});

const quoteBannerShape = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().nullable(),
  selected: z.boolean(),
});

const okShape = z.object({ ok: z.literal(true) });
const bulkShape = z.object({ ok: z.literal(true), deleted_count: z.number() });

const costSnapshotShape = z.object({
  id: z.string(),
  recipe_id: z.string(),
  recipe_name: z.string(),
  variant_id: z.string(),
  variant_name: z.string(),
  total_cost: z.number(),
  ingredient_cost: z.number(),
  packaging_cost: z.number(),
  component_cost: z.number(),
  labour_cost: z.number(),
  utility_cost: z.number(),
  reason: z.string(),
  captured_at: z.string(),
});

type CostSnapshotRow = typeof schema.costSnapshots.$inferSelect;
function toCostSnapshot(s: CostSnapshotRow): z.infer<typeof costSnapshotShape> {
  return {
    id: s.id,
    recipe_id: s.recipeId,
    recipe_name: s.recipeName,
    variant_id: s.variantId,
    variant_name: s.variantName,
    total_cost: s.totalCost,
    ingredient_cost: s.ingredientCost,
    packaging_cost: s.packagingCost,
    component_cost: s.componentCost,
    labour_cost: s.labourCost,
    utility_cost: s.utilityCost,
    reason: s.reason,
    captured_at: s.capturedAt,
  };
}

// ---------- request shapes ----------

const lineItemInput = z.object({
  id: z.string().optional(),
  ingredient_id: z.string().min(1),
  ingredient_name: z.string().max(300),
  quantity: z.number().min(0),
  unit: z.string().max(30),
  price_id_override: z.string().nullable().optional(),
});

const packagingLineInput = z.object({
  id: z.string().optional(),
  packaging_id: z.string().min(1),
  packaging_name: z.string().max(300),
  quantity: z.number().min(0),
});

const componentRefInput = z.object({
  id: z.string().optional(),
  component_recipe_id: z.string().min(1),
  component_name: z.string().max(300),
  quantity: z.number().min(0),
  use_gram_costing: z.boolean().default(false),
  component_variant_id: z.string().nullable().optional(),
});

const componentVariantInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(200),
  batch_yield_grams: z.number().min(0).default(0),
  ingredients: z.array(lineItemInput).max(500).default([]),
  packaging: z.array(packagingLineInput).max(200).default([]),
  prep_time_minutes: z.number().min(0).default(0),
  utility_time_minutes: z.number().min(0).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

type ComponentVariantInput = z.infer<typeof componentVariantInput>;

function normPackagingLine(p: z.infer<typeof packagingLineInput>): PackagingLineItem {
  return {
    id: p.id && p.id.length > 0 ? p.id : uid(),
    packaging_id: p.packaging_id,
    packaging_name: p.packaging_name,
    quantity: p.quantity,
  };
}

function normComponentVariant(v: ComponentVariantInput): ComponentVariant {
  return {
    id: v.id && v.id.length > 0 ? v.id : uid(),
    name: v.name,
    batch_yield_grams: v.batch_yield_grams,
    ingredients: v.ingredients.map(normLine),
    packaging: v.packaging.map(normPackagingLine),
    prep_time_minutes: v.prep_time_minutes,
    utility_time_minutes: v.utility_time_minutes ?? null,
    notes: v.notes ?? null,
  };
}

const variantInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(200),
  ingredients: z.array(lineItemInput).max(500).default([]),
  packaging: z.array(packagingLineInput).max(200).default([]),
  components: z.array(componentRefInput).max(200).default([]),
  prep_time_minutes: z.number().min(0).default(0),
  utility_time_minutes: z.number().min(0).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

type VariantInput = z.infer<typeof variantInput>;
type LineItemInput = z.infer<typeof lineItemInput>;

function normLine(item: LineItemInput): RecipeLineItem {
  return {
    id: item.id && item.id.length > 0 ? item.id : uid(),
    ingredient_id: item.ingredient_id,
    ingredient_name: item.ingredient_name,
    quantity: item.quantity,
    unit: item.unit,
    price_id_override: item.price_id_override ?? null,
  };
}

function normVariant(v: VariantInput): RecipeVariant {
  return {
    id: v.id && v.id.length > 0 ? v.id : uid(),
    name: v.name,
    ingredients: v.ingredients.map(normLine),
    packaging: v.packaging.map(
      (p): PackagingLineItem => ({
        id: p.id && p.id.length > 0 ? p.id : uid(),
        packaging_id: p.packaging_id,
        packaging_name: p.packaging_name,
        quantity: p.quantity,
      }),
    ),
    components: v.components.map(
      (c): ComponentRecipeRef => ({
        id: c.id && c.id.length > 0 ? c.id : uid(),
        component_recipe_id: c.component_recipe_id,
        component_name: c.component_name,
        quantity: c.quantity,
        use_gram_costing: c.use_gram_costing,
        component_variant_id: c.component_variant_id ?? null,
      }),
    ),
    prep_time_minutes: v.prep_time_minutes,
    utility_time_minutes: v.utility_time_minutes ?? null,
    notes: v.notes ?? null,
  };
}

// ---------- row mappers ----------

function toPrice(p: PriceRow): z.infer<typeof priceShape> {
  return {
    id: p.id,
    ingredient_id: p.ingredientId,
    ingredient_name: p.ingredientName,
    store_vendor: p.storeVendor,
    purchase_price: p.purchasePrice,
    package_size: p.packageSize,
    unit: p.unit,
    unit_cost: p.unitCost,
    purchase_date: p.purchaseDate,
    is_latest: p.isLatest,
    notes: p.notes,
  };
}

function toPackaging(p: PackagingRow): z.infer<typeof packagingShape> {
  return {
    id: p.id,
    name: p.name,
    store_vendor: p.storeVendor,
    purchase_price: p.purchasePrice,
    package_size: p.packageSize,
    unit_cost: p.unitCost,
    unit: p.unit,
    purchase_date: p.purchaseDate,
    notes: p.notes,
    created_at: p.createdAt,
  };
}

function toComponent(
  c: ComponentRow,
  cx: CostContext,
): z.infer<typeof componentShape> {
  return {
    id: c.id,
    name: c.name,
    notes: c.notes,
    created_at: c.createdAt,
    variants: componentVariantsOf(c).map((v) => {
      const batch = componentBatchCost(v, cx);
      return {
        id: v.id,
        name: v.name,
        batch_yield_grams: v.batch_yield_grams,
        ingredients: v.ingredients,
        packaging: v.packaging,
        prep_time_minutes: v.prep_time_minutes,
        utility_time_minutes: v.utility_time_minutes ?? null,
        notes: v.notes ?? null,
        batch_cost: round2(batch.batchCost),
        cost_per_gram:
          v.batch_yield_grams > 0
            ? round4(batch.batchCost / v.batch_yield_grams)
            : 0,
      };
    }),
  };
}

type RecipeRow = typeof schema.recipes.$inferSelect;
function toRecipe(r: RecipeRow): z.infer<typeof recipeShape> {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    notes: r.notes,
    photo_url: null,
    // Variants stored before utility time was tracked have no such key;
    // normalise to null (= cost utilities on the prep time). Component
    // lines stored before component variants existed likewise gain an
    // explicit null variant id.
    variants: r.variants.map((v) => ({
      ...v,
      utility_time_minutes: v.utility_time_minutes ?? null,
      components: v.components.map((c) => ({
        ...c,
        component_variant_id: c.component_variant_id ?? null,
      })),
    })),
    created_at: r.createdAt,
  };
}

/** toRecipe with the photo's blob URL resolved for display. */
async function toRecipeWithPhoto(
  ctx: Ctx,
  r: RecipeRow,
): Promise<z.infer<typeof recipeShape>> {
  const base = toRecipe(r);
  if (!r.photoBlobKey) return base;
  return { ...base, photo_url: await ctx.blobs.getUrl(r.photoBlobKey) };
}

/** Deletes a photo blob once no recipe references its key any more
 *  (a duplicate shares the source recipe's key). */
async function deletePhotoBlobIfUnreferenced(
  ctx: Ctx,
  db: Db,
  key: string | null,
): Promise<void> {
  if (!key) return;
  const refs = await db
    .select({ id: schema.recipes.id })
    .from(schema.recipes)
    .where(eq(schema.recipes.photoBlobKey, key))
    .limit(1);
  if (refs.length === 0) {
    await ctx.blobs.delete(key).catch(() => undefined);
  }
}

/** Decodes a base64 payload (possibly a data: URL) into bytes. */
function base64ToBytes(input: string): Uint8Array {
  const b64 = input.includes(",") ? (input.split(",").pop() ?? "") : input;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

type SaleRow = typeof schema.sales.$inferSelect;
function toSale(s: SaleRow): z.infer<typeof saleShape> {
  return {
    id: s.id,
    recipe_id: s.recipeId,
    recipe_name: s.recipeName,
    variant_name: s.variantName,
    sale_date: s.saleDate,
    customer_name: s.customerName,
    customer_first_name: s.customerFirstName,
    customer_last_name: s.customerLastName,
    sale_type: s.saleType,
    notes: s.notes,
    selling_price: s.sellingPrice,
    total_cost: s.totalCost,
    labour_cost: s.labourCost,
    profit: s.profit,
    profit_margin: s.profitMargin,
    created_at: s.createdAt,
  };
}

type QuoteItemRow = typeof schema.quoteItems.$inferSelect;
function toQuoteItem(q: QuoteItemRow): z.infer<typeof quoteItemShape> {
  return {
    id: q.id,
    recipe_id: q.recipeId,
    variant_id: q.variantId,
    recipe_name: q.recipeName,
    variant_name: q.variantName,
    category: q.category,
    price: q.price,
  };
}

type QuoteBannerRow = typeof schema.quoteBanners.$inferSelect;
async function toQuoteBanner(
  ctx: Ctx,
  b: QuoteBannerRow,
  selectedId: string | null,
): Promise<z.infer<typeof quoteBannerShape>> {
  return {
    id: b.id,
    name: b.name,
    url: await ctx.blobs.getUrl(b.blobKey),
    selected: selectedId != null && b.id === selectedId,
  };
}

async function loadQuoteBanners(db: Db): Promise<QuoteBannerRow[]> {
  return db
    .select()
    .from(schema.quoteBanners)
    .orderBy(asc(schema.quoteBanners.position), asc(schema.quoteBanners.createdAt));
}

/**
 * Loads the saved quote, refreshing each row's names and category from
 * the live recipe (so a rename shows up on the quote) and pruning rows
 * whose recipe or variant has been deleted — a deleted cake can't be
 * quoted. Rows come back in the order they were picked.
 */
async function loadQuoteItems(db: Db): Promise<QuoteItemRow[]> {
  const rows = await db
    .select()
    .from(schema.quoteItems)
    .orderBy(asc(schema.quoteItems.position), asc(schema.quoteItems.createdAt));
  if (rows.length === 0) return rows;
  const recipes = await db.select().from(schema.recipes);
  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  const live: QuoteItemRow[] = [];
  for (const row of rows) {
    const recipe = recipeById.get(row.recipeId);
    const variant = recipe?.variants.find((v) => v.id === row.variantId);
    if (!recipe || !variant) {
      await db
        .delete(schema.quoteItems)
        .where(eq(schema.quoteItems.id, row.id));
      continue;
    }
    if (
      row.recipeName !== recipe.name ||
      row.variantName !== variant.name ||
      row.category !== recipe.category
    ) {
      const refreshed = {
        ...row,
        recipeName: recipe.name,
        variantName: variant.name,
        category: recipe.category,
      };
      await db
        .update(schema.quoteItems)
        .set({
          recipeName: recipe.name,
          variantName: variant.name,
          category: recipe.category,
        })
        .where(eq(schema.quoteItems.id, row.id));
      live.push(refreshed);
    } else {
      live.push(row);
    }
  }
  return live;
}

/**
 * The price a variant starts with on the quote: always the suggested
 * price — the variant's live total cost ÷ (1 − target margin),
 * rounded UP to the next whole dollar (the ceiling rule the recipe
 * and sale pages use). She can type any price over it on the quote;
 * that override lives on the quote row only. $0 when the variant has
 * no cost yet.
 */
function quoteDefaultPrice(
  variant: RecipeVariant,
  cx: CostContext,
): number {
  const totals = variantTotals(variant, cx);
  if (totals.totalCost <= 0) return 0;
  const margin = cx.settings.targetMarginPercent ?? 40;
  if (margin < 0 || margin >= 100) return Math.ceil(totals.totalCost - 1e-9);
  return Math.ceil(totals.totalCost / (1 - margin / 100) - 1e-9);
}

function toSettings(s: SettingsRow): z.infer<typeof settingsShape> {
  return {
    labour_rate_per_hour: s.labourRatePerHour,
    utility_rate_per_hour: s.utilityRatePerHour,
    currency: s.currency,
    currency_symbol: s.currencySymbol,
    target_margin_percent: s.targetMarginPercent ?? 40,
    quote_footer_text: s.quoteFooterText ?? `Prices in ${s.currency}`,
  };
}

// ---------- spreadsheet import engine ----------
//
// Imports run in two phases over the same analysis: previewImport analyses
// and reports without writing; importData analyses and then applies the
// planned writes. Two modes:
//   merge   — prices and sales append as new records; recipes, components,
//             and packaging matched by name are updated in place; new
//             names are added; nothing is ever deleted.
//   replace — each included dataset is wiped first, then loaded fresh.
// The analysis is tolerant of her real sheets: recipe/component sheets in
// both the line format (recipe_name, variant_name, line_type, item_name —
// line_type in any case) and the original format (ingredient_name), sales
// sheets with human headers and margins stored as decimal fractions, and
// dates written as DD-MM-YYYY strings.

type ImportKind =
  | "ingredients"
  | "packaging"
  | "components"
  | "recipes"
  | "sales"
  | "settings";
type ImportMode = "merge" | "replace";
type RowMap = Record<string, string | number | null>;

interface DatasetSummary {
  rows_read: number;
  created: number;
  updated: number;
  appended: number;
  skipped: { row: number; reason: string }[];
  warnings: string[];
  error: string | null;
  detail: string | null;
}

const emptySummary = (): DatasetSummary => ({
  rows_read: 0,
  created: 0,
  updated: 0,
  appended: 0,
  skipped: [],
  warnings: [],
  error: null,
  detail: null,
});

const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function impCell(row: RowMap, ...keys: string[]): string | number | null {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}
const impStr = (v: string | number | null): string =>
  v == null ? "" : String(v).trim();
function impNum(v: string | number | null): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = v.replace(/[$,]/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
function impDate(v: string | number | null, fallback: string): string {
  if (v == null || v === "") return fallback;
  if (typeof v === "number") {
    // Excel serial date: days since 1899-12-30.
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().split("T")[0] ?? fallback;
  }
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const a = parseInt(dmy[1] ?? "0", 10);
    const b = parseInt(dmy[2] ?? "0", 10);
    const y = dmy[3] ?? "1970";
    // Her sheets write dates day-first ("23-07-2025"). "07-23-2025" can
    // only be month-first, so that one shape is honoured; everything else
    // — including the ambiguous "05-06-2025" — reads day-first. (The old
    // code fell through to `new Date(s)` for ambiguous dates, which
    // parses them month-first and silently moved the date by months.)
    if (b > 12 && a >= 1 && a <= 12) {
      return `${y}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
    }
    if (a >= 1 && a <= 31 && b >= 1 && b <= 12) {
      return `${y}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }
    return fallback;
  }
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0] ?? fallback;
  }
  return s;
}
/** The spreadsheet row number for a parsed row (header is row 1). */
const impRowNo = (row: RowMap, idx: number): number => {
  const n = row.__row;
  return typeof n === "number" && n >= 1 ? n : idx + 2;
};
const columnsFound = (row: RowMap): string =>
  Object.keys(row)
    .filter((k) => k !== "__row")
    .slice(0, 10)
    .join(", ");

type IngredientRowT = typeof schema.ingredients.$inferSelect;
type RecipeRowT = typeof schema.recipes.$inferSelect;
type SaleRowT = typeof schema.sales.$inferSelect;

type ImportOp =
  | { type: "deleteAll"; table: "ingredientPrices" | "ingredients" | "packaging" | "components" | "recipes" | "sales" }
  | { type: "deleteBlob"; key: string }
  | { type: "clearSnapshots" }
  | { type: "insertIngredient"; row: IngredientRowT }
  | { type: "insertPrice"; row: PriceRow }
  | { type: "applyLatest"; ingredientId: string; priceId: string }
  | { type: "insertPackaging"; row: PackagingRow }
  | { type: "updatePackaging"; row: PackagingRow }
  | { type: "insertComponent"; row: ComponentRow }
  | { type: "updateComponent"; row: ComponentRow }
  | { type: "insertRecipe"; row: RecipeRowT }
  | { type: "updateRecipe"; row: RecipeRowT }
  | { type: "insertSale"; row: SaleRowT }
  | { type: "updateSettingsRow"; row: SettingsRow };

interface ImportWorld {
  ingredientIdByName: Map<string, string>;
  priceCandidates: Map<string, { id: string; date: string; seq: number }[]>;
  priceLookup: { ingredientId: string; store: string; brand: string; id: string }[];
  packagingIdByName: Map<string, string>;
  packagingRowById: Map<string, PackagingRow>;
  componentIdByName: Map<string, string>;
  componentRowById: Map<string, ComponentRow>;
  // Full variant label ("dark chocolate ganache — 6-inch") and plain
  // component name → the component + variant a recipe line refers to.
  componentVariantByName: Map<string, { componentId: string; variantId: string }>;
  recipeIdByName: Map<string, string>;
  recipeRowById: Map<string, RecipeRowT>;
  saleKeys: Set<string>;
  seq: number;
}

const saleKey = (
  date: string,
  recipe: string,
  variant: string,
  customer: string,
  price: number,
) => [date, normName(recipe), normName(variant), normName(customer), price].join("|");

/** Find-or-create an ingredient referenced by a recipe/component line. */
function ensureIngredient(
  world: ImportWorld,
  ops: ImportOp[],
  summary: DatasetSummary,
  warned: Set<string>,
  name: string,
  unit: string,
): string {
  const key = normName(name);
  const found = world.ingredientIdByName.get(key);
  if (found) return found;
  const id = uid();
  ops.push({
    type: "insertIngredient",
    row: { id, name, defaultUnit: unit || "g", notes: null, createdAt: nowIso() },
  });
  world.ingredientIdByName.set(key, id);
  if (!warned.has(key)) {
    warned.add(key);
    summary.warnings.push(
      `“${name}” isn't in your ingredients yet — it will be added without a price, so lines using it cost $0 until a price is added.`,
    );
  }
  return id;
}

/** Resolves a line's optional price_store / price_brand override columns. */
function resolveOverride(
  world: ImportWorld,
  summary: DatasetSummary,
  warned: Set<string>,
  ingredientId: string,
  ingredientName: string,
  row: RowMap,
): string | null {
  const store = impStr(impCell(row, "price_store"));
  if (!store) return null;
  const brand = impStr(impCell(row, "price_brand"));
  const hit = world.priceLookup.find(
    (p) =>
      p.ingredientId === ingredientId &&
      p.store === normName(store) &&
      (brand === "" || p.brand === normName(brand)),
  );
  if (!hit) {
    const msg = `No ${store} price found for “${ingredientName}” — that line will use the ingredient's latest price instead.`;
    if (!warned.has(msg)) {
      warned.add(msg);
      summary.warnings.push(msg);
    }
    return null;
  }
  return hit.id;
}

function processIngredients(
  rows: RowMap[],
  world: ImportWorld,
  ops: ImportOp[],
  mode: ImportMode,
): DatasetSummary {
  const s = emptySummary();
  s.rows_read = rows.length;
  const first = rows[0];
  if (!first) return s;
  if (!("ingredient_name" in first)) {
    s.error = `This doesn't look like an ingredient pricing sheet — there's no “ingredient_name” column. Columns found: ${columnsFound(first)}.`;
    return s;
  }
  if (mode === "replace") {
    ops.push({ type: "deleteAll", table: "ingredientPrices" });
    ops.push({ type: "deleteAll", table: "ingredients" });
  }
  const touched = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const rn = impRowNo(row, i);
    const name = impStr(impCell(row, "ingredient_name"));
    if (!name || name.toLowerCase() === "none") {
      s.skipped.push({ row: rn, reason: "No ingredient name in this row." });
      continue;
    }
    const priceCell = impCell(row, "purchase_price");
    const sizeCellRaw = impCell(row, "package_size");
    if (
      (priceCell == null || priceCell === "") &&
      (sizeCellRaw == null || sizeCellRaw === "")
    ) {
      // A name-only row (the backup workbook writes one for an ingredient
      // that has no prices yet): keep the ingredient itself so a restore
      // doesn't lose it, and say plainly that it has no price.
      const key0 = normName(name);
      if (!world.ingredientIdByName.has(key0)) {
        const id0 = uid();
        ops.push({
          type: "insertIngredient",
          row: {
            id: id0,
            name,
            defaultUnit: impStr(impCell(row, "unit")) || "g",
            notes: null,
            createdAt: nowIso(),
          },
        });
        world.ingredientIdByName.set(key0, id0);
        s.created++;
      }
      s.warnings.push(
        `Row ${rn}: “${name}” has no price in the sheet — added as an ingredient without a price, so lines using it cost $0 until a price is added.`,
      );
      continue;
    }
    const price = impNum(priceCell);
    if (price == null || price < 0) {
      s.skipped.push({
        row: rn,
        reason: `“${name}” has no usable purchase price — the cell is empty or isn't a number.`,
      });
      continue;
    }
    const size = impNum(impCell(row, "package_size"));
    if (size == null || size <= 0) {
      s.skipped.push({
        row: rn,
        reason: `“${name}” has no usable package size — it must be a number more than zero.`,
      });
      continue;
    }
    const unit = impStr(impCell(row, "unit")) || "g";
    const vendor = impStr(impCell(row, "store_vendor")) || "Default";
    const brand = impStr(impCell(row, "brand", "notes")) || null;
    const date = impDate(impCell(row, "purchase_date"), todayStr());
    const key = normName(name);
    let ingId = world.ingredientIdByName.get(key);
    if (!ingId) {
      ingId = uid();
      ops.push({
        type: "insertIngredient",
        row: { id: ingId, name, defaultUnit: unit, notes: null, createdAt: nowIso() },
      });
      world.ingredientIdByName.set(key, ingId);
      s.created++;
    }
    const priceId = uid();
    ops.push({
      type: "insertPrice",
      row: {
        id: priceId,
        ingredientId: ingId,
        ingredientName: name,
        storeVendor: vendor,
        purchasePrice: price,
        packageSize: size,
        unit,
        unitCost: price / size,
        purchaseDate: date,
        isLatest: false,
        notes: brand,
      },
    });
    s.appended++;
    touched.add(ingId);
    const cand = world.priceCandidates.get(ingId) ?? [];
    cand.push({ id: priceId, date, seq: world.seq++ });
    world.priceCandidates.set(ingId, cand);
    world.priceLookup.push({
      ingredientId: ingId,
      store: normName(vendor),
      brand: normName(brand ?? ""),
      id: priceId,
    });
  }
  // The newest purchase (by date, then file order) becomes the latest price.
  for (const ingId of touched) {
    const cand = world.priceCandidates.get(ingId) ?? [];
    let best: { id: string; date: string; seq: number } | undefined;
    for (const c of cand) {
      if (!best || c.date > best.date || (c.date === best.date && c.seq > best.seq)) {
        best = c;
      }
    }
    if (best) ops.push({ type: "applyLatest", ingredientId: ingId, priceId: best.id });
  }
  return s;
}

function processPackaging(
  rows: RowMap[],
  world: ImportWorld,
  ops: ImportOp[],
  mode: ImportMode,
): DatasetSummary {
  const s = emptySummary();
  s.rows_read = rows.length;
  const first = rows[0];
  if (!first) return s;
  if (!("packaging_name" in first)) {
    s.error = `This doesn't look like a packaging sheet — there's no “packaging_name” column. Columns found: ${columnsFound(first)}.`;
    return s;
  }
  if (mode === "replace") ops.push({ type: "deleteAll", table: "packaging" });
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const rn = impRowNo(row, i);
    const name = impStr(impCell(row, "packaging_name"));
    if (!name || name.toLowerCase() === "none") {
      s.skipped.push({ row: rn, reason: "No packaging name in this row." });
      continue;
    }
    const priceCell = impCell(row, "purchase_price");
    const price = impNum(priceCell);
    if (priceCell != null && priceCell !== "" && (price == null || price < 0)) {
      s.skipped.push({
        row: rn,
        reason: `“${name}” has a purchase price that isn't a number.`,
      });
      continue;
    }
    const sizeCell = impCell(row, "package_size");
    const size = impNum(sizeCell);
    if (sizeCell != null && sizeCell !== "" && (size == null || size <= 0)) {
      s.skipped.push({
        row: rn,
        reason: `“${name}” has a package size that isn't a number more than zero.`,
      });
      continue;
    }
    const finalPrice = price ?? 0;
    const finalSize = size ?? 1;
    const key = normName(name);
    const existingId = world.packagingIdByName.get(key);
    const existing = existingId ? world.packagingRowById.get(existingId) : undefined;
    const record: PackagingRow = {
      id: existing?.id ?? uid(),
      name: existing?.name ?? name,
      storeVendor: impStr(impCell(row, "store_vendor")),
      purchasePrice: finalPrice,
      packageSize: finalSize,
      unitCost: finalPrice / finalSize,
      unit: impStr(impCell(row, "unit")) || "piece",
      purchaseDate: impDate(impCell(row, "purchase_date"), ""),
      notes: impStr(impCell(row, "notes")) || null,
      createdAt: existing?.createdAt ?? nowIso(),
    };
    if (existing) {
      ops.push({ type: "updatePackaging", row: record });
      s.updated++;
    } else {
      ops.push({ type: "insertPackaging", row: record });
      world.packagingIdByName.set(key, record.id);
      s.created++;
    }
    world.packagingRowById.set(record.id, record);
  }
  return s;
}

interface LineGroup {
  displayName: string;
  rows: { row: RowMap; idx: number }[];
}

function groupRows(
  rows: RowMap[],
  keyOf: (row: RowMap) => string | null,
  nameOf: (row: RowMap) => string,
): LineGroup[] {
  const map = new Map<string, LineGroup>();
  rows.forEach((row, idx) => {
    const key = keyOf(row);
    if (key == null) return;
    let g = map.get(key);
    if (!g) {
      g = { displayName: nameOf(row), rows: [] };
      map.set(key, g);
    }
    g.rows.push({ row, idx });
  });
  return [...map.values()];
}

/** Her recipe sheet has a few rows where the item name and quantity were
 *  typed into one cell (`Cake Board - 8",1"`) and the unit landed in the
 *  quantity column. Recognise that exact shape and split it back apart. */
function splitMergedNameQty(
  itemName: string,
  qtyCell: string | number | null,
  unitCell: string | number | null,
): { itemName: string; quantity: number; unit: string } | null {
  if (impNum(qtyCell) != null) return null; // quantity is fine as-is
  const m = itemName.match(/^(.+)",(\d+(?:\.\d+)?)"$/);
  if (!m || m[1] == null || m[2] == null) return null;
  return {
    itemName: `${m[1]}"`,
    quantity: parseFloat(m[2]),
    unit: impStr(unitCell) || impStr(qtyCell),
  };
}

const firstNum = (g: LineGroup, ...keys: string[]): number | null => {
  for (const { row } of g.rows) {
    const n = impNum(impCell(row, ...keys));
    if (n != null) return n;
  }
  return null;
};
const firstStr = (g: LineGroup, ...keys: string[]): string => {
  for (const { row } of g.rows) {
    const v = impStr(impCell(row, ...keys));
    if (v) return v;
  }
  return "";
};

/** Splits a sized component name ("Dark Chocolate Ganache — 6-inch")
 *  into its component and variant names on the last " — " — the same
 *  split the workbook export writes and migration 0006 applied. */
function splitComponentName(name: string): { base: string; variant: string } {
  const cut = name.lastIndexOf(" — ");
  if (cut > 0) {
    return { base: name.slice(0, cut), variant: name.slice(cut + 3) };
  }
  return { base: name, variant: "Standard" };
}

/** Registers a component and each of its variants in the import world
 *  so recipe lines can resolve "Name — Size" (or a plain name, which
 *  lands on the first variant) to a component + variant id pair. */
function registerComponentInWorld(world: ImportWorld, row: ComponentRow): void {
  world.componentIdByName.set(normName(row.name), row.id);
  world.componentRowById.set(row.id, row);
  const variants = componentVariantsOf(row);
  variants.forEach((v, i) => {
    const label = componentVariantLabel(row.name, v, variants.length);
    world.componentVariantByName.set(normName(label), {
      componentId: row.id,
      variantId: v.id,
    });
    if (i === 0) {
      const plain = normName(row.name);
      if (!world.componentVariantByName.has(plain)) {
        world.componentVariantByName.set(plain, {
          componentId: row.id,
          variantId: v.id,
        });
      }
    }
  });
}

function processComponents(
  rows: RowMap[],
  world: ImportWorld,
  ops: ImportOp[],
  mode: ImportMode,
): DatasetSummary {
  const s = emptySummary();
  s.rows_read = rows.length;
  const first = rows[0];
  if (!first) return s;
  const native = "component_name" in first;
  if (!native && !("recipe_name" in first)) {
    s.error = `This doesn't look like a components sheet — there's no “component_name” or “recipe_name” column. Columns found: ${columnsFound(first)}.`;
    return s;
  }
  if (mode === "replace") ops.push({ type: "deleteAll", table: "components" });
  const warned = new Set<string>();
  // Rows name either a component (native format — a sized name like
  // "Dark Chocolate Ganache — 6-inch" splits into component + variant)
  // or a recipe-style name + variant pair. Group by component first,
  // then by variant within it, so sizes land as variants of one
  // component, exactly like recipe sizes.
  const baseOf = (row: RowMap): { base: string; variant: string } | null => {
    if (native) {
      const n = impStr(impCell(row, "component_name"));
      return n ? splitComponentName(n) : null;
    }
    const n = impStr(impCell(row, "recipe_name"));
    if (!n) return null;
    const v = impStr(impCell(row, "variant_name"));
    return { base: n, variant: v || "Standard" };
  };
  const baseGroups = groupRows(
    rows,
    (row) => {
      const b = baseOf(row);
      return b ? normName(b.base) : null;
    },
    (row) => baseOf(row)?.base ?? "",
  );
  for (const bg of baseGroups) {
    const variantGroups = groupRows(
      bg.rows.map((r) => r.row),
      (row) => {
        const b = baseOf(row);
        return b ? normName(b.variant) : null;
      },
      (row) => baseOf(row)?.variant ?? "Standard",
    );
    // Re-pair the grouped rows with their original indices for row
    // numbers in skip/warning messages.
    const idxByRow = new Map(bg.rows.map((r) => [r.row, r.idx] as const));
    const key = normName(bg.displayName);
    const existingId = world.componentIdByName.get(key);
    const existing = existingId ? world.componentRowById.get(existingId) : undefined;
    const existingVariants = existing ? componentVariantsOf(existing) : [];
    const variants: ComponentVariant[] = [];
    for (const g of variantGroups) {
      const label =
        g.displayName === "Standard"
          ? bg.displayName
          : `${bg.displayName} — ${g.displayName}`;
      const lines: RecipeLineItem[] = [];
      const packLines: PackagingLineItem[] = [];
      for (const row of g.rows.map((r) => r.row)) {
        const idx = idxByRow.get(row) ?? 0;
        const rn = impRowNo(row, idx);
      const rawType = impStr(impCell(row, "line_type"));
      const lineType = rawType ? rawType.toLowerCase() : "ingredient";
      let itemName = impStr(
        impCell(row, "item_name", "ingredient_name", "packaging_name"),
      );
      if (!itemName) continue; // metadata-only row (carries times / yield)
      let qty = impNum(impCell(row, "quantity"));
      let unitCell = impStr(impCell(row, "unit"));
      if (qty == null) {
        const repaired = splitMergedNameQty(
          itemName,
          impCell(row, "quantity"),
          impCell(row, "unit"),
        );
        if (repaired) {
          s.warnings.push(
            `Row ${rn}: the name cell read “${itemName}” — taken as ${repaired.itemName} × ${repaired.quantity}. Worth fixing in the sheet itself.`,
          );
          itemName = repaired.itemName;
          qty = repaired.quantity;
          unitCell = repaired.unit;
        }
      }
      if (lineType === "ingredient") {
        if (qty == null) {
          s.skipped.push({
            row: rn,
            reason: `“${itemName}” has no usable quantity — the cell is empty or isn't a number.`,
          });
          continue;
        }
        const unit = unitCell || "g";
        const ingId = ensureIngredient(world, ops, s, warned, itemName, unit);
        lines.push({
          id: uid(),
          ingredient_id: ingId,
          ingredient_name: itemName,
          quantity: qty,
          unit,
          price_id_override: resolveOverride(world, s, warned, ingId, itemName, row),
        });
      } else if (lineType === "packaging") {
        const pkgId = world.packagingIdByName.get(normName(itemName));
        if (!pkgId) {
          s.skipped.push({
            row: rn,
            reason: `Packaging “${itemName}” isn't in the tool yet — import the Packaging sheet first, then re-import this one.`,
          });
          continue;
        }
        if (qty == null) {
          s.skipped.push({
            row: rn,
            reason: `“${itemName}” has no usable quantity — the cell is empty or isn't a number.`,
          });
          continue;
        }
        packLines.push({
          id: uid(),
          packaging_id: pkgId,
          packaging_name: itemName,
          quantity: qty,
        });
      } else if (lineType === "component") {
        s.skipped.push({
          row: rn,
          reason: `Components can't contain other components — the “${itemName}” line was skipped.`,
        });
      } else {
        s.skipped.push({
          row: rn,
          reason: `Unknown line type “${rawType}” — expected ingredient or packaging.`,
        });
      }
    }
      let yieldGrams = firstNum(g, "batch_yield_grams");
      if (yieldGrams == null) {
        // Her component sheets carry no yield column: the batch weighs
        // what its gram-measured ingredients weigh.
        yieldGrams = round2(
          lines.reduce(
            (sum, l) => sum + (l.unit === "g" ? l.quantity : 0),
            0,
          ),
        );
        if (yieldGrams > 0) {
          s.warnings.push(
            `“${label}” has no batch yield in the sheet — set to ${yieldGrams} g (the total weight of its ingredients). Check it in Components if the real yield differs.`,
          );
        }
      }
      // A merge re-import keeps the existing variant's id for a
      // same-named variant, so recipe lines that point at it keep
      // costing (same rule as recipe variants and cost history).
      const oldVariant = existingVariants.find(
        (v) => normName(v.name) === normName(g.displayName),
      );
      variants.push({
        id: oldVariant?.id ?? uid(),
        name: g.displayName,
        batch_yield_grams: yieldGrams,
        ingredients: lines,
        packaging: packLines,
        prep_time_minutes: firstNum(g, "prep_time_minutes") ?? 0,
        utility_time_minutes: firstNum(g, "utility_time_minutes"),
        notes: null,
      });
    }
    const firstVariant = variants[0];
    if (!firstVariant) continue;
    const allRows: LineGroup = { displayName: bg.displayName, rows: bg.rows };
    const record: ComponentRow = {
      id: existing?.id ?? uid(),
      name: existing?.name ?? bg.displayName,
      // Legacy columns mirror the first variant.
      batchYieldGrams: firstVariant.batch_yield_grams,
      ingredients: firstVariant.ingredients,
      packaging: firstVariant.packaging,
      prepTimeMinutes: firstVariant.prep_time_minutes,
      utilityTimeMinutes: firstVariant.utility_time_minutes ?? null,
      notes: firstStr(allRows, "notes") || null,
      variants,
      createdAt: existing?.createdAt ?? nowIso(),
    };
    if (existing) {
      ops.push({ type: "updateComponent", row: record });
      s.updated++;
    } else {
      ops.push({ type: "insertComponent", row: record });
      s.created++;
    }
    registerComponentInWorld(world, record);
  }
  return s;
}

function processRecipes(
  rows: RowMap[],
  world: ImportWorld,
  ops: ImportOp[],
  mode: ImportMode,
  existingRecipes: RecipeRowT[],
): DatasetSummary {
  const s = emptySummary();
  s.rows_read = rows.length;
  const first = rows[0];
  if (!first) return s;
  if (!("recipe_name" in first)) {
    s.error = `This doesn't look like a recipes sheet — there's no “recipe_name” column. Columns found: ${columnsFound(first)}.`;
    return s;
  }
  const hasLineType = "line_type" in first;
  if (!hasLineType && !("ingredient_name" in first) && !("item_name" in first)) {
    s.error = `This recipes sheet has no line columns — expected “line_type” + “item_name” (or the older “ingredient_name”). Columns found: ${columnsFound(first)}.`;
    return s;
  }
  if (mode === "replace") {
    ops.push({ type: "deleteAll", table: "recipes" });
    ops.push({ type: "clearSnapshots" });
    for (const r of existingRecipes) {
      if (r.photoBlobKey) ops.push({ type: "deleteBlob", key: r.photoBlobKey });
    }
    s.warnings.push(
      "Replace mode: all current recipes — including their photos — are deleted before the new ones load.",
    );
  }
  const warned = new Set<string>();
  // Group rows into recipes, then variants within each recipe.
  interface VariantGroup extends LineGroup {
    variantName: string;
  }
  interface RecipeGroup {
    displayName: string;
    variants: VariantGroup[];
    variantByKey: Map<string, VariantGroup>;
    allRows: { row: RowMap; idx: number }[];
  }
  const recipeGroups: RecipeGroup[] = [];
  const recipeByKey = new Map<string, RecipeGroup>();
  rows.forEach((row, idx) => {
    const recipeName = impStr(impCell(row, "recipe_name"));
    if (!recipeName) {
      s.skipped.push({
        row: impRowNo(row, idx),
        reason: "No recipe name in this row.",
      });
      return;
    }
    const variantName = impStr(impCell(row, "variant_name")) || "Standard";
    const rKey = normName(recipeName);
    let rg = recipeByKey.get(rKey);
    if (!rg) {
      rg = { displayName: recipeName, variants: [], variantByKey: new Map(), allRows: [] };
      recipeByKey.set(rKey, rg);
      recipeGroups.push(rg);
    }
    rg.allRows.push({ row, idx });
    const vKey = normName(variantName);
    let vg = rg.variantByKey.get(vKey);
    if (!vg) {
      vg = { displayName: variantName, variantName, rows: [] };
      rg.variantByKey.set(vKey, vg);
      rg.variants.push(vg);
    }
    vg.rows.push({ row, idx });
  });

  for (const rg of recipeGroups) {
    const variants: RecipeVariant[] = [];
    for (const vg of rg.variants) {
      const vIng: RecipeLineItem[] = [];
      const vPack: PackagingLineItem[] = [];
      const vComp: ComponentRecipeRef[] = [];
      for (const { row, idx } of vg.rows) {
        const rn = impRowNo(row, idx);
        const rawType = impStr(impCell(row, "line_type"));
        const lineType = rawType ? rawType.toLowerCase() : "ingredient";
        let itemName = impStr(
          impCell(
            row,
            "item_name",
            "ingredient_name",
            lineType === "packaging"
              ? "packaging_name"
              : lineType === "component"
                ? "component_name"
                : "ingredient_name",
          ),
        );
        if (!itemName) continue; // metadata-only row
        let qty = impNum(impCell(row, "quantity"));
        let unitCell = impStr(impCell(row, "unit"));
        if (qty == null) {
          const repaired = splitMergedNameQty(
            itemName,
            impCell(row, "quantity"),
            impCell(row, "unit"),
          );
          if (repaired) {
            s.warnings.push(
              `Row ${rn}: the name cell read “${itemName}” — taken as ${repaired.itemName} × ${repaired.quantity}. Worth fixing in the sheet itself.`,
            );
            itemName = repaired.itemName;
            qty = repaired.quantity;
            unitCell = repaired.unit;
          }
        }
        if (lineType === "ingredient") {
          if (qty == null) {
            s.skipped.push({
              row: rn,
              reason: `“${itemName}” has no usable quantity — the cell is empty or isn't a number.`,
            });
            continue;
          }
          const unit = unitCell || "g";
          const ingId = ensureIngredient(world, ops, s, warned, itemName, unit);
          vIng.push({
            id: uid(),
            ingredient_id: ingId,
            ingredient_name: itemName,
            quantity: qty,
            unit,
            price_id_override: resolveOverride(world, s, warned, ingId, itemName, row),
          });
        } else if (lineType === "packaging") {
          const pkgId = world.packagingIdByName.get(normName(itemName));
          if (!pkgId) {
            s.skipped.push({
              row: rn,
              reason: `Packaging “${itemName}” isn't in the tool yet — import the Packaging sheet first, then re-import this one.`,
            });
            continue;
          }
          if (qty == null) {
            s.skipped.push({
              row: rn,
              reason: `“${itemName}” has no usable quantity — the cell is empty or isn't a number.`,
            });
            continue;
          }
          vPack.push({
            id: uid(),
            packaging_id: pkgId,
            packaging_name: itemName,
            quantity: qty,
          });
        } else if (lineType === "component") {
          // A line names a component variant ("Dark Chocolate Ganache —
          // 6-inch") or a plain component name (its first variant).
          const hit = world.componentVariantByName.get(normName(itemName));
          const compId =
            hit?.componentId ?? world.componentIdByName.get(normName(itemName));
          if (!compId) {
            s.skipped.push({
              row: rn,
              reason: `Component “${itemName}” isn't in the tool yet — import the Components sheet first, then re-import this one.`,
            });
            continue;
          }
          if (qty == null) {
            s.skipped.push({
              row: rn,
              reason: `“${itemName}” has no usable quantity — the cell is empty or isn't a number.`,
            });
            continue;
          }
          const unit = unitCell.toLowerCase();
          vComp.push({
            id: uid(),
            component_recipe_id: compId,
            component_name: itemName,
            quantity: qty,
            use_gram_costing: unit === "g" || unit === "gram" || unit === "grams",
            component_variant_id: hit?.variantId ?? null,
          });
        } else {
          s.skipped.push({
            row: rn,
            reason: `Unknown line type “${rawType}” — expected ingredient, packaging, or component.`,
          });
        }
      }
      variants.push({
        id: uid(),
        name: vg.variantName,
        ingredients: vIng,
        packaging: vPack,
        components: vComp,
        prep_time_minutes: firstNum(vg, "prep_time_minutes") ?? 0,
        utility_time_minutes: firstNum(vg, "utility_time_minutes"),
        notes: hasLineType ? firstStr(vg, "notes") || null : null,
      });
    }
    const recipeLevel: LineGroup = { displayName: rg.displayName, rows: rg.allRows };
    const explicitNotes = firstStr(recipeLevel, "recipe_notes");
    const record: RecipeRowT = {
      id: uid(),
      name: rg.displayName,
      category: firstStr(recipeLevel, "category") || null,
      notes:
        explicitNotes ||
        (hasLineType ? null : firstStr(recipeLevel, "notes") || null),
      photoBlobKey: null,
      variants,
      createdAt: nowIso(),
    };
    const key = normName(rg.displayName);
    const existingId = world.recipeIdByName.get(key);
    const existing = existingId ? world.recipeRowById.get(existingId) : undefined;
    if (existing) {
      // Keep the existing variant ids for same-named variants: cost
      // history snapshots are keyed by variant id, so regenerating them
      // on every merge re-import orphaned the whole history (the recipe
      // view filters snapshots by the current variant id and showed
      // none) and broke anything else holding a variant id.
      const oldByName = new Map(
        existing.variants.map((v) => [normName(v.name), v.id]),
      );
      for (const v of record.variants) {
        const oldId = oldByName.get(normName(v.name));
        if (oldId) v.id = oldId;
      }
      record.id = existing.id;
      record.name = existing.name;
      record.photoBlobKey = existing.photoBlobKey;
      record.createdAt = existing.createdAt;
      ops.push({ type: "updateRecipe", row: record });
      s.updated++;
    } else {
      ops.push({ type: "insertRecipe", row: record });
      world.recipeIdByName.set(key, record.id);
      s.created++;
    }
    world.recipeRowById.set(record.id, record);
  }
  return s;
}

function processSales(
  rows: RowMap[],
  world: ImportWorld,
  ops: ImportOp[],
  mode: ImportMode,
): DatasetSummary {
  const s = emptySummary();
  s.rows_read = rows.length;
  const first = rows[0];
  if (!first) return s;
  let eventCount = 0;
  const hasRecipe = "recipe_name" in first || "recipe" in first;
  const hasPrice = "selling_price" in first;
  if (!hasRecipe || !hasPrice) {
    s.error = `This doesn't look like a sales sheet — it needs a recipe column and a selling price column. Columns found: ${columnsFound(first)}.`;
    return s;
  }
  if (mode === "replace") ops.push({ type: "deleteAll", table: "sales" });
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const rn = impRowNo(row, i);
    const recipeName = impStr(impCell(row, "recipe_name", "recipe"));
    if (!recipeName) {
      s.skipped.push({ row: rn, reason: "No recipe name in this row." });
      continue;
    }
    const selling = impNum(impCell(row, "selling_price"));
    if (selling == null || selling < 0) {
      s.skipped.push({
        row: rn,
        reason: `The sale of “${recipeName}” has no usable selling price — the cell is empty or isn't a number.`,
      });
      continue;
    }
    const totalCost = impNum(impCell(row, "total_cost")) ?? 0;
    const profit = impNum(impCell(row, "profit")) ?? round2(selling - totalCost);
    const marginRaw = impNum(impCell(row, "profit_margin"));
    // Her sales sheet stores the margin as a decimal fraction (0.32);
    // the app's own CSV export stores percent (32). Both are accepted.
    // A bare "≤1 means fraction" rule misreads a genuine percent margin
    // of 1% or less (a $100 sale with $0.50 profit exports as 0.5 and
    // would come back as 50%), so when the row's own profit and price
    // pin the true margin down, whichever reading sits closer to it wins.
    let margin: number;
    if (marginRaw == null) {
      margin = selling > 0 ? round2((profit / selling) * 100) : 0;
    } else if (selling > 0) {
      const trueMargin = (profit / selling) * 100;
      const asPercent = Math.abs(marginRaw - trueMargin);
      const asFraction = Math.abs(marginRaw * 100 - trueMargin);
      margin = asFraction < asPercent ? round2(marginRaw * 100) : marginRaw;
    } else {
      margin = Math.abs(marginRaw) <= 1 ? round2(marginRaw * 100) : marginRaw;
    }
    const date = impDate(impCell(row, "sale_date"), todayStr());
    const variant = impStr(impCell(row, "variant_name", "variant"));
    const customer = impStr(impCell(row, "customer_name", "customer"));
    // The sheet carries one customer column; the app stores first and
    // last separately (only the first name is required — a row with a
    // single-word customer, i.e. a blank last name, imports fine).
    // Split on the first space — the same mapping migration 0006
    // applied to older rows.
    const spaceAt = customer.indexOf(" ");
    const customerFirst =
      spaceAt > 0 ? customer.slice(0, spaceAt) : customer;
    const customerLast = spaceAt > 0 ? customer.slice(spaceAt + 1) : "";
    // The Customer/Event distinction: the backup workbook writes a
    // "Sale Type" column (Customer / Event); older sheets without it
    // import everything as customer sales.
    const saleType =
      impStr(impCell(row, "sale_type", "type")).toLowerCase() === "event"
        ? "event"
        : "customer";
    if (mode === "merge") {
      const key = saleKey(date, recipeName, variant, customer, selling);
      if (world.saleKeys.has(key)) {
        s.skipped.push({
          row: rn,
          reason: `This ${recipeName} sale (${date}, ${customer || "no customer"}, $${selling}) is already recorded — skipped as an exact duplicate.`,
        });
        continue;
      }
      world.saleKeys.add(key);
    }
    ops.push({
      type: "insertSale",
      row: {
        id: uid(),
        recipeId: world.recipeIdByName.get(normName(recipeName)) ?? "",
        recipeName,
        variantName: variant,
        saleDate: date,
        customerName: customer,
        customerFirstName: customerFirst,
        customerLastName: customerLast,
        saleType,
        notes: impStr(impCell(row, "notes")),
        sellingPrice: selling,
        totalCost,
        labourCost: impNum(impCell(row, "labour_cost")) ?? 0,
        profit,
        profitMargin: margin,
        createdAt: nowIso(),
      },
    });
    if (saleType === "event") eventCount++;
    s.appended++;
  }
  if (eventCount > 0) {
    s.detail = `${eventCount} of the sales are event sales (Sale Type: Event) — the rest are customer sales.`;
  }
  return s;
}

function processSettings(
  rows: RowMap[],
  current: SettingsRow,
): { summary: DatasetSummary; row: SettingsRow | null } {
  const s = emptySummary();
  s.rows_read = rows.length;
  const next: SettingsRow = { ...current };
  let recognized = 0;
  for (const row of rows) {
    const key = impStr(impCell(row, "setting", "key", "name"))
      .toLowerCase()
      .replace(/\s+/g, "_");
    const value = impCell(row, "value");
    if (key === "labour_rate_per_hour") {
      const n = impNum(value);
      if (n != null && n >= 0) {
        next.labourRatePerHour = n;
        recognized++;
      }
    } else if (key === "utility_rate_per_hour") {
      const n = impNum(value);
      if (n != null && n >= 0) {
        next.utilityRatePerHour = n;
        recognized++;
      }
    } else if (key === "currency") {
      const v = impStr(value);
      if (v) {
        next.currency = v;
        recognized++;
      }
    } else if (key === "currency_symbol") {
      const v = impStr(value);
      if (v) {
        next.currencySymbol = v;
        recognized++;
      }
    } else if (key === "target_margin_percent") {
      const n = impNum(value);
      if (n != null && n >= 0 && n < 100) {
        next.targetMarginPercent = n;
        recognized++;
      }
    }
  }
  if (recognized === 0) {
    s.error =
      "No recognised settings rows — expected setting/value rows such as labour_rate_per_hour.";
    return { summary: s, row: null };
  }
  s.updated = 1;
  s.detail = `Labour $${next.labourRatePerHour}/hr · Utilities $${next.utilityRatePerHour}/hr · ${next.currency} (${next.currencySymbol})`;
  return { summary: s, row: next };
}

async function analyzeImport(
  ctx: Ctx,
  datasets: Partial<Record<ImportKind, RowMap[]>>,
  mode: ImportMode,
): Promise<{ summaries: Record<string, DatasetSummary>; ops: ImportOp[] }> {
  const db = ctx.db<typeof schema>();
  const ops: ImportOp[] = [];
  const summaries: Record<string, DatasetSummary> = {};
  const replaced = (k: ImportKind) => mode === "replace" && datasets[k] != null;
  const world: ImportWorld = {
    ingredientIdByName: new Map(),
    priceCandidates: new Map(),
    priceLookup: [],
    packagingIdByName: new Map(),
    packagingRowById: new Map(),
    componentIdByName: new Map(),
    componentRowById: new Map(),
    componentVariantByName: new Map(),
    recipeIdByName: new Map(),
    recipeRowById: new Map(),
    saleKeys: new Set(),
    seq: 0,
  };
  if (!replaced("ingredients")) {
    const ings = await db.select().from(schema.ingredients);
    for (const ing of ings) world.ingredientIdByName.set(normName(ing.name), ing.id);
    const prices = await db.select().from(schema.ingredientPrices);
    for (const p of prices) {
      const cand = world.priceCandidates.get(p.ingredientId) ?? [];
      cand.push({ id: p.id, date: p.purchaseDate, seq: world.seq++ });
      world.priceCandidates.set(p.ingredientId, cand);
      world.priceLookup.push({
        ingredientId: p.ingredientId,
        store: normName(p.storeVendor),
        brand: normName(p.notes ?? ""),
        id: p.id,
      });
    }
  }
  if (!replaced("packaging")) {
    const pkgs = await db.select().from(schema.packaging);
    for (const p of pkgs) {
      world.packagingIdByName.set(normName(p.name), p.id);
      world.packagingRowById.set(p.id, p);
    }
  }
  if (!replaced("components")) {
    const comps = await db.select().from(schema.componentRecipes);
    for (const c of comps) {
      registerComponentInWorld(world, c);
    }
  }
  const existingRecipes = await db.select().from(schema.recipes);
  if (!replaced("recipes")) {
    for (const r of existingRecipes) {
      world.recipeIdByName.set(normName(r.name), r.id);
      world.recipeRowById.set(r.id, r);
    }
  }
  if (!replaced("sales")) {
    const sales = await db.select().from(schema.sales);
    for (const sl of sales) {
      world.saleKeys.add(
        saleKey(sl.saleDate, sl.recipeName, sl.variantName, sl.customerName, sl.sellingPrice),
      );
    }
  }
  if (datasets.ingredients) {
    summaries.ingredients = processIngredients(datasets.ingredients, world, ops, mode);
    if (mode === "replace" && existingRecipes.length > 0) {
      summaries.ingredients.warnings.push(
        "Replace mode deletes every current ingredient and price first. Recipes keep their lines, but a line whose ingredient is gone costs $0 until that ingredient has a price again.",
      );
    }
  }
  if (datasets.packaging) {
    summaries.packaging = processPackaging(datasets.packaging, world, ops, mode);
    if (mode === "replace" && existingRecipes.length > 0 && !datasets.recipes) {
      summaries.packaging.warnings.push(
        "Replace mode deletes every current packaging item first and the new ones get new ids. Recipe and component lines that pointed at the old items will stop costing until the recipes are re-imported too (or the lines are re-picked in the editor).",
      );
    }
  }
  if (datasets.components) {
    summaries.components = processComponents(datasets.components, world, ops, mode);
    if (mode === "replace" && existingRecipes.length > 0 && !datasets.recipes) {
      summaries.components.warnings.push(
        "Replace mode deletes every current component first and the new ones get new ids. Recipe lines that pointed at the old components will stop costing until the recipes are re-imported too (or the lines are re-picked in the editor).",
      );
    }
  }
  if (datasets.recipes) {
    summaries.recipes = processRecipes(datasets.recipes, world, ops, mode, existingRecipes);
  }
  if (datasets.sales) {
    summaries.sales = processSales(datasets.sales, world, ops, mode);
  }
  if (datasets.settings) {
    const current = await getSettingsRow(db);
    const { summary, row } = processSettings(datasets.settings, current);
    summaries.settings = summary;
    if (row) ops.push({ type: "updateSettingsRow", row });
  }
  return { summaries, ops };
}

async function applyImportOps(ctx: Ctx, ops: ImportOp[]): Promise<void> {
  const db = ctx.db<typeof schema>();
  for (const op of ops) {
    switch (op.type) {
      case "deleteAll": {
        const table =
          op.table === "ingredientPrices"
            ? schema.ingredientPrices
            : op.table === "ingredients"
              ? schema.ingredients
              : op.table === "packaging"
                ? schema.packaging
                : op.table === "components"
                  ? schema.componentRecipes
                  : op.table === "recipes"
                    ? schema.recipes
                    : schema.sales;
        await db.delete(table);
        break;
      }
      case "deleteBlob":
        await ctx.blobs.delete(op.key).catch(() => undefined);
        break;
      case "clearSnapshots":
        await db.delete(schema.costSnapshots);
        break;
      case "insertIngredient":
        await db.insert(schema.ingredients).values(op.row);
        break;
      case "insertPrice":
        await db.insert(schema.ingredientPrices).values(op.row);
        break;
      case "applyLatest":
        await db
          .update(schema.ingredientPrices)
          .set({ isLatest: false })
          .where(eq(schema.ingredientPrices.ingredientId, op.ingredientId));
        await db
          .update(schema.ingredientPrices)
          .set({ isLatest: true })
          .where(eq(schema.ingredientPrices.id, op.priceId));
        break;
      case "insertPackaging":
        await db.insert(schema.packaging).values(op.row);
        break;
      case "updatePackaging": {
        const { id, ...rest } = op.row;
        await db.update(schema.packaging).set(rest).where(eq(schema.packaging.id, id));
        break;
      }
      case "insertComponent":
        await db.insert(schema.componentRecipes).values(op.row);
        break;
      case "updateComponent": {
        const { id, ...rest } = op.row;
        await db
          .update(schema.componentRecipes)
          .set(rest)
          .where(eq(schema.componentRecipes.id, id));
        break;
      }
      case "insertRecipe":
        await db.insert(schema.recipes).values(op.row);
        break;
      case "updateRecipe": {
        const { id, ...rest } = op.row;
        await db.update(schema.recipes).set(rest).where(eq(schema.recipes.id, id));
        break;
      }
      case "insertSale":
        await db.insert(schema.sales).values(op.row);
        break;
      case "updateSettingsRow": {
        const { id, ...rest } = op.row;
        await db.update(schema.settings).set(rest).where(eq(schema.settings.id, id));
        break;
      }
    }
  }
}

const importRowsSchema = z
  .array(z.record(z.string(), z.union([z.string(), z.number(), z.null()])))
  .max(20000);
const importRequestSchema = z.object({
  mode: z.enum(["merge", "replace"]),
  datasets: z.object({
    ingredients: importRowsSchema.optional(),
    packaging: importRowsSchema.optional(),
    components: importRowsSchema.optional(),
    recipes: importRowsSchema.optional(),
    sales: importRowsSchema.optional(),
    settings: importRowsSchema.optional(),
  }),
});
const importSummarySchema = z.object({
  mode: z.enum(["merge", "replace"]),
  applied: z.boolean(),
  datasets: z.record(
    z.string(),
    z.object({
      rows_read: z.number(),
      created: z.number(),
      updated: z.number(),
      appended: z.number(),
      skipped: z.array(z.object({ row: z.number(), reason: z.string() })),
      warnings: z.array(z.string()),
      error: z.string().nullable(),
      detail: z.string().nullable(),
    }),
  ),
});
type ImportSummary = z.infer<typeof importSummarySchema>;

type WorkbookSheet = { name: string; rows: (string | number | null)[][] };

/**
 * Builds the consolidated backup workbook's sheets — Ingredient Pricing,
 * Packaging, Components, Recipes, Sales History, and Settings — each in
 * the format the matching import accepts. Shared by exportWorkbookData
 * (raw sheets for the client) and prepareWorkbookBackup (a real .xlsx
 * file built and stored server-side).
 */
async function buildWorkbookSheets(db: Db): Promise<WorkbookSheet[]> {
  const settingsRow = await getSettingsRow(db);
  const ings = await db
    .select()
    .from(schema.ingredients)
    .orderBy(asc(schema.ingredients.name));
  const prices = await db
    .select()
    .from(schema.ingredientPrices)
    .orderBy(asc(schema.ingredientPrices.purchaseDate));
  const pkgs = await db
    .select()
    .from(schema.packaging)
    .orderBy(asc(schema.packaging.name));
  const comps = await db
    .select()
    .from(schema.componentRecipes)
    .orderBy(asc(schema.componentRecipes.name));
  const recs = await db
    .select()
    .from(schema.recipes)
    .orderBy(asc(schema.recipes.name));
  const saleRows = await db
    .select()
    .from(schema.sales)
    .orderBy(asc(schema.sales.saleDate), asc(schema.sales.createdAt));
  const priceById = new Map(prices.map((p) => [p.id, p]));

  type Cell = string | number | null;
  const sheets: { name: string; rows: Cell[][] }[] = [];

  // Ingredient Pricing — one row per price record, her sheet's columns.
  const ingRows: Cell[][] = [
    ["ingredient_name", "store_vendor", "purchase_price", "package_size", "unit", "purchase_date", "brand"],
  ];
  for (const ing of ings) {
    const mine = prices.filter((x) => x.ingredientId === ing.id);
    for (const p of mine) {
      ingRows.push([
        ing.name,
        p.storeVendor,
        p.purchasePrice,
        p.packageSize,
        p.unit,
        p.purchaseDate,
        p.notes,
      ]);
    }
    if (mine.length === 0) {
      // An ingredient with no prices still belongs in the backup —
      // the import reads this name-only row back as a priceless
      // ingredient instead of the ingredient vanishing on restore.
      ingRows.push([ing.name, null, null, null, ing.defaultUnit, null, null]);
    }
  }
  sheets.push({ name: "Ingredient Pricing", rows: ingRows });

  // Packaging — one row per item.
  const pkgRows: Cell[][] = [
    ["packaging_name", "store_vendor", "purchase_price", "package_size", "unit", "purchase_date", "notes"],
  ];
  for (const p of pkgs) {
    pkgRows.push([
      p.name,
      p.storeVendor,
      p.purchasePrice,
      p.packageSize,
      p.unit,
      p.purchaseDate || null,
      p.notes,
    ]);
  }
  sheets.push({ name: "Packaging", rows: pkgRows });

  // Components — her component-sheet layout: one row per line, per
  // size variant: recipe_name is the component, variant_name its size
  // (blank for a lone "Standard" variant), metadata on each variant's
  // first row, the component's notes on its very first row.
  const compRows: Cell[][] = [
    ["recipe_name", "variant_name", "line_type", "item_name", "quantity", "unit", "prep_time_minutes", "utility_time_minutes", "batch_yield_grams", "notes"],
  ];
  for (const c of comps) {
    const variants = componentVariantsOf(c);
    let compFirst = true;
    for (const v of variants) {
      const variantName =
        variants.length <= 1 && v.name === "Standard" ? "" : v.name;
      let first = true;
      const meta = (): Cell[] =>
        first
          ? [
              v.prep_time_minutes || null,
              v.utility_time_minutes ?? null,
              v.batch_yield_grams || null,
              compFirst ? c.notes : null,
            ]
          : [null, null, null, null];
      for (const l of v.ingredients) {
        compRows.push([c.name, variantName, "ingredient", l.ingredient_name, l.quantity, l.unit, ...meta()]);
        first = false;
        compFirst = false;
      }
      for (const l of v.packaging) {
        compRows.push([c.name, variantName, "packaging", l.packaging_name, l.quantity, "piece", ...meta()]);
        first = false;
        compFirst = false;
      }
      if (first) {
        compRows.push([c.name, variantName, "ingredient", null, null, null, ...meta()]);
        compFirst = false;
      }
    }
  }
  sheets.push({ name: "Components", rows: compRows });

  // Recipes — her recipe-sheet layout: one row per line (ingredient /
  // packaging / component), variant metadata on the variant's first
  // row, recipe metadata on the recipe's first row. price_store /
  // price_brand pin a line's price override so it round-trips.
  const recRows: Cell[][] = [
    ["recipe_name", "variant_name", "line_type", "item_name", "quantity", "unit", "prep_time_minutes", "utility_time_minutes", "category", "notes", "recipe_notes", "price_store", "price_brand"],
  ];
  for (const r of recs) {
    let recipeFirst = true;
    for (const v of r.variants) {
      let variantFirst = true;
      const push = (
        lineType: string,
        item: string | null,
        quantity: number | null,
        unit: string | null,
        priceStore: string | null = null,
        priceBrand: string | null = null,
      ) => {
        recRows.push([
          r.name,
          v.name,
          lineType,
          item,
          quantity,
          unit,
          variantFirst ? v.prep_time_minutes || null : null,
          variantFirst ? (v.utility_time_minutes ?? null) : null,
          recipeFirst ? r.category : null,
          variantFirst ? v.notes : null,
          recipeFirst ? r.notes : null,
          priceStore,
          priceBrand,
        ]);
        variantFirst = false;
        recipeFirst = false;
      };
      for (const l of v.ingredients) {
        const ov = l.price_id_override ? priceById.get(l.price_id_override) : undefined;
        push("ingredient", l.ingredient_name, l.quantity, l.unit, ov?.storeVendor ?? null, ov?.notes ?? null);
      }
      for (const l of v.packaging) {
        push("packaging", l.packaging_name, l.quantity, "piece");
      }
      for (const l of v.components) {
        push("component", l.component_name, l.quantity, l.use_gram_costing ? "g" : "batch");
      }
      if (variantFirst) push("ingredient", null, null, null);
    }
    if (recipeFirst) {
      // A recipe with no variants still gets one row so its name,
      // category, and notes survive the round trip.
      recRows.push([r.name, "", "ingredient", null, null, null, null, null, r.category, null, r.notes, null, null]);
    }
  }
  sheets.push({ name: "Recipes", rows: recRows });

  // Sales History — her sheet's human-style headers; the margin is a
  // decimal fraction (0.32 = 32%), exactly as her file stores it.
  const saleSheetRows: Cell[][] = [
    ["Sale Date", "Recipe", "Variant", "Customer", "Sale Type", "Selling Price", "Total Cost", "Labour Cost", "Profit", "Profit Margin", "Notes"],
  ];
  for (const s of saleRows) {
    saleSheetRows.push([
      s.saleDate,
      s.recipeName,
      s.variantName,
      s.customerName,
      s.saleType === "event" ? "Event" : "Customer",
      s.sellingPrice,
      s.totalCost,
      s.labourCost,
      s.profit,
      s.sellingPrice > 0 ? round4(s.profit / s.sellingPrice) : 0,
      s.notes || null,
    ]);
  }
  sheets.push({ name: "Sales History", rows: saleSheetRows });

  sheets.push({
    name: "Settings",
    rows: [
      ["setting", "value"],
      ["labour_rate_per_hour", settingsRow.labourRatePerHour],
      ["utility_rate_per_hour", settingsRow.utilityRatePerHour],
      ["currency", settingsRow.currency],
      ["currency_symbol", settingsRow.currencySymbol],
      ["target_margin_percent", settingsRow.targetMarginPercent ?? 40],
    ],
  });

  return sheets;
}

export const Actions = {
  // ---------- settings ----------
  getSettings: defineAction({
    description: "Returns the costing settings: labour and utility hourly rates, currency, and target margin percent.",
    request: z.object({}),
    response: settingsShape,
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      return toSettings(await getSettingsRow(db));
    },
  }),

  updateSettings: defineAction({
    description: "Updates the labour rate, utility rate, currency, and target margin used by cost calculations and suggested prices.",
    request: z.object({
      labour_rate_per_hour: z.number().min(0).max(10000),
      utility_rate_per_hour: z.number().min(0).max(10000),
      currency: z.string().trim().min(1).max(10),
      currency_symbol: z.string().trim().min(1).max(4),
      target_margin_percent: z.number().min(0).max(99).optional(),
    }),
    response: settingsShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const current = await getSettingsRow(db);
      await db
        .update(schema.settings)
        .set({
          labourRatePerHour: args.labour_rate_per_hour,
          utilityRatePerHour: args.utility_rate_per_hour,
          currency: args.currency,
          currencySymbol: args.currency_symbol,
          targetMarginPercent:
            args.target_margin_percent ?? current.targetMarginPercent ?? 40,
        })
        .where(eq(schema.settings.id, "settings"));
      await snapshotCosts(db, "Labour / utility rates changed");
      ctx.invalidateQueries();
      return toSettings(await getSettingsRow(db));
    },
  }),

  updateQuoteFooterText: defineAction({
    description:
      "Saves the footer text shown at the bottom of the generated quote image (line breaks preserved). It persists and applies to every quote until she changes it again.",
    request: z.object({
      text: z.string().max(500),
    }),
    response: settingsShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await getSettingsRow(db);
      await db
        .update(schema.settings)
        .set({ quoteFooterText: args.text })
        .where(eq(schema.settings.id, "settings"));
      ctx.invalidateQueries();
      return toSettings(await getSettingsRow(db));
    },
  }),

  // ---------- ingredients & prices ----------
  listIngredients: defineAction({
    description: "Lists all ingredients, each with its full vendor price history.",
    request: z.object({}),
    response: z.object({ ingredients: z.array(ingredientShape) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const ings = await db
        .select()
        .from(schema.ingredients)
        .orderBy(asc(schema.ingredients.name));
      const prices = await db
        .select()
        .from(schema.ingredientPrices)
        .orderBy(desc(schema.ingredientPrices.purchaseDate));
      return {
        ingredients: ings.map((ing) => ({
          id: ing.id,
          name: ing.name,
          default_unit: ing.defaultUnit,
          notes: ing.notes,
          created_at: ing.createdAt,
          prices: prices.filter((p) => p.ingredientId === ing.id).map(toPrice),
        })),
      };
    },
  }),

  createIngredient: defineAction({
    description: "Creates an ingredient in the master list.",
    request: z.object({
      name: z.string().trim().min(1).max(300),
      default_unit: z.string().trim().min(1).max(30).default("g"),
      notes: z.string().max(2000).nullable().optional(),
    }),
    response: ingredientShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const row = {
        id: uid(),
        name: args.name,
        defaultUnit: args.default_unit,
        notes: args.notes ?? null,
        createdAt: nowIso(),
      };
      await db.insert(schema.ingredients).values(row);
      ctx.invalidateQueries();
      return {
        id: row.id,
        name: row.name,
        default_unit: row.defaultUnit,
        notes: row.notes,
        created_at: row.createdAt,
        prices: [],
      };
    },
  }),

  updateIngredient: defineAction({
    description: "Updates an ingredient's name, default unit, or notes.",
    request: z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1).max(300),
      default_unit: z.string().trim().min(1).max(30),
      notes: z.string().max(2000).nullable().optional(),
    }),
    response: okShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const res = await db
        .update(schema.ingredients)
        .set({
          name: args.name,
          defaultUnit: args.default_unit,
          notes: args.notes ?? null,
        })
        .where(eq(schema.ingredients.id, args.id))
        .returning({ id: schema.ingredients.id });
      if (res.length === 0) throw new Error("Ingredient not found.");
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  deleteIngredient: defineAction({
    description: "Deletes an ingredient and all of its price records.",
    request: z.object({ id: z.string().min(1) }),
    response: okShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db
        .delete(schema.ingredientPrices)
        .where(eq(schema.ingredientPrices.ingredientId, args.id));
      await db.delete(schema.ingredients).where(eq(schema.ingredients.id, args.id));
      await snapshotCosts(db, "Ingredient removed");
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  bulkDeleteIngredients: defineAction({
    description: "Deletes several ingredients and all of their price records at once.",
    request: z.object({ ids: z.array(z.string().min(1)).min(1).max(1000) }),
    response: bulkShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db
        .delete(schema.ingredientPrices)
        .where(inArray(schema.ingredientPrices.ingredientId, args.ids));
      const res = await db
        .delete(schema.ingredients)
        .where(inArray(schema.ingredients.id, args.ids))
        .returning({ id: schema.ingredients.id });
      await snapshotCosts(db, "Ingredients removed");
      ctx.invalidateQueries();
      return { ok: true as const, deleted_count: res.length };
    },
  }),

  createPrice: defineAction({
    description: "Adds a vendor price record for an ingredient; unit cost is purchase price divided by package size.",
    request: z.object({
      ingredient_id: z.string().min(1),
      ingredient_name: z.string().max(300),
      store_vendor: z.string().trim().min(1).max(300),
      purchase_price: z.number().min(0),
      package_size: z.number().positive(),
      unit: z.string().trim().min(1).max(30),
      purchase_date: z.string().max(40).default(""),
      is_latest: z.boolean().default(true),
      notes: z.string().max(2000).nullable().optional(),
    }),
    response: priceShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const ing = (
        await db
          .select({ id: schema.ingredients.id })
          .from(schema.ingredients)
          .where(eq(schema.ingredients.id, args.ingredient_id))
          .limit(1)
      )[0];
      if (!ing) throw new Error("Ingredient not found.");
      if (args.is_latest) {
        await db
          .update(schema.ingredientPrices)
          .set({ isLatest: false })
          .where(eq(schema.ingredientPrices.ingredientId, args.ingredient_id));
      }
      const row: PriceRow = {
        id: uid(),
        ingredientId: args.ingredient_id,
        ingredientName: args.ingredient_name,
        storeVendor: args.store_vendor,
        purchasePrice: args.purchase_price,
        packageSize: args.package_size,
        unit: args.unit,
        unitCost: args.package_size > 0 ? args.purchase_price / args.package_size : 0,
        purchaseDate: args.purchase_date || todayStr(),
        isLatest: args.is_latest,
        notes: args.notes ?? null,
      };
      await db.insert(schema.ingredientPrices).values(row);
      await snapshotCosts(db, "Ingredient price added");
      ctx.invalidateQueries();
      return toPrice(row);
    },
  }),

  updatePrice: defineAction({
    description: "Updates a vendor price record and recalculates its unit cost.",
    request: z.object({
      id: z.string().min(1),
      store_vendor: z.string().trim().min(1).max(300),
      purchase_price: z.number().min(0),
      package_size: z.number().positive(),
      unit: z.string().trim().min(1).max(30),
      purchase_date: z.string().max(40),
      is_latest: z.boolean(),
      notes: z.string().max(2000).nullable().optional(),
    }),
    response: okShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const existing = (
        await db
          .select()
          .from(schema.ingredientPrices)
          .where(eq(schema.ingredientPrices.id, args.id))
          .limit(1)
      )[0];
      if (!existing) throw new Error("Price record not found.");
      if (args.is_latest) {
        await db
          .update(schema.ingredientPrices)
          .set({ isLatest: false })
          .where(eq(schema.ingredientPrices.ingredientId, existing.ingredientId));
      }
      await db
        .update(schema.ingredientPrices)
        .set({
          storeVendor: args.store_vendor,
          purchasePrice: args.purchase_price,
          packageSize: args.package_size,
          unit: args.unit,
          unitCost: args.package_size > 0 ? args.purchase_price / args.package_size : 0,
          purchaseDate: args.purchase_date,
          isLatest: args.is_latest,
          notes: args.notes ?? null,
        })
        .where(eq(schema.ingredientPrices.id, args.id));
      await snapshotCosts(db, "Ingredient price updated");
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  deletePrice: defineAction({
    description: "Deletes one vendor price record.",
    request: z.object({ id: z.string().min(1) }),
    response: okShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const existing = (
        await db
          .select()
          .from(schema.ingredientPrices)
          .where(eq(schema.ingredientPrices.id, args.id))
          .limit(1)
      )[0];
      await db
        .delete(schema.ingredientPrices)
        .where(eq(schema.ingredientPrices.id, args.id));
      if (existing?.isLatest) {
        // The deleted price was the costing price: promote the most
        // recently purchased remaining price so the ingredient keeps a
        // flagged "latest" (costing fell back to the newest purchase
        // anyway, but the UI showed no latest price at all).
        const remaining = await db
          .select()
          .from(schema.ingredientPrices)
          .where(eq(schema.ingredientPrices.ingredientId, existing.ingredientId))
          .orderBy(desc(schema.ingredientPrices.purchaseDate));
        const next = remaining[0];
        if (next) {
          await db
            .update(schema.ingredientPrices)
            .set({ isLatest: true })
            .where(eq(schema.ingredientPrices.id, next.id));
        }
      }
      await snapshotCosts(db, "Ingredient price removed");
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  scanPricePhoto: defineAction({
    description:
      "Reads a photo of a baking ingredient or packaging item — the product itself, a shelf price tag, or a receipt — and extracts the item name, brand, store, total purchase price, package size and unit, and purchase date visible in it. Fields that cannot be read from the photo come back null; nothing is saved by this action, the caller reviews the extracted values and saves them with the normal create actions.",
    request: z.object({
      data_base64: z.string().min(1).max(11_200_000),
      mime_type: z.enum(["image/jpeg", "image/png"]),
    }),
    response: z.object({
      item_name: z.string().nullable(),
      store_vendor: z.string().nullable(),
      purchase_price: z.number().nullable(),
      package_size: z.number().nullable(),
      unit: z.string().nullable(),
      brand: z.string().nullable(),
      purchase_date: z.string().nullable(),
      readable: z.boolean(),
    }),
    async handler(ctx, args) {
      const scanSchema = z.object({
        item_name: z.string().nullable(),
        store_vendor: z.string().nullable(),
        purchase_price: z.number().nullable(),
        package_size: z.number().nullable(),
        unit: z.string().nullable(),
        brand: z.string().nullable(),
        purchase_date: z.string().nullable(),
        readable: z.boolean(),
      });
      const prompt = [
        "Look at this photo, which shows a baking ingredient or a packaging item (such as a cake box or board), its shelf price tag, or a receipt for it. Extract the purchase details that are actually visible.",
        "item_name: the product's name, without the brand (for example 'All-purpose flour', 'Unsalted butter', '8-inch cake box').",
        "brand: the brand or maker name shown, if any.",
        "store_vendor: the store the item is from, if a store name is visible on the tag, packaging, or receipt.",
        "purchase_price: the total price paid or charged for the whole package, in dollars. If the photo shows only a per-weight or per-unit price together with the package's total weight or count, multiply them out to get the total for the package.",
        "package_size and unit: how much the package contains. Normalise weights to grams (1 kg = 1000 g, so unit 'g') and volumes to millilitres (1 L = 1000 ml, so unit 'ml') when the size is given that way; for counted items use the count with unit 'piece'. A multipack (for example 2 jars of 26.5 oz each) is one package: its size is the total across the pack (2 × 26.5 oz = 53 oz ≈ 1503 g).",
        "purchase_date: the date on a receipt, in YYYY-MM-DD form, only when a date is actually visible.",
        "readable: true when the photo clearly shows a product, price tag, or receipt you could read details from; false when it is too blurry, dark, or unrelated to read anything useful.",
        "Leave any detail that is not visible as null. Never guess a price, size, store, or date that the photo does not show. If the photo is a receipt listing several items, extract the first item line.",
      ].join("\n");
      const dataBase64 = args.data_base64.includes(",")
        ? (args.data_base64.split(",").pop() ?? args.data_base64)
        : args.data_base64;
      const attempt = () =>
        ctx.inference.complete(prompt, {
          schema: scanSchema,
          images: [
            {
              dataBase64,
              mimeType: args.mime_type,
              filename:
                args.mime_type === "image/png" ? "price-photo.png" : "price-photo.jpg",
              caption: "Photo of an item and its price, to extract purchase details from.",
            },
          ],
          timeout_secs: 90,
        });
      const nothingRead = (r: z.infer<typeof scanSchema>) =>
        !r.readable &&
        r.item_name == null &&
        r.purchase_price == null &&
        r.package_size == null &&
        r.store_vendor == null;
      // The vision read is occasionally flaky — a hard failure or a
      // completely empty read gets one retry before giving up.
      let extracted: z.infer<typeof scanSchema>;
      try {
        extracted = await attempt();
        if (nothingRead(extracted)) extracted = await attempt();
      } catch {
        extracted = await attempt();
      }
      const dateOk =
        extracted.purchase_date != null &&
        /^\d{4}-\d{2}-\d{2}$/.test(extracted.purchase_date) &&
        !Number.isNaN(Date.parse(extracted.purchase_date));
      return {
        item_name: extracted.item_name?.trim() ? extracted.item_name.trim() : null,
        store_vendor: extracted.store_vendor?.trim()
          ? extracted.store_vendor.trim()
          : null,
        purchase_price:
          extracted.purchase_price != null && extracted.purchase_price >= 0
            ? round2(extracted.purchase_price)
            : null,
        package_size:
          extracted.package_size != null && extracted.package_size > 0
            ? extracted.package_size
            : null,
        unit: extracted.unit?.trim() ? extracted.unit.trim() : null,
        brand: extracted.brand?.trim() ? extracted.brand.trim() : null,
        purchase_date: dateOk ? extracted.purchase_date : null,
        readable: extracted.readable,
      };
    },
  }),

  // ---------- packaging ----------
  listPackaging: defineAction({
    description: "Lists all packaging items with their unit costs.",
    request: z.object({}),
    response: z.object({ packaging: z.array(packagingShape) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.packaging)
        .orderBy(asc(schema.packaging.name));
      return { packaging: rows.map(toPackaging) };
    },
  }),

  createPackaging: defineAction({
    description: "Creates a packaging item; unit cost is purchase price divided by package size.",
    request: z.object({
      name: z.string().trim().min(1).max(300),
      store_vendor: z.string().max(300).default(""),
      purchase_price: z.number().min(0).default(0),
      package_size: z.number().positive().default(1),
      unit: z.string().trim().min(1).max(30).default("piece"),
      purchase_date: z.string().max(40).default(""),
      notes: z.string().max(2000).nullable().optional(),
    }),
    response: packagingShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const row: PackagingRow = {
        id: uid(),
        name: args.name,
        storeVendor: args.store_vendor,
        purchasePrice: args.purchase_price,
        packageSize: args.package_size,
        unitCost: args.package_size > 0 ? args.purchase_price / args.package_size : 0,
        unit: args.unit,
        purchaseDate: args.purchase_date,
        notes: args.notes ?? null,
        createdAt: nowIso(),
      };
      await db.insert(schema.packaging).values(row);
      ctx.invalidateQueries();
      return toPackaging(row);
    },
  }),

  updatePackaging: defineAction({
    description: "Updates a packaging item and recalculates its unit cost.",
    request: z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1).max(300),
      store_vendor: z.string().max(300),
      purchase_price: z.number().min(0),
      package_size: z.number().positive(),
      unit: z.string().trim().min(1).max(30),
      purchase_date: z.string().max(40),
      notes: z.string().max(2000).nullable().optional(),
    }),
    response: okShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const res = await db
        .update(schema.packaging)
        .set({
          name: args.name,
          storeVendor: args.store_vendor,
          purchasePrice: args.purchase_price,
          packageSize: args.package_size,
          unitCost: args.package_size > 0 ? args.purchase_price / args.package_size : 0,
          unit: args.unit,
          purchaseDate: args.purchase_date,
          notes: args.notes ?? null,
        })
        .where(eq(schema.packaging.id, args.id))
        .returning({ id: schema.packaging.id });
      if (res.length === 0) throw new Error("Packaging item not found.");
      await snapshotCosts(db, "Packaging cost updated");
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  deletePackaging: defineAction({
    description: "Deletes one packaging item.",
    request: z.object({ id: z.string().min(1) }),
    response: okShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.packaging).where(eq(schema.packaging.id, args.id));
      await snapshotCosts(db, "Packaging removed");
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  bulkDeletePackaging: defineAction({
    description: "Deletes several packaging items at once.",
    request: z.object({ ids: z.array(z.string().min(1)).min(1).max(1000) }),
    response: bulkShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const res = await db
        .delete(schema.packaging)
        .where(inArray(schema.packaging.id, args.ids))
        .returning({ id: schema.packaging.id });
      await snapshotCosts(db, "Packaging removed");
      ctx.invalidateQueries();
      return { ok: true as const, deleted_count: res.length };
    },
  }),

  // ---------- recipes ----------
  listRecipes: defineAction({
    description: "Lists all recipes with their size variants and line items.",
    request: z.object({}),
    response: z.object({ recipes: z.array(recipeShape) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.recipes)
        .orderBy(asc(schema.recipes.name));
      return {
        recipes: await Promise.all(rows.map((r) => toRecipeWithPhoto(ctx, r))),
      };
    },
  }),

  createRecipe: defineAction({
    description: "Creates a recipe with its variants and line items.",
    request: z.object({
      name: z.string().trim().min(1).max(300),
      category: z.string().max(200).nullable().optional(),
      notes: z.string().max(5000).nullable().optional(),
      variants: z.array(variantInput).max(50).default([]),
    }),
    response: recipeShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const row: RecipeRow = {
        id: uid(),
        name: args.name,
        category: args.category ?? null,
        notes: args.notes ?? null,
        photoBlobKey: null,
        variants: args.variants.map(normVariant),
        createdAt: nowIso(),
      };
      await db.insert(schema.recipes).values(row);
      await snapshotCosts(db, "Recipe created");
      ctx.invalidateQueries();
      return toRecipe(row);
    },
  }),

  setRecipePhoto: defineAction({
    description:
      "Stores a photo for a recipe (uploaded from the client as base64 JPEG, PNG, or WebP), replacing any previous photo, and returns the recipe with its photo URL resolved.",
    request: z.object({
      id: z.string().min(1),
      data_base64: z.string().min(1).max(11_200_000),
      mime_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
    }),
    response: recipeShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const existing = (
        await db
          .select()
          .from(schema.recipes)
          .where(eq(schema.recipes.id, args.id))
          .limit(1)
      )[0];
      if (!existing) throw new Error("Recipe not found.");
      const bytes = base64ToBytes(args.data_base64);
      if (bytes.length === 0) throw new Error("That photo file looks empty.");
      if (bytes.length > 8_000_000) {
        throw new Error("That photo is too large — please pick one under 8 MB.");
      }
      const ext =
        args.mime_type === "image/png"
          ? "png"
          : args.mime_type === "image/webp"
            ? "webp"
            : "jpg";
      const key = `recipe-photos/${args.id}/${uid()}.${ext}`;
      await ctx.blobs.put(key, bytes, { contentType: args.mime_type });
      const oldKey = existing.photoBlobKey;
      await db
        .update(schema.recipes)
        .set({ photoBlobKey: key })
        .where(eq(schema.recipes.id, args.id));
      if (oldKey && oldKey !== key) {
        await deletePhotoBlobIfUnreferenced(ctx, db, oldKey);
      }
      ctx.invalidateQueries();
      return toRecipeWithPhoto(ctx, { ...existing, photoBlobKey: key });
    },
  }),

  removeRecipePhoto: defineAction({
    description: "Removes a recipe's photo, deleting the stored image once no recipe references it.",
    request: z.object({ id: z.string().min(1) }),
    response: okShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const existing = (
        await db
          .select()
          .from(schema.recipes)
          .where(eq(schema.recipes.id, args.id))
          .limit(1)
      )[0];
      if (!existing) throw new Error("Recipe not found.");
      const oldKey = existing.photoBlobKey;
      await db
        .update(schema.recipes)
        .set({ photoBlobKey: null })
        .where(eq(schema.recipes.id, args.id));
      await deletePhotoBlobIfUnreferenced(ctx, db, oldKey);
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  updateRecipe: defineAction({
    description: "Replaces a recipe's details, variants, and line items.",
    request: z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1).max(300),
      category: z.string().max(200).nullable().optional(),
      notes: z.string().max(5000).nullable().optional(),
      variants: z.array(variantInput).max(50),
    }),
    response: okShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const res = await db
        .update(schema.recipes)
        .set({
          name: args.name,
          category: args.category ?? null,
          notes: args.notes ?? null,
          variants: args.variants.map(normVariant),
        })
        .where(eq(schema.recipes.id, args.id))
        .returning({ id: schema.recipes.id });
      if (res.length === 0) throw new Error("Recipe not found.");
      await snapshotCosts(db, "Recipe updated");
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  deleteRecipe: defineAction({
    description: "Deletes a recipe and all of its variants.",
    request: z.object({ id: z.string().min(1) }),
    response: okShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const existing = (
        await db
          .select()
          .from(schema.recipes)
          .where(eq(schema.recipes.id, args.id))
          .limit(1)
      )[0];
      await db.delete(schema.recipes).where(eq(schema.recipes.id, args.id));
      await db
        .delete(schema.costSnapshots)
        .where(eq(schema.costSnapshots.recipeId, args.id));
      await deletePhotoBlobIfUnreferenced(ctx, db, existing?.photoBlobKey ?? null);
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  duplicateRecipe: defineAction({
    description:
      "Copies a recipe — name suffixed with (copy) — including every variant and its ingredient, packaging, and component lines, with fresh ids throughout. Returns the new recipe.",
    request: z.object({ id: z.string().min(1) }),
    response: recipeShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const src = (
        await db
          .select()
          .from(schema.recipes)
          .where(eq(schema.recipes.id, args.id))
          .limit(1)
      )[0];
      if (!src) throw new Error("Recipe not found.");
      const row: RecipeRow = {
        id: uid(),
        name: `${src.name} (copy)`,
        category: src.category,
        notes: src.notes,
        // The copy shares the source's photo blob; it is deleted only once
        // no recipe references it.
        photoBlobKey: src.photoBlobKey,
        variants: src.variants.map((v) => ({
          id: uid(),
          name: v.name,
          ingredients: v.ingredients.map((l) => ({ ...l, id: uid() })),
          packaging: v.packaging.map((l) => ({ ...l, id: uid() })),
          components: v.components.map((l) => ({ ...l, id: uid() })),
          prep_time_minutes: v.prep_time_minutes,
          utility_time_minutes: v.utility_time_minutes ?? null,
          notes: v.notes,
        })),
        createdAt: nowIso(),
      };
      await db.insert(schema.recipes).values(row);
      await snapshotCosts(db, "Recipe duplicated");
      ctx.invalidateQueries();
      return toRecipeWithPhoto(ctx, row);
    },
  }),

  duplicateRecipeVariant: defineAction({
    description:
      "Copies one variant of a recipe as a new variant under that same recipe (name suffixed with (copy), fresh ids throughout) — the way a new size of the same cake is started. Returns the updated recipe.",
    request: z.object({
      recipe_id: z.string().min(1),
      variant_id: z.string().min(1),
    }),
    response: recipeShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const src = (
        await db
          .select()
          .from(schema.recipes)
          .where(eq(schema.recipes.id, args.recipe_id))
          .limit(1)
      )[0];
      if (!src) throw new Error("Recipe not found.");
      const variant = src.variants.find((v) => v.id === args.variant_id);
      if (!variant) throw new Error("Variant not found.");
      const copy: RecipeVariant = {
        id: uid(),
        name: `${variant.name} (copy)`,
        ingredients: variant.ingredients.map((l) => ({ ...l, id: uid() })),
        packaging: variant.packaging.map((l) => ({ ...l, id: uid() })),
        components: variant.components.map((l) => ({ ...l, id: uid() })),
        prep_time_minutes: variant.prep_time_minutes,
        utility_time_minutes: variant.utility_time_minutes ?? null,
        notes: variant.notes,
      };
      const updated: RecipeRow = {
        ...src,
        variants: [...src.variants, copy],
      };
      await db
        .update(schema.recipes)
        .set({ variants: updated.variants })
        .where(eq(schema.recipes.id, src.id));
      await snapshotCosts(db, "Variant duplicated");
      ctx.invalidateQueries();
      return toRecipeWithPhoto(ctx, updated);
    },
  }),

  costHistory: defineAction({
    description:
      "Returns the dated cost snapshots recorded for one recipe, oldest first, across all of its variants.",
    request: z.object({ recipe_id: z.string().min(1) }),
    response: z.object({ snapshots: z.array(costSnapshotShape) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.costSnapshots)
        .where(eq(schema.costSnapshots.recipeId, args.recipe_id))
        .orderBy(asc(schema.costSnapshots.capturedAt));
      return { snapshots: rows.map(toCostSnapshot) };
    },
  }),

  exportWorkbookData: defineAction({
    description:
      "Returns the whole dataset as spreadsheet sheets (header row first) for the consolidated backup workbook: Ingredient Pricing, Packaging, Components, Recipes, Sales History, and Settings — each in the same format the matching import accepts, so the downloaded workbook restores or merges straight back in.",
    request: z.object({}),
    response: z.object({
      sheets: z.array(
        z.object({
          name: z.string(),
          rows: z.array(
            z.array(z.union([z.string(), z.number(), z.null()])),
          ),
        }),
      ),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      return { sheets: await buildWorkbookSheets(db) };
    },
  }),

  prepareWorkbookBackup: defineAction({
    description:
      "Builds the consolidated backup workbook as a real .xlsx file on the server, stores it, and returns its blob URL with the file name and size. The client fetches the bytes from that URL in-page and saves them from memory — it must never navigate to the URL: blob responses are served sandboxed, so a top-level navigation to one fails in the app shell and takes the whole space down with it.",
    request: z.object({}),
    response: z.object({
      url: z.string(),
      filename: z.string(),
      size_bytes: z.number(),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const sheets = await buildWorkbookSheets(db);
      const wb = XLSX.utils.book_new();
      for (const sheet of sheets) {
        const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
        XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
      }
      const out = XLSX.write(wb, {
        type: "array",
        bookType: "xlsx",
      }) as ArrayBuffer;
      const bytes = new Uint8Array(out);
      const filename = `shadow-cakes-backup-${todayStr()}.xlsx`;
      const key = "backups/workbook-backup.xlsx";
      await ctx.blobs.put(key, bytes, {
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = await ctx.blobs.getUrl(key);
      return { url, filename, size_bytes: bytes.length };
    },
  }),

  // ---------- cost engine ----------
  variantCost: defineAction({
    description:
      "Calculates the full cost breakdown for one recipe variant: per-line ingredient, packaging, and component costs, labour and utilities from prep time, total cost, and margin when a selling price is given.",
    request: z.object({
      recipe_id: z.string().min(1),
      variant_id: z.string().min(1),
      selling_price: z.number().min(0).nullable().optional(),
    }),
    response: z.object({
      recipe_name: z.string(),
      variant_name: z.string(),
      prep_time_minutes: z.number(),
      settings: settingsShape,
      breakdown: z.object({
        ingredient_costs: z.array(
          z.object({
            ingredient_name: z.string(),
            quantity: z.number(),
            unit: z.string(),
            unit_cost: z.number(),
            store_vendor: z.string(),
            brand: z.string().nullable(),
            is_override: z.boolean(),
            cost: z.number(),
          }),
        ),
        packaging_costs: z.array(
          z.object({
            packaging_name: z.string(),
            quantity: z.number(),
            unit_cost: z.number(),
            cost: z.number(),
          }),
        ),
        component_costs: z.array(
          z.object({
            component_name: z.string(),
            quantity: z.number(),
            use_gram_costing: z.boolean(),
            batch_cost: z.number(),
            cost: z.number(),
          }),
        ),
        labour_cost: z.number(),
        utility_cost: z.number(),
        // Lines that could not be costed (ingredient with no price, or a
        // packaging/component line whose item was deleted) — they add $0
        // to the total, and the UI names them so the total is never
        // silently understated.
        missing_lines: z.array(z.string()),
        total_ingredient_cost: z.number(),
        total_packaging_cost: z.number(),
        total_component_cost: z.number(),
        total_cost: z.number(),
        selling_price: z.number().nullable(),
        profit: z.number().nullable(),
        profit_margin: z.number().nullable(),
      }),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const recipe = (
        await db
          .select()
          .from(schema.recipes)
          .where(eq(schema.recipes.id, args.recipe_id))
          .limit(1)
      )[0];
      if (!recipe) throw new Error("Recipe not found.");
      const variant = recipe.variants.find((v) => v.id === args.variant_id);
      if (!variant) throw new Error("Variant not found.");
      const cx = await loadCostContext(db);

      const ingredientCosts: {
        ingredient_name: string;
        quantity: number;
        unit: string;
        unit_cost: number;
        store_vendor: string;
        brand: string | null;
        is_override: boolean;
        cost: number;
      }[] = [];
      const missingLines: string[] = [];
      let totalIngredient = 0;
      for (const item of variant.ingredients) {
        const price = resolvePrice(cx.prices, item.ingredient_id, item.price_id_override);
        if (!price) {
          missingLines.push(
            `${item.ingredient_name} — no price recorded for this ingredient`,
          );
          continue;
        }
        const cost = item.quantity * price.unitCost;
        totalIngredient += cost;
        ingredientCosts.push({
          ingredient_name: item.ingredient_name,
          quantity: item.quantity,
          unit: item.unit,
          unit_cost: round4(price.unitCost),
          store_vendor: price.storeVendor,
          brand: price.notes,
          // Only flag an override when the override price is the one
          // actually used (a dangling override id falls back to latest).
          is_override: item.price_id_override != null && price.id === item.price_id_override,
          cost: round4(cost),
        });
      }

      const packagingCosts: {
        packaging_name: string;
        quantity: number;
        unit_cost: number;
        cost: number;
      }[] = [];
      let totalPackaging = 0;
      for (const item of variant.packaging) {
        const pkg = cx.packagingById.get(item.packaging_id);
        if (!pkg) {
          missingLines.push(
            `${item.packaging_name} — this packaging item no longer exists`,
          );
          continue;
        }
        const cost = item.quantity * pkg.unitCost;
        totalPackaging += cost;
        packagingCosts.push({
          packaging_name: item.packaging_name,
          quantity: item.quantity,
          unit_cost: pkg.unitCost,
          cost: round4(cost),
        });
      }

      const componentCosts: {
        component_name: string;
        quantity: number;
        use_gram_costing: boolean;
        batch_cost: number;
        cost: number;
      }[] = [];
      let totalComponent = 0;
      for (const ref of variant.components) {
        const resolved = resolveComponentVariant(cx, ref);
        if (!resolved) {
          missingLines.push(
            `${ref.component_name} — this component no longer exists`,
          );
          continue;
        }
        const { comp, variant: cv } = resolved;
        const variants = componentVariantsOf(comp);
        const label = componentVariantLabel(comp.name, cv, variants.length);
        const batch = componentBatchCost(cv, cx);
        // A component variant's own unpriced lines understate its batch
        // cost the same way — name them too, prefixed with the component.
        for (const cl of cv.ingredients) {
          if (!resolvePrice(cx.prices, cl.ingredient_id, cl.price_id_override)) {
            missingLines.push(
              `${label} → ${cl.ingredient_name} — no price recorded for this ingredient`,
            );
          }
        }
        for (const cl of cv.packaging) {
          if (!cx.packagingById.has(cl.packaging_id)) {
            missingLines.push(
              `${label} → ${cl.packaging_name} — this packaging item no longer exists`,
            );
          }
        }
        const cost =
          ref.use_gram_costing && cv.batch_yield_grams > 0
            ? (batch.batchCost / cv.batch_yield_grams) * ref.quantity
            : batch.batchCost * ref.quantity;
        totalComponent += round4(cost);
        componentCosts.push({
          component_name: label,
          quantity: ref.quantity,
          use_gram_costing: ref.use_gram_costing,
          batch_cost: round4(batch.batchCost),
          cost: round4(cost),
        });
      }

      const hours = variant.prep_time_minutes / 60;
      const labourCost = round4(hours * cx.settings.labourRatePerHour);
      const utilityCost = round4(
        ((variant.utility_time_minutes ?? variant.prep_time_minutes) / 60) *
          cx.settings.utilityRatePerHour,
      );
      const totalIng2 = round2(totalIngredient);
      const totalPkg2 = round2(totalPackaging);
      const totalComp2 = round2(totalComponent);
      const totalCost = round2(totalIng2 + totalPkg2 + totalComp2 + labourCost + utilityCost);

      const sp = args.selling_price ?? null;
      const hasPrice = sp != null && sp > 0;
      return {
        recipe_name: recipe.name,
        variant_name: variant.name,
        prep_time_minutes: variant.prep_time_minutes,
        settings: toSettings(cx.settings),
        breakdown: {
          ingredient_costs: ingredientCosts,
          packaging_costs: packagingCosts,
          component_costs: componentCosts,
          labour_cost: labourCost,
          utility_cost: utilityCost,
          missing_lines: missingLines,
          total_ingredient_cost: totalIng2,
          total_packaging_cost: totalPkg2,
          total_component_cost: totalComp2,
          total_cost: totalCost,
          selling_price: hasPrice ? sp : null,
          profit: hasPrice ? round2(sp - totalCost) : null,
          profit_margin: hasPrice ? round2(((sp - totalCost) / sp) * 100) : null,
        },
      };
    },
  }),

  // ---------- component recipes ----------
  listComponents: defineAction({
    description: "Lists all component recipes (frostings, ganaches, fillings) with their batch cost and cost per gram.",
    request: z.object({}),
    response: z.object({ components: z.array(componentShape) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const cx = await loadCostContext(db);
      const rows = await db
        .select()
        .from(schema.componentRecipes)
        .orderBy(asc(schema.componentRecipes.name));
      return { components: rows.map((c) => toComponent(c, cx)) };
    },
  }),

  createComponent: defineAction({
    description: "Creates a reusable component recipe with one or more size variants, each with its own ingredient and packaging lines.",
    request: z.object({
      name: z.string().trim().min(1).max(300),
      notes: z.string().max(5000).nullable().optional(),
      variants: z.array(componentVariantInput).min(1).max(50),
    }),
    response: componentShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const variants = args.variants.map(normComponentVariant);
      const first = variants[0];
      if (!first) throw new Error("A component needs at least one variant.");
      const row: ComponentRow = {
        id: uid(),
        name: args.name,
        // Legacy columns mirror the first variant.
        batchYieldGrams: first.batch_yield_grams,
        ingredients: first.ingredients,
        packaging: first.packaging,
        prepTimeMinutes: first.prep_time_minutes,
        utilityTimeMinutes: first.utility_time_minutes ?? null,
        notes: args.notes ?? null,
        variants,
        createdAt: nowIso(),
      };
      await db.insert(schema.componentRecipes).values(row);
      ctx.invalidateQueries();
      const cx = await loadCostContext(db);
      return toComponent(row, cx);
    },
  }),

  updateComponent: defineAction({
    description: "Replaces a component recipe's details and all of its size variants.",
    request: z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1).max(300),
      notes: z.string().max(5000).nullable().optional(),
      variants: z.array(componentVariantInput).min(1).max(50),
    }),
    response: okShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const variants = args.variants.map(normComponentVariant);
      const first = variants[0];
      if (!first) throw new Error("A component needs at least one variant.");
      const res = await db
        .update(schema.componentRecipes)
        .set({
          name: args.name,
          // Legacy columns mirror the first variant.
          batchYieldGrams: first.batch_yield_grams,
          prepTimeMinutes: first.prep_time_minutes,
          utilityTimeMinutes: first.utility_time_minutes ?? null,
          notes: args.notes ?? null,
          ingredients: first.ingredients,
          packaging: first.packaging,
          variants,
        })
        .where(eq(schema.componentRecipes.id, args.id))
        .returning({ id: schema.componentRecipes.id });
      if (res.length === 0) throw new Error("Component not found.");
      await snapshotCosts(db, "Component recipe updated");
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  deleteComponent: defineAction({
    description: "Deletes one component recipe.",
    request: z.object({ id: z.string().min(1) }),
    response: okShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db
        .delete(schema.componentRecipes)
        .where(eq(schema.componentRecipes.id, args.id));
      await snapshotCosts(db, "Component removed");
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  bulkDeleteComponents: defineAction({
    description: "Deletes several component recipes at once.",
    request: z.object({ ids: z.array(z.string().min(1)).min(1).max(1000) }),
    response: bulkShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const res = await db
        .delete(schema.componentRecipes)
        .where(inArray(schema.componentRecipes.id, args.ids))
        .returning({ id: schema.componentRecipes.id });
      await snapshotCosts(db, "Components removed");
      ctx.invalidateQueries();
      return { ok: true as const, deleted_count: res.length };
    },
  }),

  // ---------- sales ----------
  listSales: defineAction({
    description: "Lists all recorded sales, newest first.",
    request: z.object({}),
    response: z.object({ sales: z.array(saleShape) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.sales)
        .orderBy(desc(schema.sales.saleDate), desc(schema.sales.createdAt));
      return { sales: rows.map(toSale) };
    },
  }),

  salesSummary: defineAction({
    description: "Returns dashboard totals across all sales: count, revenue, cost, wages paid in labour, and profit — plus revenue, cost, wages, and profit grouped by month for the dashboard graph. Totals are always all-time; the chart's time frames are picked client-side from the monthly rows.",
    request: z.object({}),
    response: z.object({
      total_sales: z.number(),
      total_revenue: z.number(),
      total_cost: z.number(),
      total_hourly_pay: z.number(),
      total_profit: z.number(),
      monthly: z.array(
        z.object({
          month: z.string(),
          revenue: z.number(),
          cost: z.number(),
          wages: z.number(),
          profit: z.number(),
        }),
      ),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.sales);
      const byMonth = new Map<
        string,
        { revenue: number; cost: number; wages: number; profit: number }
      >();
      for (const r of rows) {
        const key = r.saleDate.slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(key)) continue;
        const agg = byMonth.get(key) ?? { revenue: 0, cost: 0, wages: 0, profit: 0 };
        agg.revenue += r.sellingPrice;
        agg.cost += r.totalCost;
        agg.wages += r.labourCost;
        agg.profit += r.profit;
        byMonth.set(key, agg);
      }
      return {
        total_sales: rows.length,
        total_revenue: round2(rows.reduce((s, r) => s + r.sellingPrice, 0)),
        total_cost: round2(rows.reduce((s, r) => s + r.totalCost, 0)),
        total_hourly_pay: round2(rows.reduce((s, r) => s + r.labourCost, 0)),
        total_profit: round2(rows.reduce((s, r) => s + r.profit, 0)),
        monthly: [...byMonth.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([month, agg]) => ({
            month,
            revenue: round2(agg.revenue),
            cost: round2(agg.cost),
            wages: round2(agg.wages),
            profit: round2(agg.profit),
          })),
      };
    },
  }),

  salesPeriodSummary: defineAction({
    description: "Returns dashboard totals (sale count, revenue, cost, wages paid in labour, profit) for sales whose date falls in an inclusive YYYY-MM-DD range — the dashboard's period filter (Year / Quarter / 6 months / All time / Custom) drives the total cards from this.",
    request: z.object({
      from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    response: z.object({
      total_sales: z.number(),
      total_revenue: z.number(),
      total_cost: z.number(),
      total_hourly_pay: z.number(),
      total_profit: z.number(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = (await db.select().from(schema.sales)).filter((r) => {
        const d = r.saleDate.slice(0, 10);
        return d >= args.from_date && d <= args.to_date;
      });
      return {
        total_sales: rows.length,
        total_revenue: round2(rows.reduce((s, r) => s + r.sellingPrice, 0)),
        total_cost: round2(rows.reduce((s, r) => s + r.totalCost, 0)),
        total_hourly_pay: round2(rows.reduce((s, r) => s + r.labourCost, 0)),
        total_profit: round2(rows.reduce((s, r) => s + r.profit, 0)),
      };
    },
  }),

  salesInsights: defineAction({
    description: "Computes the dashboard Insights for one period (inclusive YYYY-MM month range matching the dashboard period filter; optional exact from_date/to_date bounds override the months for a custom range): the top-selling item by units (revenue breaks ties), the top customer and the top event by spend (ranked separately — customer sales only count toward Top customer, event sales only toward Top event), and the highest- and lowest-margin items (margin = total profit ÷ total revenue per recipe + variant, over the period). Fields are null when the period has no qualifying sales.",
    request: z.object({
      from_month: z.string().regex(/^\d{4}-\d{2}$/),
      to_month: z.string().regex(/^\d{4}-\d{2}$/),
      // Optional exact YYYY-MM-DD bounds (the dashboard's Custom range);
      // when both are present they win over the month range.
      from_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
    response: z.object({
      top_item: z
        .object({
          recipe_name: z.string(),
          variant_name: z.string(),
          units: z.number(),
          revenue: z.number(),
        })
        .nullable(),
      top_customer: z
        .object({
          customer_name: z.string(),
          orders: z.number(),
          spent: z.number(),
        })
        .nullable(),
      top_event: z
        .object({
          event_name: z.string(),
          orders: z.number(),
          spent: z.number(),
        })
        .nullable(),
      highest_margin: z
        .object({
          recipe_name: z.string(),
          variant_name: z.string(),
          margin_pct: z.number(),
        })
        .nullable(),
      lowest_margin: z
        .object({
          recipe_name: z.string(),
          variant_name: z.string(),
          margin_pct: z.number(),
        })
        .nullable(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = (await db.select().from(schema.sales)).filter((r) => {
        if (args.from_date && args.to_date) {
          const d = r.saleDate.slice(0, 10);
          return d >= args.from_date && d <= args.to_date;
        }
        const key = r.saleDate.slice(0, 7);
        return key >= args.from_month && key <= args.to_month;
      });

      const items = new Map<
        string,
        { recipe_name: string; variant_name: string; units: number; revenue: number; profit: number }
      >();
      // Customers and events are ranked separately — an event (a
      // market day with many sales) must never crowd out the top
      // individual customer, and vice versa.
      const customers = new Map<string, { orders: number; spent: number }>();
      const events = new Map<string, { orders: number; spent: number }>();
      for (const r of rows) {
        const ik = `${r.recipeId} ${r.variantName}`;
        const item = items.get(ik) ?? {
          recipe_name: r.recipeName,
          variant_name: r.variantName,
          units: 0,
          revenue: 0,
          profit: 0,
        };
        item.units += 1;
        item.revenue += r.sellingPrice;
        item.profit += r.profit;
        items.set(ik, item);

        const name = r.customerName.trim();
        if (name) {
          const map = r.saleType === "event" ? events : customers;
          const buyer = map.get(name) ?? { orders: 0, spent: 0 };
          buyer.orders += 1;
          buyer.spent += r.sellingPrice;
          map.set(name, buyer);
        }
      }

      const topItem = [...items.values()].sort(
        (a, b) => b.units - a.units || b.revenue - a.revenue,
      )[0];
      const bySpend = (
        a: [string, { orders: number; spent: number }],
        b: [string, { orders: number; spent: number }],
      ) => b[1].spent - a[1].spent || b[1].orders - a[1].orders;
      const topCustomer = [...customers.entries()].sort(bySpend)[0];
      const topEvent = [...events.entries()].sort(bySpend)[0];
      const margins = [...items.values()]
        .filter((i) => i.revenue > 0)
        .map((i) => ({
          recipe_name: i.recipe_name,
          variant_name: i.variant_name,
          margin_pct: round2((i.profit / i.revenue) * 100),
        }))
        .sort((a, b) => b.margin_pct - a.margin_pct);

      return {
        top_item: topItem
          ? {
              recipe_name: topItem.recipe_name,
              variant_name: topItem.variant_name,
              units: topItem.units,
              revenue: round2(topItem.revenue),
            }
          : null,
        top_customer: topCustomer
          ? {
              customer_name: topCustomer[0],
              orders: topCustomer[1].orders,
              spent: round2(topCustomer[1].spent),
            }
          : null,
        top_event: topEvent
          ? {
              event_name: topEvent[0],
              orders: topEvent[1].orders,
              spent: round2(topEvent[1].spent),
            }
          : null,
        highest_margin: margins[0] ?? null,
        lowest_margin: margins[margins.length - 1] ?? null,
      };
    },
  }),

  counts: defineAction({
    description: "Returns how many recipes, ingredients, packaging items, and components exist, for the dashboard.",
    request: z.object({}),
    response: z.object({
      recipes: z.number(),
      ingredients: z.number(),
      packaging: z.number(),
      components: z.number(),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const [r, i, p, c] = await Promise.all([
        db.select({ id: schema.recipes.id }).from(schema.recipes),
        db.select({ id: schema.ingredients.id }).from(schema.ingredients),
        db.select({ id: schema.packaging.id }).from(schema.packaging),
        db.select({ id: schema.componentRecipes.id }).from(schema.componentRecipes),
      ]);
      return {
        recipes: r.length,
        ingredients: i.length,
        packaging: p.length,
        components: c.length,
      };
    },
  }),

  createSale: defineAction({
    description: "Records a sale with its cost snapshot, profit, and margin. Only the customer's first name is required (the last name is optional); the combined customer_name is composed server-side. sale_type marks the buyer as an individual customer or an event.",
    request: z.object({
      recipe_id: z.string().max(100),
      recipe_name: z.string().min(1).max(300),
      variant_name: z.string().max(200),
      sale_date: z.string().min(1).max(40),
      customer_first_name: z.string().trim().min(1, "Enter the customer's first name.").max(150),
      customer_last_name: z.string().trim().max(150).default(""),
      sale_type: z.enum(["customer", "event"]).default("customer"),
      notes: z.string().max(2000).default(""),
      selling_price: z.number().min(0),
      total_cost: z.number().min(0),
      labour_cost: z.number().min(0).default(0),
      profit: z.number(),
      profit_margin: z.number(),
    }),
    response: saleShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const row: SaleRow = {
        id: uid(),
        recipeId: args.recipe_id,
        recipeName: args.recipe_name,
        variantName: args.variant_name,
        saleDate: args.sale_date,
        customerName: [args.customer_first_name, args.customer_last_name]
          .filter(Boolean)
          .join(" "),
        customerFirstName: args.customer_first_name,
        customerLastName: args.customer_last_name,
        saleType: args.sale_type,
        notes: args.notes,
        sellingPrice: args.selling_price,
        totalCost: args.total_cost,
        labourCost: args.labour_cost,
        profit: args.profit,
        profitMargin: args.profit_margin,
        createdAt: nowIso(),
      };
      await db.insert(schema.sales).values(row);
      ctx.invalidateQueries();
      return toSale(row);
    },
  }),

  updateSale: defineAction({
    description: "Updates a recorded sale's details and figures. Only the customer's first name is required (the last name is optional); the combined customer_name is composed server-side. sale_type marks the buyer as an individual customer or an event.",
    request: z.object({
      id: z.string().min(1),
      recipe_name: z.string().min(1).max(300),
      variant_name: z.string().max(200),
      sale_date: z.string().min(1).max(40),
      customer_first_name: z.string().trim().min(1, "Enter the customer's first name.").max(150),
      customer_last_name: z.string().trim().max(150).default(""),
      sale_type: z.enum(["customer", "event"]).default("customer"),
      notes: z.string().max(2000),
      selling_price: z.number().min(0),
      total_cost: z.number().min(0),
      labour_cost: z.number().min(0),
      profit: z.number(),
      profit_margin: z.number(),
    }),
    response: okShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const res = await db
        .update(schema.sales)
        .set({
          recipeName: args.recipe_name,
          variantName: args.variant_name,
          saleDate: args.sale_date,
          customerName: [args.customer_first_name, args.customer_last_name]
            .filter(Boolean)
            .join(" "),
          customerFirstName: args.customer_first_name,
          customerLastName: args.customer_last_name,
          saleType: args.sale_type,
          notes: args.notes,
          sellingPrice: args.selling_price,
          totalCost: args.total_cost,
          labourCost: args.labour_cost,
          profit: args.profit,
          profitMargin: args.profit_margin,
        })
        .where(eq(schema.sales.id, args.id))
        .returning({ id: schema.sales.id });
      if (res.length === 0) throw new Error("Sale not found.");
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  deleteSale: defineAction({
    description: "Deletes one recorded sale.",
    request: z.object({ id: z.string().min(1) }),
    response: okShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.sales).where(eq(schema.sales.id, args.id));
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  bulkDeleteSales: defineAction({
    description: "Deletes several recorded sales at once.",
    request: z.object({ ids: z.array(z.string().min(1)).min(1).max(1000) }),
    response: bulkShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const res = await db
        .delete(schema.sales)
        .where(inArray(schema.sales.id, args.ids))
        .returning({ id: schema.sales.id });
      ctx.invalidateQueries();
      return { ok: true as const, deleted_count: res.length };
    },
  }),

  // ---------- quote ----------
  getQuote: defineAction({
    description:
      "Returns the one saved customer quote: the recipe variants she has picked, in pick order, each with its quote price (names and categories refreshed from the live recipes; picks whose recipe or variant was deleted are pruned).",
    request: z.object({}),
    response: z.object({ items: z.array(quoteItemShape) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await loadQuoteItems(db);
      return { items: rows.map(toQuoteItem) };
    },
  }),

  addQuoteItem: defineAction({
    description:
      "Adds one recipe variant to the saved quote (picking the same variant twice returns the existing row). The starting price is the suggested price at her target margin — live total cost divided by (1 − target margin), rounded up to the next whole dollar. She can override it on the quote; prices already on the saved quote are never changed by this.",
    request: z.object({
      recipe_id: z.string().min(1),
      variant_id: z.string().min(1),
    }),
    response: quoteItemShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const existing = (
        await db
          .select()
          .from(schema.quoteItems)
          .where(eq(schema.quoteItems.recipeId, args.recipe_id))
      ).find((q) => q.variantId === args.variant_id);
      if (existing) return toQuoteItem(existing);
      const recipe = (
        await db
          .select()
          .from(schema.recipes)
          .where(eq(schema.recipes.id, args.recipe_id))
          .limit(1)
      )[0];
      if (!recipe) throw new Error("Recipe not found.");
      const variant = recipe.variants.find((v) => v.id === args.variant_id);
      if (!variant) throw new Error("Variant not found.");
      const cx = await loadCostContext(db);
      const price = quoteDefaultPrice(variant, cx);
      const siblings = await db.select({ id: schema.quoteItems.id }).from(schema.quoteItems);
      const row: QuoteItemRow = {
        id: uid(),
        recipeId: recipe.id,
        variantId: variant.id,
        recipeName: recipe.name,
        variantName: variant.name,
        category: recipe.category,
        price,
        position: siblings.length,
        createdAt: nowIso(),
      };
      await db.insert(schema.quoteItems).values(row);
      ctx.invalidateQueries();
      return toQuoteItem(row);
    },
  }),

  removeQuoteItem: defineAction({
    description: "Removes one picked variant from the saved quote.",
    request: z.object({ id: z.string().min(1) }),
    response: okShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db
        .delete(schema.quoteItems)
        .where(eq(schema.quoteItems.id, args.id));
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  updateQuoteItemPrice: defineAction({
    description:
      "Sets the quote price for one picked variant. The override lives only on the quote — the recipe's own prices are never changed by it.",
    request: z.object({
      id: z.string().min(1),
      price: z.number().min(0).max(100000),
    }),
    response: quoteItemShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const res = await db
        .update(schema.quoteItems)
        .set({ price: round2(args.price) })
        .where(eq(schema.quoteItems.id, args.id))
        .returning();
      const row = res[0];
      if (!row) throw new Error("Quote item not found.");
      ctx.invalidateQueries();
      return toQuoteItem(row);
    },
  }),

  // ---------- quote banners ----------
  listQuoteBanners: defineAction({
    description:
      "Lists her quote banner images in display order, each with its image URL and whether it is the selected one. The selection is the banner she last picked on the Quote page and persists between visits.",
    request: z.object({}),
    response: z.object({
      banners: z.array(quoteBannerShape),
      selected_id: z.string().nullable(),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const settingsRow = await getSettingsRow(db);
      const rows = await loadQuoteBanners(db);
      const selectedId =
        settingsRow.selectedBannerId != null &&
        rows.some((b) => b.id === settingsRow.selectedBannerId)
          ? settingsRow.selectedBannerId
          : null;
      return {
        banners: await Promise.all(
          rows.map((b) => toQuoteBanner(ctx, b, selectedId)),
        ),
        selected_id: selectedId,
      };
    },
  }),

  addQuoteBanner: defineAction({
    description:
      "Uploads a new quote banner image (base64 JPEG, PNG, or WebP), stores it in blob storage, adds it to her banner set, and selects it.",
    request: z.object({
      name: z.string().trim().min(1).max(80),
      data_base64: z.string().min(1).max(11_200_000),
      mime_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
    }),
    response: quoteBannerShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const bytes = base64ToBytes(args.data_base64);
      if (bytes.length === 0) throw new Error("That banner file looks empty.");
      if (bytes.length > 8_000_000) {
        throw new Error("That banner is too large — please pick one under 8 MB.");
      }
      const ext =
        args.mime_type === "image/png"
          ? "png"
          : args.mime_type === "image/webp"
            ? "webp"
            : "jpg";
      const id = uid();
      const key = `quote-banners/${id}.${ext}`;
      await ctx.blobs.put(key, bytes, { contentType: args.mime_type });
      const siblings = await db
        .select({ id: schema.quoteBanners.id })
        .from(schema.quoteBanners);
      const row: QuoteBannerRow = {
        id,
        name: args.name,
        blobKey: key,
        position: siblings.length,
        createdAt: nowIso(),
      };
      await db.insert(schema.quoteBanners).values(row);
      const settingsRow = await getSettingsRow(db);
      await db
        .update(schema.settings)
        .set({ selectedBannerId: id })
        .where(eq(schema.settings.id, settingsRow.id));
      ctx.invalidateQueries();
      return toQuoteBanner(ctx, row, id);
    },
  }),

  selectQuoteBanner: defineAction({
    description:
      "Sets which quote banner is selected (null clears the selection, so the quote image falls back to the logo header). The choice persists as her last-used banner.",
    request: z.object({ id: z.string().min(1).nullable() }),
    response: okShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      if (args.id != null) {
        const found = (
          await db
            .select({ id: schema.quoteBanners.id })
            .from(schema.quoteBanners)
            .where(eq(schema.quoteBanners.id, args.id))
            .limit(1)
        )[0];
        if (!found) throw new Error("Banner not found.");
      }
      const settingsRow = await getSettingsRow(db);
      await db
        .update(schema.settings)
        .set({ selectedBannerId: args.id })
        .where(eq(schema.settings.id, settingsRow.id));
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  deleteQuoteBanner: defineAction({
    description:
      "Deletes one quote banner and its stored image. If it was the selected banner, the selection clears and the quote image falls back to the logo header.",
    request: z.object({ id: z.string().min(1) }),
    response: okShape,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const existing = (
        await db
          .select()
          .from(schema.quoteBanners)
          .where(eq(schema.quoteBanners.id, args.id))
          .limit(1)
      )[0];
      if (!existing) throw new Error("Banner not found.");
      await db
        .delete(schema.quoteBanners)
        .where(eq(schema.quoteBanners.id, args.id));
      await ctx.blobs.delete(existing.blobKey).catch(() => undefined);
      const settingsRow = await getSettingsRow(db);
      if (settingsRow.selectedBannerId === args.id) {
        await db
          .update(schema.settings)
          .set({ selectedBannerId: null })
          .where(eq(schema.settings.id, settingsRow.id));
      }
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  seedQuoteBanners: defineAction({
    description:
      "One-time setup: stores the five banner images she supplied (Standard, Fall, Spring, Summer, Winter) as her starting quote banner set and selects the plain Standard banner. Idempotent — it adds nothing when banners already exist, so her uploads and deletions are never overwritten.",
    request: z.object({}),
    response: z.object({
      ok: z.literal(true),
      seeded_count: z.number(),
    }),
    handler: async (ctx): Promise<{ ok: true; seeded_count: number }> => {
      const db = ctx.db<typeof schema>();
      const existing = await loadQuoteBanners(db);
      if (existing.length > 0) return { ok: true, seeded_count: 0 };
      let position = 0;
      let standardId: string | null = null;
      for (const seed of SEED_BANNERS) {
        const bytes = base64ToBytes(seed.data_base64);
        if (bytes.length === 0) continue;
        const id = uid();
        const key = `quote-banners/${id}.png`;
        await ctx.blobs.put(key, bytes, { contentType: seed.mime_type });
        await db.insert(schema.quoteBanners).values({
          id,
          name: seed.name,
          blobKey: key,
          position,
          createdAt: nowIso(),
        });
        if (seed.name === "Standard") standardId = id;
        position += 1;
      }
      if (standardId) {
        const settingsRow = await getSettingsRow(db);
        if (settingsRow.selectedBannerId == null) {
          await db
            .update(schema.settings)
            .set({ selectedBannerId: standardId })
            .where(eq(schema.settings.id, settingsRow.id));
        }
      }
      ctx.invalidateQueries();
      return { ok: true, seeded_count: position };
    },
  }),

  syncQuoteBannerImages: defineAction({
    description:
      "Repairs the five supplied quote banners (Standard, Fall, Spring, Summer, Winter): rewrites each named banner's stored image from the supplied artwork, restores the strip order Standard first, creates any missing banner, and selects Standard when no valid banner selection exists. Other banners and an explicit banner pick are left alone.",
    request: z.object({}),
    response: z.object({
      ok: z.literal(true),
      synced_count: z.number(),
    }),
    handler: async (ctx): Promise<{ ok: true; synced_count: number }> => {
      const db = ctx.db<typeof schema>();
      let synced = 0;
      let standardId: string | null = null;
      for (const [position, seed] of SEED_BANNERS.entries()) {
        const bytes = base64ToBytes(seed.data_base64);
        if (bytes.length === 0) continue;
        const rows = await loadQuoteBanners(db);
        const row = rows.find((b) => b.name === seed.name);
        if (row) {
          await ctx.blobs.put(row.blobKey, bytes, {
            contentType: seed.mime_type,
          });
          if (row.position !== position) {
            await db
              .update(schema.quoteBanners)
              .set({ position })
              .where(eq(schema.quoteBanners.id, row.id));
          }
          if (seed.name === "Standard") standardId = row.id;
        } else {
          const id = uid();
          const key = `quote-banners/${id}.png`;
          await ctx.blobs.put(key, bytes, { contentType: seed.mime_type });
          await db.insert(schema.quoteBanners).values({
            id,
            name: seed.name,
            blobKey: key,
            position,
            createdAt: nowIso(),
          });
          if (seed.name === "Standard") standardId = id;
        }
        synced += 1;
      }
      if (standardId) {
        const settingsRow = await getSettingsRow(db);
        const rows = await loadQuoteBanners(db);
        const selectionValid =
          settingsRow.selectedBannerId != null &&
          rows.some((b) => b.id === settingsRow.selectedBannerId);
        if (!selectionValid) {
          await db
            .update(schema.settings)
            .set({ selectedBannerId: standardId })
            .where(eq(schema.settings.id, settingsRow.id));
        }
      }
      ctx.invalidateQueries();
      return { ok: true, synced_count: synced };
    },
  }),

  // ---------- spreadsheet import (merge + replace, preview first) ----------
  previewImport: defineAction({
    description:
      "Dry-runs a spreadsheet import without writing anything: for each dataset supplied (ingredients, packaging, components, recipes, sales, settings) it reports how many rows were read, how many items would be created, updated, or appended, and every row that would be skipped with its spreadsheet row number and the reason.",
    request: importRequestSchema,
    response: importSummarySchema,
    async handler(ctx, args): Promise<ImportSummary> {
      const { summaries } = await analyzeImport(ctx, args.datasets, args.mode);
      return { mode: args.mode, applied: false, datasets: summaries };
    },
  }),

  importData: defineAction({
    description:
      "Applies a spreadsheet import in merge mode (prices and sales append; recipes, components, and packaging matched by name update in place; nothing is deleted) or replace mode (each supplied dataset is wiped, then loaded). Returns the same per-dataset summary the preview produces: created, updated, appended, and skipped rows with reasons.",
    request: importRequestSchema,
    response: importSummarySchema,
    async handler(ctx, args): Promise<ImportSummary> {
      const db = ctx.db<typeof schema>();
      const { summaries, ops } = await analyzeImport(ctx, args.datasets, args.mode);
      await applyImportOps(ctx, ops);
      const touchesCosts =
        args.datasets.ingredients != null ||
        args.datasets.packaging != null ||
        args.datasets.components != null ||
        args.datasets.recipes != null ||
        args.datasets.settings != null;
      if (touchesCosts) {
        await snapshotCosts(
          db,
          args.mode === "replace" ? "Data imported (replace)" : "Data imported (merge)",
        );
      }
      ctx.invalidateQueries();
      return { mode: args.mode, applied: true, datasets: summaries };
    },
  }),
} satisfies ActionsModule;
