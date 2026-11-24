import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import {
FIELDS,
money,
todayStr,
unitMoney,
useSymbol,
type PackagingItem,
} from "../lib";
import {
btnGhost,
btnIconSmall,
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
SortTh,
useToast,
IconPencil,
IconPlus,
IconTrash,
type SortDir,
} from "../ui";

type PackagingSortKey = "name" | "vendor" | "price" | "unitCost" | "date";

function packagingSortValue(p: PackagingItem, key: PackagingSortKey): string | number {
  switch (key) {
    case "name":
      return p.name.toLowerCase();
    case "vendor":
      return p.store_vendor.toLowerCase();
    case "price":
      return p.purchase_price;
    case "unitCost":
      return p.unit_cost;
    case "date":
      return p.purchase_date ? p.purchase_date.slice(0, 10) : "";
  }
}

export function PackagingPage() {
  const symbol = useSymbol();
  const toast = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<PackagingSortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [form, setForm] = useState<PackagingItem | "new" | null>(null);
  const [confirm, setConfirm] = useState<
    { kind: "one"; target: PackagingItem } | null
  >(null);

  const q = useQuery({
    queryKey: ["packaging"],
    queryFn: () => api.listPackaging({}),
  });
  const items = useMemo(() => q.data?.packaging ?? [], [q.data]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const rows = items.filter(
      (p) =>
        !s ||
        p.name.toLowerCase().includes(s) ||
        p.store_vendor.toLowerCase().includes(s),
    );
    const mul = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = packagingSortValue(a, sortKey);
      const vb = packagingSortValue(b, sortKey);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb));
      return cmp * mul;
    });
  }, [items, search, sortKey, sortDir]);

  const toggleSort = (key: PackagingSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "vendor" ? "asc" : "desc");
    }
  };
  const filtersActive = !!search.trim();
  const clearFilters = () => {
    setSearch("");
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ["packaging"] });
  const onErr = (e: Error) => toast(e.message, "error");
  const delOne = useMutation({
    mutationFn: (id: string) => api.deletePackaging({ id }),
    onSuccess: () => {
      invalidate();
      toast("Packaging deleted");
      setConfirm(null);
    },
    onError: onErr,
  });


  return (
    <div>
      <div className="flex items-start sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-light tracking-tight text-[#1a1a1a]">
            Packaging
          </h1>
          <p className="text-sm text-[var(--dim)] mt-1">
            {items.length} item{items.length === 1 ? "" : "s"}
            <span className="hidden sm:inline">
              {" "}
              — boxes, boards, ribbons, and everything a cake lives in
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button type="button" className={btnPrimary} onClick={() => setForm("new")}>
            <IconPlus /> New item
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="block flex-1 min-w-52 max-w-md">
          <span className="sr-only">Search packaging</span>
          <input
            type="search"
            className={inputCls}
            placeholder="Search packaging or stores…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {/* No mobile Sort control: on phones the items simply show
            in the default order (item name, A–Z). Sorting lives in
            the desktop table's column headers only. */}
      </div>

      {filtersActive ? (
        <p className="mt-3 text-sm text-[var(--dim)]">
          Showing {filtered.length} of {items.length} item
          {items.length === 1 ? "" : "s"}{" "}
          <button
            type="button"
            className="font-semibold text-[#2c1e16] underline underline-offset-2"
            onClick={clearFilters}
          >
            Clear search
          </button>
        </p>
      ) : null}

      <div className="mt-6">
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorNote error={q.error} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={items.length === 0 ? "No packaging yet" : "Nothing matches"}
            body={
              items.length === 0
                ? "Add cake boxes, boards, and other packaging with what you paid. Recipes add these as line items so the box is costed too."
                : "Try a different search, or clear the store filter above."
            }
          >
            {items.length === 0 ? (
              <button type="button" className={btnPrimary} onClick={() => setForm("new")}>
                <IconPlus /> Add your first item
              </button>
            ) : null}
          </EmptyState>
        ) : (
          <>
            {/* Desktop table — scrolls sideways instead of squeezing
                columns at laptop widths, with the actions column pinned
                on the right exactly as on the Sales page, so Edit/Delete
                can never be clipped off-screen. */}
            <div className={`hidden md:block ${cardCls} overflow-x-auto`}>
              <table className="w-full min-w-[860px] text-sm table-fixed">
                <colgroup>
                  <col />
                  <col className="w-[13%]" />
                  <col className="w-[21%]" />
                  <col className="w-[17%]" />
                  <col className="w-[14%]" />
                  <col className="w-24" />
                </colgroup>
                <thead>
                  <tr className="bg-[var(--surface-alt)] text-left">
                    <SortTh label="Item" active={sortKey === "name"} dir={sortDir} onSort={() => toggleSort("name")} />
                    <SortTh label="Store" active={sortKey === "vendor"} dir={sortDir} onSort={() => toggleSort("vendor")} />
                    <SortTh label="Purchase" align="right" active={sortKey === "price"} dir={sortDir} onSort={() => toggleSort("price")} />
                    <SortTh label="Unit cost" align="right" active={sortKey === "unitCost"} dir={sortDir} onSort={() => toggleSort("unitCost")} />
                    <SortTh label="Purchased" active={sortKey === "date"} dir={sortDir} onSort={() => toggleSort("date")} />
                    <th className="sticky right-0 bg-[var(--surface-alt)] px-4 py-3 w-24"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className="border-t border-[var(--border)] hover:bg-[#fdf8ef]">
                      <td className="px-4 py-3 font-medium text-[#2c1e16]">
                        {p.name}
                        {p.notes ? (
                          <span className="block text-xs text-[var(--dim)] font-normal">{p.notes}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{p.store_vendor || "—"}</td>
                      <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                        {money(p.purchase_price, symbol)} / {p.package_size} {p.unit}
                      </td>
                      <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                        {unitMoney(p.unit_cost, symbol)}/{p.unit}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{p.purchase_date ? p.purchase_date.slice(0, 10) : "—"}</td>
                      <td className="sticky right-0 bg-[var(--surface)] px-4 py-3 shadow-[-10px_0_10px_-10px_rgba(44,30,22,0.35)]">
                        <span className="flex justify-end gap-1">
                          <button type="button" className={btnIconSmall} aria-label={`Edit ${p.name}`} title="Edit" onClick={() => setForm(p)}>
                            <IconPencil />
                          </button>
                          <button type="button" className={btnIconSmall} aria-label={`Delete ${p.name}`} title="Delete" onClick={() => setConfirm({ kind: "one", target: p })}>
                            <IconTrash />
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <div className="grid gap-4 md:hidden">
              {filtered.map((p) => (
                <article key={p.id} className={`${cardCls} p-5`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-heading text-lg font-medium text-[#2c1e16]">{p.name}</h2>
                      <p className="text-xs text-[var(--dim)]">
                        {p.store_vendor || "No store"}
                        {p.purchase_date ? ` · ${p.purchase_date.slice(0, 10)}` : ""}
                        {p.notes ? ` · ${p.notes}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 bg-[var(--surface-alt)] rounded-md px-4 py-3 flex items-baseline justify-between">
                    <span className="text-xs text-[var(--dim)]">
                      {money(p.purchase_price, symbol)} for {p.package_size} {p.unit}
                    </span>
                    <span className="font-mono text-lg text-[#2c1e16]">
                      {unitMoney(p.unit_cost, symbol)}
                      <span className="text-sm text-[var(--dim)]"> /{p.unit}</span>
                    </span>
                  </div>
                  {/* Labeled action row, same as the Sales phone cards:
                      small glyphs, labels stay, nothing to clip. */}
                  <div className="mt-3 flex border-t border-[var(--border)] pt-2">
                    <button type="button" className={`${btnGhost} flex-1 [&_svg]:w-4 [&_svg]:h-4`} aria-label={`Edit ${p.name}`} onClick={() => setForm(p)}>
                      <IconPencil /> Edit
                    </button>
                    <button type="button" className={`${btnGhost} flex-1 [&_svg]:w-4 [&_svg]:h-4`} aria-label={`Delete ${p.name}`} onClick={() => setConfirm({ kind: "one", target: p })}>
                      <IconTrash /> Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      {form ? (
        <PackagingForm
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
          title="Delete packaging?"
          message={`“${confirm.target.name}” will be deleted. Recipe lines that use it will stop costing.`}
          busy={delOne.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => delOne.mutate(confirm.target.id)}
        />
      ) : null}
    </div>
  );
}

function PackagingForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: PackagingItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const symbol = useSymbol();
  const [name, setName] = useState(initial?.name ?? "");
  const [vendor, setVendor] = useState(initial?.store_vendor ?? "");
  const [price, setPrice] = useState(initial ? String(initial.purchase_price) : "");
  const [size, setSize] = useState(initial ? String(initial.package_size) : "1");
  const [unit, setUnit] = useState(initial?.unit ?? "piece");
  const [date, setDate] = useState(
    // Editing an item that has no purchase date keeps it dateless —
    // defaulting to today here silently stamped today's date onto it
    // on any unrelated edit. Only a brand-new item starts at today.
    initial
      ? initial.purchase_date
        ? initial.purchase_date.slice(0, 10)
        : ""
      : todayStr(),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState("");

  const priceNum = parseFloat(price) || 0;
  const sizeNum = parseFloat(size) || 0;
  const unitCost = sizeNum > 0 ? priceNum / sizeNum : 0;

  const create = useMutation({
    mutationFn: () =>
      api.createPackaging({
        name: name.trim(),
        store_vendor: vendor.trim(),
        purchase_price: priceNum,
        package_size: sizeNum,
        unit: unit.trim() || "piece",
        purchase_date: date,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      toast("Packaging added");
      onSaved();
    },
    onError: (e) => toast(e.message, "error"),
  });
  const update = useMutation({
    mutationFn: () =>
      api.updatePackaging({
        id: initial?.id ?? "",
        name: name.trim(),
        store_vendor: vendor.trim(),
        purchase_price: priceNum,
        package_size: sizeNum,
        unit: unit.trim() || "piece",
        purchase_date: date,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      toast("Packaging saved");
      onSaved();
    },
    onError: (e) => toast(e.message, "error"),
  });
  const busy = create.isPending || update.isPending;

  const submit = () => {
    if (!name.trim()) {
      setError("Give the item a name.");
      return;
    }
    if (price === "" || !(priceNum >= 0)) {
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
    <Modal title={initial ? "Edit packaging" : "New packaging"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <Field label="Name">
          <input
            {...FIELDS.createPackaging.name}
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 8-inch cake box"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Store / vendor">
            <input
              {...FIELDS.createPackaging.store_vendor}
              className={inputCls}
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g. Bulk Barn"
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
          <Field label={`Purchase price (${symbol})`}>
            <input
              {...FIELDS.createPackaging.purchase_price}
              className={inputCls}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
            />
          </Field>
          <Field label="Package size (count)">
            <input
              {...FIELDS.createPackaging.package_size}
              className={inputCls}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="10"
              inputMode="decimal"
            />
          </Field>
          <Field label="Unit">
            <input
              {...FIELDS.createPackaging.unit}
              className={inputCls}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="piece"
            />
          </Field>
          <Field label="Notes (optional)">
            <input
              {...FIELDS.createPackaging.notes}
              className={inputCls}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Size, colour…"
            />
          </Field>
        </div>
        <div className="flex items-center justify-between bg-[var(--surface-alt)] rounded-md px-4 py-3">
          <span className="text-sm text-[var(--dim)]">Unit cost</span>
          <span className="font-mono text-lg text-[#2c1e16]">
            {unitMoney(unitCost, symbol)}
            <span className="text-sm text-[var(--dim)]"> /{unit || "piece"}</span>
          </span>
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
            {busy ? "Saving…" : initial ? "Save changes" : "Add item"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
