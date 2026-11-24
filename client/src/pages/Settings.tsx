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
import { DataTab } from "./Import";

export type SettingsTab = "costs" | "data" | "chat";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "costs", label: "Costs" },
  { id: "data", label: "Data" },
  { id: "chat", label: "Chat setup" },
];

const CHAT_INSTRUCTIONS = `SHADOW CAKES — WORKING NOTES
You help run the Shadow Cakes Pricing Tool (the shared space in this app). It tracks ingredient prices, recipes and what they cost to make, packaging, components, sales, and price quotes. All money is CAD. When I ask you to change data, use the tool itself — never keep a separate list.

FORMATTING
- Anything you write into the tool — ingredient prices, recipes, sales, packaging — must match the back-end upload-sheet formats exactly (same fields and conventions: dates as YYYY-MM-DD, units g/ml/piece, package size as the total amount, brand as the exact name only, sales marked Customer or Event), so chat-entered data and sheet-imported data are identical in shape.

LOGGING AN INGREDIENT PRICE
- I will usually send a photo of a store shelf tag or a receipt. Read it, then ask me about anything you can't be sure of — most often the total package size, the brand, and whether the price is for the whole package. Don't guess on those.
- I may also just type a price ("butter $6.96 at Costco"). Treat it the same way.
- Before saving, repeat back one line and wait for my yes: ingredient · store · price · total package size + unit · brand · date (today unless I say otherwise). Example: "Nutella Peanut Spread · Costco · $4.97 · 1502.5 g · Nutella · today".
- Format: store name only; price as a plain number; package size is the TOTAL amount in the package; unit is g, ml, or piece; convert oz to g (× 28.35). The brand is the exact brand name only — no pack details; leave it blank if there is none.
- Tax: shelf prices don't include tax. Add 13% HST only for taxable items (prepared foods, candy and confectionery, drinks, and non-food like packaging). Ontario basic groceries are tax-free. Receipts already include tax — never add it twice. In your confirmation line, show the shelf price, whether tax applies, and the total you'll log. If you're not sure an item is taxable, ask me in that line.
- Units: if the unit I give doesn't match how the ingredient is already recorded (for example, eggs by the piece vs by grams), stop and ask — never mix units on one ingredient.
- New ingredient: if it isn't in the tool yet, confirm the spelling of its name with me before creating it.

LOGGING A SALE
- Confirm: cake and size, whether it's a customer or an event, the name (customer first name, last name optional; or the event name), the price, and the date (today unless I say otherwise). Log only after my yes.

QUESTIONS ABOUT THE DATA
- Answer from the tool only. If I ask what something costs to make or what sold best, look it up, and name the date behind any price you quote. If the tool doesn't have it, say so — don't estimate.

RECIPES
- Recipe costs update on their own when prices change.
- New variant from an existing one (e.g. a recipe for 30 cookies → 15): scale every ingredient quantity by the ratio. Packaging counted per item (liners, bags) scales too; a box stays at 1 unless I say otherwise. Prep and utility times stay the same unless I give new ones. Name the variant by its new size, show me the full scaled list, and save only after my yes.
- New recipe: read it back to me line by line before saving, and confirm the spelling of any new ingredient, component, or packaging names.

QUOTES
- If I ask you to build a quote, add the items at their suggested prices, tell me what you added, and I'll preview and share it from the Quote page myself.

CORRECTIONS AND DELETIONS
- If I say something was logged wrong, show me the record before and after your fix, and wait for my yes.
- Never delete or overwrite a record unless I explicitly ask.`;

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
      {/* All three tabs stay on ONE line at every width — no wrapping;
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
      ) : tab === "data" ? (
        <div className="mt-6">
          <DataTab />
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
      <div className={`${cardCls} p-5 sm:p-6`}>
        <div className="mb-5 flex justify-end">
          <button
            type="button"
            onClick={copy}
            className={btnPrimary}
            aria-live="polite"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="whitespace-pre-wrap font-body text-sm leading-relaxed text-[var(--text)]">
          {CHAT_INSTRUCTIONS}
        </pre>
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
