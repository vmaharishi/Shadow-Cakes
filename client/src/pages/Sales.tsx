import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import {
CustomerNameFields,
pastCustomers,
splitSaleName,
} from "../customers";
import {
FIELDS,
fmtPercent,
money,
playSaleChime,
suggestedPrice,
todayStr,
useSymbol,
wholeMoney,
useTargetMargin,
type Recipe,
type Sale,
} from "../lib";
import {
btnGhost,
btnIconSmall,
btnPrimary,
btnSecondary,
cardCls,
ConfirmDialog,
EmptyState,
ErrorNote,
Field,
inputCls,
Loading,
Modal,
SortTh,
useToast,
IconCopy,
IconPencil,
IconPlus,
IconTrash,
type SortDir,
} from "../ui";

type SaleSortKey =
  | "date"
  | "recipe"
  | "customer"
  | "price"
  | "cost"
  | "labour"
  | "profit"
  | "margin";

const SALE_SORT_OPTIONS: { key: SaleSortKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "recipe", label: "Recipe" },
  { key: "customer", label: "Customer" },
  { key: "price", label: "Price" },
  { key: "cost", label: "Cost" },
  { key: "labour", label: "Labour" },
  { key: "profit", label: "Profit" },
  { key: "margin", label: "Margin" },
];

function saleSortValue(s: Sale, key: SaleSortKey): string | number {
  switch (key) {
    case "date":
      return s.sale_date.slice(0, 10);
    case "recipe":
      return s.recipe_name.toLowerCase();
    case "customer":
      return s.customer_name.toLowerCase();
    case "price":
      return s.selling_price;
    case "cost":
      return s.total_cost;
    case "labour":
      return s.labour_cost;
    case "profit":
      return s.profit;
    case "margin":
      return s.profit_margin;
  }
}

export function SalesPage() {
  const symbol = useSymbol();
  const toast = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [recipeFilter, setRecipeFilter] = useState("");
  const [sortKey, setSortKey] = useState<SaleSortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showNew, setShowNew] = useState(false);
  const [duplicateFrom, setDuplicateFrom] = useState<Sale | null>(null);
  const [edit, setEdit] = useState<Sale | null>(null);
  const [confirm, setConfirm] = useState<
    { kind: "one"; target: Sale } | { kind: "bulk" } | null
  >(null);

  const q = useQuery({ queryKey: ["sales"], queryFn: () => api.listSales({}) });
  const sales = useMemo(() => q.data?.sales ?? [], [q.data]);
  const customers = useMemo(
    () =>
      [...new Set(sales.map((x) => x.customer_name).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [sales],
  );
  const recipeNames = useMemo(
    () =>
      [...new Set(sales.map((x) => x.recipe_name).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [sales],
  );
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const rows = sales.filter(
      (x) =>
        (!s ||
          x.recipe_name.toLowerCase().includes(s) ||
          x.customer_name.toLowerCase().includes(s) ||
          x.variant_name.toLowerCase().includes(s)) &&
        (!customerFilter || x.customer_name === customerFilter) &&
        (!recipeFilter || x.recipe_name === recipeFilter),
    );
    const mul = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = saleSortValue(a, sortKey);
      const vb = saleSortValue(b, sortKey);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb));
      return cmp * mul;
    });
  }, [sales, search, customerFilter, recipeFilter, sortKey, sortDir]);

  const toggleSort = (key: SaleSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "recipe" || key === "customer" ? "asc" : "desc");
    }
  };
  const filtersActive = !!search.trim() || !!customerFilter || !!recipeFilter;
  const clearFilters = () => {
    setSearch("");
    setCustomerFilter("");
    setRecipeFilter("");
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
  };
  const onErr = (e: Error) => toast(e.message, "error");
  const delOne = useMutation({
    mutationFn: (id: string) => api.deleteSale({ id }),
    onSuccess: () => {
      invalidate();
      toast("Sale deleted");
      setConfirm(null);
    },
    onError: onErr,
  });
  const bulkDelete = useMutation({
    mutationFn: (ids: string[]) => api.bulkDeleteSales({ ids }),
    onSuccess: (r) => {
      invalidate();
      toast(`Deleted ${r.deleted_count} sale${r.deleted_count === 1 ? "" : "s"}`);
      setSelected(new Set());
      setSelectionMode(false);
      setConfirm(null);
    },
    onError: onErr,
  });

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-light tracking-tight text-[#1a1a1a]">
            Sales
          </h1>
          <p className="text-sm text-[var(--dim)] mt-1">
            {sales.length} sale{sales.length === 1 ? "" : "s"} recorded — every sale
            keeps the cost it was recorded at
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={() => setShowNew(true)}>
            <IconPlus /> New sale
          </button>
          <button
            type="button"
            className={selectionMode ? btnPrimary : btnSecondary}
            onClick={() => {
              setSelectionMode((m) => !m);
              setSelected(new Set());
            }}
            aria-pressed={selectionMode}
          >
            {selectionMode ? "Done selecting" : "Select"}
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="block flex-1 min-w-52 max-w-md">
          <span className="sr-only">Search sales</span>
          <input
            type="search"
            className={inputCls}
            placeholder="Search by recipe, variant, or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="sr-only">Filter by customer</span>
          <select
            className={inputCls}
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            aria-label="Filter by customer"
          >
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Filter by recipe</span>
          <select
            className={inputCls}
            value={recipeFilter}
            onChange={(e) => setRecipeFilter(e.target.value)}
            aria-label="Filter by recipe"
          >
            <option value="">All recipes</option>
            {recipeNames.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2 lg:hidden">
          <label className="flex items-center gap-2 text-sm text-[var(--dim)]">
            Sort
            <select
              className={inputCls}
              value={sortKey}
              onChange={(e) => toggleSort(e.target.value as SaleSortKey)}
              aria-label="Sort sales by"
            >
              {SALE_SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={btnSecondary}
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            aria-label={`Sort order: ${sortDir === "asc" ? "ascending" : "descending"} — tap to reverse`}
          >
            {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>
        </div>
      </div>

      {filtersActive ? (
        <p className="mt-3 text-sm text-[var(--dim)]">
          Showing {filtered.length} of {sales.length} sale
          {sales.length === 1 ? "" : "s"}{" "}
          <button
            type="button"
            className="font-semibold text-[#2c1e16] underline underline-offset-2"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </p>
      ) : null}

      {selectionMode && selected.size > 0 ? (
        <div className="mt-4 flex items-center gap-3 bg-[#f9ecd7] border border-[var(--border)] rounded-md px-4 py-2.5">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <button
            type="button"
            className="text-sm font-semibold text-[#a63c3c]"
            onClick={() => setConfirm({ kind: "bulk" })}
          >
            Delete selected
          </button>
          <button
            type="button"
            className="text-sm text-[var(--dim)]"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      ) : null}

      <div className="mt-6">
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorNote error={q.error} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={sales.length === 0 ? "No sales yet" : "Nothing matches"}
            body={
              sales.length === 0
                ? "Tap New sale above to log one — pick the cake and size, and the cost fills in from the recipe. You can also record from a recipe's cost breakdown, or bring in past sales under Settings → Upload."
                : "Try a different search, or clear the customer and recipe filters above."
            }
          />
        ) : (
          <>
            <div className={`hidden lg:block ${cardCls} overflow-x-auto`}>
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="bg-[var(--surface-alt)] text-left">
                    {selectionMode ? (
                      <th className="px-4 py-3 w-10">
                        <span className="sr-only">Select</span>
                      </th>
                    ) : null}
                    <SortTh label="Date" active={sortKey === "date"} dir={sortDir} onSort={() => toggleSort("date")} />
                    <SortTh label="Recipe" active={sortKey === "recipe"} dir={sortDir} onSort={() => toggleSort("recipe")} />
                    <SortTh label="Customer" active={sortKey === "customer"} dir={sortDir} onSort={() => toggleSort("customer")} />
                    <SortTh label="Price" align="right" active={sortKey === "price"} dir={sortDir} onSort={() => toggleSort("price")} />
                    <SortTh label="Cost" align="right" active={sortKey === "cost"} dir={sortDir} onSort={() => toggleSort("cost")} />
                    <SortTh label="Labour" align="right" active={sortKey === "labour"} dir={sortDir} onSort={() => toggleSort("labour")} />
                    <SortTh label="Profit" align="right" active={sortKey === "profit"} dir={sortDir} onSort={() => toggleSort("profit")} />
                    <SortTh label="Margin" align="right" active={sortKey === "margin"} dir={sortDir} onSort={() => toggleSort("margin")} />
                    <th className="sticky right-0 bg-[var(--surface-alt)] px-4 py-3 w-36">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-t border-[var(--border)] hover:bg-[#fdf8ef]">
                      {selectionMode ? (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select sale of ${s.recipe_name}`}
                            checked={selected.has(s.id)}
                            onChange={() => toggleSelect(s.id)}
                          />
                        </td>
                      ) : null}
                      <td className="px-4 py-3 whitespace-nowrap">{s.sale_date.slice(0, 10)}</td>
                      <td className="px-4 py-3 font-medium text-[#2c1e16]">
                        {s.recipe_name}
                        {s.variant_name ? (
                          <span className="text-[var(--dim)] font-normal"> · {s.variant_name}</span>
                        ) : null}
                        {s.notes ? (
                          <span className="block text-xs text-[var(--dim)] font-normal">{s.notes}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{s.customer_name || "—"}</td>
                      <td className="px-4 py-3 text-right font-mono">{money(s.selling_price, symbol)}</td>
                      <td className="px-4 py-3 text-right font-mono">{money(s.total_cost, symbol)}</td>
                      <td className="px-4 py-3 text-right font-mono">{money(s.labour_cost, symbol)}</td>
                      <td className={`px-4 py-3 text-right font-mono ${s.profit >= 0 ? "text-[#4a6b53]" : "text-[#a63c3c]"}`}>
                        {money(s.profit, symbol)}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${s.profit_margin >= 0 ? "text-[#4a6b53]" : "text-[#a63c3c]"}`}>
                        {s.profit_margin.toFixed(1)}%
                      </td>
                      <td className="sticky right-0 bg-[var(--surface)] px-4 py-3 shadow-[-10px_0_10px_-10px_rgba(44,30,22,0.35)]">
                        <span className="flex justify-end gap-1">
                          <button type="button" className={btnIconSmall} aria-label={`Duplicate sale of ${s.recipe_name}`} title="Duplicate sale" onClick={() => setDuplicateFrom(s)}>
                            <IconCopy />
                          </button>
                          <button type="button" className={btnIconSmall} aria-label={`Edit sale of ${s.recipe_name}`} title="Edit sale" onClick={() => setEdit(s)}>
                            <IconPencil />
                          </button>
                          <button type="button" className={btnIconSmall} aria-label={`Delete sale of ${s.recipe_name}`} title="Delete sale" onClick={() => setConfirm({ kind: "one", target: s })}>
                            <IconTrash />
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 lg:hidden">
              {filtered.map((s) => (
                <article key={s.id} className={`${cardCls} p-4`}>
                  <div className="flex items-start gap-2">
                    {selectionMode ? (
                      <input
                        type="checkbox"
                        aria-label={`Select sale of ${s.recipe_name}`}
                        checked={selected.has(s.id)}
                        onChange={() => toggleSelect(s.id)}
                        className="mt-1"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[#2c1e16]">
                        {s.recipe_name}
                        {s.variant_name ? (
                          <span className="text-[var(--dim)] font-normal"> · {s.variant_name}</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-[var(--dim)]">
                        {s.sale_date.slice(0, 10)}
                        {s.customer_name ? ` · ${s.customer_name}` : ""}
                        {s.notes ? ` · ${s.notes}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center bg-[var(--surface-alt)] rounded-md px-2 py-2.5">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--dim)]">Price</p>
                      <p className="font-mono text-sm">{money(s.selling_price, symbol)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--dim)]">Cost</p>
                      <p className="font-mono text-sm">{money(s.total_cost, symbol)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--dim)]">Profit</p>
                      <p className={`font-mono text-sm ${s.profit >= 0 ? "text-[#4a6b53]" : "text-[#a63c3c]"}`}>
                        {money(s.profit, symbol)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--dim)]">Margin</p>
                      <p className={`font-mono text-sm ${s.profit_margin >= 0 ? "text-[#4a6b53]" : "text-[#a63c3c]"}`}>
                        {s.profit_margin.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex border-t border-[var(--border)] pt-2">
                    <button type="button" className={`${btnGhost} flex-1 [&_svg]:w-4 [&_svg]:h-4`} aria-label={`Duplicate sale of ${s.recipe_name}`} onClick={() => setDuplicateFrom(s)}>
                      <IconCopy /> Duplicate
                    </button>
                    <button type="button" className={`${btnGhost} flex-1 [&_svg]:w-4 [&_svg]:h-4`} aria-label={`Edit sale of ${s.recipe_name}`} onClick={() => setEdit(s)}>
                      <IconPencil /> Edit
                    </button>
                    <button type="button" className={`${btnGhost} flex-1 [&_svg]:w-4 [&_svg]:h-4`} aria-label={`Delete sale of ${s.recipe_name}`} onClick={() => setConfirm({ kind: "one", target: s })}>
                      <IconTrash /> Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      {showNew ? (
        <NewSaleModal
          pastSales={sales}
          onClose={() => setShowNew(false)}
          onSaved={() => {
            invalidate();
            setShowNew(false);
          }}
        />
      ) : null}
      {duplicateFrom ? (
        <NewSaleModal
          key={duplicateFrom.id}
          initial={duplicateFrom}
          pastSales={sales}
          onClose={() => setDuplicateFrom(null)}
          onSaved={() => {
            invalidate();
            setDuplicateFrom(null);
          }}
        />
      ) : null}
      {edit ? (
        <SaleEditModal
          sale={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            invalidate();
            setEdit(null);
          }}
        />
      ) : null}
      {confirm?.kind === "one" ? (
        <ConfirmDialog
          title="Delete sale?"
          message={`The ${confirm.target.sale_date.slice(0, 10)} sale of “${confirm.target.recipe_name}” (${money(confirm.target.selling_price, symbol)}) will be deleted.`}
          busy={delOne.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => delOne.mutate(confirm.target.id)}
        />
      ) : null}
      {confirm?.kind === "bulk" ? (
        <ConfirmDialog
          title="Delete selected sales?"
          message={`${selected.size} sale${selected.size === 1 ? "" : "s"} will be deleted.`}
          busy={bulkDelete.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => bulkDelete.mutate([...selected])}
        />
      ) : null}
    </div>
  );
}

function NewSaleModal({
  onClose,
  onSaved,
  initial = null,
  pastSales,
}: {
  onClose: () => void;
  onSaved: () => void;
  initial?: Sale | null;
  pastSales: Sale[];
}) {
  const toast = useToast();
  const symbol = useSymbol();
  const targetMargin = useTargetMargin();
  const [recipeId, setRecipeId] = useState(initial?.recipe_id ?? "");
  const [variantId, setVariantId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [firstName, setFirstName] = useState(() =>
    initial ? splitSaleName(initial).first : "",
  );
  const [lastName, setLastName] = useState(() =>
    initial ? splitSaleName(initial).last : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [price, setPrice] = useState(
    initial ? String(initial.selling_price) : "",
  );
  const [cost, setCost] = useState(initial ? String(initial.total_cost) : "");
  const [labour, setLabour] = useState(
    initial ? String(initial.labour_cost) : "",
  );
  const [error, setError] = useState("");
  // When duplicating, the copied sale's recorded cost stands until she
  // picks a different recipe/variant herself.
  const [variantPickedByUser, setVariantPickedByUser] = useState(false);
  const customers = useMemo(() => pastCustomers(pastSales), [pastSales]);

  const recipesQ = useQuery({
    queryKey: ["recipes"],
    queryFn: () => api.listRecipes({}),
  });
  const recipes: Recipe[] = recipesQ.data?.recipes ?? [];
  const recipe = recipes.find((r) => r.id === recipeId);
  const variant = recipe?.variants.find((v) => v.id === variantId);

  // When duplicating, select the source sale's recipe + variant once the
  // recipe list has loaded (matching by name if the original was deleted
  // and re-created). Runs once; her own picks are never overridden.
  const dupResolved = useRef(false);
  useEffect(() => {
    if (!initial || dupResolved.current || recipesQ.isPending) return;
    dupResolved.current = true;
    const r =
      recipes.find((x) => x.id === initial.recipe_id) ??
      recipes.find((x) => x.name === initial.recipe_name);
    if (!r) {
      setRecipeId("");
      return;
    }
    setRecipeId(r.id);
    const v =
      r.variants.find((x) => x.name === initial.variant_name) ?? r.variants[0];
    if (v) setVariantId(v.id);
  }, [initial, recipes, recipesQ.isPending]);

  // Prefill the cost fields from the picked variant's live costing; both
  // stay editable, exactly as in the edit form, so a one-off cost can be
  // recorded as-is.
  const costQ = useQuery({
    queryKey: ["variantCost", recipeId, variantId, null],
    queryFn: () =>
      api.variantCost({
        recipe_id: recipeId,
        variant_id: variantId,
        selling_price: null,
      }),
    enabled: !!recipe && !!variant,
  });
  const breakdown = costQ.data?.breakdown;
  useEffect(() => {
    if (breakdown && (!initial || variantPickedByUser)) {
      setCost(String(breakdown.total_cost));
      setLabour(String(breakdown.labour_cost));
    }
  }, [breakdown, initial, variantPickedByUser]);

  const priceNum = parseFloat(price) || 0;
  const costNum = parseFloat(cost) || 0;
  const labourNum = parseFloat(labour) || 0;
  const profit = Math.round((priceNum - costNum) * 100) / 100;
  const margin =
    priceNum > 0 ? Math.round((profit / priceNum) * 10000) / 100 : 0;
  // Recommended price at her target margin, from the cost currently in
  // the form (the picked variant's live cost, or her edit of it). This
  // is the same suggested price the recipe pages show — it belongs here
  // too, at the moment she's choosing what to charge.
  const recommended =
    costNum > 0 ? suggestedPrice(costNum, targetMargin) : null;

  const create = useMutation({
    mutationFn: () =>
      api.createSale({
        recipe_id: recipe?.id ?? "",
        recipe_name: recipe?.name ?? "",
        variant_name: variant?.name ?? "",
        sale_date: date || todayStr(),
        customer_first_name: firstName.trim(),
        customer_last_name: lastName.trim(),
        notes: notes.trim(),
        selling_price: priceNum,
        total_cost: costNum,
        labour_cost: labourNum,
        profit,
        profit_margin: margin,
      }),
    onSuccess: () => {
      playSaleChime();
      toast("Sale recorded");
      onSaved();
    },
    onError: (e) => toast(e.message, "error"),
  });

  const submit = () => {
    if (!recipe || !variant) {
      setError("Pick the recipe and size that was sold.");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setError("Enter the customer's first and last name.");
      return;
    }
    if (price === "" || cost === "") {
      setError("Selling price and total cost are required.");
      return;
    }
    create.mutate();
  };

  return (
    <Modal title={initial ? "Duplicate sale" : "New sale"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Recipe">
            <select
              className={inputCls}
              value={recipeId}
              onChange={(e) => {
                const next = recipes.find((r) => r.id === e.target.value);
                setRecipeId(e.target.value);
                setVariantId(next?.variants[0]?.id ?? "");
                setVariantPickedByUser(true);
                setCost("");
                setLabour("");
              }}
              aria-label="Recipe"
            >
              <option value="">Choose a recipe…</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Variant">
            <select
              className={inputCls}
              value={variantId}
              onChange={(e) => {
                setVariantId(e.target.value);
                setVariantPickedByUser(true);
              }}
              disabled={!recipe}
              aria-label="Variant"
            >
              <option value="">Choose a size…</option>
              {(recipe?.variants ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sale date">
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div className="col-span-2">
            <CustomerNameFields
              firstName={firstName}
              lastName={lastName}
              onFirstChange={setFirstName}
              onLastChange={setLastName}
              customers={customers}
            />
          </div>
          <Field label={`Selling price (${symbol})`}>
            <input {...FIELDS.createSale.selling_price} className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="0.00" />
          </Field>
          <Field label={`Total cost (${symbol})`}>
            <input {...FIELDS.createSale.total_cost} className={inputCls} value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder={costQ.isFetching ? "Costing…" : "0.00"} />
          </Field>
          <Field label={`Labour cost (${symbol})`}>
            <input {...FIELDS.createSale.labour_cost} className={inputCls} value={labour} onChange={(e) => setLabour(e.target.value)} inputMode="decimal" placeholder="0.00" />
          </Field>
          <Field label="Notes">
            <input {...FIELDS.createSale.notes} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Occasion, delivery, anything" />
          </Field>
        </div>
        {recommended != null ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#ae8a3e]/40 bg-[#f9ecd7] px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#2c1e16]">
                Recommended price {wholeMoney(recommended, symbol)}
              </p>
              <p className="text-xs text-[var(--dim)]">
                At your {fmtPercent(targetMargin)}% target margin · based on
                cost {money(costNum, symbol)}
              </p>
            </div>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setPrice(String(recommended))}
              aria-label={`Use recommended price ${wholeMoney(recommended, symbol)}`}
            >
              Use this price
            </button>
          </div>
        ) : recipe && variant ? (
          <p className="text-sm text-[var(--dim)]">
            {costQ.isFetching
              ? "Working out the recommended price…"
              : `The recommended price at your ${fmtPercent(targetMargin)}% target margin will appear here once the cost is in.`}
          </p>
        ) : (
          <p className="text-sm text-[var(--dim)]">
            Pick a recipe and size to see the recommended price at your{" "}
            {fmtPercent(targetMargin)}% target margin.
          </p>
        )}
        <div className="flex items-center justify-between bg-[var(--surface-alt)] rounded-md px-4 py-3 text-sm">
          <span className="text-[var(--dim)]">Profit</span>
          <span className={`font-mono font-semibold ${profit >= 0 ? "text-[#4a6b53]" : "text-[#a63c3c]"}`}>
            {money(profit, symbol)} · {margin.toFixed(1)}%
          </span>
        </div>
        {recipesQ.isSuccess && recipes.length === 0 ? (
          <p role="alert" className="text-sm text-[#a63c3c]">
            There are no recipes yet — add one first, then record its sales here.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-[#a63c3c]">
            {error}
          </p>
        ) : null}
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary} disabled={create.isPending}>
            {create.isPending ? "Recording…" : "Record sale"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SaleEditModal({
  sale,
  onClose,
  onSaved,
}: {
  sale: Sale;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const symbol = useSymbol();
  const targetMargin = useTargetMargin();
  const [recipeName, setRecipeName] = useState(sale.recipe_name);
  const [variantName, setVariantName] = useState(sale.variant_name);
  const [date, setDate] = useState(sale.sale_date.slice(0, 10));
  // Older sales carry only the combined name — split it the same way
  // the server backfilled (first space) so the fields start sensible.
  const [firstName, setFirstName] = useState(() => {
    if (sale.customer_first_name) return sale.customer_first_name;
    const at = sale.customer_name.indexOf(" ");
    return at > 0 ? sale.customer_name.slice(0, at) : sale.customer_name;
  });
  const [lastName, setLastName] = useState(() => {
    if (sale.customer_first_name || sale.customer_last_name)
      return sale.customer_last_name;
    const at = sale.customer_name.indexOf(" ");
    return at > 0 ? sale.customer_name.slice(at + 1) : "";
  });
  const [notes, setNotes] = useState(sale.notes);
  const [price, setPrice] = useState(String(sale.selling_price));
  const [cost, setCost] = useState(String(sale.total_cost));
  const [labour, setLabour] = useState(String(sale.labour_cost));
  const [error, setError] = useState("");

  const priceNum = parseFloat(price) || 0;
  const costNum = parseFloat(cost) || 0;
  const labourNum = parseFloat(labour) || 0;
  const profit = Math.round((priceNum - costNum) * 100) / 100;
  const margin =
    priceNum > 0 ? Math.round((profit / priceNum) * 10000) / 100 : 0;
  const recommended =
    costNum > 0 ? suggestedPrice(costNum, targetMargin) : null;

  const update = useMutation({
    mutationFn: () =>
      api.updateSale({
        id: sale.id,
        recipe_name: recipeName.trim(),
        variant_name: variantName.trim(),
        sale_date: date || sale.sale_date,
        customer_first_name: firstName.trim(),
        customer_last_name: lastName.trim(),
        notes: notes.trim(),
        selling_price: priceNum,
        total_cost: costNum,
        labour_cost: labourNum,
        profit,
        profit_margin: margin,
      }),
    onSuccess: () => {
      toast("Sale saved");
      onSaved();
    },
    onError: (e) => toast(e.message, "error"),
  });

  const submit = () => {
    if (!recipeName.trim()) {
      setError("The recipe name can't be empty.");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setError("Enter the customer's first and last name.");
      return;
    }
    if (price === "" || cost === "") {
      setError("Selling price and total cost are required.");
      return;
    }
    update.mutate();
  };

  return (
    <Modal title="Edit sale" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Recipe">
            <input {...FIELDS.updateSale.recipe_name} className={inputCls} value={recipeName} onChange={(e) => setRecipeName(e.target.value)} />
          </Field>
          <Field label="Variant">
            <input {...FIELDS.updateSale.variant_name} className={inputCls} value={variantName} onChange={(e) => setVariantName(e.target.value)} />
          </Field>
          <Field label="Sale date">
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4 col-span-2">
            <Field label="Customer first name">
              <input {...FIELDS.updateSale.customer_first_name} className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Leo" />
            </Field>
            <Field label="Customer last name">
              <input {...FIELDS.updateSale.customer_last_name} className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="e.g. Divecha" />
            </Field>
          </div>
          <Field label={`Selling price (${symbol})`}>
            <input {...FIELDS.updateSale.selling_price} className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label={`Total cost (${symbol})`}>
            <input {...FIELDS.updateSale.total_cost} className={inputCls} value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label={`Labour cost (${symbol})`}>
            <input {...FIELDS.updateSale.labour_cost} className={inputCls} value={labour} onChange={(e) => setLabour(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Notes">
            <input {...FIELDS.updateSale.notes} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        {recommended != null ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#ae8a3e]/40 bg-[#f9ecd7] px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#2c1e16]">
                Recommended price {wholeMoney(recommended, symbol)}
              </p>
              <p className="text-xs text-[var(--dim)]">
                At your {fmtPercent(targetMargin)}% target margin · based on
                cost {money(costNum, symbol)}
              </p>
            </div>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setPrice(String(recommended))}
              aria-label={`Use recommended price ${wholeMoney(recommended, symbol)}`}
            >
              Use this price
            </button>
          </div>
        ) : null}
        <div className="flex items-center justify-between bg-[var(--surface-alt)] rounded-md px-4 py-3 text-sm">
          <span className="text-[var(--dim)]">Profit</span>
          <span className={`font-mono font-semibold ${profit >= 0 ? "text-[#4a6b53]" : "text-[#a63c3c]"}`}>
            {money(profit, symbol)} · {margin.toFixed(1)}%
          </span>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-[#a63c3c]">
            {error}
          </p>
        ) : null}
        <div className="flex gap-3 justify-end pt-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
