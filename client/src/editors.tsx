import { useState } from "react";
import {
money,
qty,
resolvePrice,
unitMoney,
type Component,
type CompRef,
type Ingredient,
type LineItem,
type PackagingItem,
type PackLine,
} from "./lib";
import { btnSecondary, inputCls, IconPlus, IconTrash } from "./ui";

const miniLabel = "block text-[11px] font-bold uppercase tracking-wide text-[var(--dim)] mb-1";
const newId = () => crypto.randomUUID();

function RemoveBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-md text-[var(--dim)] hover:text-[#a63c3c] hover:bg-[#a63c3c]/10"
    >
      <IconTrash />
    </button>
  );
}

// ---------- ingredient lines ----------
export function IngredientLinesEditor({
  lines,
  onChange,
  ingredients,
  symbol,
}: {
  lines: LineItem[];
  onChange: (lines: LineItem[]) => void;
  ingredients: Ingredient[];
  symbol: string;
}) {
  const [addId, setAddId] = useState("");
  const byId = new Map(ingredients.map((i) => [i.id, i]));

  const update = (id: string, patch: Partial<LineItem>) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const remove = (id: string) => onChange(lines.filter((l) => l.id !== id));
  const add = () => {
    const ing = byId.get(addId);
    if (!ing) return;
    onChange([
      ...lines,
      {
        id: newId(),
        ingredient_id: ing.id,
        ingredient_name: ing.name,
        quantity: 0,
        unit: ing.default_unit,
        price_id_override: null,
      },
    ]);
    setAddId("");
  };

  return (
    <div>
      <div className="space-y-3">
        {lines.map((line) => {
          const ing = byId.get(line.ingredient_id);
          const prices = ing?.prices ?? [];
          const resolved = resolvePrice(prices, line.price_id_override);
          const cost = resolved ? line.quantity * resolved.unit_cost : 0;
          return (
            <div
              key={line.id}
              className="border border-[var(--border)] rounded-md p-3 bg-[var(--surface)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-[#2c1e16] truncate">
                    {line.ingredient_name}
                  </p>
                  <p className="text-xs text-[var(--dim)]">
                    {resolved
                      ? `${resolved.store_vendor} · ${unitMoney(resolved.unit_cost, symbol)}/${resolved.unit}`
                      : "No price recorded yet"}
                  </p>
                </div>
                <RemoveBtn
                  label={`Remove ${line.ingredient_name}`}
                  onClick={() => remove(line.id)}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="w-24">
                  <span className={miniLabel}>Quantity</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    aria-label={`Quantity for ${line.ingredient_name}`}
                    className={inputCls}
                    value={line.quantity === 0 ? "" : line.quantity}
                    placeholder="0"
                    onChange={(e) =>
                      update(line.id, { quantity: parseFloat(e.target.value) || 0 })
                    }
                  />
                </label>
                <label className="w-20">
                  <span className={miniLabel}>Unit</span>
                  <input
                    type="text"
                    aria-label={`Unit for ${line.ingredient_name}`}
                    className={inputCls}
                    value={line.unit}
                    onChange={(e) => update(line.id, { unit: e.target.value })}
                  />
                </label>
                <label className="flex-1 min-w-44">
                  <span className={miniLabel}>Price source</span>
                  <select
                    aria-label={`Price source for ${line.ingredient_name}`}
                    className={inputCls}
                    value={line.price_id_override ?? ""}
                    onChange={(e) =>
                      update(line.id, {
                        price_id_override: e.target.value === "" ? null : e.target.value,
                      })
                    }
                  >
                    <option value="">
                      Latest price
                      {prices.find((p) => p.is_latest)
                        ? ` — ${prices.find((p) => p.is_latest)?.store_vendor}`
                        : ""}
                    </option>
                    {prices.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.store_vendor} — {unitMoney(p.unit_cost, symbol)}/{p.unit}
                        {p.notes ? ` · ${p.notes}` : ""} ({p.purchase_date.slice(0, 10)})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="w-24 text-right">
                  <span className={miniLabel}>Line cost</span>
                  <p className="font-mono text-sm leading-9 text-[#2c1e16]">
                    {money(cost, symbol)}
                  </p>
                </div>
              </div>
              {line.price_id_override ? (
                <span className="inline-block mt-2 bg-[#d99441]/10 text-[#9a6716] border border-[#d99441]/30 rounded-full px-2 py-0.5 text-xs font-medium">
                  Price override
                </span>
              ) : null}
            </div>
          );
        })}
        {lines.length === 0 ? (
          <p className="text-sm text-[var(--dim)]">No ingredients yet — add the first one below.</p>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-48">
          <span className={miniLabel}>Add ingredient</span>
          <select
            aria-label="Ingredient to add"
            className={inputCls}
            value={addId}
            onChange={(e) => setAddId(e.target.value)}
          >
            <option value="">Choose an ingredient…</option>
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={btnSecondary} onClick={add} disabled={!addId}>
          <IconPlus /> Add
        </button>
      </div>
      {ingredients.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--dim)]">
          The ingredient list is empty — add ingredients on the Ingredients tab first.
        </p>
      ) : null}
    </div>
  );
}

// ---------- packaging lines ----------
export function PackagingLinesEditor({
  lines,
  onChange,
  packaging,
  symbol,
}: {
  lines: PackLine[];
  onChange: (lines: PackLine[]) => void;
  packaging: PackagingItem[];
  symbol: string;
}) {
  const [addId, setAddId] = useState("");
  const byId = new Map(packaging.map((p) => [p.id, p]));
  const update = (id: string, patch: Partial<PackLine>) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const remove = (id: string) => onChange(lines.filter((l) => l.id !== id));
  const add = () => {
    const pkg = byId.get(addId);
    if (!pkg) return;
    onChange([
      ...lines,
      { id: newId(), packaging_id: pkg.id, packaging_name: pkg.name, quantity: 1 },
    ]);
    setAddId("");
  };
  return (
    <div>
      <div className="space-y-3">
        {lines.map((line) => {
          const pkg = byId.get(line.packaging_id);
          const cost = pkg ? line.quantity * pkg.unit_cost : 0;
          return (
            <div
              key={line.id}
              className="border border-[var(--border)] rounded-md p-3 bg-[var(--surface)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-[#2c1e16] truncate">
                    {line.packaging_name}
                  </p>
                  <p className="text-xs text-[var(--dim)]">
                    {pkg
                      ? `${unitMoney(pkg.unit_cost, symbol)} per ${pkg.unit}`
                      : "Packaging item no longer exists"}
                  </p>
                </div>
                <RemoveBtn
                  label={`Remove ${line.packaging_name}`}
                  onClick={() => remove(line.id)}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="w-24">
                  <span className={miniLabel}>Quantity</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    aria-label={`Quantity for ${line.packaging_name}`}
                    className={inputCls}
                    value={line.quantity === 0 ? "" : line.quantity}
                    placeholder="0"
                    onChange={(e) =>
                      update(line.id, { quantity: parseFloat(e.target.value) || 0 })
                    }
                  />
                </label>
                <div className="w-24 text-right ml-auto">
                  <span className={miniLabel}>Line cost</span>
                  <p className="font-mono text-sm leading-9 text-[#2c1e16]">
                    {money(cost, symbol)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        {lines.length === 0 ? (
          <p className="text-sm text-[var(--dim)]">No packaging yet — add the first item below.</p>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-48">
          <span className={miniLabel}>Add packaging</span>
          <select
            aria-label="Packaging to add"
            className={inputCls}
            value={addId}
            onChange={(e) => setAddId(e.target.value)}
          >
            <option value="">Choose packaging…</option>
            {packaging.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {unitMoney(p.unit_cost, symbol)}/{p.unit}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={btnSecondary} onClick={add} disabled={!addId}>
          <IconPlus /> Add
        </button>
      </div>
      {packaging.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--dim)]">
          The packaging list is empty — add items under Packaging first.
        </p>
      ) : null}
    </div>
  );
}

// ---------- component refs ----------
export type CompVariant = Component["variants"][number];

/** Client mirror of the server's rule: a line's variant id wins; older
 *  lines point at what was then the component row and is now a variant
 *  id inside the (possibly merged) component; otherwise the first
 *  variant. */
export function resolveCompVariant(
  components: Component[],
  ref: CompRef,
): { comp: Component; variant: CompVariant } | undefined {
  const comp = components.find((c) => c.id === ref.component_recipe_id);
  if (comp) {
    const variant =
      (ref.component_variant_id
        ? comp.variants.find((v) => v.id === ref.component_variant_id)
        : undefined) ??
      comp.variants.find((v) => v.id === ref.component_recipe_id) ??
      comp.variants[0];
    return variant ? { comp, variant } : undefined;
  }
  for (const c of components) {
    const variant = c.variants.find((v) => v.id === ref.component_recipe_id);
    if (variant) return { comp: c, variant };
  }
  return undefined;
}

/** "Dark Chocolate Ganache — 6-inch"; a lone "Standard" variant reads
 *  as just the component name. */
export function compVariantLabel(
  comp: Component,
  variant: CompVariant,
): string {
  if (comp.variants.length <= 1 && variant.name === "Standard") return comp.name;
  return `${comp.name} — ${variant.name}`;
}

export function ComponentLinesEditor({
  lines,
  onChange,
  components,
  symbol,
}: {
  lines: CompRef[];
  onChange: (lines: CompRef[]) => void;
  components: Component[];
  symbol: string;
}) {
  const [addKey, setAddKey] = useState("");
  const update = (id: string, patch: Partial<CompRef>) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const remove = (id: string) => onChange(lines.filter((l) => l.id !== id));
  const add = () => {
    const [compId, variantId] = addKey.split("::");
    const comp = components.find((c) => c.id === compId);
    const variant = comp?.variants.find((v) => v.id === variantId);
    if (!comp || !variant) return;
    onChange([
      ...lines,
      {
        id: newId(),
        component_recipe_id: comp.id,
        component_name: compVariantLabel(comp, variant),
        quantity: 0,
        use_gram_costing: variant.batch_yield_grams > 0,
        component_variant_id: variant.id,
      },
    ]);
    setAddKey("");
  };
  return (
    <div>
      <div className="space-y-3">
        {lines.map((line) => {
          const resolved = resolveCompVariant(components, line);
          const comp = resolved?.comp;
          const variant = resolved?.variant;
          const cost = variant
            ? line.use_gram_costing && variant.batch_yield_grams > 0
              ? variant.cost_per_gram * line.quantity
              : variant.batch_cost * line.quantity
            : 0;
          return (
            <div
              key={line.id}
              className="border border-[var(--border)] rounded-md p-3 bg-[var(--surface)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-[#2c1e16] truncate">
                    {line.component_name}
                  </p>
                  <p className="text-xs text-[var(--dim)]">
                    {variant
                      ? `Batch ${money(variant.batch_cost, symbol)}${variant.batch_yield_grams > 0 ? ` · yields ${qty(variant.batch_yield_grams)} g` : ""}`
                      : "Component no longer exists"}
                  </p>
                </div>
                <RemoveBtn
                  label={`Remove ${line.component_name}`}
                  onClick={() => remove(line.id)}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                {comp && comp.variants.length > 1 ? (
                  <label className="w-44">
                    <span className={miniLabel}>Size</span>
                    <select
                      aria-label={`Size for ${comp.name}`}
                      className={inputCls}
                      value={variant?.id ?? ""}
                      onChange={(e) => {
                        const v = comp.variants.find((x) => x.id === e.target.value);
                        if (!v) return;
                        update(line.id, {
                          component_variant_id: v.id,
                          component_name: compVariantLabel(comp, v),
                        });
                      }}
                    >
                      {comp.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="w-28">
                  <span className={miniLabel}>{line.use_gram_costing ? "Quantity (g)" : "Batches"}</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    aria-label={`Quantity for ${line.component_name}`}
                    className={inputCls}
                    value={line.quantity === 0 ? "" : line.quantity}
                    placeholder="0"
                    onChange={(e) =>
                      update(line.id, { quantity: parseFloat(e.target.value) || 0 })
                    }
                  />
                </label>
                <label className="w-40">
                  <span className={miniLabel}>Costing</span>
                  <select
                    aria-label={`Costing mode for ${line.component_name}`}
                    className={inputCls}
                    value={line.use_gram_costing ? "gram" : "batch"}
                    onChange={(e) =>
                      update(line.id, { use_gram_costing: e.target.value === "gram" })
                    }
                  >
                    <option value="gram">Per gram</option>
                    <option value="batch">Full batches</option>
                  </select>
                </label>
                <div className="w-24 text-right ml-auto">
                  <span className={miniLabel}>Line cost</span>
                  <p className="font-mono text-sm leading-9 text-[#2c1e16]">
                    {money(cost, symbol)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        {lines.length === 0 ? (
          <p className="text-sm text-[var(--dim)]">No components yet — add one below.</p>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-48">
          <span className={miniLabel}>Add component</span>
          <select
            aria-label="Component to add"
            className={inputCls}
            value={addKey}
            onChange={(e) => setAddKey(e.target.value)}
          >
            <option value="">Choose a component…</option>
            {components.flatMap((c) =>
              c.variants.map((v) => (
                <option key={`${c.id}::${v.id}`} value={`${c.id}::${v.id}`}>
                  {compVariantLabel(c, v)} — batch {money(v.batch_cost, symbol)}
                </option>
              )),
            )}
          </select>
        </label>
        <button type="button" className={btnSecondary} onClick={add} disabled={!addKey}>
          <IconPlus /> Add
        </button>
      </div>
      {components.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--dim)]">
          No components exist yet — create them under Components first.
        </p>
      ) : null}
    </div>
  );
}
