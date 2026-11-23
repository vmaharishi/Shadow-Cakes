import { useMemo, useState, type ReactNode } from "react";
import {
useMutation,
useQueries,
useQuery,
useQueryClient,
} from "@tanstack/react-query";
import { api } from "../api";
import {
FIELDS,
fmtPercent,
money,
playSaleChime,
preparePhoto,
qty,
suggestedPrice,
todayStr,
unitMoney,
wholeMoney,
useSymbol,
useTargetMargin,
type Breakdown,
type CostSnapshot,
type PreparedPhoto,
type Recipe,
type Variant,
} from "../lib";
import {
ComponentLinesEditor,
IngredientLinesEditor,
PackagingLinesEditor,
} from "../editors";
import { CustomerNameFields, pastCustomers } from "../customers";
import {
btnGhost,
btnPrimary,
btnSecondary,
cardCls,
ConfirmDialog,
EmptyState,
ErrorNote,
Field,
inputCls,
labelCls,
Loading,
microLabel,
Modal,
useToast,
IconBack,
IconCamera,
IconCopy,
IconPlus,
IconTrash,
} from "../ui";

// Baked-goods types offered in the category dropdown; categories already
// in use are merged in, and "Add a new category…" covers anything else.
const CATEGORY_PRESETS = [
  "Cake",
  "Cupcakes",
  "Cookies",
  "Brownies & Bars",
  "Cheesecake",
  "Tarts & Pies",
  "Muffins & Loaves",
  "Breads",
  "Pastries",
  "Other",
];

export function CategoryField({
  value,
  onChange,
  categories,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  categories: string[];
}) {
  const [adding, setAdding] = useState(false);
  const options = useMemo(() => {
    const set = new Set<string>(CATEGORY_PRESETS);
    for (const c of categories) if (c) set.add(c);
    if (value) set.add(value);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [categories, value]);
  if (adding) {
    return (
      <div className="flex gap-2">
        <input
          className={inputCls}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="New category"
          aria-label="New category"
          autoFocus
        />
        <button
          type="button"
          className={`${btnSecondary} shrink-0`}
          onClick={() => setAdding(false)}
        >
          Use list
        </button>
      </div>
    );
  }
  return (
    <select
      className={inputCls}
      value={value ?? ""}
      aria-label="Category"
      onChange={(e) => {
        if (e.target.value === "__add__") {
          setAdding(true);
          onChange(null);
        } else {
          onChange(e.target.value || null);
        }
      }}
    >
      <option value="">No category</option>
      {options.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value="__add__">Add a new category…</option>
    </select>
  );
}

export function RecipesPage({
  openId,
  onOpen,
  onCloseDetail,
}: {
  openId: string | null;
  onOpen: (id: string) => void;
  onCloseDetail: () => void;
}) {
  const symbol = useSymbol();
  const targetMargin = useTargetMargin();
  const toast = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const recipesQ = useQuery({
    queryKey: ["recipes"],
    queryFn: () => api.listRecipes({}),
  });
  const ingredientsQ = useQuery({
    queryKey: ["ingredients"],
    queryFn: () => api.listIngredients({}),
  });
  const packagingQ = useQuery({
    queryKey: ["packaging"],
    queryFn: () => api.listPackaging({}),
  });
  const componentsQ = useQuery({
    queryKey: ["components"],
    queryFn: () => api.listComponents({}),
  });

  const recipes = useMemo(() => recipesQ.data?.recipes ?? [], [recipesQ.data]);
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes) if (r.category) set.add(r.category);
    return [...set];
  }, [recipes]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return recipes;
    return recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        (r.category ?? "").toLowerCase().includes(s),
    );
  }, [recipes, search]);

  // Live total cost per variant for the library cards.
  const flat = useMemo(
    () =>
      recipes.flatMap((r) =>
        r.variants.map((v) => ({ recipeId: r.id, variantId: v.id })),
      ),
    [recipes],
  );
  const costQueries = useQueries({
    queries: flat.map((f) => ({
      queryKey: ["variantCost", f.recipeId, f.variantId, null],
      queryFn: () =>
        api.variantCost({
          recipe_id: f.recipeId,
          variant_id: f.variantId,
          selling_price: null,
        }),
    })),
  });
  const costMap = new Map<string, number>();
  flat.forEach((f, i) => {
    const d = costQueries[i]?.data;
    if (d) costMap.set(`${f.recipeId}:${f.variantId}`, d.breakdown.total_cost);
  });

  const openRecipe = openId ? recipes.find((r) => r.id === openId) : undefined;

  // Duplicate copies the recipe's first variant as a new variant under
  // the same recipe — a new size of the same cake, not a new card.
  const duplicate = useMutation({
    mutationFn: (r: Recipe) => {
      const first = r.variants[0];
      if (!first) throw new Error("Add a variant first, then duplicate it.");
      return api.duplicateRecipeVariant({
        recipe_id: r.id,
        variant_id: first.id,
      });
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast(`“${updated.name}” gained a copied variant — rename it and make it yours`);
      onOpen(updated.id);
    },
    onError: (e) => toast(e.message, "error"),
  });

  if (openId) {
    if (!openRecipe) {
      return recipesQ.isPending ? (
        <Loading />
      ) : (
        <div>
          <button type="button" className={btnGhost} onClick={onCloseDetail}>
            <IconBack /> All recipes
          </button>
          <div className="mt-6">
            <EmptyState
              title="Recipe not found"
              body="It may have been deleted. Head back to the library to pick another."
            />
          </div>
        </div>
      );
    }
    return (
      <RecipeDetail
        key={openRecipe.id}
        recipe={openRecipe}
        categories={categories}
        ingredients={ingredientsQ.data?.ingredients ?? []}
        packaging={packagingQ.data?.packaging ?? []}
        components={componentsQ.data?.components ?? []}
        onBack={onCloseDetail}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-light tracking-tight text-[#1a1a1a]">
            Recipes
          </h1>
          <p className="text-sm text-[var(--dim)] mt-1">
            {recipes.length} recipe{recipes.length === 1 ? "" : "s"} — tap one to
            cost it, price it, and record sales
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={() => setCreateOpen(true)}>
            <IconPlus /> New recipe
          </button>
        </div>
      </div>

      <div className="mt-5">
        <label className="block max-w-md">
          <span className="sr-only">Search recipes</span>
          <input
            type="search"
            className={inputCls}
            placeholder="Search recipes or categories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-6">
        {recipesQ.isPending ? (
          <Loading />
        ) : recipesQ.error ? (
          <ErrorNote error={recipesQ.error} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={recipes.length === 0 ? "No recipes yet" : "Nothing matches"}
            body={
              recipes.length === 0
                ? "Create a recipe, add a size variant, and build it from your ingredients, components, and packaging. The tool works out exactly what each cake costs to make."
                : "Try a different search — recipes match on name or category."
            }
          >
            {recipes.length === 0 ? (
              <button type="button" className={btnPrimary} onClick={() => setCreateOpen(true)}>
                <IconPlus /> Create your first recipe
              </button>
            ) : null}
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r) => (
              <article key={r.id} className={`${cardCls} overflow-hidden flex flex-col`}>
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-start gap-3">
                    {r.photo_url ? (
                      <button
                        type="button"
                        onClick={() => onOpen(r.id)}
                        aria-label={`Open ${r.name}`}
                        className="shrink-0 min-h-0"
                      >
                        <img
                          src={r.photo_url}
                          alt={`Photo of ${r.name}`}
                          loading="lazy"
                          className="block w-24 h-24 object-cover rounded-md border border-[var(--border)]"
                        />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="text-left flex-1 min-w-0"
                      onClick={() => onOpen(r.id)}
                      aria-label={`Open ${r.name}`}
                    >
                      <h2 className="font-heading text-xl font-medium text-[#2c1e16] leading-snug">
                        {r.name}
                      </h2>
                      {r.category ? (
                        <span className="inline-block mt-2 bg-[#f9ecd7] border border-[var(--border)] rounded-full px-2.5 py-0.5 text-xs font-medium text-[var(--dim)]">
                          {r.category}
                        </span>
                      ) : null}
                      {r.notes ? (
                        <p className="mt-2 text-sm text-[var(--dim)] line-clamp-2">{r.notes}</p>
                      ) : null}
                    </button>
                  </div>
                  <div className="mt-4 space-y-1.5">
                    {r.variants.map((v) => {
                      const c = costMap.get(`${r.id}:${v.id}`);
                      const suggested = c != null ? suggestedPrice(c, targetMargin) : null;
                      return (
                        <div
                          key={v.id}
                          className="flex items-center justify-between gap-3 bg-[var(--surface-alt)] rounded-md px-3 py-2"
                        >
                          <span className="text-sm font-medium">{v.name}</span>
                          <span className="text-right">
                            <span className="block font-mono text-sm text-[#2c1e16]">
                              {c != null ? money(c, symbol) : "…"}
                            </span>
                            {suggested != null ? (
                              <span className="block text-xs text-[var(--dim)]">
                                Suggested {wholeMoney(suggested, symbol)} · at{" "}
                                {fmtPercent(targetMargin)}%
                              </span>
                            ) : null}
                          </span>
                        </div>
                      );
                    })}
                    {r.variants.length === 0 ? (
                      <p className="text-sm text-[var(--dim)]">No variants yet</p>
                    ) : null}
                  </div>
                  <div className="mt-4 flex gap-2 mt-auto pt-1">
                    <button
                      type="button"
                      className={`${btnSecondary} flex-1`}
                      onClick={() => onOpen(r.id)}
                    >
                      Open recipe
                    </button>
                    <button
                      type="button"
                      className={btnSecondary}
                      onClick={() => duplicate.mutate(r)}
                      disabled={duplicate.isPending || r.variants.length === 0}
                      aria-label={`Duplicate a variant of ${r.name}`}
                    >
                      <IconCopy /> Duplicate
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {createOpen ? (
        <CreateRecipeModal
          categories={categories}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            qc.invalidateQueries({ queryKey: ["recipes"] });
            setCreateOpen(false);
            onOpen(id);
          }}
        />
      ) : null}
    </div>
  );
}

function CreateRecipeModal({
  categories,
  onClose,
  onCreated,
}: {
  categories: string[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [variantName, setVariantName] = useState("Standard");
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const create = useMutation({
    mutationFn: async (): Promise<{ id: string; photoFailed: boolean }> => {
      const r = await api.createRecipe({
        name: name.trim(),
        category: category.trim() || null,
        notes: notes.trim() || null,
        variants: [
          {
            name: variantName.trim() || "Standard",
            ingredients: [],
            packaging: [],
            components: [],
            prep_time_minutes: 0,
            notes: null,
          },
        ],
      });
      let photoFailed = false;
      if (photo) {
        try {
          await api.setRecipePhoto({
            id: r.id,
            data_base64: photo.dataBase64,
            mime_type: photo.mimeType,
          });
        } catch {
          photoFailed = true;
        }
      }
      return { id: r.id, photoFailed };
    },
    onSuccess: (r) => {
      toast(
        r.photoFailed
          ? "Recipe created — the photo didn't save; add it from the recipe page"
          : "Recipe created — now build its variant",
      );
      onCreated(r.id);
    },
    onError: (e) => toast(e.message, "error"),
  });

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    setError("");
    try {
      setPhoto(await preparePhoto(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That photo couldn't be used.");
    } finally {
      setPhotoBusy(false);
    }
  };
  return (
    <Modal title="New recipe" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) {
            setError("Give the recipe a name.");
            return;
          }
          create.mutate();
        }}
        className="space-y-4"
      >
        <Field label="Recipe name">
          <input
            {...FIELDS.createRecipe.name}
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Vanilla Bean Layer Cake"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category (optional)">
            <CategoryField
              value={category || null}
              onChange={(v) => setCategory(v ?? "")}
              categories={categories}
            />
          </Field>
          <Field label="First variant (size)">
            <input
              {...FIELDS.createRecipe.variants.name}
              className={inputCls}
              value={variantName}
              onChange={(e) => setVariantName(e.target.value)}
              placeholder="e.g. 8-inch"
            />
          </Field>
        </div>
        <Field label="Notes (optional)">
          <textarea
            {...FIELDS.createRecipe.notes}
            className={`${inputCls} min-h-20`}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Where the recipe came from, method notes, what to watch for…"
          />
        </Field>
        <div>
          <span className={labelCls}>Photo (optional)</span>
          {photo ? (
            <div className="relative w-24 h-24">
              <img
                src={`data:${photo.mimeType};base64,${photo.dataBase64}`}
                alt="Photo chosen for this recipe"
                className="block w-24 h-24 object-cover rounded-md border border-[var(--border)]"
              />
              <button
                type="button"
                className="absolute top-2 right-2 bg-[#2c1e16]/85 text-white text-xs font-semibold rounded-md px-2.5 py-1.5"
                onClick={() => setPhoto(null)}
                aria-label="Remove chosen photo"
              >
                Remove
              </button>
            </div>
          ) : (
            <label
              className={`${btnSecondary} w-full cursor-pointer ${photoBusy ? "opacity-50 pointer-events-none" : ""}`}
            >
              <IconCamera /> {photoBusy ? "Preparing photo…" : "Add a photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label="Recipe photo"
                onChange={(e) => {
                  void pickPhoto(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          )}
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
          <button type="submit" className={btnPrimary} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create recipe"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- recipe detail ----------
function RecipeDetail({
  recipe,
  categories,
  ingredients,
  packaging,
  components,
  onBack,
}: {
  recipe: Recipe;
  categories: string[];
  ingredients: Parameters<typeof IngredientLinesEditor>[0]["ingredients"];
  packaging: Parameters<typeof PackagingLinesEditor>[0]["packaging"];
  components: Parameters<typeof ComponentLinesEditor>[0]["components"];
  onBack: () => void;
}) {
  const symbol = useSymbol();
  const targetMargin = useTargetMargin();
  const toast = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Recipe>(() =>
    JSON.parse(JSON.stringify(recipe)),
  );
  const [baseline, setBaseline] = useState(() => JSON.stringify(recipe));
  const [activeId, setActiveId] = useState<string>(
    recipe.variants[0]?.id ?? "",
  );
  const [priceInput, setPriceInput] = useState<Record<string, string>>({});
  const [submittedPrice, setSubmittedPrice] = useState<Record<string, number | null>>({});
  const [variantModal, setVariantModal] = useState<"add" | "rename" | null>(null);
  const [confirm, setConfirm] = useState<"recipe" | "variant" | "photo" | null>(null);
  const [saleOpen, setSaleOpen] = useState(false);

  const dirty = JSON.stringify(draft) !== baseline;
  const active: Variant | undefined = draft.variants.find((v) => v.id === activeId);

  const save = useMutation({
    mutationFn: (d: Recipe) =>
      api.updateRecipe({
        id: d.id,
        name: d.name,
        category: d.category,
        notes: d.notes,
        variants: d.variants.map((v) => ({
          id: v.id,
          name: v.name,
          ingredients: v.ingredients,
          packaging: v.packaging,
          components: v.components,
          prep_time_minutes: v.prep_time_minutes,
          utility_time_minutes: v.utility_time_minutes ?? null,
          notes: v.notes,
        })),
      }),
    onSuccess: (_r, d) => {
      setBaseline(JSON.stringify(d));
      qc.invalidateQueries({ queryKey: ["recipes"] });
      qc.invalidateQueries({ queryKey: ["variantCost"] });
      qc.invalidateQueries({ queryKey: ["costHistory"] });
    },
    onError: (e) => toast(e.message, "error"),
  });

  const del = useMutation({
    mutationFn: () => api.deleteRecipe({ id: recipe.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast("Recipe deleted");
      onBack();
    },
    onError: (e) => toast(e.message, "error"),
  });

  // Duplicate copies the active variant as a new variant under this
  // same recipe — the starting point for another size of the same cake.
  const dup = useMutation({
    mutationFn: () => {
      if (!active) throw new Error("Add a variant first, then duplicate it.");
      return api.duplicateRecipeVariant({
        recipe_id: recipe.id,
        variant_id: active.id,
      });
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      const copy = updated.variants.find(
        (v) => !draft.variants.some((d) => d.id === v.id),
      );
      const next = JSON.parse(JSON.stringify(updated)) as Recipe;
      setDraft(next);
      setBaseline(JSON.stringify(next));
      if (copy) setActiveId(copy.id);
      toast(
        `Variant duplicated${copy ? ` as “${copy.name}”` : ""} — tweak it and save`,
      );
    },
    onError: (e) => toast(e.message, "error"),
  });

  const photoSave = useMutation({
    mutationFn: async (file: File) => {
      const prepared = await preparePhoto(file);
      return api.setRecipePhoto({
        id: recipe.id,
        data_base64: prepared.dataBase64,
        mime_type: prepared.mimeType,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast("Photo saved");
    },
    onError: (e) => toast(e.message, "error"),
  });

  const photoRemove = useMutation({
    mutationFn: () => api.removeRecipePhoto({ id: recipe.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      setConfirm(null);
      toast("Photo removed");
    },
    onError: (e) => toast(e.message, "error"),
  });

  const historyQ = useQuery({
    queryKey: ["costHistory", recipe.id],
    queryFn: () => api.costHistory({ recipe_id: recipe.id }),
  });

  const priceForActive =
    active != null && active.id in submittedPrice
      ? submittedPrice[active.id]
      : null;
  const costQ = useQuery({
    queryKey: ["variantCost", recipe.id, active?.id ?? "none", priceForActive],
    queryFn: () =>
      api.variantCost({
        recipe_id: recipe.id,
        variant_id: active?.id ?? "",
        selling_price: priceForActive,
      }),
    enabled: !!active,
  });
  const breakdown = costQ.data?.breakdown;

  const updateVariant = (id: string, patch: Partial<Variant>) =>
    setDraft((d) => ({
      ...d,
      variants: d.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    }));

  const handleCalculate = async () => {
    if (!active) return;
    const raw = (priceInput[active.id] ?? "").trim();
    const parsed = raw === "" ? null : parseFloat(raw);
    if (raw !== "" && (parsed == null || Number.isNaN(parsed) || parsed < 0)) {
      toast("Enter a valid selling price, or leave it blank for cost only.", "error");
      return;
    }
    try {
      if (dirty) await save.mutateAsync(draft);
      setSubmittedPrice((m) => ({ ...m, [active.id]: parsed }));
    } catch {
      // save's onError already toasted
    }
  };

  const handleSave = async () => {
    try {
      await save.mutateAsync(draft);
      toast("Recipe saved");
    } catch {
      // toasted by onError
    }
  };

  const canRecordSale =
    !!breakdown && breakdown.selling_price != null && !dirty && !costQ.isFetching;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={btnGhost} onClick={onBack}>
          <IconBack /> All recipes
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={btnGhost}
            onClick={() => {
              if (dirty) {
                toast("Save your changes first — then duplicate the variant.", "error");
                return;
              }
              dup.mutate();
            }}
            disabled={dup.isPending || !active}
          >
            <IconCopy /> {dup.isPending ? "Duplicating…" : "Duplicate variant"}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#a63c3c] hover:bg-[#a63c3c]/10 rounded-md px-3 py-1.5"
            onClick={() => setConfirm("recipe")}
          >
            <IconTrash /> Delete recipe
          </button>
        </div>
      </div>

      {/* Recipe header */}
      <div className={`${cardCls} mt-3`}>
        <div className="p-5">
          <div className="flex items-start gap-4">
            {recipe.photo_url ? (
              <img
                src={recipe.photo_url}
                alt={`Photo of ${recipe.name}`}
                className="block w-28 h-28 shrink-0 object-cover rounded-md border border-[var(--border)]"
              />
            ) : null}
            <label className="block flex-1 min-w-0">
              <span className={labelCls}>Recipe name</span>
              <input
                {...FIELDS.updateRecipe.name}
                className="w-full font-heading text-2xl sm:text-3xl font-light tracking-tight bg-transparent border-b border-transparent focus:border-[#ae8a3e] outline-none py-1 text-[#1a1a1a]"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                aria-label="Recipe name"
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 mt-4">
            <Field label="Category">
              <CategoryField
                value={draft.category}
                onChange={(v) => setDraft((d) => ({ ...d, category: v }))}
                categories={categories}
              />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Notes">
              <textarea
                {...FIELDS.updateRecipe.notes}
                className={`${inputCls} min-h-24`}
                rows={4}
                value={draft.notes ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, notes: e.target.value || null }))
                }
                placeholder="Method notes, where the recipe came from, what to watch for, tweaks to try…"
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label
              className={`${btnSecondary} cursor-pointer ${photoSave.isPending ? "opacity-50 pointer-events-none" : ""}`}
            >
              <IconCamera />
              {photoSave.isPending
                ? "Saving photo…"
                : recipe.photo_url
                  ? "Change photo"
                  : "Add a photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label="Recipe photo"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) photoSave.mutate(f);
                  e.target.value = "";
                }}
              />
            </label>
            {recipe.photo_url ? (
              <button
                type="button"
                className={btnGhost}
                onClick={() => setConfirm("photo")}
              >
                <IconTrash /> Remove photo
              </button>
            ) : (
              <span className="text-sm text-[var(--dim)]">
                A photo turns the library into her own little cookbook.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Variant tabs */}
      <div className="mt-5 flex flex-wrap items-center gap-2" role="tablist" aria-label="Recipe variants">
        {draft.variants.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={v.id === activeId}
            onClick={() => setActiveId(v.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold border transition-colors ${
              v.id === activeId
                ? "bg-[#2c1e16] text-white border-[#2c1e16]"
                : "bg-[var(--surface)] text-[var(--dim)] border-[var(--border)] hover:bg-[#f9ecd7]"
            }`}
          >
            {v.name}
          </button>
        ))}
        <button
          type="button"
          className={btnGhost}
          onClick={() => setVariantModal("add")}
        >
          <IconPlus /> Add variant
        </button>
      </div>

      {active ? (
        <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_380px] items-start">
          {/* Variant editor */}
          <div className={`${cardCls} p-5`}>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Variant name (size)">
                <input
                  className={inputCls}
                  aria-label="Variant name"
                  value={active.name}
                  onChange={(e) => updateVariant(active.id, { name: e.target.value })}
                />
              </Field>
              <Field label="Prep time (minutes)">
                <input
                  type="number"
                  min="0"
                  step="any"
                  aria-label="Prep time in minutes"
                  className={inputCls}
                  value={active.prep_time_minutes === 0 ? "" : active.prep_time_minutes}
                  placeholder="0"
                  onChange={(e) =>
                    updateVariant(active.id, {
                      prep_time_minutes: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </Field>
              <Field label="Utility time (minutes)">
                <input
                  type="number"
                  min="0"
                  step="any"
                  aria-label="Utility time in minutes"
                  className={inputCls}
                  value={active.utility_time_minutes ?? ""}
                  placeholder={active.prep_time_minutes ? String(active.prep_time_minutes) : "Same as prep"}
                  onChange={(e) =>
                    updateVariant(active.id, {
                      utility_time_minutes:
                        e.target.value === ""
                          ? null
                          : parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </Field>
              <Field label="Variant notes">
                <input
                  className={inputCls}
                  value={active.notes ?? ""}
                  onChange={(e) =>
                    updateVariant(active.id, { notes: e.target.value || null })
                  }
                  placeholder="Optional"
                />
              </Field>
            </div>
            <p className="text-xs text-[var(--dim)] mt-2">
              Prep time drives labour cost. Utility time is how long the oven
              and utilities run — leave it blank to cost utilities on the prep
              time.
            </p>

            <section className="mt-7">
              <h3 className="font-heading text-lg font-medium text-[#2c1e16] mb-3">
                Ingredients
              </h3>
              <IngredientLinesEditor
                lines={active.ingredients}
                onChange={(lines) => updateVariant(active.id, { ingredients: lines })}
                ingredients={ingredients}
                symbol={symbol}
              />
            </section>
            <section className="mt-7">
              <h3 className="font-heading text-lg font-medium text-[#2c1e16] mb-3">
                Components
              </h3>
              <ComponentLinesEditor
                lines={active.components}
                onChange={(lines) => updateVariant(active.id, { components: lines })}
                components={components}
                symbol={symbol}
              />
            </section>
            <section className="mt-7">
              <h3 className="font-heading text-lg font-medium text-[#2c1e16] mb-3">
                Packaging
              </h3>
              <PackagingLinesEditor
                lines={active.packaging}
                onChange={(lines) => updateVariant(active.id, { packaging: lines })}
                packaging={packaging}
                symbol={symbol}
              />
            </section>

            <div className="mt-7 pt-4 border-t border-[var(--border)] flex justify-end">
              <button
                type="button"
                className="text-sm font-medium text-[#a63c3c] hover:bg-[#a63c3c]/10 rounded-md px-3 py-1.5"
                onClick={() => setConfirm("variant")}
              >
                Delete this variant
              </button>
            </div>
          </div>

          {/* Cost breakdown panel */}
          <div className={`${cardCls} p-5 lg:sticky lg:top-6`}>
            <h3 className="font-heading text-lg font-medium text-[#2c1e16]">
              Cost breakdown
            </h3>
            <p className="text-xs text-[var(--dim)] mt-0.5">
              {draft.name} · {active.name}
              {dirty ? " · unsaved changes — Calculate saves first" : ""}
            </p>

            {costQ.isPending ? (
              <p className="text-sm text-[var(--dim)] py-6">Calculating…</p>
            ) : costQ.error ? (
              <div className="py-4">
                <ErrorNote error={costQ.error} />
              </div>
            ) : breakdown ? (
              <div className="mt-4">
                <BreakdownLines breakdown={breakdown} symbol={symbol} />
                {breakdown.missing_lines.length > 0 ? (
                  <div
                    role="alert"
                    className="mt-4 bg-[#d99441]/10 border border-[#d99441]/30 rounded-md px-3 py-2.5"
                  >
                    <p className="text-sm font-semibold text-[#9a6716]">
                      Some lines aren't costed — the total below leaves them out:
                    </p>
                    <ul className="mt-1 text-sm text-[var(--text)] list-disc pl-5 space-y-0.5">
                      {breakdown.missing_lines.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-5 pt-4 border-t-2 border-[#2c1e16]">
                  <div className="flex items-baseline justify-between">
                    <span className={microLabel}>Total cost</span>
                    <span className="font-mono text-2xl text-[#2c1e16]">
                      {money(breakdown.total_cost, symbol)}
                    </span>
                  </div>
                  {(() => {
                    const suggested = suggestedPrice(
                      breakdown.total_cost,
                      targetMargin,
                    );
                    return suggested != null ? (
                      <p className="mt-1 text-right text-sm text-[var(--dim)]">
                        Suggested {wholeMoney(suggested, symbol)} · at{" "}
                        {fmtPercent(targetMargin)}%
                      </p>
                    ) : null;
                  })()}
                </div>

                <div className="mt-5">
                  <Field label={`Selling price (${symbol})`}>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      aria-label="Selling price"
                      className={inputCls}
                      value={priceInput[active.id] ?? ""}
                      placeholder="e.g. 65.00"
                      onChange={(e) =>
                        setPriceInput((m) => ({ ...m, [active.id]: e.target.value }))
                      }
                    />
                  </Field>
                  <button
                    type="button"
                    className={`${btnPrimary} w-full mt-3`}
                    onClick={handleCalculate}
                    disabled={save.isPending || costQ.isFetching}
                  >
                    {save.isPending ? "Saving…" : "Calculate margin"}
                  </button>
                </div>

                {breakdown.selling_price != null && breakdown.profit_margin != null ? (
                  <div className="mt-4 bg-[var(--surface-alt)] rounded-md px-4 py-3 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--dim)]">Profit margin</span>
                      <span
                        className={`font-mono font-semibold ${
                          breakdown.profit_margin >= 0
                            ? "text-[#4a6b53]"
                            : "text-[#a63c3c]"
                        }`}
                      >
                        {breakdown.profit_margin.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--dim)]">Profit</span>
                      <span
                        className={`font-mono ${
                          (breakdown.profit ?? 0) >= 0
                            ? "text-[#4a6b53]"
                            : "text-[#a63c3c]"
                        }`}
                      >
                        {money(breakdown.profit ?? 0, symbol)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={`${btnPrimary} w-full mt-2`}
                      onClick={() => setSaleOpen(true)}
                      disabled={!canRecordSale}
                    >
                      Record a sale
                    </button>
                    {dirty ? (
                      <p className="text-xs text-[var(--dim)]">
                        Save your changes before recording — the sale snapshots the
                        saved cost.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState
            title="No variants yet"
            body="A variant is a size or version of this recipe — 6-inch, 8-inch, cupcakes. Add the first one to start costing."
          >
            <button type="button" className={btnPrimary} onClick={() => setVariantModal("add")}>
              <IconPlus /> Add variant
            </button>
          </EmptyState>
        </div>
      )}

      {active ? (
        <CostHistoryPanel
          snapshots={(historyQ.data?.snapshots ?? []).filter(
            (s) => s.variant_id === active.id,
          )}
          variantName={active.name}
          symbol={symbol}
        />
      ) : null}

      {/* Save bar */}
      <div className="sticky bottom-20 lg:bottom-4 z-30 mt-6">
        <div className="bg-[#2c1e16] text-white rounded-lg px-4 py-3 flex items-center gap-3 shadow-lg">
          <span className="text-sm flex-1">
            {dirty ? "You have unsaved changes" : "All changes saved"}
          </span>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || save.isPending}
            className="bg-white text-[#2c1e16] hover:bg-[#f9ecd7] rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            {save.isPending ? "Saving…" : "Save recipe"}
          </button>
        </div>
      </div>

      {variantModal ? (
        <VariantNameModal
          title={variantModal === "add" ? "Add variant" : "Rename variant"}
          initial={variantModal === "rename" ? (active?.name ?? "") : ""}
          onClose={() => setVariantModal(null)}
          onSubmit={(name) => {
            if (variantModal === "add") {
              const id = crypto.randomUUID();
              setDraft((d) => ({
                ...d,
                variants: [
                  ...d.variants,
                  {
                    id,
                    name,
                    ingredients: [],
                    packaging: [],
                    components: [],
                    prep_time_minutes: 0,
                    utility_time_minutes: null,
                    notes: null,
                  },
                ],
              }));
              setActiveId(id);
            } else if (active) {
              updateVariant(active.id, { name });
            }
            setVariantModal(null);
          }}
        />
      ) : null}

      {confirm === "recipe" ? (
        <ConfirmDialog
          title="Delete recipe?"
          message={`“${draft.name}” and all of its variants will be deleted. Recorded sales keep their history.`}
          busy={del.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => del.mutate()}
        />
      ) : null}
      {confirm === "photo" ? (
        <ConfirmDialog
          title="Remove photo?"
          message={`The photo on “${draft.name}” will be removed.`}
          busy={photoRemove.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => photoRemove.mutate()}
        />
      ) : null}
      {confirm === "variant" && active ? (
        <ConfirmDialog
          title="Delete variant?"
          message={`The “${active.name}” variant will be removed from this recipe when you save.`}
          busy={false}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setDraft((d) => ({
              ...d,
              variants: d.variants.filter((v) => v.id !== active.id),
            }));
            setActiveId(
              draft.variants.find((v) => v.id !== active.id)?.id ?? "",
            );
            setConfirm(null);
          }}
        />
      ) : null}

      {saleOpen && active && breakdown && breakdown.selling_price != null ? (
        <RecordSaleModal
          recipeName={draft.name}
          variantName={active.name}
          breakdown={breakdown}
          symbol={symbol}
          recipeId={recipe.id}
          onClose={() => setSaleOpen(false)}
        />
      ) : null}
    </div>
  );
}

function CostHistoryPanel({
  snapshots,
  variantName,
  symbol,
}: {
  snapshots: CostSnapshot[];
  variantName: string;
  symbol: string;
}) {
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  // Trend line geometry (oldest → newest), padded so a flat line still reads.
  const W = 600;
  const H = 72;
  const PAD = 8;
  const costs = snapshots.map((s) => s.total_cost);
  const min = Math.min(...costs);
  const max = Math.max(...costs);
  const span = max - min || 1;
  const points = snapshots
    .map((s, i) => {
      const x =
        snapshots.length === 1
          ? W / 2
          : PAD + (i / (snapshots.length - 1)) * (W - PAD * 2);
      const y = H - PAD - ((s.total_cost - min) / span) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const newestFirst = [...snapshots].reverse().slice(0, 10);

  return (
    <section className={`${cardCls} p-5 mt-5`}>
      <h3 className="font-heading text-lg font-medium text-[#2c1e16]">
        Cost history
      </h3>
      <p className="text-xs text-[var(--dim)] mt-0.5">
        {variantName} — a snapshot is recorded whenever a price, packaging or
        component cost, labour/utility rate, or the recipe itself changes this
        variant's total cost.
      </p>
      {snapshots.length === 0 ? (
        <p className="text-sm text-[var(--dim)] mt-4">
          No snapshots yet — the first one lands the next time anything moves
          this variant's cost.
        </p>
      ) : (
        <div className="mt-4">
          {snapshots.length > 1 ? (
            <div>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-20"
                role="img"
                aria-label={`Cost trend for ${variantName}: from ${money(costs[0] ?? 0, symbol)} to ${money(costs[costs.length - 1] ?? 0, symbol)}`}
                preserveAspectRatio="none"
              >
                <polyline
                  points={points}
                  fill="none"
                  stroke="#ae8a3e"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div className="flex justify-between text-xs text-[var(--dim)] -mt-1">
                <span>
                  {fmtDate(snapshots[0]?.captured_at ?? "")} ·{" "}
                  {money(costs[0] ?? 0, symbol)}
                </span>
                <span>
                  {money(costs[costs.length - 1] ?? 0, symbol)} ·{" "}
                  {fmtDate(
                    snapshots[snapshots.length - 1]?.captured_at ?? "",
                  )}
                </span>
              </div>
            </div>
          ) : null}
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {newestFirst.map((s, i) => {
              const prev = snapshots[snapshots.length - 1 - i - 1];
              const delta = prev ? s.total_cost - prev.total_cost : null;
              return (
                <li
                  key={s.id}
                  className="flex items-baseline justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {fmtDate(s.captured_at)}
                    </p>
                    <p className="text-xs text-[var(--dim)] truncate">
                      {s.reason || "Cost recorded"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm text-[#2c1e16]">
                      {money(s.total_cost, symbol)}
                    </p>
                    {delta != null && Math.abs(delta) >= 0.005 ? (
                      <p
                        className={`font-mono text-xs ${
                          delta > 0 ? "text-[#9a6716]" : "text-[#4a6b53]"
                        }`}
                      >
                        {delta > 0 ? "+" : "−"}
                        {money(Math.abs(delta), symbol).replace("-", "")}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {snapshots.length > 10 ? (
            <p className="text-xs text-[var(--dim)] mt-2">
              Showing the 10 most recent of {snapshots.length} snapshots.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function BreakdownLines({
  breakdown,
  symbol,
}: {
  breakdown: Breakdown;
  symbol: string;
}) {
  const row = (left: ReactNode, right: string, key: string) => (
    <div key={key} className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-sm min-w-0">{left}</span>
      <span className="font-mono text-sm text-[#2c1e16] shrink-0">{right}</span>
    </div>
  );
  const subtotal = (label: string, value: number, key: string) => (
    <div
      key={key}
      className="flex items-baseline justify-between gap-3 py-1.5 mt-1 border-t border-[var(--border)]"
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="font-mono text-sm font-semibold text-[#2c1e16]">
        {money(value, symbol)}
      </span>
    </div>
  );
  return (
    <div>
      {breakdown.ingredient_costs.length > 0 ? (
        <div>
          <p className={microLabel}>Ingredients</p>
          <div className="mt-1.5">
            {breakdown.ingredient_costs.map((c, i) =>
              row(
                <>
                  {c.ingredient_name}{" "}
                  <span className="text-[var(--dim)] text-xs">
                    {qty(c.quantity)} {c.unit} × {unitMoney(c.unit_cost, symbol)} ·{" "}
                    {c.store_vendor}
                    {c.brand ? ` · ${c.brand}` : ""}
                  </span>
                  {c.is_override ? (
                    <span className="ml-1.5 bg-[#d99441]/10 text-[#9a6716] border border-[#d99441]/30 rounded-full px-1.5 py-px text-[10px] font-semibold align-middle">
                      Override
                    </span>
                  ) : null}
                </>,
                money(c.cost, symbol),
                `ing-${i}`,
              ),
            )}
          </div>
          {subtotal("Ingredients subtotal", breakdown.total_ingredient_cost, "ing-sub")}
        </div>
      ) : null}
      {breakdown.component_costs.length > 0 ? (
        <div className="mt-4">
          <p className={microLabel}>Components</p>
          <div className="mt-1.5">
            {breakdown.component_costs.map((c, i) =>
              row(
                <>
                  {c.component_name}{" "}
                  <span className="text-[var(--dim)] text-xs">
                    {qty(c.quantity)} {c.use_gram_costing ? "g" : "batch(es)"} · batch{" "}
                    {money(c.batch_cost, symbol)}
                  </span>
                </>,
                money(c.cost, symbol),
                `comp-${i}`,
              ),
            )}
          </div>
          {subtotal("Components subtotal", breakdown.total_component_cost, "comp-sub")}
        </div>
      ) : null}
      {breakdown.packaging_costs.length > 0 ? (
        <div className="mt-4">
          <p className={microLabel}>Packaging</p>
          <div className="mt-1.5">
            {breakdown.packaging_costs.map((c, i) =>
              row(
                <>
                  {c.packaging_name}{" "}
                  <span className="text-[var(--dim)] text-xs">
                    {qty(c.quantity)} × {unitMoney(c.unit_cost, symbol)}
                  </span>
                </>,
                money(c.cost, symbol),
                `pkg-${i}`,
              ),
            )}
          </div>
          {subtotal("Packaging subtotal", breakdown.total_packaging_cost, "pkg-sub")}
        </div>
      ) : null}
      <div className="mt-4">
        {row("Labour", money(breakdown.labour_cost, symbol), "lab")}
        {row("Utilities", money(breakdown.utility_cost, symbol), "util")}
      </div>
      {breakdown.ingredient_costs.length === 0 &&
      breakdown.component_costs.length === 0 &&
      breakdown.packaging_costs.length === 0 &&
      breakdown.missing_lines.length === 0 ? (
        <p className="text-sm text-[var(--dim)]">
          No costed lines yet — add ingredients, components, or packaging, or set a
          prep time for labour and utilities.
        </p>
      ) : null}
    </div>
  );
}

function VariantNameModal({
  title,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) {
            setError("Give the variant a name — usually a size like 8-inch.");
            return;
          }
          onSubmit(name.trim());
        }}
        className="space-y-4"
      >
        <Field label="Variant name">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 8-inch"
            autoFocus
          />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-[#a63c3c]">
            {error}
          </p>
        ) : null}
        <div className="flex gap-3 justify-end">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary}>
            {title === "Add variant" ? "Add variant" : "Rename"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RecordSaleModal({
  recipeId,
  recipeName,
  variantName,
  breakdown,
  symbol,
  onClose,
}: {
  recipeId: string;
  recipeName: string;
  variantName: string;
  breakdown: {
    selling_price: number | null;
    total_cost: number;
    labour_cost: number;
    profit: number | null;
    profit_margin: number | null;
  };
  symbol: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const selling = breakdown.selling_price ?? 0;
  const profit = breakdown.profit ?? selling - breakdown.total_cost;
  const margin = breakdown.profit_margin ?? 0;

  // Past customers for the name autocomplete — same list and behaviour
  // as the Sales tab's New Sale form.
  const salesQ = useQuery({
    queryKey: ["sales"],
    queryFn: () => api.listSales({}),
  });
  const customers = useMemo(
    () => pastCustomers(salesQ.data?.sales ?? []),
    [salesQ.data],
  );

  const create = useMutation({
    mutationFn: () =>
      api.createSale({
        recipe_id: recipeId,
        recipe_name: recipeName,
        variant_name: variantName,
        sale_date: date || todayStr(),
        customer_first_name: firstName.trim(),
        customer_last_name: lastName.trim(),
        notes: notes.trim(),
        selling_price: selling,
        total_cost: breakdown.total_cost,
        labour_cost: breakdown.labour_cost,
        profit,
        profit_margin: margin,
      }),
    onSuccess: () => {
      playSaleChime();
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      toast("Sale recorded");
      onClose();
    },
    onError: (e) => toast(e.message, "error"),
  });

  return (
    <Modal title="Record a Sale" onClose={onClose}>
      <div className="bg-[var(--surface-alt)] rounded-md px-4 py-3 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--dim)]">Recipe</span>
          <span className="font-medium">
            {recipeName} · {variantName}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--dim)]">Selling Price</span>
          <span className="font-mono">{money(selling, symbol)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--dim)]">Total Cost</span>
          <span className="font-mono">{money(breakdown.total_cost, symbol)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--dim)]">Profit</span>
          <span className={`font-mono ${profit >= 0 ? "text-[#4a6b53]" : "text-[#a63c3c]"}`}>
            {money(profit, symbol)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--dim)]">Profit Margin</span>
          <span className={`font-mono ${margin >= 0 ? "text-[#4a6b53]" : "text-[#a63c3c]"}`}>
            {margin.toFixed(1)}%
          </span>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!firstName.trim() || !lastName.trim()) {
            setError("Enter the customer's first and last name.");
            return;
          }
          create.mutate();
        }}
        className="space-y-4 mt-5"
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Sale date">
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>
        <CustomerNameFields
          firstName={firstName}
          lastName={lastName}
          onFirstChange={setFirstName}
          onLastChange={setLastName}
          customers={customers}
        />
        <Field label="Notes (optional)">
          <input
            {...FIELDS.createSale.notes}
            className={inputCls}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Occasion, delivery, anything"
          />
        </Field>
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
