import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import {
FIELDS,
money,
todayStr,
unitMoney,
useSymbol,
type Ingredient,
type Price,
} from "../lib";
import {
btnGhost,
btnPrimary,
formActionsCls,
btnSecondary,
cardCls,
ConfirmDialog,
EmptyState,
ErrorNote,
Field,
inputCls,
Loading,
microLabel,
Modal,
useToast,
IconClock,
IconPencil,
IconPlus,
IconTrash,
} from "../ui";

export function IngredientsPage() {
  const symbol = useSymbol();
  const toast = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [ingForm, setIngForm] = useState<Ingredient | "new" | null>(null);
  const [historyIng, setHistoryIng] = useState<Ingredient | null>(null);
  const [priceForm, setPriceForm] = useState<
    { ingredient: Ingredient; price: Price | null } | null
  >(null);
  const [confirm, setConfirm] = useState<
    | { kind: "ingredient"; target: Ingredient }
    | { kind: "price"; target: Price }
   
    | null
  >(null);

  const q = useQuery({
    queryKey: ["ingredients"],
    queryFn: () => api.listIngredients({}),
  });
  const ingredients = useMemo(() => q.data?.ingredients ?? [], [q.data]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return ingredients;
    return ingredients.filter(
      (i) =>
        i.name.toLowerCase().includes(s) ||
        i.prices.some(
          (p) =>
            p.store_vendor.toLowerCase().includes(s) ||
            (p.notes ?? "").toLowerCase().includes(s),
        ),
    );
  }, [ingredients, search]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ingredients"] });
  const onErr = (e: Error) => toast(e.message, "error");

  const delIngredient = useMutation({
    mutationFn: (id: string) => api.deleteIngredient({ id }),
    onSuccess: () => {
      invalidate();
      toast("Ingredient deleted");
      setConfirm(null);
    },
    onError: onErr,
  });
  const delPrice = useMutation({
    mutationFn: (id: string) => api.deletePrice({ id }),
    onSuccess: () => {
      invalidate();
      toast("Price deleted");
      setConfirm(null);
    },
    onError: onErr,
  });


  return (
    <div>
      <div className="flex items-start sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-light tracking-tight text-[#1a1a1a]">
            Ingredients
          </h1>
          <p className="text-sm text-[var(--dim)] mt-1">
            {ingredients.length} ingredient{ingredients.length === 1 ? "" : "s"}
            <span className="hidden sm:inline"> with vendor pricing</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button type="button" className={btnPrimary} onClick={() => setIngForm("new")}>
            <IconPlus /> New ingredient
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <label className="block w-full max-w-md">
          <span className="sr-only">Search ingredients</span>
          <input
            type="search"
            className={inputCls}
            placeholder="Search ingredients, stores, or brands…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {search.trim() ? (
          <p className="w-full text-xs text-[var(--dim)]" role="status">
            Showing {filtered.length} of {ingredients.length} ingredients
            {` matching “${search.trim()}”`}.{" "}
            <button
              type="button"
              className="font-semibold text-[#8a6d2f] underline underline-offset-2"
              onClick={() => setSearch("")}
            >
              Clear search
            </button>
          </p>
        ) : null}
      </div>

      <div className="mt-6">
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorNote error={q.error} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={ingredients.length === 0 ? "No ingredients yet" : "Nothing matches"}
            body={
              ingredients.length === 0
                ? "Add the ingredients you bake with and record what you pay for them at each store. Every recipe cost is built from these prices."
                : "Try a different search or filter — ingredients match on name, store, or brand."
            }
          >
            {ingredients.length === 0 ? (
              <button type="button" className={btnPrimary} onClick={() => setIngForm("new")}>
                <IconPlus /> Add your first ingredient
              </button>
            ) : null}
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((ing) => {
              const latest =
                ing.prices.find((p) => p.is_latest) ?? ing.prices[0];
              // The previous purchase: prices arrive newest-first by
              // purchase date, so it's the record right after the latest.
              // Compare unit costs (not sticker prices) so pack-size
              // changes don't fake a rise; only when the units match.
              const latestIdx = latest ? ing.prices.indexOf(latest) : -1;
              const previous =
                latestIdx >= 0 ? ing.prices[latestIdx + 1] : undefined;
              const trendPct =
                latest &&
                previous &&
                previous.unit_cost > 0 &&
                previous.unit.toLowerCase() === latest.unit.toLowerCase()
                  ? Math.round(
                      ((latest.unit_cost - previous.unit_cost) /
                        previous.unit_cost) *
                        100,
                    )
                  : null;
              return (
                <article key={ing.id} className={`${cardCls} p-5 flex flex-col`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-heading text-lg font-medium text-[#2c1e16] leading-snug">
                        {ing.name}
                      </h2>
                      <p className="text-xs text-[var(--dim)]">
                        priced per {ing.default_unit}
                        {ing.notes ? ` · ${ing.notes}` : ""}
                      </p>
                    </div>
                  </div>

                  {latest ? (
                    <div className="mt-4 bg-[var(--surface-alt)] rounded-md px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`${microLabel} pt-1`}>Latest price</p>
                        <div className="flex -mr-2 -mt-1">
                          <button
                            type="button"
                            className={btnGhost}
                            aria-label={`Edit latest price from ${latest.store_vendor}`}
                            onClick={() => setPriceForm({ ingredient: ing, price: latest })}
                          >
                            <IconPencil />
                          </button>
                          <button
                            type="button"
                            className={btnGhost}
                            aria-label={`Delete latest price from ${latest.store_vendor}`}
                            onClick={() => setConfirm({ kind: "price", target: latest })}
                          >
                            <IconTrash />
                          </button>
                        </div>
                      </div>
                      <p className="mt-1 font-mono text-xl text-[#2c1e16]">
                        {unitMoney(latest.unit_cost, symbol)}
                        <span className="text-sm text-[var(--dim)]"> /{latest.unit}</span>
                      </p>
                      {trendPct !== null ? (
                        <p className="text-xs text-[var(--dim)] mt-0.5">
                          {trendPct > 0
                            ? `↑ ${trendPct}% vs last buy`
                            : trendPct < 0
                              ? `↓ ${Math.abs(trendPct)}% vs last buy`
                              : "0% vs last buy"}
                        </p>
                      ) : null}
                      <p className="text-xs text-[var(--dim)] mt-1">
                        {latest.store_vendor}
                        {latest.notes ? ` · ${latest.notes}` : ""} ·{" "}
                        {money(latest.purchase_price, symbol)} for{" "}
                        {latest.package_size} {latest.unit} ·{" "}
                        {latest.purchase_date.slice(0, 10)}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 bg-[var(--surface-alt)] rounded-md px-4 py-3 text-sm text-[var(--dim)]">
                      No prices recorded — add one so recipes can cost this
                      ingredient.
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-1 mt-auto pt-1">
                    <button
                      type="button"
                      className={btnPrimary}
                      onClick={() => setPriceForm({ ingredient: ing, price: null })}
                    >
                      <IconPlus /> Add price
                    </button>
                    {ing.prices.length > 0 ? (
                      <button
                        type="button"
                        className={btnSecondary}
                        onClick={() => setHistoryIng(ing)}
                      >
                        <IconClock /> History
                      </button>
                    ) : null}
                    <span className="flex-1" />
                    <button
                      type="button"
                      className={btnGhost}
                      aria-label={`Edit ${ing.name}`}
                      onClick={() => setIngForm(ing)}
                    >
                      <IconPencil />
                    </button>
                    <button
                      type="button"
                      className={btnGhost}
                      aria-label={`Delete ${ing.name}`}
                      onClick={() => setConfirm({ kind: "ingredient", target: ing })}
                    >
                      <IconTrash />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {historyIng ? (
        <PriceHistoryModal
          ingredient={historyIng}
          onClose={() => setHistoryIng(null)}
          onEditPrice={(p) => {
            setHistoryIng(null);
            setPriceForm({ ingredient: historyIng, price: p });
          }}
          onDeletePrice={(p) => {
            setHistoryIng(null);
            setConfirm({ kind: "price", target: p });
          }}
        />
      ) : null}
      {ingForm ? (
        <IngredientForm
          initial={ingForm === "new" ? null : ingForm}
          onClose={() => setIngForm(null)}
          onSaved={() => {
            invalidate();
            setIngForm(null);
          }}
        />
      ) : null}
      {priceForm ? (
        <PriceForm
          ingredient={priceForm.ingredient}
          initial={priceForm.price}
          onClose={() => setPriceForm(null)}
          onSaved={() => {
            invalidate();
            setPriceForm(null);
          }}
        />
      ) : null}
      {confirm?.kind === "ingredient" ? (
        <ConfirmDialog
          title="Delete ingredient?"
          message={`“${confirm.target.name}” and all of its price records will be deleted. Recipe lines that use it will stop costing until a new price exists.`}
          busy={delIngredient.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => delIngredient.mutate(confirm.target.id)}
        />
      ) : null}
      {confirm?.kind === "price" ? (
        <ConfirmDialog
          title="Delete price?"
          message={`The ${confirm.target.store_vendor} price (${unitMoney(confirm.target.unit_cost, symbol)}/${confirm.target.unit}) will be deleted.`}
          busy={delPrice.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => delPrice.mutate(confirm.target.id)}
        />
      ) : null}
    </div>
  );
}

function PriceHistoryModal({
  ingredient,
  onClose,
  onEditPrice,
  onDeletePrice,
}: {
  ingredient: Ingredient;
  onClose: () => void;
  onEditPrice: (p: Price) => void;
  onDeletePrice: (p: Price) => void;
}) {
  const symbol = useSymbol();
  return (
    <Modal title={`Price history — ${ingredient.name}`} onClose={onClose}>
      <ul className="divide-y divide-[var(--border)]">
        {ingredient.prices.map((p) => (
          <li key={p.id} className="py-2.5 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {p.store_vendor}
                {p.notes ? (
                  <span className="text-[var(--dim)] font-normal">
                    {" "}
                    · {p.notes}
                  </span>
                ) : null}
                {p.is_latest ? (
                  <span className="ml-2 bg-[#4a6b53]/10 text-[#4a6b53] rounded-full px-2 py-0.5 text-[11px] font-semibold">
                    Latest
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-[var(--dim)]">
                {money(p.purchase_price, symbol)} / {p.package_size} {p.unit} ·{" "}
                {p.purchase_date.slice(0, 10)}
              </p>
            </div>
            <span className="font-mono text-sm text-[#2c1e16]">
              {unitMoney(p.unit_cost, symbol)}/{p.unit}
            </span>
            <button
              type="button"
              className={btnGhost}
              aria-label={`Edit price from ${p.store_vendor}`}
              onClick={() => onEditPrice(p)}
            >
              <IconPencil />
            </button>
            <button
              type="button"
              className={btnGhost}
              aria-label={`Delete price from ${p.store_vendor}`}
              onClick={() => onDeletePrice(p)}
            >
              <IconTrash />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function IngredientForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Ingredient | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.default_unit ?? "g");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [nameError, setNameError] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.createIngredient({
        name: name.trim(),
        default_unit: unit.trim() || "g",
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      toast("Ingredient added");
      onSaved();
    },
    onError: (e) => toast(e.message, "error"),
  });
  const update = useMutation({
    mutationFn: () =>
      api.updateIngredient({
        id: initial?.id ?? "",
        name: name.trim(),
        default_unit: unit.trim() || "g",
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      toast("Ingredient saved");
      onSaved();
    },
    onError: (e) => toast(e.message, "error"),
  });
  const busy = create.isPending || update.isPending;

  const submit = () => {
    if (!name.trim()) {
      setNameError("Give the ingredient a name.");
      return;
    }
    if (initial) update.mutate();
    else create.mutate();
  };

  return (
    <Modal title={initial ? "Edit ingredient" : "New ingredient"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <Field label="Name">
          <input
            {...FIELDS.createIngredient.name}
            className={inputCls}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError("");
            }}
            placeholder="e.g. All-purpose flour"
            autoFocus
          />
        </Field>
        {nameError ? (
          <p role="alert" className="text-sm text-[#a63c3c]">
            {nameError}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Default unit">
            <input
              {...FIELDS.createIngredient.default_unit}
              className={inputCls}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="g"
            />
          </Field>
          <Field label="Notes (optional)">
            <input
              {...FIELDS.createIngredient.notes}
              className={inputCls}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Brand, grade…"
            />
          </Field>
        </div>
        <div className={formActionsCls}>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? "Saving…" : initial ? "Save changes" : "Add ingredient"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PriceForm({
  ingredient,
  initial,
  onClose,
  onSaved,
}: {
  ingredient: Ingredient;
  initial: Price | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const symbol = useSymbol();
  const [vendor, setVendor] = useState(initial?.store_vendor ?? "");
  const [price, setPrice] = useState(
    initial ? String(initial.purchase_price) : "",
  );
  const [size, setSize] = useState(initial ? String(initial.package_size) : "");
  const [unit, setUnit] = useState(initial?.unit ?? ingredient.default_unit);
  const [date, setDate] = useState(
    initial ? initial.purchase_date.slice(0, 10) : todayStr(),
  );
  const [brand, setBrand] = useState(initial?.notes ?? "");
  const [latest, setLatest] = useState(initial?.is_latest ?? true);
  const [error, setError] = useState("");

  const priceNum = parseFloat(price) || 0;
  const sizeNum = parseFloat(size) || 0;
  const unitCost = sizeNum > 0 ? priceNum / sizeNum : 0;

  const create = useMutation({
    mutationFn: () =>
      api.createPrice({
        ingredient_id: ingredient.id,
        ingredient_name: ingredient.name,
        store_vendor: vendor.trim(),
        purchase_price: priceNum,
        package_size: sizeNum,
        unit: unit.trim() || ingredient.default_unit,
        purchase_date: date || todayStr(),
        is_latest: latest,
        notes: brand.trim() || null,
      }),
    onSuccess: () => {
      toast("Price added");
      onSaved();
    },
    onError: (e) => toast(e.message, "error"),
  });
  const update = useMutation({
    mutationFn: () =>
      api.updatePrice({
        id: initial?.id ?? "",
        store_vendor: vendor.trim(),
        purchase_price: priceNum,
        package_size: sizeNum,
        unit: unit.trim() || ingredient.default_unit,
        purchase_date: date || todayStr(),
        is_latest: latest,
        notes: brand.trim() || null,
      }),
    onSuccess: () => {
      toast("Price saved");
      onSaved();
    },
    onError: (e) => toast(e.message, "error"),
  });
  const busy = create.isPending || update.isPending;

  const submit = () => {
    if (!vendor.trim()) {
      setError("Enter the store or vendor.");
      return;
    }
    if (!(priceNum >= 0) || price === "") {
      setError("Enter the purchase price.");
      return;
    }
    if (!(sizeNum > 0)) {
      setError("Package size must be more than zero.");
      return;
    }
    if (initial) update.mutate();
    else create.mutate();
  };

  return (
    <Modal
      title={initial ? `Edit price — ${ingredient.name}` : `Add price — ${ingredient.name}`}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <Field label="Store / vendor">
          <input
            {...FIELDS.createPrice.store_vendor}
            className={inputCls}
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="e.g. Costco"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Purchase price (${symbol})`}>
            <input
              {...FIELDS.createPrice.purchase_price}
              className={inputCls}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
            />
          </Field>
          <Field label="Package size">
            <input
              {...FIELDS.createPrice.package_size}
              className={inputCls}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="1000"
              inputMode="decimal"
            />
          </Field>
          <Field label="Unit">
            <input
              {...FIELDS.createPrice.unit}
              className={inputCls}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="g"
            />
          </Field>
          <Field label="Purchase date">
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Brand (optional)">
          <input
            {...FIELDS.createPrice.notes}
            className={inputCls}
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="e.g. Robin Hood"
          />
        </Field>
        <div className="flex items-center justify-between bg-[var(--surface-alt)] rounded-md px-4 py-3">
          <span className="text-sm text-[var(--dim)]">Unit cost</span>
          <span className="font-mono text-lg text-[#2c1e16]">
            {unitMoney(unitCost, symbol)}
            <span className="text-sm text-[var(--dim)]"> /{unit || "g"}</span>
          </span>
        </div>
        <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer py-1">
          <input
            type="checkbox"
            checked={latest}
            onChange={(e) => setLatest(e.target.checked)}
          />
          Use as the latest price for costing
        </label>
        {error ? (
          <p role="alert" className="text-sm text-[#a63c3c]">
            {error}
          </p>
        ) : null}
        <div className={formActionsCls}>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? "Saving…" : initial ? "Save changes" : "Add price"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
