import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ApiResponse } from "../api";
import { FIELDS, money, useSymbol } from "../lib";
import {
  btnPrimary,
  btnSecondary,
  cardCls,
  EmptyState,
  ErrorNote,
  inputCls,
  Loading,
  microLabel,
  IconBook,
  IconChevronRight,
  IconUpload,
} from "../ui";
import type { Page } from "../App";
import mascotUrl from "../assets/shadow-mascot.jpg";

type MonthRow = ApiResponse<typeof api, "salesSummary">["monthly"][number];
type SeriesKey = "revenue" | "wages" | "profit";
type Frame = "all" | "custom";

// Stacked bar colours: Revenue antique gold, Wages plum, Profit deep
// green (red for a negative month). Cost is not part of the chart.
const STACK_SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: "revenue", label: "Revenue", color: "#ae8a3e" },
  { key: "wages", label: "Wages", color: "#7c4a72" },
  { key: "profit", label: "Profit", color: "#4a6b53" },
];
const NEGATIVE_PROFIT = "#a63c3c";

const FRAMES: { key: Frame; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

/**
 * Compact figure for the monthly list: "$850", "$1.2k". The full
 * amount stays in the stat cards and each bar's accessible label.
 */
function chartMoney(n: number, symbol: string): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1000) {
    const k = abs / 1000;
    const s = k >= 100 ? String(Math.round(k)) : String(Math.round(k * 10) / 10);
    return `${sign}${symbol}${s}k`;
  }
  return `${sign}${symbol}${Math.round(abs)}`;
}

/**
 * The monthly figures at every width: a vertical list with one
 * entry per month that actually has sales (empty months are skipped
 * entirely, so real bars never get squeezed by blank slots). Each
 * entry is the month name, a horizontal stacked bar (Revenue gold →
 * Wages plum → Profit green; a negative profit is a red segment
 * extending left of the zero point), and one small line with the
 * three figures as plain text, always visible — no labels sit on
 * the bars, so nothing can overlap. The list simply grows downward
 * as more months accumulate.
 */
function MonthList({
  months,
  symbol,
}: {
  months: MonthRow[];
  symbol: string;
}) {
  const active = months.filter(
    (m) => m.revenue !== 0 || m.wages !== 0 || m.profit !== 0,
  );
  if (active.length === 0) {
    return (
      <p className="py-2 text-sm text-[var(--dim)]">
        No sales in this period yet.
      </p>
    );
  }
  // One shared scale: the widest positive stack sets the right edge,
  // and the deepest negative profit reserves room on the left of the
  // zero point so every bar lines up.
  const posMax = Math.max(
    1,
    ...active.map((m) => m.revenue + m.wages + Math.max(0, m.profit)),
  );
  const negMax = Math.max(0, ...active.map((m) => Math.max(0, -m.profit)));
  const span = posMax + negMax || 1;
  const zeroPct = (negMax / span) * 100;
  const pct = (v: number) => (v / span) * 100;
  return (
    <ul className="divide-y divide-[var(--border)]">
      {active.map((m) => {
        const segs: { key: SeriesKey; value: number; color: string }[] = [];
        if (m.revenue !== 0)
          segs.push({ key: "revenue", value: m.revenue, color: "#ae8a3e" });
        if (m.wages !== 0)
          segs.push({ key: "wages", value: m.wages, color: "#7c4a72" });
        if (m.profit > 0)
          segs.push({ key: "profit", value: m.profit, color: "#4a6b53" });
        let cursor = zeroPct;
        const placed = segs.map((s) => {
          const left = cursor;
          cursor += pct(s.value);
          return { ...s, left, width: pct(s.value) };
        });
        return (
          <li key={m.month} className="py-3 first:pt-1 last:pb-0">
            <p className="text-sm font-semibold text-[#2c1e16]">
              {monthLabel(m.month)}
            </p>
            <div
              className="relative mt-1.5 h-4"
              role="img"
              aria-label={`${monthLabel(m.month)}: Revenue ${money(m.revenue, symbol)}, Wages ${money(m.wages, symbol)}, Profit ${money(m.profit, symbol)}`}
            >
              {negMax > 0 ? (
                <span
                  className="absolute inset-y-0 w-px bg-[var(--border)]"
                  style={{ left: `${zeroPct}%` }}
                  aria-hidden="true"
                />
              ) : null}
              {placed.map((s, i) => (
                <span
                  key={s.key}
                  className={`absolute inset-y-0 ${
                    i === 0 ? "rounded-l" : ""
                  } ${i === placed.length - 1 && m.profit >= 0 ? "rounded-r" : ""}`}
                  style={{
                    left: `${s.left}%`,
                    width: `${Math.max(0.75, s.width)}%`,
                    backgroundColor: s.color,
                    opacity: 0.92,
                  }}
                  aria-hidden="true"
                />
              ))}
              {m.profit < 0 ? (
                <span
                  className="absolute inset-y-0 rounded-l"
                  style={{
                    left: `${zeroPct - pct(-m.profit)}%`,
                    width: `${Math.max(0.75, pct(-m.profit))}%`,
                    backgroundColor: NEGATIVE_PROFIT,
                    opacity: 0.92,
                  }}
                  aria-hidden="true"
                />
              ) : null}
            </div>
            <p className="mt-1.5 font-mono text-xs text-[var(--dim)]">
              Revenue {chartMoney(m.revenue, symbol)} · Wages{" "}
              {chartMoney(m.wages, symbol)} · Profit{" "}
              {chartMoney(m.profit, symbol)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function monthLabel(month: string): string {
  const [y = 1970, m = 1] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-CA", {
    month: "short",
    year: "2-digit",
  });
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(key: string, delta: number): string {
  const [y = 1970, m = 1] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(start, i));
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function lastDayOfMonth(monthKey: string): string {
  const [y = 1970, m = 1] = monthKey.split("-").map(Number);
  return `${monthKey}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

/** Inclusive month count from one YYYY-MM key to another. */
function monthSpan(fromMonth: string, toMonth: string): number {
  return (
    (Number(toMonth.slice(0, 4)) - Number(fromMonth.slice(0, 4))) * 12 +
    (Number(toMonth.slice(5, 7)) - Number(fromMonth.slice(5, 7))) +
    1
  );
}

function prettyDate(dateStr: string): string {
  const [y = 1970, m = 1, d = 1] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const ZERO: Omit<MonthRow, "month"> = { revenue: 0, cost: 0, wages: 0, profit: 0 };

/**
 * The month keys "All time" covers, zero-filled later from the data map:
 * every month from the first sale through the most recent one. When
 * there are no sales yet it falls back to the last six months so the
 * chart still has a sensible empty shape.
 */
function allTimeMonths(data: Map<string, MonthRow>): string[] {
  const now = currentMonthKey();
  const keys = [...data.keys()].sort();
  const latest = keys[keys.length - 1];
  if (!latest) return monthRange(shiftMonth(now, -5), 6);
  const first = keys[0] ?? latest;
  return monthRange(first, monthSpan(first, latest));
}

function frameCaption(months: string[]): string {
  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last) return "";
  return `${monthLabel(first)} – ${monthLabel(last)}`;
}

export function DashboardPage({
  go,
  onImportHistory,
}: {
  go: (p: Page) => void;
  onImportHistory: () => void;
}) {
  const symbol = useSymbol();
  const summaryQ = useQuery({
    queryKey: ["summary"],
    queryFn: () => api.salesSummary({}),
  });
  const [frame, setFrame] = useState<Frame>("all");
  // The monthly breakdown stays tucked away until she taps its
  // header open — the totals and Insights are the everyday view.
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  // On phones the Insights card is likewise collapsed behind its
  // header until tapped open; on desktop it always shows.
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(
    () => `${new Date().getFullYear()}-01-01`,
  );
  const [customTo, setCustomTo] = useState(() => localDateStr(new Date()));

  const summary = summaryQ.data;
  const dataByMonth = new Map<string, MonthRow>(
    (summary?.monthly ?? []).map((m) => [m.month, m]),
  );

  // One period filter at the top drives everything below it: the total
  // cards, the chart, and Insights all resolve to the same date range.
  const cFromRaw = customFrom || `${new Date().getFullYear()}-01-01`;
  const cToRaw = customTo || localDateStr(new Date());
  const [cFrom, cTo] = cFromRaw <= cToRaw ? [cFromRaw, cToRaw] : [cToRaw, cFromRaw];
  const rangeMonths =
    frame === "custom"
      ? monthRange(
          cFrom.slice(0, 7),
          Math.min(60, Math.max(1, monthSpan(cFrom.slice(0, 7), cTo.slice(0, 7)))),
        )
      : allTimeMonths(dataByMonth);
  const fromMonthKey = rangeMonths[0] ?? "";
  const toMonthKey = rangeMonths[rangeMonths.length - 1] ?? "";
  const fromDate =
    frame === "custom" ? cFrom : fromMonthKey ? `${fromMonthKey}-01` : "";
  const toDate =
    frame === "custom" ? cTo : toMonthKey ? lastDayOfMonth(toMonthKey) : "";
  const caption =
    frame === "custom"
      ? `${prettyDate(cFrom)} – ${prettyDate(cTo)}`
      : frameCaption(rangeMonths);

  const months = rangeMonths.map(
    (key) => dataByMonth.get(key) ?? { month: key, ...ZERO },
  );

  const periodReady =
    !!summary && summary.total_sales > 0 && fromDate !== "" && toDate !== "";
  const totalsQ = useQuery({
    queryKey: ["periodTotals", fromDate, toDate],
    queryFn: () =>
      api.salesPeriodSummary({ from_date: fromDate, to_date: toDate }),
    enabled: periodReady,
  });
  const totals = totalsQ.data;

  const insightsQ = useQuery({
    queryKey: ["insights", fromDate, toDate],
    queryFn: () =>
      api.salesInsights({
        from_month: fromMonthKey,
        to_month: toMonthKey,
        from_date: fromDate,
        to_date: toDate,
      }),
    enabled: periodReady,
  });
  const insights = insightsQ.data;

  const onCustomFrom = (v: string) => {
    setCustomFrom(v);
    if (v && customTo && v > customTo) setCustomTo(v);
  };
  const onCustomTo = (v: string) => {
    setCustomTo(v);
    if (v && customFrom && v < customFrom) setCustomFrom(v);
  };

  const statCards = [
    { label: "Total Revenue", value: totals?.total_revenue, color: "text-[#4a6b53]" },
    { label: "Total Cost", value: totals?.total_cost, color: "text-[#ae8a3e]" },
    { label: "Total Wages", value: totals?.total_hourly_pay, color: "text-[#9a6716]" },
    {
      label: "Total Profit",
      value: totals?.total_profit,
      color:
        (totals?.total_profit ?? 0) >= 0 ? "text-[#4a6b53]" : "text-[#a63c3c]",
    },
  ];

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl sm:text-4xl font-medium tracking-tight text-[#1a1a1a]">
            Sales Dashboard
          </h1>
          <p className="text-sm text-[var(--dim)] mt-1">
            {summary
              ? totals
                ? `${totals.total_sales} sale${totals.total_sales === 1 ? "" : "s"} in this period · ${summary.total_sales} all time`
                : `${summary.total_sales} sale${summary.total_sales === 1 ? "" : "s"} recorded`
              : "Loading…"}
          </p>
        </div>
        <img
          src={mascotUrl}
          alt="Shadow Cakes logo"
          className="h-16 w-auto shrink-0 mix-blend-multiply sm:h-20"
        />
      </div>

      {summaryQ.isPending ? (
        <Loading />
      ) : summaryQ.error ? (
        <div className="mt-6">
          <ErrorNote error={summaryQ.error} />
        </div>
      ) : summary && summary.total_sales === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No sales recorded yet"
            body="Cost a recipe, set its selling price, and record the sale from the recipe page — revenue, wages, and profit will land here."
          >
            <button type="button" className={btnPrimary} onClick={() => go("recipes")}>
              <IconBook /> Go to recipes
            </button>
            <button type="button" className={btnSecondary} onClick={onImportHistory}>
              <IconUpload /> Import history
            </button>
          </EmptyState>
        </div>
      ) : (
        <>
          {/* The one period filter for the whole page: totals, chart, and
              Insights below all follow it. */}
          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
            <div
              className="inline-flex flex-wrap rounded-md border border-[var(--border)] overflow-hidden"
              role="group"
              aria-label="Dashboard period"
            >
              {FRAMES.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={frame === f.key}
                  onClick={() => setFrame(f.key)}
                  className={`px-3 text-xs font-semibold transition-colors ${
                    frame === f.key
                      ? "bg-[#2c1e16] text-[#fdf8ef]"
                      : "bg-[var(--surface)] text-[var(--dim)] hover:text-[#2c1e16]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--dim)]">{caption}</p>
          </div>
          {frame === "custom" ? (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <label className="flex flex-col gap-1 sm:w-auto">
                <span className={microLabel}>Start date</span>
                <input
                  {...FIELDS.salesPeriodSummary.from_date}
                  type="date"
                  className={`${inputCls} w-full sm:w-auto`}
                  value={customFrom}
                  onChange={(e) => onCustomFrom(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 sm:w-auto">
                <span className={microLabel}>End date</span>
                <input
                  {...FIELDS.salesPeriodSummary.to_date}
                  type="date"
                  className={`${inputCls} w-full sm:w-auto`}
                  value={customTo}
                  onChange={(e) => onCustomTo(e.target.value)}
                />
              </label>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((c) => (
              <div key={c.label} className={`${cardCls} p-5`}>
                <p className={microLabel}>{c.label}</p>
                <p className={`mt-2 font-mono text-2xl sm:text-3xl ${c.color}`}>
                  {c.value != null ? money(c.value, symbol) : "—"}
                </p>
              </div>
            ))}
          </div>

          <div className={`${cardCls} mt-4 p-4 sm:p-6`}>
            <h2>
              <button
                type="button"
                aria-expanded={insightsOpen}
                aria-controls="insights-body"
                onClick={() => setInsightsOpen((v) => !v)}
                className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 text-left lg:pointer-events-none"
              >
                <span className="font-heading text-xl font-medium text-[#2c1e16]">
                  Insights
                </span>
                <span
                  className={`ml-auto inline-flex shrink-0 self-center text-[var(--dim)] transition-transform lg:hidden ${
                    insightsOpen ? "rotate-90" : ""
                  }`}
                  aria-hidden="true"
                >
                  <IconChevronRight />
                </span>
              </button>
            </h2>
            <div
              id="insights-body"
              className={insightsOpen ? "" : "hidden lg:block"}
            >
            {insightsQ.isPending ? (
              <p className="mt-4 text-sm text-[var(--dim)]">Loading…</p>
            ) : insights &&
              (insights.top_item ||
                insights.top_customer ||
                insights.top_event ||
                insights.highest_margin ||
                insights.lowest_margin) ? (
              <dl className="mt-2 divide-y divide-[var(--border)]">
                {insights.top_item ? (
                  <div className="flex flex-col gap-1.5 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 sm:py-2.5">
                    <dt className={microLabel}>Top seller</dt>
                    <dd className="text-sm font-medium text-[#2c1e16] text-left min-w-0 sm:text-right">
                      {insights.top_item.recipe_name} · {insights.top_item.variant_name}
                      <span className="text-[var(--dim)] font-normal">
                        {" "}
                        — {insights.top_item.units} sold ·{" "}
                        {money(insights.top_item.revenue, symbol)}
                      </span>
                    </dd>
                  </div>
                ) : null}
                {insights.top_customer ? (
                  <div className="flex flex-col gap-1.5 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 sm:py-2.5">
                    <dt className={microLabel}>Top customer</dt>
                    <dd className="text-sm font-medium text-[#2c1e16] text-left min-w-0 sm:text-right">
                      {insights.top_customer.customer_name}
                      <span className="text-[var(--dim)] font-normal">
                        {" "}
                        — {money(insights.top_customer.spent, symbol)} ·{" "}
                        {insights.top_customer.orders} order
                        {insights.top_customer.orders === 1 ? "" : "s"}
                      </span>
                    </dd>
                  </div>
                ) : null}
                {insights.top_event ? (
                  <div className="flex flex-col gap-1.5 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 sm:py-2.5">
                    <dt className={microLabel}>Top event</dt>
                    <dd className="text-sm font-medium text-[#2c1e16] text-left min-w-0 sm:text-right">
                      {insights.top_event.event_name}
                      <span className="text-[var(--dim)] font-normal">
                        {" "}
                        — {money(insights.top_event.spent, symbol)} ·{" "}
                        {insights.top_event.orders} order
                        {insights.top_event.orders === 1 ? "" : "s"}
                      </span>
                    </dd>
                  </div>
                ) : null}
                {insights.highest_margin ? (
                  <div className="flex flex-col gap-1.5 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 sm:py-2.5">
                    <dt className={microLabel}>Highest margin</dt>
                    <dd className="text-sm font-medium text-[#2c1e16] text-left min-w-0 sm:text-right">
                      {insights.highest_margin.recipe_name} ·{" "}
                      {insights.highest_margin.variant_name}
                      <span className="text-[#4a6b53] font-normal">
                        {" "}
                        — {insights.highest_margin.margin_pct.toFixed(1)}%
                      </span>
                    </dd>
                  </div>
                ) : null}
                {insights.lowest_margin ? (
                  <div className="flex flex-col gap-1.5 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 sm:py-2.5">
                    <dt className={microLabel}>Lowest margin</dt>
                    <dd className="text-sm font-medium text-[#2c1e16] text-left min-w-0 sm:text-right">
                      {insights.lowest_margin.recipe_name} ·{" "}
                      {insights.lowest_margin.variant_name}
                      <span
                        className={`font-normal ${
                          insights.lowest_margin.margin_pct < 0
                            ? "text-[#a63c3c]"
                            : "text-[var(--dim)]"
                        }`}
                      >
                        {" "}
                        — {insights.lowest_margin.margin_pct.toFixed(1)}%
                      </span>
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="mt-4 text-sm text-[var(--dim)]">
                No sales in this period yet.
              </p>
            )}
            </div>
          </div>

          <div className={`${cardCls} mt-4 p-4 sm:p-6`}>
            <h2>
              <button
                type="button"
                aria-expanded={breakdownOpen}
                aria-controls="monthly-breakdown"
                onClick={() => setBreakdownOpen((v) => !v)}
                className="flex w-full items-center gap-3 text-left"
              >
                <span className="font-heading text-xl font-medium text-[#2c1e16]">
                  Monthly breakdown
                </span>
                <span
                  className={`ml-auto inline-flex shrink-0 text-[var(--dim)] transition-transform ${
                    breakdownOpen ? "rotate-90" : ""
                  }`}
                  aria-hidden="true"
                >
                  <IconChevronRight />
                </span>
              </button>
            </h2>
            {breakdownOpen ? (
              <div id="monthly-breakdown">
                <div
                  className="mt-4 flex flex-wrap gap-x-5 gap-y-2"
                  aria-label="Chart legend"
                >
                  {STACK_SERIES.map((s) => (
                    <span
                      key={s.key}
                      className="flex items-center gap-1.5 text-xs font-semibold text-[#2c1e16]"
                    >
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: s.color }}
                        aria-hidden="true"
                      />
                      {s.label}
                    </span>
                  ))}
                </div>
                <div className="mt-2">
                  <MonthList months={months} symbol={symbol} />
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
