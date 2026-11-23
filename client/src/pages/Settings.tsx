import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { FIELDS, useSettings, type Settings } from "../lib";
import {
btnPrimary,
cardCls,
ErrorNote,
Field,
inputCls,
Loading,
useToast,
} from "../ui";
import { BackupTab, UploadTab } from "./Import";

export type SettingsTab = "costs" | "backup" | "upload" | "chat";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "costs", label: "Costs" },
  { id: "backup", label: "Backup" },
  { id: "upload", label: "Upload" },
  { id: "chat", label: "Chat setup" },
];

const CHAT_INSTRUCTIONS = `Remember this for the Shadow Cakes pricing tool — these are standing rules:

LOGGING PRICES FROM PHOTOS
When I send a photo of a price tag, product, or receipt:
1. Read the item name, brand, store, total price, and package size.
2. Repeat back to me exactly what you are about to log — one line, in the format below — and wait for my yes before logging anything.
3. Log it as a price for that ingredient in the Shadow Cakes tool: if the ingredient already exists, add it as the newest price; if it is new, create the ingredient and its first price.
4. If anything is unreadable or missing, ask me — never guess a price, size, or brand.

FORMAT — match my spreadsheet exactly:
- Ingredient: the product name as printed (for example, "Nutella Peanut Spread")
- Store: the store name only (Costco, No Frills, Amazon…)
- Price: the total price paid, as a plain number (4.97)
- Package size: the TOTAL amount, as a number — a multi-pack counts as its total (2 × 26.5 oz = 1,502.5)
- Unit: g, ml, or piece — convert ounces to grams (1 oz = 28.35 g)
- Date: YYYY-MM-DD
- Brand: the exact brand name only, or blank if there is none — no other words in this field

Repeat-back example: "Nutella Peanut Spread · Costco · $4.97 · 1,502.5 g · 2026-11-22 · Brand: Nutella — log it?"

TAX: Store shelf prices don't include tax. When you log a price from a store photo, show it in your confirmation line: the shelf price, whether tax applies, and the total you'll log — e.g. "…$4.97 + 13% tax = $5.62". Add 13% HST only for taxable items (prepared foods, candy/confectionery, drinks, non-food items like packaging). Basic grocery staples are tax-free in Ontario — log those at the shelf price. If the photo is a receipt, the tax is already in — never add it twice. If you're unsure whether an item is taxable, ask her in the confirmation line.

LOGGING SALES
When I tell you about a sale in chat, repeat back one line first — cake and size, customer first and last name (both are required), price, and date (today unless I say otherwise) — and log it only after I say yes.

GENERAL
Prices I type in chat without a photo follow the same rules. Never edit or delete existing records unless I ask. When a new price is logged, recipe costs update on their own — I never need to change a recipe because a price changed.`;

export function SettingsPage({
  tab,
  onTabChange,
}: {
  tab: SettingsTab;
  onTabChange: (t: SettingsTab) => void;
}) {
  const q = useSettings();
  return (
    <div>
      <h1 className="font-heading text-3xl sm:text-4xl font-light tracking-tight text-[#1a1a1a]">
        Settings
      </h1>
      <p className="text-sm text-[var(--dim)] mt-1">
        {tab === "costs"
          ? "Configure labour and utility rates and your target margin"
          : tab === "backup"
            ? "Download everything as one workbook"
            : tab === "upload"
              ? "Import a workbook or individual spreadsheets"
              : "Standing instructions for your Muse chat"}
      </p>

      {/* All four tabs stay on ONE line at every width — no wrapping;
          the pills shrink their font and padding on phones to fit. */}
      <div
        className="mt-5 flex flex-nowrap items-center gap-1.5 sm:gap-2"
        role="tablist"
        aria-label="Settings sections"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTabChange(t.id)}
            className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-2 text-[13px] sm:px-4 sm:text-sm font-semibold border transition-colors ${
              tab === t.id
                ? "bg-[#2c1e16] text-white border-[#2c1e16]"
                : "bg-[var(--surface)] text-[var(--dim)] border-[var(--border)] hover:bg-[#f9ecd7]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "costs" ? (
        <div className="mt-6 max-w-2xl">
          {q.isPending ? (
            <Loading />
          ) : q.error ? (
            <ErrorNote error={q.error} />
          ) : q.data ? (
            <SettingsForm key={JSON.stringify(q.data)} initial={q.data} />
          ) : null}
        </div>
      ) : tab === "backup" ? (
        <div className="mt-6">
          <BackupTab />
        </div>
      ) : tab === "upload" ? (
        <div className="mt-6">
          <UploadTab />
        </div>
      ) : (
        <div className="mt-6">
          <ChatSetupTab />
        </div>
      )}
    </div>
  );
}

function ChatSetupTab() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CHAT_INSTRUCTIONS);
    } catch {
      // Clipboard API can be unavailable in some webviews — fall back to a
      // temporary textarea + execCommand.
      const ta = document.createElement("textarea");
      ta.value = CHAT_INSTRUCTIONS;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        // Nothing more to try; the text stays visible for manual copying.
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-[var(--dim)]">
        Paste this into your Muse chat once — it will remember how to log
        prices and sales for this tool.
      </p>
      <div className={`${cardCls} mt-4 p-5 sm:p-6`}>
        <pre className="whitespace-pre-wrap font-body text-sm leading-relaxed text-[var(--text)]">
          {CHAT_INSTRUCTIONS}
        </pre>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={copy}
            className={btnPrimary}
            aria-live="polite"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsForm({ initial }: { initial: Settings }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [labour, setLabour] = useState(String(initial.labour_rate_per_hour));
  const [utility, setUtility] = useState(String(initial.utility_rate_per_hour));
  const [currency, setCurrency] = useState(initial.currency);
  const [symbol, setSymbol] = useState(initial.currency_symbol);
  const [targetMargin, setTargetMargin] = useState(
    String(initial.target_margin_percent ?? 40),
  );
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api.updateSettings({
        labour_rate_per_hour: parseFloat(labour) || 0,
        utility_rate_per_hour: parseFloat(utility) || 0,
        currency: currency.trim() || "CAD",
        currency_symbol: symbol.trim() || "$",
        target_margin_percent: parseFloat(targetMargin) || 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["variantCost"] });
      qc.invalidateQueries({ queryKey: ["components"] });
      toast("Settings saved — costs now use the new rates");
    },
    onError: (e) => toast(e.message, "error"),
  });

  const submit = () => {
    const lab = parseFloat(labour);
    const util = parseFloat(utility);
    if (
      labour === "" ||
      utility === "" ||
      Number.isNaN(lab) ||
      Number.isNaN(util) ||
      lab < 0 ||
      util < 0
    ) {
      setError("Rates must be numbers, zero or more.");
      return;
    }
    if (!currency.trim() || !symbol.trim()) {
      setError("Currency and symbol can't be empty.");
      return;
    }
    const margin = parseFloat(targetMargin);
    if (
      targetMargin === "" ||
      Number.isNaN(margin) ||
      margin < 0 ||
      margin > 99
    ) {
      setError("Target margin must be a number between 0% and 99%.");
      return;
    }
    save.mutate();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={`${cardCls} p-5 sm:p-6 space-y-5`}
    >
      <p className="text-sm text-[var(--dim)] bg-[var(--surface-alt)] rounded-md px-4 py-3">
        These rates are used to calculate labour and utility costs in recipes —
        labour and utilities are charged on each variant's prep time.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Currency">
          <input
            {...FIELDS.updateSettings.currency}
            className={inputCls}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </Field>
        <Field label="Currency symbol">
          <input
            {...FIELDS.updateSettings.currency_symbol}
            className={inputCls}
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          />
        </Field>
        <Field label={`Labour rate (${symbol}/hr)`}>
          <input
            {...FIELDS.updateSettings.labour_rate_per_hour}
            className={inputCls}
            value={labour}
            onChange={(e) => setLabour(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field label={`Utility rate (${symbol}/hr)`}>
          <input
            {...FIELDS.updateSettings.utility_rate_per_hour}
            className={inputCls}
            value={utility}
            onChange={(e) => setUtility(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field label="Target margin %">
          <input
            {...FIELDS.updateSettings.target_margin_percent}
            className={inputCls}
            value={targetMargin}
            onChange={(e) => setTargetMargin(e.target.value)}
            inputMode="decimal"
          />
        </Field>
      </div>
      <p className="text-sm text-[var(--dim)]">
        Each recipe variant shows a suggested price — what to charge to hit
        this margin on its current cost. It updates on its own whenever an
        ingredient price changes.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-[#a63c3c]">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button type="submit" className={btnPrimary} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
