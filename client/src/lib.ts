import { useQuery } from "@tanstack/react-query";
import { fileToBase64 } from "@hatch/space-sdk/client";
import { actionFields } from "@hatch/space-sdk/fields" with { type: "macro" };
import type { Actions } from "../../server/src/actions";
import { api, type ApiResponse } from "./api";

export const FIELDS = actionFields<typeof Actions>();

// ---------- derived types ----------
export type Settings = ApiResponse<typeof api, "getSettings">;
export type Ingredient = ApiResponse<typeof api, "listIngredients">["ingredients"][number];
export type Price = Ingredient["prices"][number];
export type PackagingItem = ApiResponse<typeof api, "listPackaging">["packaging"][number];
export type Recipe = ApiResponse<typeof api, "listRecipes">["recipes"][number];
export type Variant = Recipe["variants"][number];
export type LineItem = Variant["ingredients"][number];
export type PackLine = Variant["packaging"][number];
export type CompRef = Variant["components"][number];
export type Component = ApiResponse<typeof api, "listComponents">["components"][number];
export type Sale = ApiResponse<typeof api, "listSales">["sales"][number];
export type CostResult = ApiResponse<typeof api, "variantCost">;
export type Breakdown = CostResult["breakdown"];
export type Summary = ApiResponse<typeof api, "salesSummary">;
export type Counts = ApiResponse<typeof api, "counts">;
export type CostSnapshot = ApiResponse<typeof api, "costHistory">["snapshots"][number];
export type QuoteItem = ApiResponse<typeof api, "getQuote">["items"][number];
export type QuoteBanner = ApiResponse<typeof api, "listQuoteBanners">["banners"][number];

// ---------- formatting ----------
export function money(n: number, symbol = "$"): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}${symbol}${Math.abs(n).toFixed(2)}`;
}

/** Whole-dollar money with no decimals — for suggested/recommended prices. */
export function wholeMoney(n: number, symbol = "$"): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}${symbol}${Math.abs(Math.round(n)).toFixed(0)}`;
}

/** Unit costs are shown at up to 4 decimals, trailing zeros trimmed. */
export function unitMoney(n: number, symbol = "$"): string {
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n)
    .toFixed(4)
    .replace(/\.?0+$/, "");
  return `${sign}${symbol}${v === "" ? "0" : v}`;
}

export function qty(n: number): string {
  return String(Math.round(n * 10000) / 10000);
}

export function todayStr(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

/** Mirror of the server rule: override price, else latest, else newest purchase. */
export function resolvePrice(
  prices: Price[],
  overrideId: string | null,
): Price | undefined {
  if (overrideId) {
    const hit = prices.find((p) => p.id === overrideId);
    if (hit) return hit;
  }
  const latest = prices.find((p) => p.is_latest);
  if (latest) return latest;
  return [...prices].sort((a, b) => b.purchase_date.localeCompare(a.purchase_date))[0];
}

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => api.getSettings({}) });
}

/** Her target margin (%) from Settings, defaulting to 40 when unset. */
export function useTargetMargin(): number {
  const s = useSettings();
  const v = s.data?.target_margin_percent;
  return typeof v === "number" && v >= 0 && v < 100 ? v : 40;
}

/**
 * The price to charge for a variant at the target margin: live total
 * cost ÷ (1 − margin), always rounded UP to the next whole dollar
 * (ceiling) — never down, and no decimals. A value that is already a
 * whole dollar stays as is. Null when the margin can't produce a
 * price (≥100%).
 */
export function suggestedPrice(totalCost: number, marginPercent: number): number | null {
  if (!(marginPercent >= 0) || marginPercent >= 100) return null;
  const raw = totalCost / (1 - marginPercent / 100);
  // Subtract a tiny epsilon so floating-point error on an exact whole
  // dollar (e.g. 56.0000000001) doesn't push it up to the next dollar.
  return Math.ceil(raw - 1e-9);
}

/** "40" for whole percents, "37.5" otherwise — for "at N%" lines. */
export function fmtPercent(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function useSymbol(): string {
  const s = useSettings();
  return s.data?.currency_symbol ?? "$";
}

// ---------- file downloads ----------

/**
 * Triggers a download for a Blob the robust way: the anchor is attached to
 * the document before clicking (a detached anchor's click is ignored by
 * some in-app browsers), and the object URL stays alive well past the
 * click — revoking it synchronously, as the old code did, cancels the
 * download before it starts in several browsers and webviews.
 */
export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => a.remove(), 0);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const esc = (c: string | number) => `"${String(c).replace(/"/g, '""')}"`;
  const content = [
    headers.join(","),
    ...rows.map((r) => r.map(esc).join(",")),
  ].join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

export const stamp = () => todayStr();

// ---------- sale confirmation chime ----------

/**
 * A brief, quiet two-tone cash-register chime (~0.5s), synthesized with
 * Web Audio so no audio file is needed. Called only after a sale has
 * been recorded successfully; failures are silent by design (and any
 * audio problem is swallowed — a sound must never break a save).
 */
export function playSaleChime(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    void ctx.resume().catch(() => undefined);
    const master = ctx.createGain();
    master.gain.value = 0.08;
    master.connect(ctx.destination);
    // Two bright notes, struck in quick succession like a register bell.
    const notes: { freq: number; at: number }[] = [
      { freq: 1318.5, at: 0 }, // E6
      { freq: 1760, at: 0.09 }, // A6
    ];
    for (const { freq, at } of notes) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const start = ctx.currentTime + at;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(1, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + 0.3);
    }
    window.setTimeout(() => void ctx.close().catch(() => undefined), 700);
  } catch {
    // Sound is a nicety, never a blocker.
  }
}

// ---------- recipe photos ----------
export type PhotoMime = "image/jpeg" | "image/png" | "image/webp";
export interface PreparedPhoto {
  dataBase64: string;
  mimeType: PhotoMime;
}

const PHOTO_MIMES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

/**
 * Prepares a picked photo file for upload to setRecipePhoto: downscales it
 * to at most 1600px on the long edge and re-encodes as JPEG so phone photos
 * stay small. Falls back to the original file when it is already a modest
 * JPEG/PNG/WebP; rejects anything else (e.g. HEIC the browser can't decode).
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const asIs = async (): Promise<PreparedPhoto> => {
    const { dataBase64, mimeType } = await fileToBase64(file);
    if (PHOTO_MIMES.includes(mimeType)) {
      return { dataBase64, mimeType: mimeType as PhotoMime };
    }
    throw new Error("Please choose a JPEG, PNG, or WebP photo.");
  };
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return asIs();
  }
  try {
    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    if (scale >= 1 && PHOTO_MIMES.includes(file.type) && file.size <= 2_000_000) {
      return await asIs();
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const cx = canvas.getContext("2d");
    if (!cx) return await asIs();
    cx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) return await asIs();
    const { dataBase64 } = await fileToBase64(blob);
    return { dataBase64, mimeType: "image/jpeg" };
  } finally {
    bmp.close();
  }
}

/**
 * Prepares a picked photo for the price scan (scanPricePhoto): vision reads
 * JPEG/PNG only, so the photo is always re-encoded as JPEG at at most
 * 1600px on the long edge when the browser can decode it. Falls back to the
 * original bytes for a JPEG/PNG the browser cannot decode; rejects anything
 * else (e.g. an undecodable HEIC).
 */
/** A photo prepared for the price scan: JPEG or PNG only (vision's limit). */
export interface PreparedScanPhoto {
  dataBase64: string;
  mimeType: "image/jpeg" | "image/png";
}

export async function prepareScanPhoto(file: File): Promise<PreparedScanPhoto> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const maxDim = 1600;
      const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      const cx = canvas.getContext("2d");
      if (cx) {
        cx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.85),
        );
        if (blob) {
          const { dataBase64 } = await fileToBase64(blob);
          return { dataBase64, mimeType: "image/jpeg" };
        }
      }
    } finally {
      bmp.close();
    }
  } catch {
    // Fall through to the as-is path below.
  }
  const { dataBase64, mimeType } = await fileToBase64(file);
  if (mimeType === "image/jpeg" || mimeType === "image/png") {
    return { dataBase64, mimeType };
  }
  throw new Error("Please choose a JPEG or PNG photo.");
}

export type WorkbookSheets = {
  name: string;
  rows: (string | number | null)[][];
}[];

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Builds the consolidated backup workbook (.xlsx) as a File from the sheets
 * returned by exportWorkbookData — one tab per dataset, each in the format
 * the matching import accepts.
 */
export async function buildWorkbookFile(
  filename: string,
  sheets: WorkbookSheets,
): Promise<File> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([out], filename, { type: XLSX_MIME });
}

/** True when this browser can hand a File to the system share sheet —
 *  on phones that's the dependable "Save to Files" route, since a
 *  programmatic download click is silently dropped by some in-app
 *  browsers. */
export function canShareFile(file: File): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  );
}

/** Opens the share sheet for the file so the user can save it to Files /
 *  Drive / mail. Resolves once the sheet completes; rejects with an
 *  AbortError when the user dismisses it. */
export async function shareFile(file: File): Promise<void> {
  await navigator.share({ files: [file], title: file.name });
}

/** Opens the share sheet with the image FILE ONLY — no title, no text,
 *  no URL in the payload — so the recipient gets just the image, with
 *  nothing extra composed alongside it. Resolves once the sheet
 *  completes; rejects with an AbortError when the user dismisses it. */
export async function shareFileOnly(file: File): Promise<void> {
  await navigator.share({ files: [file] });
}

