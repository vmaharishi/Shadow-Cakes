import { useRef, useState, type RefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "../api";
import {
  buildWorkbookFile,
  canShareFile,
  downloadCsv,
  shareFile,
  triggerDownload,
  XLSX_MIME,
} from "../lib";
import {
  btnPrimary,
  btnSecondary,
  cardCls,
  ConfirmDialog,
  useToast,
  IconChevronRight,
  IconDownload,
  IconUpload,
} from "../ui";

type Kind =
  | "ingredients"
  | "recipes"
  | "packaging"
  | "components"
  | "sales"
  | "settings";
type Row = Record<string, string | number | null>;
type Datasets = Partial<Record<Kind, Row[]>>;
type Mode = "merge" | "replace";
type ImportSummary = ApiResponse<typeof api, "previewImport">;
type DatasetSummary = ImportSummary["datasets"][string];

// ---------- spreadsheet parsing (client-side, as before) ----------

async function readSheets(
  file: File,
): Promise<{ name: string; rows: Row[] }[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const out: { name: string; rows: Row[] }[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
      raw: true,
    }) as unknown[][];
    if (aoa.length === 0) continue;
    const headers = (aoa[0] ?? []).map((h) =>
      String(h ?? "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, ""),
    );
    const rows: Row[] = [];
    aoa.forEach((r, i) => {
      if (i === 0 || !r || r.every((c) => c == null || c === "")) return;
      const obj: Row = { __row: i + 1 };
      headers.forEach((h, j) => {
        if (!h) return;
        const v = r[j];
        if (v instanceof Date) obj[h] = v.toISOString().split("T")[0] ?? null;
        else if (typeof v === "number" || typeof v === "string") obj[h] = v;
        else if (v == null) obj[h] = null;
        else obj[h] = String(v);
      });
      rows.push(obj);
    });
    out.push({ name, rows });
  }
  return out;
}

const SHEET_NAME_KINDS: [RegExp, Kind][] = [
  [/ingredient/, "ingredients"],
  [/packag/, "packaging"],
  [/component/, "components"],
  [/recipe/, "recipes"],
  [/sales/, "sales"],
  [/setting/, "settings"],
];

/** Which dataset a sheet belongs to — by tab name first, then by headers.
 *  `nameHint` (the file's own name, for single-sheet files whose tab is
 *  just "Sheet1") is tried between the two: her Component_Recipes.xlsx and
 *  Recipe_Breakdown.xlsx have identical headers, so the file name is the
 *  only thing that tells them apart. */
function detectKind(sheetName: string, rows: Row[], nameHint?: string): Kind | null {
  const byName = (raw: string): Kind | null => {
    const n = raw.toLowerCase().replace(/[^a-z]/g, "");
    for (const [re, kind] of SHEET_NAME_KINDS) {
      if (re.test(n)) return kind;
    }
    return null;
  };
  const fromTab = byName(sheetName);
  if (fromTab) return fromTab;
  if (nameHint) {
    const fromFile = byName(nameHint);
    if (fromFile) return fromFile;
  }
  const first = rows[0];
  if (!first) return null;
  if ("packaging_name" in first) return "packaging";
  if ("component_name" in first) return "components";
  if ("ingredient_name" in first && "purchase_price" in first) return "ingredients";
  if (("recipe_name" in first || "recipe" in first) && "selling_price" in first)
    return "sales";
  if ("recipe_name" in first) return "recipes";
  if ("setting" in first) return "settings";
  return null;
}

const KIND_LABELS: Record<Kind, string> = {
  ingredients: "Ingredient pricing",
  packaging: "Packaging",
  components: "Components",
  recipes: "Recipes",
  sales: "Sales history",
  settings: "Settings",
};

// ---------- page ----------

/** The Data tab's whole content, top to bottom: the backup download,
 *  the workbook import, then the individual-sheet imports tucked under
 *  their expander beneath both. */
export function DataTab() {
  const [sheetsOpen, setSheetsOpen] = useState(false);
  return (
    <div className="space-y-6">
      <BackupCard />
      <WorkbookCard />

      {/* The individual-sheet imports stay one tap away but out of the
          main view — the workbook in is the everyday upload path. */}
      <button
        type="button"
        className="w-full flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left hover:border-[#ae8a3e]/60 transition-colors"
        aria-expanded={sheetsOpen}
        onClick={() => setSheetsOpen((o) => !o)}
      >
        <span className="flex-1 min-w-0">
          <span className="block font-heading text-lg font-medium text-[#2c1e16]">
            Individual sheets
          </span>
        </span>
        <span
          className={`shrink-0 text-[var(--dim)] transition-transform ${sheetsOpen ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          <IconChevronRight />
        </span>
      </button>
      {sheetsOpen ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {DEFS.map((def) => (
            <ImportCard key={def.kind} def={def} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type PreparedBackup = ApiResponse<typeof api, "prepareWorkbookBackup">;

function BackupCard() {
  const toast = useToast();
  const [prepared, setPrepared] = useState<PreparedBackup | null>(null);
  // The prepared file itself, built in-page as soon as Prepare succeeds.
  // Delivery never navigates to the blob URL: blob responses are served
  // with a sandbox CSP, so pointing the webview at the file failed with
  // the shell's "Couldn't load this space" error. Fetching the same URL
  // in-page is unaffected (it's how the app loads recipe photos and PDFs).
  // The File is built up front so the Save tap can hand it straight to
  // the share sheet — navigator.share must run inside the tap's gesture,
  // before any await, or the webview refuses it.
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [status, setStatus] = useState("");

  const fetchPrepared = async (p: PreparedBackup): Promise<Blob> => {
    const res = await fetch(p.url);
    if (!res.ok) throw new Error(`The prepared file couldn't be fetched (${res.status}).`);
    return await res.blob();
  };

  const prepare = useMutation({
    mutationFn: () => api.prepareWorkbookBackup({}),
    onSuccess: async (data) => {
      setPrepared(data);
      setFile(null);
      setSaveError("");
      setStatus("");
      try {
        const blob = await fetchPrepared(data);
        setFile(new File([blob], data.filename, { type: XLSX_MIME }));
      } catch {
        // Saving falls back to building the file client-side (below).
        setFile(null);
      }
      toast("Workbook ready — tap “Save the workbook” below");
    },
    onError: (e) => toast(e.message, "error"),
  });

  /** The workbook as a File: the prebuilt one when we have it, otherwise
   *  fetch the server-built bytes, otherwise build from the sheet data. */
  const workbookFile = async (p: PreparedBackup): Promise<File> => {
    if (file) return file;
    try {
      const blob = await fetchPrepared(p);
      const built = new File([blob], p.filename, { type: XLSX_MIME });
      setFile(built);
      return built;
    } catch {
      const data = await api.exportWorkbookData({});
      return await buildWorkbookFile(p.filename, data.sheets);
    }
  };

  /**
   * Hands the file to the device. Primary path: the Web Share API with
   * the prebuilt File — the OS share sheet's "Save to Files" is a native
   * hand-off that works inside the Muse webview, where programmatic
   * blob-anchor downloads (the old Save button) are silently dropped:
   * the tap produced no download, no error, nothing. navigator.share is
   * invoked synchronously from the tap, before any await, because the
   * webview only honours it during the tap's user gesture. Where file
   * sharing isn't available (most desktop browsers), fall back to the
   * anchor download, which desktop browsers do honour. The status line
   * only reports what actually happened — a completed share, a dismissed
   * sheet, or a browser download starting — never a bare success claim.
   */
  const deliver = (f: File) => {
    if (canShareFile(f)) {
      shareFile(f).then(
        () => {
          setStatus(
            "Share complete — the workbook went to the place you picked. Check there for the file.",
          );
        },
        (e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") {
            setStatus(
              "The share sheet closed without saving — the workbook isn't saved yet. Tap “Save the workbook” when you're ready.",
            );
          } else {
            setSaveError(
              "The share sheet couldn't open — try “Download instead” below.",
            );
          }
        },
      );
      return;
    }
    triggerDownload(f, f.name);
    setStatus(
      "Download started in your browser — look for the file in your Downloads folder.",
    );
  };

  const save = async () => {
    if (!prepared) return;
    setSaveError("");
    setStatus("");
    // Fast path: the File is already built, so delivery starts
    // synchronously inside this tap — no async gap to lose the gesture
    // the share sheet needs.
    if (file) {
      deliver(file);
      return;
    }
    setSaving(true);
    try {
      deliver(await workbookFile(prepared));
    } catch (e) {
      setSaveError(
        e instanceof Error
          ? e.message
          : "Couldn't get the workbook file — tap “Prepare a fresh copy” and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  /** The plain browser download, kept as a secondary route for anyone
   *  whose share sheet doesn't offer a save option. */
  const downloadInstead = async () => {
    if (!prepared) return;
    setSaveError("");
    setStatus("");
    setSaving(true);
    try {
      const f = await workbookFile(prepared);
      triggerDownload(f, f.name);
      setStatus(
        "Download started in your browser — if no file appears, use “Save the workbook” and pick Save to Files in the sheet instead.",
      );
    } catch (e) {
      setSaveError(
        e instanceof Error
          ? e.message
          : "Couldn't get the workbook file — tap “Prepare a fresh copy” and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`${cardCls} p-5 border-[#ae8a3e]/40 bg-[#ae8a3e]/5`}>
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div className="min-w-0 max-w-xl">
          <h2 className="font-heading text-lg font-medium text-[#2c1e16]">
            One workbook with everything
          </h2>
        </div>
        <button
          type="button"
          className={btnPrimary}
          disabled={prepare.isPending}
          onClick={() => prepare.mutate()}
        >
          <IconDownload />{" "}
          {prepare.isPending
            ? "Preparing…"
            : prepared
              ? "Prepare a fresh copy"
              : "Prepare workbook"}
        </button>
      </div>

      {prepared ? (
        <div className="mt-4 border-t border-[#ae8a3e]/30 pt-4">
          <p className="text-sm text-[var(--text)] leading-relaxed">
            Your workbook is ready:{" "}
            <span className="font-semibold text-[#2c1e16]">
              {prepared.filename}
            </span>{" "}
            <span className="text-[var(--dim)]">
              ({Math.max(1, Math.round(prepared.size_bytes / 1024))} KB, all six
              tabs)
            </span>
            . Tap “Save the workbook” — on a phone a share sheet opens;
            choose Save to Files to keep it.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={saving}
              onClick={() => void save()}
            >
              <IconDownload /> {saving ? "Getting the file…" : "Save the workbook"}
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={saving}
              onClick={() => void downloadInstead()}
            >
              Download instead
            </button>
          </div>
          {status ? (
            <p className="mt-3 text-sm text-[var(--text)]">{status}</p>
          ) : null}
          {saveError ? (
            <p role="alert" className="mt-3 text-sm text-[#a63c3c]">
              {saveError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ---------- shared import flow ----------

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  const opt = (m: Mode, title: string, body?: string) => (
    <button
      type="button"
      onClick={() => onChange(m)}
      aria-pressed={mode === m}
      className={`flex-1 text-left rounded-md border px-3 py-2.5 transition-colors ${
        mode === m
          ? "border-[#ae8a3e] bg-[#ae8a3e]/10"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[#ae8a3e]/60"
      }`}
    >
      <span className="block text-sm font-semibold text-[#2c1e16]">{title}</span>
      {body ? (
        <span className="block text-xs text-[var(--dim)] mt-0.5 leading-relaxed">
          {body}
        </span>
      ) : null}
    </button>
  );
  return (
    <div className="flex flex-col sm:flex-row gap-2" role="group" aria-label="Import mode">
      {opt("merge", "Merge")}
      {opt("replace", "Replace")}
    </div>
  );
}

function SummaryPanel({
  summary,
  applied,
}: {
  summary: ImportSummary;
  applied: boolean;
}) {
  const entries = Object.entries(summary.datasets) as [Kind, DatasetSummary][];
  if (entries.length === 0) return null;
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm font-semibold text-[#2c1e16]">
        {applied
          ? "Import complete"
          : summary.mode === "merge"
            ? "Preview — here's what merging will do"
            : "Preview — here's what replacing will do"}
      </p>
      {entries.map(([kind, d]) => (
        <div
          key={kind}
          className="bg-[#fdf8ef] border border-[var(--border)] rounded-md px-4 py-3"
        >
          <p className="text-sm font-semibold text-[#2c1e16]">
            {KIND_LABELS[kind] ?? kind}
            <span className="font-normal text-[var(--dim)]">
              {" "}
              · {d.rows_read} row{d.rows_read === 1 ? "" : "s"} read
            </span>
          </p>
          {d.error ? (
            <p role="alert" className="text-sm text-[#a63c3c] mt-1">
              {d.error}
            </p>
          ) : (
            <ul className="mt-1 text-sm text-[var(--text)]">
              {d.created > 0 ? <li>{d.created} new</li> : null}
              {d.updated > 0 ? <li>{d.updated} updated</li> : null}
              {d.appended > 0 ? <li>{d.appended} added as new records</li> : null}
              {d.created === 0 && d.updated === 0 && d.appended === 0 ? (
                <li>No changes</li>
              ) : null}
              {d.detail ? <li>{d.detail}</li> : null}
            </ul>
          )}
          {d.warnings.length > 0 ? (
            <ul className="mt-2 text-xs text-[#9a6716] list-disc pl-5 space-y-0.5">
              {d.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
          {d.skipped.length > 0 ? (
            <div className="mt-2">
              <p className="text-xs font-semibold text-[#9a6716]">
                {d.skipped.length} row{d.skipped.length === 1 ? "" : "s"} skipped:
              </p>
              <ul className="text-xs text-[var(--dim)] list-disc pl-5 space-y-0.5">
                {d.skipped.slice(0, 25).map((sk, i) => (
                  <li key={i}>
                    Row {sk.row}: {sk.reason}
                  </li>
                ))}
                {d.skipped.length > 25 ? (
                  <li>…and {d.skipped.length - 25} more</li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function useImportFlow() {
  const toast = useToast();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("merge");
  const [fileName, setFileName] = useState("");
  const [datasets, setDatasets] = useState<Datasets | null>(null);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [parseError, setParseError] = useState("");
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const previewMut = useMutation({
    mutationFn: (args: { datasets: Datasets; mode: Mode }) =>
      api.previewImport({ datasets: args.datasets, mode: args.mode }),
    onSuccess: (res) => setPreview(res),
    onError: (e) => toast(e.message, "error"),
  });
  const applyMut = useMutation({
    mutationFn: (args: { datasets: Datasets; mode: Mode }) =>
      api.importData({ datasets: args.datasets, mode: args.mode }),
    onSuccess: (res) => {
      setResult(res);
      setPreview(null);
      setConfirmOpen(false);
      qc.invalidateQueries();
      toast("Import complete");
    },
    onError: (e) => {
      setConfirmOpen(false);
      toast(e.message, "error");
    },
  });

  const startPreview = (ds: Datasets, m: Mode) => {
    setResult(null);
    setPreview(null);
    previewMut.mutate({ datasets: ds, mode: m });
  };

  const changeMode = (m: Mode) => {
    setMode(m);
    setResult(null);
    if (datasets) startPreview(datasets, m);
  };

  const apply = () => {
    if (!datasets) return;
    if (mode === "replace") setConfirmOpen(true);
    else applyMut.mutate({ datasets, mode });
  };

  const totalRows = datasets
    ? Object.values(datasets).reduce((n, rows) => n + (rows?.length ?? 0), 0)
    : 0;
  const allErrored =
    preview != null &&
    Object.values(preview.datasets).every((d) => d.error != null);

  return {
    mode,
    changeMode,
    fileName,
    setFileName,
    datasets,
    setDatasets,
    ignored,
    setIgnored,
    parseError,
    setParseError,
    preview,
    result,
    confirmOpen,
    setConfirmOpen,
    previewMut,
    applyMut,
    startPreview,
    apply,
    totalRows,
    allErrored,
  };
}

type Flow = ReturnType<typeof useImportFlow>;

function FlowControls({
  flow,
  fileRef,
  chooseLabel,
  fileHint,
  onPick,
}: {
  flow: Flow;
  fileRef: RefObject<HTMLInputElement | null>;
  chooseLabel: string;
  fileHint: string;
  onPick: (f: File | undefined) => void;
}) {
  return (
    <>
      <div className="mt-4">
        <ModeToggle mode={flow.mode} onChange={flow.changeMode} />
      </div>
      <div className="mt-4 border-2 border-dashed border-[var(--border)] rounded-lg px-4 py-5 text-center bg-[#fdf8ef]">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="sr-only"
          aria-label={chooseLabel}
          onChange={(e) => {
            onPick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className={btnSecondary}
          onClick={() => fileRef.current?.click()}
        >
          <IconUpload /> Choose a file
        </button>
        <p className="text-xs text-[var(--dim)] mt-2">
          {flow.fileName
            ? `${flow.fileName} — ${flow.totalRows} data rows`
            : fileHint}
        </p>
      </div>

      {flow.parseError ? (
        <p role="alert" className="mt-3 text-sm text-[#a63c3c]">
          {flow.parseError}
        </p>
      ) : null}
      {flow.ignored.length > 0 ? (
        <p className="mt-3 text-xs text-[var(--dim)]">
          Tabs not recognised and ignored: {flow.ignored.join(", ")}.
        </p>
      ) : null}

      {flow.previewMut.isPending ? (
        <p role="status" className="mt-4 text-sm text-[var(--dim)]">
          Checking the file…
        </p>
      ) : null}
      {flow.preview ? (
        <SummaryPanel summary={flow.preview} applied={false} />
      ) : null}
      {flow.result ? <SummaryPanel summary={flow.result} applied /> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={
            !flow.datasets ||
            !flow.preview ||
            flow.allErrored ||
            flow.applyMut.isPending
          }
          onClick={flow.apply}
        >
          <IconUpload />{" "}
          {flow.applyMut.isPending
            ? "Importing…"
            : flow.mode === "merge"
              ? "Import — merge"
              : "Import — replace…"}
        </button>
      </div>

      {flow.confirmOpen ? (
        <ConfirmDialog
          title="Replace with this import?"
          message={`Replace mode wipes each included section first, then loads the ${flow.totalRows} rows from ${flow.fileName}. Anything not in the file is gone from those sections. This can't be undone — download a workbook backup first if you need one.`}
          confirmLabel="Replace data"
          busy={flow.applyMut.isPending}
          onCancel={() => flow.setConfirmOpen(false)}
          onConfirm={() =>
            flow.datasets &&
            flow.applyMut.mutate({ datasets: flow.datasets, mode: flow.mode })
          }
        />
      ) : null}
    </>
  );
}

function WorkbookCard() {
  const flow = useImportFlow();
  const fileRef = useRef<HTMLInputElement>(null);

  const onPick = async (f: File | undefined) => {
    flow.setParseError("");
    flow.setDatasets(null);
    flow.setFileName("");
    flow.setIgnored([]);
    if (!f) return;
    if (!/\.(csv|xlsx|xls)$/i.test(f.name)) {
      flow.setParseError("Please choose a .csv or .xlsx file.");
      return;
    }
    try {
      const sheets = await readSheets(f);
      const datasets: Datasets = {};
      const ignored: string[] = [];
      // A single-sheet file's tab name carries no meaning ("Sheet1"), so
      // let the file name classify it; in a real workbook the tab names do.
      const hint = sheets.length === 1 ? f.name : undefined;
      for (const sheet of sheets) {
        if (sheet.rows.length === 0) continue;
        const kind = detectKind(sheet.name, sheet.rows, hint);
        if (kind) datasets[kind] = sheet.rows;
        else ignored.push(sheet.name);
      }
      if (Object.keys(datasets).length === 0) {
        flow.setParseError(
          "None of that file's tabs look like Shadow Cakes data. The workbook's tabs are named Ingredient Pricing, Packaging, Components, Recipes, Sales History, and Settings.",
        );
        return;
      }
      flow.setDatasets(datasets);
      flow.setIgnored(ignored);
      flow.setFileName(f.name);
      flow.startPreview(datasets, flow.mode);
    } catch {
      flow.setParseError(
        "Couldn't read that file — check it's a valid CSV or Excel spreadsheet.",
      );
    }
  };

  return (
    <section className={`${cardCls} p-5 border-[#ae8a3e]/40`}>
      <h2 className="font-heading text-lg font-medium text-[#2c1e16]">
        Import the workbook
      </h2>
      <FlowControls
        flow={flow}
        fileRef={fileRef}
        chooseLabel="Choose the workbook file to import"
        fileHint="Excel (.xlsx) with one tab per dataset"
        onPick={onPick}
      />
    </section>
  );
}

// ---------- individual sheet imports ----------

interface ImportDef {
  kind: Exclude<Kind, "settings">;
  title: string;
  description: string;
  columns: string[];
  templateRows: (string | number)[][];
}

const DEFS: ImportDef[] = [
  {
    kind: "ingredients",
    title: "Ingredient Pricing",
    description:
      "One row per purchase: the ingredient, the store, what you paid, and how much you got. Merging adds every row as a new dated price — the newest purchase becomes the current price.",
    columns: ["ingredient_name", "store_vendor", "purchase_price", "package_size", "unit", "purchase_date", "brand"],
    templateRows: [["All-purpose flour", "Costco", 12.99, 10000, "g", "2026-01-15", "Robin Hood"]],
  },
  {
    kind: "recipes",
    title: "Recipes",
    description:
      "One row per line of each recipe variant. line_type says what the line is — ingredient, packaging, or component — and item_name names it. Packaging and component lines link to items already in the tool, so import those sheets first.",
    columns: ["recipe_name", "variant_name", "line_type", "item_name", "quantity", "unit", "prep_time_minutes", "utility_time_minutes", "category", "notes"],
    templateRows: [
      ["Vanilla Layer Cake", "8-inch", "ingredient", "All-purpose flour", 300, "g", 45, 30, "Birthday", ""],
      ["Vanilla Layer Cake", "8-inch", "packaging", "8-inch cake box", 1, "piece", "", "", "", ""],
      ["Vanilla Layer Cake", "8-inch", "component", "Chocolate ganache", 1, "batch", "", "", "", ""],
    ],
  },
  {
    kind: "packaging",
    title: "Packaging",
    description:
      "One row per packaging item — unit cost is calculated from purchase_price ÷ package_size. Merging updates an item with the same name.",
    columns: ["packaging_name", "store_vendor", "purchase_price", "package_size", "unit", "purchase_date", "notes"],
    templateRows: [["8-inch cake box", "Bulk Barn", 15.0, 10, "piece", "2026-01-15", "White, window lid"]],
  },
  {
    kind: "components",
    title: "Components",
    description:
      "Frostings, ganaches, fillings — same layout as the recipes sheet. Each recipe_name + variant_name pair becomes one component (e.g. “Dark Chocolate Ganache — 6-inch”), matching how recipes refer to them.",
    columns: ["recipe_name", "variant_name", "line_type", "item_name", "quantity", "unit", "prep_time_minutes", "utility_time_minutes", "batch_yield_grams", "notes"],
    templateRows: [
      ["Chocolate ganache", "8-inch", "Ingredient", "Dark chocolate", 400, "g", 20, 0, 800, ""],
      ["Chocolate ganache", "8-inch", "Ingredient", "Whipping cream", 200, "g", "", "", "", ""],
    ],
  },
  {
    kind: "sales",
    title: "Sales History",
    description:
      "Past sales, in the same format the Sales page exports — and the format of the original Sales History sheet (margins there are decimal fractions, 0.32 for 32%; both are understood). The Sale Type column marks each sale Customer or Event (older sheets without it import as Customer). A customer with just a first name is fine — the last name can be blank. Merging adds sales that aren't already recorded and skips exact duplicates.",
    columns: ["Sale Date", "Recipe", "Variant", "Customer", "Sale Type", "Selling Price", "Total Cost", "Labour Cost", "Profit", "Profit Margin", "Notes"],
    templateRows: [["2026-01-20", "Vanilla Layer Cake", "8-inch", "Priya", "Customer", 65, 28.5, 7.5, 36.5, 0.56, "Birthday order"]],
  },
];

function ImportCard({ def }: { def: ImportDef }) {
  const flow = useImportFlow();
  const fileRef = useRef<HTMLInputElement>(null);

  const onPick = async (f: File | undefined) => {
    flow.setParseError("");
    flow.setDatasets(null);
    flow.setFileName("");
    flow.setIgnored([]);
    if (!f) return;
    if (!/\.(csv|xlsx|xls)$/i.test(f.name)) {
      flow.setParseError("Please choose a .csv or .xlsx file.");
      return;
    }
    try {
      const sheets = await readSheets(f);
      const hint = sheets.length === 1 ? f.name : undefined;
      const named = sheets.find(
        (sh) =>
          sh.rows.length > 0 && detectKind(sh.name, sh.rows, hint) === def.kind,
      );
      const rows = named?.rows ?? sheets.find((sh) => sh.rows.length > 0)?.rows;
      if (!rows || rows.length === 0) {
        flow.setParseError("That file has no data rows under its header row.");
        return;
      }
      const datasets: Datasets = { [def.kind]: rows };
      flow.setDatasets(datasets);
      flow.setFileName(f.name);
      flow.startPreview(datasets, flow.mode);
    } catch {
      flow.setParseError(
        "Couldn't read that file — check it's a valid CSV or Excel spreadsheet.",
      );
    }
  };

  return (
    <section className={`${cardCls} p-5 flex flex-col`}>
      <h2 className="font-heading text-lg font-medium text-[#2c1e16]">{def.title}</h2>
      <div className="mt-3">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--dim)]">
          Expected columns
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {def.columns.map((c) => (
            <code
              key={c}
              className="bg-[var(--surface-alt)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[11px] font-mono text-[#2c1e16]"
            >
              {c}
            </code>
          ))}
        </div>
      </div>
      <FlowControls
        flow={flow}
        fileRef={fileRef}
        chooseLabel={`Choose file for ${def.title}`}
        fileHint="CSV or Excel, first row is the header"
        onPick={onPick}
      />
      <div className="mt-auto pt-3">
        <button
          type="button"
          className={btnSecondary}
          onClick={() =>
            downloadCsv(`${def.kind}_template.csv`, def.columns, def.templateRows)
          }
        >
          <IconDownload /> Template
        </button>
      </div>
    </section>
  );
}
