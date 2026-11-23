// Past-customer helpers shared by every sale form (Sales tab's New Sale
// form and the Recipes page's Record a Sale modal): the deduped customer
// list, the name split, and the first/last name fields with the
// past-customer autocomplete dropdown.

import { useState } from "react";
import { FIELDS, type Sale } from "./lib";
import { inputCls, labelCls } from "./ui";

export interface PastCustomer {
  first: string;
  last: string;
  full: string;
  lastRecipe: string;
}

/** A sale's customer split into first/last, falling back to splitting the
 *  combined name the same way the server backfilled (first space). */
export function splitSaleName(s: Sale): { first: string; last: string } {
  if (s.customer_first_name || s.customer_last_name) {
    return { first: s.customer_first_name, last: s.customer_last_name };
  }
  const at = s.customer_name.indexOf(" ");
  return at > 0
    ? {
        first: s.customer_name.slice(0, at),
        last: s.customer_name.slice(at + 1),
      }
    : { first: s.customer_name, last: "" };
}

/** Distinct past customers, deduped by full name; each carries the recipe
 *  from their most recent sale for the "last ordered …" line. */
export function pastCustomers(sales: Sale[]): PastCustomer[] {
  const byKey = new Map<string, PastCustomer & { date: string }>();
  for (const s of sales) {
    const { first, last } = splitSaleName(s);
    const full = [first, last].filter(Boolean).join(" ").trim();
    if (!full) continue;
    const key = full.toLowerCase();
    const date = s.sale_date.slice(0, 10);
    const existing = byKey.get(key);
    if (!existing || date > existing.date) {
      byKey.set(key, { first, last, full, lastRecipe: s.recipe_name, date });
    }
  }
  return [...byKey.values()]
    .map(({ first, last, full, lastRecipe }) => ({
      first,
      last,
      full,
      lastRecipe,
    }))
    .sort((a, b) => a.full.localeCompare(b.full));
}

/**
 * First/last name fields with a past-customer dropdown: typing in either
 * field searches the same customer list (first, last, or full name), and
 * picking a suggestion fills both fields. No matches — no dropdown, and
 * typing works exactly as a plain form.
 */
export function CustomerNameFields({
  firstName,
  lastName,
  onFirstChange,
  onLastChange,
  customers,
}: {
  firstName: string;
  lastName: string;
  onFirstChange: (v: string) => void;
  onLastChange: (v: string) => void;
  customers: PastCustomer[];
}) {
  const [openField, setOpenField] = useState<"first" | "last" | null>(null);

  const matchesFor = (value: string): PastCustomer[] => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return customers
      .filter(
        (c) =>
          c.first.toLowerCase().includes(q) ||
          c.last.toLowerCase().includes(q) ||
          c.full.toLowerCase().includes(q),
      )
      .slice(0, 6);
  };

  const pick = (c: PastCustomer) => {
    onFirstChange(c.first);
    onLastChange(c.last);
    setOpenField(null);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const dropdown = (field: "first" | "last", matches: PastCustomer[]) =>
    openField === field && matches.length > 0 ? (
      <ul
        role="listbox"
        aria-label="Past customers"
        className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-[var(--border)] bg-white shadow-lg py-1"
      >
        {matches.map((c) => (
          <li key={c.full.toLowerCase()}>
            <button
              type="button"
              role="option"
              aria-selected="false"
              aria-label={`Use customer ${c.full}`}
              className="block w-full px-3 py-2 text-left hover:bg-[#f9ecd7]"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
            >
              <span className="block text-sm font-medium text-[#2c1e16]">
                {c.full}
              </span>
              {c.lastRecipe ? (
                <span className="block text-xs text-[var(--dim)]">
                  last ordered {c.lastRecipe}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="relative">
        <span className={labelCls}>Customer first name</span>
        <input
          {...FIELDS.createSale.customer_first_name}
          className={inputCls}
          value={firstName}
          onChange={(e) => onFirstChange(e.target.value)}
          onFocus={() => setOpenField("first")}
          onBlur={() => setOpenField(null)}
          placeholder="e.g. Leo"
          aria-label="Customer first name"
          autoComplete="off"
        />
        {dropdown("first", matchesFor(firstName))}
      </div>
      <div className="relative">
        <span className={labelCls}>Customer last name</span>
        <input
          {...FIELDS.createSale.customer_last_name}
          className={inputCls}
          value={lastName}
          onChange={(e) => onLastChange(e.target.value)}
          onFocus={() => setOpenField("last")}
          onBlur={() => setOpenField(null)}
          placeholder="e.g. Divecha"
          aria-label="Customer last name"
          autoComplete="off"
        />
        {dropdown("last", matchesFor(lastName))}
      </div>
    </div>
  );
}
