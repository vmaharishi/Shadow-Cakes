import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import {
money,
qty,
unitMoney,
useSymbol,
type Component,
type LineItem,
type PackLine,
} from "../lib";

type CompVariant = Component["variants"][number];
import { IngredientLinesEditor, PackagingLinesEditor } from "../editors";
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
Modal,
useToast,
IconCopy,
IconPencil,
IconPlus,
IconTrash,
} from "../ui";

export function ComponentsPage() {
  const symbol = useSymbol();
  const toast = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Component | "new" | null>(null);
  const [confirm, setConfirm] = useState<
    { kind: "one"; target: Component } | null
  >(null);

  const q = useQuery({
    queryKey: ["components"],
    queryFn: () => api.listComponents({}),
  });
  const components = useMemo(() => q.data?.components ?? [], [q.data]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return components;
    return components.filter((c) => c.name.toLowerCase().includes(s));
  }, [components, search]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["components"] });
  const onErr = (e: Error) => toast(e.message, "error");
  const delOne = useMutation({
    mutationFn: (id: string) => api.deleteComponent({ id }),
    onSuccess: () => {
      invalidate();
      toast("Component deleted");
      setConfirm(null);
    },
    onError: onErr,
  });


  return (
    <div>
      <div className="flex items-start sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-light tracking-tight text-[#1a1a1a]">
            Components
          </h1>
          <p className="text-sm text-[var(--dim)] mt-1">
            <span className="sm:hidden">
              {components.length} component{components.length === 1 ? "" : "s"}
            </span>
            <span className="hidden sm:inline">
              {components.length} reusable sub-recipe
              {components.length === 1 ? "" : "s"} — frostings, ganaches,
              fillings, each with its sizes underneath
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button type="button" className={btnPrimary} onClick={() => setForm("new")}>
            <IconPlus /> New component
          </button>
        </div>
      </div>

      <div className="mt-5">
        <label className="block max-w-md">
          <span className="sr-only">Search components</span>
          <input
            type="search"
            className={inputCls}
            placeholder="Search components…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-6">
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorNote error={q.error} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={components.length === 0 ? "No components yet" : "Nothing matches"}
            body={
              components.length === 0
                ? "Components are the frostings, ganaches, and fillings you make once and reuse across cakes. Cost a batch here — one component holds every size — then drop it into any recipe by the gram or by the batch."
                : "Try a different search."
            }
          >
            {components.length === 0 ? (
              <button type="button" className={btnPrimary} onClick={() => setForm("new")}>
                <IconPlus /> Add your first component
              </button>
            ) : null}
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((c) => (
              <article key={c.id} className={`${cardCls} p-5 flex flex-col`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-heading text-lg font-medium text-[#2c1e16] leading-snug">
                      {c.name}
                    </h2>
                    <p className="text-xs text-[var(--dim)]">
                      {c.variants.length} size{c.variants.length === 1 ? "" : "s"}
                      {c.notes ? ` · ${c.notes}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={btnGhost}
                    aria-label={`Edit ${c.name}`}
                    onClick={() => setForm(c)}
                  >
                    <IconPencil />
                  </button>
                  <button
                    type="button"
                    className={btnGhost}
                    aria-label={`Delete ${c.name}`}
                    onClick={() => setConfirm({ kind: "one", target: c })}
                  >
                    <IconTrash />
                  </button>
                </div>
                <div className="mt-4 space-y-1.5">
                  {c.variants.map((v) => (
                    <div
                      key={v.id}
                      className="bg-[var(--surface-alt)] rounded-md px-3 py-2 flex items-baseline justify-between gap-2"
                    >
                      <span className="text-sm font-medium min-w-0 truncate">
                        {v.name}
                        {v.batch_yield_grams > 0 ? (
                          <span className="block text-[11px] text-[var(--dim)] font-normal">
                            yields {qty(v.batch_yield_grams)} g ·{" "}
                            {unitMoney(v.cost_per_gram, symbol)}/g
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono text-sm text-[#2c1e16] shrink-0">
                        {money(v.batch_cost, symbol)}
                      </span>
                    </div>
                  ))}
                  {c.variants.length === 0 ? (
                    <p className="text-sm text-[var(--dim)]">No sizes yet</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={`${btnSecondary} mt-4 w-full`}
                  onClick={() => setForm(c)}
                >
                  Open component
                </button>
              </article>
            ))}
          </div>
        )}
      </div>

      {form ? (
        <ComponentForm
          key={form === "new" ? "new" : form.id}
          initial={form === "new" ? null : form}
          onClose={() => setForm(null)}
          onSaved={() => {
            invalidate();
            setForm(null);
          }}
        />
      ) : null}
      {confirm?.kind === "one" ? (
        <ConfirmDialog
          title="Delete component?"
          message={`“${confirm.target.name}” and all its sizes will be deleted. Recipes that use it will stop costing that component.`}
          busy={delOne.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => delOne.mutate(confirm.target.id)}
        />
      ) : null}
    </div>
  );
}

// ---------- form ----------

interface DraftVariant {
  id: string;
  name: string;
  batch_yield_grams: string;
  prep_time_minutes: string;
  utility_time_minutes: string;
  notes: string;
  ingredients: LineItem[];
  packaging: PackLine[];
}

const blankVariant = (name = "Standard"): DraftVariant => ({
  id: crypto.randomUUID(),
  name,
  batch_yield_grams: "",
  prep_time_minutes: "",
  utility_time_minutes: "",
  notes: "",
  ingredients: [],
  packaging: [],
});

const toDraft = (v: CompVariant): DraftVariant => ({
  id: v.id,
  name: v.name,
  batch_yield_grams: v.batch_yield_grams ? String(v.batch_yield_grams) : "",
  prep_time_minutes: v.prep_time_minutes ? String(v.prep_time_minutes) : "",
  utility_time_minutes:
    v.utility_time_minutes != null ? String(v.utility_time_minutes) : "",
  notes: v.notes ?? "",
  ingredients: v.ingredients,
  packaging: v.packaging,
});

function ComponentForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Component | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const symbol = useSymbol();
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [variants, setVariants] = useState<DraftVariant[]>(
    initial && initial.variants.length > 0
      ? initial.variants.map(toDraft)
      : [blankVariant()],
  );
  const [activeId, setActiveId] = useState<string>(
    initial?.variants[0]?.id ?? variants[0]?.id ?? "",
  );
  const [confirmDeleteVariant, setConfirmDeleteVariant] = useState(false);
  const [error, setError] = useState("");

  const active = variants.find((v) => v.id === activeId) ?? variants[0];

  const ingredientsQ = useQuery({
    queryKey: ["ingredients"],
    queryFn: () => api.listIngredients({}),
  });
  const packagingQ = useQuery({
    queryKey: ["packaging"],
    queryFn: () => api.listPackaging({}),
  });

  const updateVariant = (id: string, patch: Partial<DraftVariant>) =>
    setVariants((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  const addVariant = () => {
    const v = blankVariant("");
    setVariants((vs) => [...vs, v]);
    setActiveId(v.id);
  };

  const duplicateVariant = () => {
    if (!active) return;
    const copy: DraftVariant = {
      ...JSON.parse(JSON.stringify(active)),
      id: crypto.randomUUID(),
      name: `${active.name} (copy)`,
      ingredients: active.ingredients.map((l) => ({
        ...l,
        id: crypto.randomUUID(),
      })),
      packaging: active.packaging.map((l) => ({
        ...l,
        id: crypto.randomUUID(),
      })),
    };
    setVariants((vs) => [...vs, copy]);
    setActiveId(copy.id);
  };

  const deleteVariant = () => {
    if (!active) return;
    const rest = variants.filter((v) => v.id !== active.id);
    setVariants(rest);
    setActiveId(rest[0]?.id ?? "");
    setConfirmDeleteVariant(false);
  };

  const payload = () => ({
    name: name.trim(),
    notes: notes.trim() || null,
    variants: variants.map((v) => ({
      id: v.id,
      name: v.name.trim(),
      batch_yield_grams: parseFloat(v.batch_yield_grams) || 0,
      prep_time_minutes: parseFloat(v.prep_time_minutes) || 0,
      utility_time_minutes:
        v.utility_time_minutes === ""
          ? null
          : parseFloat(v.utility_time_minutes) || 0,
      notes: v.notes.trim() || null,
      ingredients: v.ingredients.map((l) => ({
        id: l.id,
        ingredient_id: l.ingredient_id,
        ingredient_name: l.ingredient_name,
        quantity: l.quantity,
        unit: l.unit,
        price_id_override: l.price_id_override,
      })),
      packaging: v.packaging.map((l) => ({
        id: l.id,
        packaging_id: l.packaging_id,
        packaging_name: l.packaging_name,
        quantity: l.quantity,
      })),
    })),
  });

  const create = useMutation({
    mutationFn: () => api.createComponent(payload()),
    onSuccess: () => {
      toast("Component added");
      qc.invalidateQueries({ queryKey: ["components"] });
      onSaved();
    },
    onError: (e) => toast(e.message, "error"),
  });
  const update = useMutation({
    mutationFn: () => api.updateComponent({ id: initial?.id ?? "", ...payload() }),
    onSuccess: () => {
      toast("Component saved");
      qc.invalidateQueries({ queryKey: ["components"] });
      onSaved();
    },
    onError: (e) => toast(e.message, "error"),
  });
  const busy = create.isPending || update.isPending;

  const submit = () => {
    if (!name.trim()) {
      setError("Give the component a name.");
      return;
    }
    if (variants.some((v) => !v.name.trim())) {
      setError("Every size needs a name — usually the cake size it covers, like 6-inch.");
      return;
    }
    if (initial) update.mutate();
    else create.mutate();
  };

  return (
    <Modal
      title={initial ? `Edit — ${initial.name}` : "New component"}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-6"
      >
        <div className="grid gap-4 sm:grid-cols-2 items-end">
          <Field label="Name">
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dark Chocolate Ganache"
              autoFocus
            />
          </Field>
          <Field label="Notes (optional)">
            <input
              className={inputCls}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Storage, shelf life…"
            />
          </Field>
        </div>

        {/* Variant tabs */}
        <div>
          <div
            className="flex flex-wrap items-center gap-2"
            role="tablist"
            aria-label="Component sizes"
          >
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={v.id === active?.id}
                onClick={() => setActiveId(v.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold border transition-colors ${
                  v.id === active?.id
                    ? "bg-[#2c1e16] text-white border-[#2c1e16]"
                    : "bg-[var(--surface)] text-[var(--dim)] border-[var(--border)] hover:bg-[#f9ecd7]"
                }`}
              >
                {v.name || "Unnamed size"}
              </button>
            ))}
            <button type="button" className={btnGhost} onClick={addVariant}>
              <IconPlus /> Add size
            </button>
          </div>

          {active ? (
            <div className="mt-4 space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 items-end">
                <Field label="Size name">
                  <input
                    className={inputCls}
                    value={active.name}
                    onChange={(e) => updateVariant(active.id, { name: e.target.value })}
                    placeholder="e.g. 6-inch"
                    aria-label="Size name"
                  />
                </Field>
                <Field label="Batch yield (grams)">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className={inputCls}
                    value={active.batch_yield_grams}
                    onChange={(e) =>
                      updateVariant(active.id, { batch_yield_grams: e.target.value })
                    }
                    placeholder="e.g. 800"
                  />
                </Field>
                <Field label="Prep time (minutes)">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className={inputCls}
                    value={active.prep_time_minutes}
                    onChange={(e) =>
                      updateVariant(active.id, { prep_time_minutes: e.target.value })
                    }
                    placeholder="e.g. 20"
                  />
                </Field>
                <Field label="Utility time (minutes, optional)">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className={inputCls}
                    value={active.utility_time_minutes}
                    onChange={(e) =>
                      updateVariant(active.id, { utility_time_minutes: e.target.value })
                    }
                    placeholder="Same as prep time"
                  />
                </Field>
              </div>
              <p className="text-xs text-[var(--dim)] -mt-3">
                Batch yield enables per-gram costing when this size is used in
                a recipe. Prep time drives its labour cost; utility time (when
                the oven runs for a different length) drives its utility cost.
              </p>

              <section>
                <h3 className="font-heading text-base font-medium text-[#2c1e16] mb-3">
                  Ingredients
                </h3>
                <IngredientLinesEditor
                  lines={active.ingredients}
                  onChange={(lines) => updateVariant(active.id, { ingredients: lines })}
                  ingredients={ingredientsQ.data?.ingredients ?? []}
                  symbol={symbol}
                />
              </section>
              <section>
                <h3 className="font-heading text-base font-medium text-[#2c1e16] mb-3">
                  Packaging
                </h3>
                <PackagingLinesEditor
                  lines={active.packaging}
                  onChange={(lines) => updateVariant(active.id, { packaging: lines })}
                  packaging={packagingQ.data?.packaging ?? []}
                  symbol={symbol}
                />
              </section>

              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" className={btnSecondary} onClick={duplicateVariant}>
                  <IconCopy /> Duplicate this size
                </button>
                {variants.length > 1 ? (
                  <button
                    type="button"
                    className="text-sm font-medium text-[#a63c3c] hover:bg-[#a63c3c]/10 rounded-md px-3 py-1.5"
                    onClick={() => setConfirmDeleteVariant(true)}
                  >
                    Delete this size
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

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
            {busy ? "Saving…" : initial ? "Save changes" : "Add component"}
          </button>
        </div>
      </form>

      {confirmDeleteVariant && active ? (
        <ConfirmDialog
          title="Delete this size?"
          message={`The “${active.name}” size will be removed from “${name}” when you save. Recipes costing that size will stop costing it.`}
          busy={false}
          onCancel={() => setConfirmDeleteVariant(false)}
          onConfirm={deleteVariant}
        />
      ) : null}
    </Modal>
  );
}
