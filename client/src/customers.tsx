// Buyer-name helpers shared by every sale form (Sales tab's New Sale
// and Edit forms and the Recipes page's Record a Sale modal): the
// deduped customer and event lists, the name split, the buyer-name
// state hook (with the Customer ↔ Event switch), the name fields —
// first/last for a customer, a single Event name field for an event,
// each with its autocomplete dropdown — and the Customer / Event
// toggle.

export type SaleType = "customer" | "event";

/**
 * Customer / Event toggle for the sale forms: a sale is either to an
 * individual customer (the default) or at an event (a market, a fair),
 * in which case the name fields hold the event's name.
 */
export function SaleTypeToggle({
  value,
  onChange,
}: {
  value: SaleType;
  onChange: (v: SaleType) => void;
}) {
  const options: { key: SaleType; label: string }[] = [
    { key: "customer", label: "Customer" },
    { key: "event", label: "Event" },
  ];
  return (
    <div className="min-w-0">
      <span className={labelCls}>Sale to</span>
      <div
        className="inline-flex h-11 max-w-full rounded-md border border-[var(--border)] overflow-hidden"
        role="group"
        aria-label="Sale type"
      >
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={value === o.key}
            onClick={() => onChange(o.key)}
            className={`h-full px-4 text-sm font-semibold transition-colors ${
              value === o.key
                ? "bg-[#2c1e16] text-[#fdf8ef]"
                : "bg-[var(--surface)] text-[var(--dim)] hover:text-[#2c1e16]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

import { useState } from "react";
import { FIELDS, type Sale } from "./lib";
import { labelCls, saleInputCls } from "./ui";

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
 *  from their most recent sale for the "last ordered …" line. Event sales
 *  are not customers — they feed pastEvents instead. */
export function pastCustomers(sales: Sale[]): PastCustomer[] {
  const byKey = new Map<string, PastCustomer & { date: string }>();
  for (const s of sales) {
    if (s.sale_type === "event") continue;
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

export interface PastEvent {
  name: string;
  lastRecipe: string;
}

/** Distinct past event names (from event sales, whose name field holds
 *  the event's name), deduped; each carries the recipe from its most
 *  recent sale for the "last ordered …" line. */
export function pastEvents(sales: Sale[]): PastEvent[] {
  const byKey = new Map<string, PastEvent & { date: string }>();
  for (const s of sales) {
    if (s.sale_type !== "event") continue;
    const name = s.customer_name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const date = s.sale_date.slice(0, 10);
    const existing = byKey.get(key);
    if (!existing || date > existing.date) {
      byKey.set(key, { name, lastRecipe: s.recipe_name, date });
    }
  }
  return [...byKey.values()]
    .map(({ name, lastRecipe }) => ({ name, lastRecipe }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Buyer-name state for a sale form: the first/last name pair, the sale
 * type, and the Customer ↔ Event switch. An event has no last name, so
 * the event name lives in the first-name state (and is stored in the
 * sale's name field, as agreed). Switching to Event pre-fills the event
 * name with the customer's full name; switching back to Customer splits
 * the event name on its first space.
 */
export function useSaleBuyer(initial?: Sale | null) {
  const [saleType, setSaleTypeState] = useState<SaleType>(
    initial?.sale_type ?? "customer",
  );
  const [firstName, setFirstName] = useState(() => {
    if (!initial) return "";
    return initial.sale_type === "event"
      ? initial.customer_name
      : splitSaleName(initial).first;
  });
  const [lastName, setLastName] = useState(() => {
    if (!initial || initial.sale_type === "event") return "";
    return splitSaleName(initial).last;
  });
  const setSaleType = (next: SaleType) => {
    if (next === saleType) return;
    if (next === "event") {
      setFirstName(
        [firstName, lastName].filter(Boolean).join(" ").trim(),
      );
      setLastName("");
    } else {
      const at = firstName.indexOf(" ");
      if (at > 0) {
        setLastName(firstName.slice(at + 1));
        setFirstName(firstName.slice(0, at));
      }
    }
    setSaleTypeState(next);
  };
  return {
    firstName,
    lastName,
    saleType,
    setFirstName,
    setLastName,
    setSaleType,
  };
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
    <div className="grid grid-cols-2 gap-4 items-end">
      <div className="relative min-w-0">
        <span className={labelCls}>First name</span>
        <input
          {...FIELDS.createSale.customer_first_name}
          className={saleInputCls}
          value={firstName}
          onChange={(e) => onFirstChange(e.target.value)}
          onFocus={() => setOpenField("first")}
          onBlur={() => setOpenField(null)}
          placeholder="e.g. Leo"
          aria-label="First name"
          autoComplete="off"
        />
        {dropdown("first", matchesFor(firstName))}
      </div>
      <div className="relative min-w-0">
        <span className={labelCls}>Last name (optional)</span>
        <input
          {...FIELDS.createSale.customer_last_name}
          className={saleInputCls}
          value={lastName}
          onChange={(e) => onLastChange(e.target.value)}
          onFocus={() => setOpenField("last")}
          onBlur={() => setOpenField(null)}
          placeholder="e.g. Divecha"
          aria-label="Last name"
          autoComplete="off"
        />
        {dropdown("last", matchesFor(lastName))}
      </div>
    </div>
  );
}

/**
 * The single "Event name" field shown in Event mode, with a past-event
 * dropdown mirroring the customer autocomplete: typing searches past
 * event names, and picking one fills the field. The event name is kept
 * in the form's first-name state, so it saves into the sale's name
 * field with the sale type set to event.
 */
export function EventNameField({
  value,
  onChange,
  events,
}: {
  value: string;
  onChange: (v: string) => void;
  events: PastEvent[];
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const matches = q
    ? events
        .filter((e) => e.name.toLowerCase().includes(q))
        .slice(0, 6)
    : [];

  const pick = (e: PastEvent) => {
    onChange(e.name);
    setOpen(false);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  return (
    <div className="relative min-w-0">
      <span className={labelCls}>Event name</span>
      <input
        {...FIELDS.createSale.customer_first_name}
        className={saleInputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder="e.g. Farmer's Market"
        aria-label="Event name"
        autoComplete="off"
      />
      {open && matches.length > 0 ? (
        <ul
          role="listbox"
          aria-label="Past events"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-[var(--border)] bg-white shadow-lg py-1"
        >
          {matches.map((e) => (
            <li key={e.name.toLowerCase()}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                aria-label={`Use event ${e.name}`}
                className="block w-full px-3 py-2 text-left hover:bg-[#f9ecd7]"
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  pick(e);
                }}
              >
                <span className="block text-sm font-medium text-[#2c1e16]">
                  {e.name}
                </span>
                {e.lastRecipe ? (
                  <span className="block text-xs text-[var(--dim)]">
                    last ordered {e.lastRecipe}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The buyer-name fields for a sale form, shaped by the sale type:
 * Customer mode shows the first/last name pair; Event mode collapses
 * to the single "Event name" field (no last name).
 */
export function SaleNameFields({
  saleType,
  firstName,
  lastName,
  onFirstChange,
  onLastChange,
  customers,
  events,
}: {
  saleType: SaleType;
  firstName: string;
  lastName: string;
  onFirstChange: (v: string) => void;
  onLastChange: (v: string) => void;
  customers: PastCustomer[];
  events: PastEvent[];
}) {
  if (saleType === "event") {
    return (
      <EventNameField value={firstName} onChange={onFirstChange} events={events} />
    );
  }
  return (
    <CustomerNameFields
      firstName={firstName}
      lastName={lastName}
      onFirstChange={onFirstChange}
      onLastChange={onLastChange}
      customers={customers}
    />
  );
}
