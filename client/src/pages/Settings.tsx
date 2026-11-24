import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "../api";
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

export type SettingsTab = "costs" | "data" | "feedback" | "getting-started";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "costs", label: "Costs" },
  { id: "data", label: "Data" },
  { id: "feedback", label: "Feedback" },
  { id: "getting-started", label: "Getting started" },
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
- Recipe from a photo: I may send a photo of a recipe — handwritten, from a book, or a screenshot. Read it, then talk it through with me before building anything: read back the name, the size, and every line with its quantity and unit. Match each line to an ingredient, component, or packaging item already in the tool; if a line could match more than one, ask me which. Ask me about anything the photo doesn't say — prep time, utility time, packaging, the size name. Then show me the full recipe with its cost, and save only after my yes.

QUOTES
- If I ask you to build a quote, add the items at their suggested prices, tell me what you added, and I'll preview and share it from the Quote page myself.

CORRECTIONS AND DELETIONS
- If I say something was logged wrong, show me the record before and after your fix, and wait for my yes.
- Never delete or overwrite a record unless I explicitly ask.

FEEDBACK
- When I mention anything about using the tool itself — something confusing, slow, too small to tap, missing, or that I would change — treat it as feedback, even if I never say the word "feedback". If I react to the tool while we're working, offer to note it down.
- If what I said is vague, ask me one brief follow-up first — which screen I was on, or what I was trying to do — so the note is useful.
- Then compile it into one short, clear feedback item in my own words, and log it into the tool with the logfeedback action, tagging the area it belongs to (Dashboard, Sales, Ingredients, Quote, Recipes, Packaging, or General). Tell me it's noted.
- Feedback is only logged — never act on it yourself, and no changes get made from it directly.`;

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
      {/* Section picker: an underline tab bar at the top — four tabs
          sized to their text, left-aligned with clear space between
          them. The active tab is bold dark text over a 3px gold
          underline; inactive tabs are muted with no underline, and a
          hairline runs under the whole bar. Chat setup is no longer a
          tab: it lives inside Getting started as the "Notes" drop-down. */}
      <nav
        aria-label="Settings sections"
        className="mt-6 flex gap-5 border-b border-[var(--border)]"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onTabChange(t.id)}
              className={`-mb-px whitespace-nowrap border-b-[3px] pb-2.5 pt-1 text-xs transition-colors ${
                active
                  ? "border-[#ae8a3e] font-bold text-[#2c1e16]"
                  : "border-transparent font-medium text-[var(--dim)] hover:text-[#2c1e16]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-6 min-w-0">
        {tab === "costs" ? (
          <div className="max-w-2xl">
            {q.isPending ? (
              <Loading />
            ) : q.error ? (
              <ErrorNote error={q.error} />
            ) : q.data ? (
              <SettingsForm key={JSON.stringify(q.data)} initial={q.data} />
            ) : null}
          </div>
        ) : tab === "data" ? (
          <DataTab />
        ) : tab === "feedback" ? (
          <FeedbackTab />
        ) : (
          <GettingStartedTab />
        )}
      </div>
    </div>
  );
}

// Getting started holds two collapsible drop-downs, both closed by
// default and styled like the Feedback sections: "Notes" first — the
// Chat setup instruction block that used to be its own tab — then
// "User guide", the high-level overview.
function GettingStartedTab() {
  return (
    <div className="max-w-2xl space-y-4">
      <GuideSection title="Notes">
        <ChatSetupTab />
      </GuideSection>
      <GuideSection title="User guide">
        <div className="space-y-6">
        <p className="text-sm leading-relaxed text-[var(--text)]">
          Shadow Cakes keeps your ingredient prices, recipe costs, and sales in one place.
        </p>

        <section>
          <h2 className="font-heading text-lg font-semibold text-[#2c1e16]">
            Work through Muse
          </h2>
          <p className="mt-2 text-sm text-[var(--text)]">
            You don&apos;t have to type things in. Just tell Muse:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--text)]">
            <li>Send a photo of a store price tag — the new price gets logged</li>
            <li>Say you sold a cake — the sale gets logged</li>
            <li>Ask for a quote — Muse builds it at the right price</li>
            <li>Anything confusing or annoying — say it, and it lands in Feedback</li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold text-[#2c1e16]">
            The pages
          </h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--text)]">
            <li>Dashboard — your totals, and what&apos;s selling</li>
            <li>Sales — every cake you&apos;ve sold</li>
            <li>Quote — a price quote image to send a customer</li>
            <li>Recipes — what each cake costs to make</li>
            <li>Components — the reusable parts, like ganache, that recipes share</li>
            <li>Ingredients &amp; Packaging — the latest prices</li>
          </ul>
        </section>

        <section>
          <h2 className="font-heading text-lg font-semibold text-[#2c1e16]">
            Prices change — costs keep up
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text)]">
            When a store price changes, send Muse the photo. Recipe costs update on their own, so your prices stay right.
          </p>
        </section>
        </div>
      </GuideSection>
    </div>
  );
}

function GuideSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className={`group ${cardCls} overflow-hidden`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="font-heading text-lg font-semibold text-[#2c1e16]">
          {title}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-5 w-5 shrink-0 text-[var(--dim)] transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </summary>
      <div className="px-4 pb-5 sm:px-5">{children}</div>
    </details>
  );
}

// Read-only view of the feedback mailbox: two collapsible sections, Open
// feedback and Resolved feedback, both collapsed by default and opened
// only when tapped, each listing its entries grouped by the date they
// were given, newest first. Feedback is logged only through Muse chat
// (see the FEEDBACK section of the Chat setup notes) — there is
// deliberately no form here.
type FeedbackGroups = ApiResponse<typeof api, "listfeedback">["groups"];

function FeedbackTab() {
  const q = useQuery({
    queryKey: ["feedback", "all"],
    queryFn: () => api.listfeedback({ include_resolved: true }),
  });
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} />;
  const groups = q.data?.groups ?? [];
  const split = (status: "open" | "resolved"): FeedbackGroups =>
    groups
      .map((g) => ({
        date: g.date,
        entries: g.entries.filter((e) => e.status === status),
      }))
      .filter((g) => g.entries.length > 0);
  return (
    <div className="max-w-2xl space-y-4">
      <p className="whitespace-nowrap text-[11px] text-[var(--dim)]">
        Just tell Muse any feedback you have — it will be logged here.
      </p>
      <FeedbackSection
        title="Open feedback"
        groups={split("open")}
        emptyText="No open feedback."
        defaultOpen={false}
      />
      <FeedbackSection
        title="Resolved feedback"
        groups={split("resolved")}
        emptyText="No resolved feedback."
        defaultOpen={false}
      />
    </div>
  );
}

function FeedbackSection({
  title,
  groups,
  emptyText,
  defaultOpen,
}: {
  title: string;
  groups: FeedbackGroups;
  emptyText: string;
  defaultOpen: boolean;
}) {
  const total = groups.reduce((n, g) => n + g.entries.length, 0);
  return (
    <details open={defaultOpen} className={`group ${cardCls} overflow-hidden`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="font-heading text-lg font-semibold text-[#2c1e16]">
          {title}
          <span className="ml-2 align-middle font-body text-sm font-semibold text-[var(--dim)]">
            {total}
          </span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-5 w-5 shrink-0 text-[var(--dim)] transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </summary>
      <div className="space-y-6 px-4 pb-5 sm:px-5">
        {groups.length === 0 ? (
          <p className="text-sm text-[var(--dim)]">{emptyText}</p>
        ) : (
          groups.map((g) => (
            <section key={g.date}>
              <h3 className="font-heading text-base font-semibold text-[#2c1e16]">
                {new Date(`${g.date}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </h3>
              <div className="mt-3 space-y-3">
                {g.entries.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--dim)]">
                      <span className="font-mono">
                        {new Date(e.created_at).toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      {e.area ? (
                        <span className="rounded-full bg-[#f9ecd7] px-2 py-0.5 font-semibold text-[#8a6d2f]">
                          {e.area}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">
                      {e.text}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </details>
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
    <div>
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
