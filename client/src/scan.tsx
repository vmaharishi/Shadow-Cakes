import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";
import {
  FIELDS,
  money,
  prepareScanPhoto,
  todayStr,
  unitMoney,
  useSymbol,
  type PreparedScanPhoto,
} from "./lib";
import {
  btnPrimary,
  btnSecondary,
  Field,
  inputCls,
  Modal,
  useToast,
  IconCamera,
} from "./ui";

type ScanResult = ApiResponse<typeof api, "scanPricePhoto">;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * "Add from photo" flow shared by Ingredients and Packaging: pick a photo
 * of the product, its price tag, or a receipt; the scan action reads the
 * item name, store, price, and package size out of it; the user checks the
 * pre-filled fields (and fills anything the photo didn't show) and saves.
 * For ingredients, a name that matches an existing ingredient adds the
 * price to that ingredient instead of creating a duplicate.
 */
export function ScanAddModal({
  kind,
  onClose,
  onSaved,
}: {
  kind: "ingredient" | "packaging";
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const symbol = useSymbol();
  const fileRef = useRef<HTMLInputElement>(null);
  // Identifies the current scan attempt: a result (or the timeout below)
  // that arrives for an older attempt is ignored.
  const scanTokenRef = useRef(0);
  const phaseRef = useRef<"pick" | "scanning" | "review">("pick");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhaseState] = useState<"pick" | "scanning" | "review">("pick");
  const setPhase = (p: "pick" | "scanning" | "review") => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const [scanNote, setScanNote] = useState("");
  const [missing, setMissing] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [price, setPrice] = useState("");
  const [size, setSize] = useState("");
  const [unit, setUnit] = useState(kind === "ingredient" ? "g" : "piece");
  const [date, setDate] = useState(todayStr());
  const [brand, setBrand] = useState("");
  const [error, setError] = useState("");

  const ingQ = useQuery({
    queryKey: ["ingredients"],
    queryFn: () => api.listIngredients({}),
    enabled: kind === "ingredient",
  });
  const existing = useMemo(
    () => (kind === "ingredient" ? (ingQ.data?.ingredients ?? []) : []),
    [kind, ingQ.data],
  );
  const match = useMemo(() => {
    if (kind !== "ingredient" || !name.trim()) return undefined;
    return existing.find((i) => norm(i.name) === norm(name));
  }, [kind, existing, name]);

  const priceNum = parseFloat(price) || 0;
  const sizeNum = parseFloat(size) || 0;
  const unitCost = sizeNum > 0 ? priceNum / sizeNum : 0;

  const applyScan = (r: ScanResult) => {
    const missed: string[] = [];
    if (r.item_name) setName(r.item_name);
    else missed.push("the item name");
    if (r.store_vendor) setVendor(r.store_vendor);
    else if (kind === "ingredient") missed.push("the store");
    if (r.purchase_price != null) setPrice(String(r.purchase_price));
    else missed.push("the price");
    if (r.package_size != null) setSize(String(r.package_size));
    else missed.push("the package size");
    if (r.unit) setUnit(r.unit);
    if (r.brand) setBrand(r.brand);
    if (r.purchase_date) setDate(r.purchase_date);
    setMissing(missed);
    setScanNote(
      r.readable
        ? "Read from your photo — check the details before saving."
        : "That photo was hard to read, so some fields may be blank. Fill in what you know, or try a clearer photo.",
    );
    setPhase("review");
  };

  const scan = useMutation({
    mutationFn: (vars: { photo: PreparedScanPhoto; token: number }) =>
      api.scanPricePhoto({
        data_base64: vars.photo.dataBase64,
        mime_type: vars.photo.mimeType,
      }),
    onSuccess: (data, vars) => {
      if (vars.token !== scanTokenRef.current) return; // timed out already
      applyScan(data);
    },
    onError: (e, vars) => {
      if (vars.token !== scanTokenRef.current) return;
      setScanNote("");
      setMissing([]);
      setError(
        `Couldn't read that photo (${e.message}). You can fill the details in by hand, or try another photo.`,
      );
      setPhase("review");
    },
  });

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const token = ++scanTokenRef.current;
    setError("");
    setScanNote("");
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setPhase("scanning");
    // A healthy read takes seconds. If it drags on, don't leave the modal
    // stuck on "Reading the photo…" — fall back to the manual form and
    // ignore the scan if it eventually comes back.
    window.setTimeout(() => {
      if (scanTokenRef.current === token && phaseRef.current === "scanning") {
        scanTokenRef.current += 1;
        setScanNote("");
        setMissing([]);
        setError(
          "Reading that photo is taking too long — the reader may be having a slow moment. Fill the details in by hand, or try the photo again.",
        );
        setPhase("review");
      }
    }, 45000);
    try {
      const prepared = await prepareScanPhoto(file);
      if (scanTokenRef.current !== token) return;
      scan.mutate({ photo: prepared, token });
    } catch (err) {
      if (scanTokenRef.current !== token) return;
      setError(
        err instanceof Error
          ? err.message
          : "That photo couldn't be used. You can fill the details in by hand.",
      );
      setPhase("review");
    }
  };

  const save = useMutation({
    mutationFn: async (): Promise<{ matched: boolean }> => {
      if (kind === "ingredient") {
        let ingredientId = match?.id;
        let ingredientName = match?.name ?? name.trim();
        if (!ingredientId) {
          const created = await api.createIngredient({
            name: name.trim(),
            default_unit: unit.trim() || "g",
            notes: null,
          });
          ingredientId = created.id;
          ingredientName = created.name;
        }
        await api.createPrice({
          ingredient_id: ingredientId,
          ingredient_name: ingredientName,
          store_vendor: vendor.trim(),
          purchase_price: priceNum,
          package_size: sizeNum,
          unit: unit.trim() || "g",
          purchase_date: date || todayStr(),
          is_latest: true,
          notes: brand.trim() || null,
        });
        return { matched: match != null };
      }
      await api.createPackaging({
        name: name.trim(),
        store_vendor: vendor.trim(),
        purchase_price: priceNum,
        package_size: sizeNum,
        unit: unit.trim() || "piece",
        purchase_date: date || todayStr(),
        notes: brand.trim() || null,
      });
      return { matched: false };
    },
    onSuccess: (r) => {
      toast(
        kind === "ingredient"
          ? r.matched
            ? `Price added to ${name.trim()}`
            : `Added ${name.trim()} with its price`
          : `Added ${name.trim()} with its price`,
      );
      onSaved();
    },
    onError: (e) => toast(e.message, "error"),
  });

  const submit = () => {
    if (!name.trim()) {
      setError("Give the item a name.");
      return;
    }
    if (kind === "ingredient" && !vendor.trim()) {
      setError("Enter the store or vendor.");
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
    setError("");
    save.mutate();
  };

  return (
    <Modal
      title={kind === "ingredient" ? "Add ingredient from photo" : "Add packaging from photo"}
      onClose={onClose}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Choose a photo of the item and its price"
        onChange={onPick}
      />

      {phase === "pick" ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--dim)] leading-relaxed">
            Take or pick a photo of the{" "}
            {kind === "ingredient" ? "ingredient" : "item"}, its price tag, or
            the receipt — the name, store, price, and package size are read
            from the photo and added for you. You get a quick look before
            anything is saved.
          </p>
          <button
            type="button"
            className={`${btnPrimary} w-full py-3`}
            onClick={() => fileRef.current?.click()}
          >
            <IconCamera /> Choose or take a photo
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="The photo you picked, showing the item and its price"
              className="w-full max-h-56 object-contain rounded-md border border-[var(--border)] bg-[var(--surface-alt)]"
            />
          ) : null}

          {phase === "scanning" ? (
            <p role="status" className="text-sm text-[var(--dim)] py-2 text-center">
              Reading the photo…
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="space-y-4"
            >
              {scanNote ? (
                <p className="text-sm text-[var(--dim)] bg-[var(--surface-alt)] rounded-md px-3 py-2 leading-relaxed">
                  {scanNote}
                  {missing.length > 0
                    ? ` Couldn't read ${missing.join(", ")} — please fill ${missing.length === 1 ? "it" : "those"} in.`
                    : ""}
                </p>
              ) : null}

              <Field label={kind === "ingredient" ? "Ingredient name" : "Item name"}>
                {kind === "ingredient" ? (
                  <input
                    {...FIELDS.createIngredient.name}
                    className={inputCls}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. All-purpose flour"
                  />
                ) : (
                  <input
                    {...FIELDS.createPackaging.name}
                    className={inputCls}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. 8-inch cake box"
                  />
                )}
              </Field>
              {kind === "ingredient" && name.trim() ? (
                <p className="text-xs text-[var(--dim)] -mt-2" role="status">
                  {match
                    ? `Matches your existing “${match.name}” — the price will be added to it as its latest price.`
                    : "New ingredient — it will be created with this price as its latest."}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-4">
                <Field label="Store / vendor">
                  {kind === "ingredient" ? (
                    <input
                      {...FIELDS.createPrice.store_vendor}
                      className={inputCls}
                      value={vendor}
                      onChange={(e) => setVendor(e.target.value)}
                      placeholder="e.g. Costco"
                    />
                  ) : (
                    <input
                      {...FIELDS.createPackaging.store_vendor}
                      className={inputCls}
                      value={vendor}
                      onChange={(e) => setVendor(e.target.value)}
                      placeholder="e.g. Costco"
                    />
                  )}
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
                  {kind === "ingredient" ? (
                    <input
                      {...FIELDS.createPrice.purchase_price}
                      className={inputCls}
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0.00"
                      inputMode="decimal"
                    />
                  ) : (
                    <input
                      {...FIELDS.createPackaging.purchase_price}
                      className={inputCls}
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0.00"
                      inputMode="decimal"
                    />
                  )}
                </Field>
                <Field label="Package size">
                  {kind === "ingredient" ? (
                    <input
                      {...FIELDS.createPrice.package_size}
                      className={inputCls}
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                      placeholder="1000"
                      inputMode="decimal"
                    />
                  ) : (
                    <input
                      {...FIELDS.createPackaging.package_size}
                      className={inputCls}
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                      placeholder="10"
                      inputMode="decimal"
                    />
                  )}
                </Field>
                <Field label="Unit">
                  {kind === "ingredient" ? (
                    <input
                      {...FIELDS.createPrice.unit}
                      className={inputCls}
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="g"
                    />
                  ) : (
                    <input
                      {...FIELDS.createPackaging.unit}
                      className={inputCls}
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="piece"
                    />
                  )}
                </Field>
                <Field label={kind === "ingredient" ? "Brand (optional)" : "Notes (optional)"}>
                  {kind === "ingredient" ? (
                    <input
                      {...FIELDS.createPrice.notes}
                      className={inputCls}
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      placeholder="e.g. Robin Hood"
                    />
                  ) : (
                    <input
                      {...FIELDS.createPackaging.notes}
                      className={inputCls}
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      placeholder="Size, colour…"
                    />
                  )}
                </Field>
              </div>

              <div className="flex items-center justify-between bg-[var(--surface-alt)] rounded-md px-4 py-3">
                <span className="text-sm text-[var(--dim)]">
                  Unit cost{price !== "" && sizeNum > 0 ? ` · ${money(priceNum, symbol)} for ${sizeNum} ${unit || ""}` : ""}
                </span>
                <span className="font-mono text-lg text-[#2c1e16]">
                  {unitMoney(unitCost, symbol)}
                  <span className="text-sm text-[var(--dim)]"> /{unit || (kind === "ingredient" ? "g" : "piece")}</span>
                </span>
              </div>

              {error ? (
                <p role="alert" className="text-sm text-[#a63c3c]">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-3 justify-end pt-2">
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => fileRef.current?.click()}
                >
                  <IconCamera /> Use a different photo
                </button>
                <button type="button" className={btnSecondary} onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className={btnPrimary} disabled={save.isPending}>
                  {save.isPending
                    ? "Adding…"
                    : kind === "ingredient"
                      ? match
                        ? "Add this price"
                        : "Add ingredient & price"
                      : "Add item & price"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
