import { useEffect, useRef, useState } from "react";
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
 * Compact label for a chart point: "$850", "$1.2k". The full amount stays
 * in the stat cards and the chart's accessible description — near a point
 * only a few characters fit before neighbours collide.
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
 * Stacked bar chart for wide (desktop) widths. One bar per month,
 * stacked from three segments: Revenue (bottom), Wages, and Profit
 * (top). All three always show — there are no series toggles. A
 * negative profit month renders its profit segment below the zero
 * line instead of breaking the stack. Segment value labels (cream
 * pill / dark ink) render only when the Numbers switch is on, and
 * only where the segment is tall enough to hold one legibly.
 * Clicking a bar selects that month for the readout under the chart.
 */
function StackedBarChart({
  months,
  symbol,
  showNumbers,
  selectedMonth,
  onSelect,
}: {
  months: MonthRow[];
  symbol: string;
  showNumbers: boolean;
  selectedMonth: string | null;
  onSelect: (month: string) => void;
}) {
  // Measure the container so the SVG uses real pixels at every width:
  // font size and stroke stay constant whether the chart is 340px on a
  // phone or 1000px+ on a desktop, instead of scaling up with viewBox.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [measuredW, setMeasuredW] = useState(340);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setMeasuredW(w);
    };
    update();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const W = measuredW;
  const H = Math.round(Math.min(300, Math.max(200, W * 0.42)));
  const PAD_X = 20;
  const PAD_T = 16;
  const PAD_B = 24;
  const plotW = W - PAD_X * 2;
  const plotH = H - PAD_T - PAD_B;
  // Stacked totals: positive stack is Revenue + Wages + positive
  // Profit; a negative Profit sits below zero on its own.
  const stackedTotals = months.map((m) => {
    const positiveProfit = m.profit > 0 ? m.profit : 0;
    return {
      month: m.month,
      positiveTotal: m.revenue + m.wages + positiveProfit,
      negativeProfit: m.profit < 0 ? m.profit : 0,
    };
  });
  const maxValue = Math.max(1, ...stackedTotals.map((t) => t.positiveTotal));
  const minV = Math.min(0, ...stackedTotals.map((t) => t.negativeProfit));
  const span = maxValue - minV || 1;
  // Bars are evenly spaced across the plot (centred slots), not spread
  // point-to-point like a line chart, so first/last bars don't clip.
  const slotW = plotW / Math.max(1, months.length);
  const px = (i: number) => PAD_X + slotW * (i + 0.5);
  const py = (v: number) => PAD_T + (1 - (v - minV) / span) * plotH;
  const barW = Math.max(4, Math.min(56, slotW * 0.62));

  // Build every segment as a rect in value space, then convert.
  interface Segment {
    id: string;
    monthIdx: number;
    key: SeriesKey;
    value: number;
    from: number; // value at bottom of segment
    to: number; // value at top of segment
    color: string;
  }
  const segments: Segment[] = [];
  months.forEach((m, mi) => {
    // Revenue — bottom
    if (m.revenue !== 0) {
      segments.push({
        id: `${m.month}:revenue`,
        monthIdx: mi,
        key: "revenue",
        value: m.revenue,
        from: 0,
        to: m.revenue,
        color: "#ae8a3e",
      });
    }
    // Wages — stacked on Revenue
    if (m.wages !== 0) {
      segments.push({
        id: `${m.month}:wages`,
        monthIdx: mi,
        key: "wages",
        value: m.wages,
        from: m.revenue,
        to: m.revenue + m.wages,
        color: "#7c4a72",
      });
    }
    // Profit — on top when positive, below zero when negative
    if (m.profit > 0) {
      const base = m.revenue + m.wages;
      segments.push({
        id: `${m.month}:profit`,
        monthIdx: mi,
        key: "profit",
        value: m.profit,
        from: base,
        to: base + m.profit,
        color: "#4a6b53",
      });
    } else if (m.profit < 0) {
      segments.push({
        id: `${m.month}:profit`,
        monthIdx: mi,
        key: "profit",
        value: m.profit,
        from: m.profit,
        to: 0,
        color: NEGATIVE_PROFIT,
      });
    }
  });

  // Labels: cream pill centred inside the segment, only when the
  // Numbers switch is on and the segment is tall enough (≥22px) to
  // hold one legibly.
  const labels = (showNumbers ? segments : [])
    .filter((s) => {
      const h = Math.abs(py(s.to) - py(s.from));
      return s.value !== 0 && h >= 22;
    })
    .map((s) => {
      const topY = py(Math.max(s.from, s.to));
      const bottomY = py(Math.min(s.from, s.to));
      const cy = (topY + bottomY) / 2;
      return {
        id: s.id,
        x: px(s.monthIdx),
        y: cy + 3.5,
        pillY: cy - 7.5,
        text: chartMoney(s.value, symbol),
      };
    });

  // Show as many month labels as fit without crowding: ~52px per
  // full "Jan 25" label on wide charts, ~36px per short label on narrow.
  const wide = W >= 640;
  const labelEveryPx = wide ? 56 : 38;
  const maxMonthLabels = Math.max(2, Math.floor(plotW / labelEveryPx));
  const monthStep = Math.max(1, Math.ceil(months.length / maxMonthLabels));

  return (
    <div ref={wrapRef} className="w-full">
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" aria-hidden="true">
      {selectedMonth
        ? months.map((m, mi) =>
            m.month === selectedMonth ? (
              <rect
                key={`sel-${m.month}`}
                x={PAD_X + slotW * mi + 2}
                y={PAD_T - 6}
                width={Math.max(0, slotW - 4)}
                height={plotH + 12}
                rx={6}
                fill="var(--surface-alt)"
              />
            ) : null,
          )
        : null}
      <line
        x1={PAD_X}
        x2={W - PAD_X}
        y1={py(minV)}
        y2={py(minV)}
        stroke="var(--border)"
        strokeWidth="1"
      />
      {minV < 0 ? (
        <line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={py(0)}
          y2={py(0)}
          stroke="var(--border)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
      ) : null}
      {segments.map((s) => {
        const topY = py(Math.max(s.from, s.to));
        const bottomY = py(Math.min(s.from, s.to));
        const h = Math.max(0, bottomY - topY);
        // Round only the outer ends of the stack: top of the topmost
        // positive segment and bottom of the bottommost segment.
        const isTopPositive =
          s.to >= s.from &&
          s.to ===
            Math.max(
              ...segments
                .filter((x) => x.monthIdx === s.monthIdx && x.to > x.from)
                .map((x) => x.to),
              s.to,
            );
        const isBottom = s.from === 0 && s.key === "revenue";
        const isNegativeBottom = s.value < 0;
        const rx = isTopPositive || isBottom || isNegativeBottom ? 3 : 0;
        return (
          <rect
            key={s.id}
            x={px(s.monthIdx) - barW / 2}
            y={topY}
            width={barW}
            height={h}
            rx={rx}
            fill={s.color}
            fillOpacity="0.92"
            stroke="#fffdf9"
            strokeWidth={h > 2 ? 1 : 0}
          />
        );
      })}
      {labels.map((l) => {
        const pillW = l.text.length * 5.6 + 12;
        // Clamp the pill inside the chart horizontally.
        const cx = Math.min(Math.max(l.x, pillW / 2 + 2), W - pillW / 2 - 2);
        return (
          <g key={l.id}>
            <rect
              x={cx - pillW / 2}
              y={l.pillY}
              width={pillW}
              height={15}
              rx={7.5}
              fill="#fffdf9"
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={cx}
              y={l.y}
              textAnchor="middle"
              fontSize="10"
              className="font-mono"
              style={{ fill: "#2c1e16" }}
            >
              {l.text}
            </text>
          </g>
        );
      })}
      {months.map((m, mi) =>
        mi % monthStep === 0 ? (
          <text
            key={m.month}
            x={px(mi)}
            y={H - 8}
            textAnchor="middle"
            fontSize="10"
            fontWeight={m.month === selectedMonth ? "800" : "600"}
            style={{ fill: m.month === selectedMonth ? "#2c1e16" : "var(--dim)" }}
          >
            {wide ? monthLabel(m.month) : monthShort(m.month)}
          </text>
        ) : null,
      )}
      {/* Full-slot click targets, one per month, above everything so a
          click anywhere in a month's column selects it. */}
      {months.map((m, mi) => (
        <rect
          key={`hit-${m.month}`}
          x={PAD_X + slotW * mi}
          y={0}
          width={slotW}
          height={H}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onClick={() => onSelect(m.month)}
        />
      ))}
    </svg>
    </div>
  );
}

/**
 * Phone layout for the monthly figures: a vertical list with one
 * entry per month that actually has sales (empty months are skipped
 * entirely, so real bars never get squeezed by blank slots). Each
 * entry is the month name, a horizontal stacked bar (Revenue gold →
 * Wages plum → Profit green; a negative profit is a red segment
 * extending left of the zero point), and one small line with the
 * three figures as plain text — no labels sit on the bars, so
 * nothing can overlap. The list simply grows downward as more
 * months accumulate.
 */
function PhoneMonthList({
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

/** Short month name only ("Jan") — used under the chart on
 *  narrow widths, where the full "Jan 25" label would crowd. */
function monthShort(month: string): string {
  const [y = 1970, m = 1] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-CA", {
    month: "short",
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
  // Desktop chart: value labels are off until she flips Numbers on.
  const [showNumbers, setShowNumbers] = useState(false);
  // Month chosen by tapping/clicking a desktop bar; its figures show
  // in the readout line under the chart. Tapping it again clears it.
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const toggleSelectedMonth = (month: string) =>
    setSelectedMonth((cur) => (cur === month ? null : month));
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
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <div
                className="flex flex-wrap gap-x-5 gap-y-2"
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
              {/* Desktop only: the phone list always prints its figures
                  as text, so it needs no switch. */}
              <button
                type="button"
                role="switch"
                aria-checked={showNumbers}
                onClick={() => setShowNumbers((v) => !v)}
                className="ml-auto hidden items-center gap-2 text-xs font-semibold text-[#2c1e16] lg:inline-flex"
              >
                <span
                  className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${
                    showNumbers ? "bg-[#2c1e16]" : "bg-[var(--border)]"
                  }`}
                  aria-hidden="true"
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#fffdf9] shadow transition-all ${
                      showNumbers ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </span>
                Numbers
              </button>
            </div>

            {/* Phone: horizontal stacked bars, one per month with
                sales, figures as a text line under each bar. */}
            <div className="mt-2 lg:hidden">
              <PhoneMonthList months={months} symbol={symbol} />
            </div>

            {/* Desktop: vertical stacked bars. */}
            <div
              className="mt-2 hidden w-full lg:block"
              role="img"
              aria-label={`Monthly stacked bar chart, ${caption}: ${months
                .map(
                  (m) =>
                    `${monthLabel(m.month)} — ${STACK_SERIES.map(
                      (s) => `${s.label.toLowerCase()} ${money(m[s.key], symbol)}`,
                    ).join(", ")}`,
                )
                .join("; ")}`}
            >
              <StackedBarChart
                months={months}
                symbol={symbol}
                showNumbers={showNumbers}
                selectedMonth={selectedMonth}
                onSelect={toggleSelectedMonth}
              />
            </div>

            {(() => {
              const sel = selectedMonth
                ? months.find((m) => m.month === selectedMonth)
                : undefined;
              return sel ? (
                <p className="mt-3 hidden border-t border-[var(--border)] pt-3 font-mono text-xs text-[#2c1e16] lg:block">
                  {monthLabel(sel.month)} — Revenue{" "}
                  {chartMoney(sel.revenue, symbol)} · Wages{" "}
                  {chartMoney(sel.wages, symbol)} · Profit{" "}
                  {chartMoney(sel.profit, symbol)}
                </p>
              ) : null;
            })()}
          </div>

          <div className={`${cardCls} mt-4 p-4 sm:p-6`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-heading text-xl font-medium text-[#2c1e16]">
                Insights
              </h2>
              <p className="text-xs text-[var(--dim)]">{caption}</p>
            </div>
            {insightsQ.isPending ? (
              <p className="mt-4 text-sm text-[var(--dim)]">Loading…</p>
            ) : insights &&
              (insights.top_item ||
                insights.top_buyer ||
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
                {insights.top_buyer ? (
                  <div className="flex flex-col gap-1.5 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 sm:py-2.5">
                    <dt className={microLabel}>Top buyer</dt>
                    <dd className="text-sm font-medium text-[#2c1e16] text-left min-w-0 sm:text-right">
                      {insights.top_buyer.customer_name}
                      <span className="text-[var(--dim)] font-normal">
                        {" "}
                        — {money(insights.top_buyer.spent, symbol)} ·{" "}
                        {insights.top_buyer.orders} order
                        {insights.top_buyer.orders === 1 ? "" : "s"}
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
        </>
      )}
    </div>
  );
}
