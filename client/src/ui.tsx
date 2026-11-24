import {
createContext,
useCallback,
useContext,
useEffect,
useRef,
useState,
type ReactNode,
} from "react";
import mascotUrl from "./assets/shadow-mascot.jpg";

// ---------- style tokens ----------
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 bg-[#2c1e16] text-white hover:bg-[#3e2a1f] rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none";
export const btnSecondary =
  "inline-flex items-center justify-center gap-2 bg-transparent border border-[var(--border)] text-[#2c1e16] hover:bg-[#f9ecd7] rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none";
export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 bg-transparent text-[var(--dim)] hover:text-[#2c1e16] hover:bg-[#f9ecd7] rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";
export const btnIcon =
  "inline-flex shrink-0 items-center justify-center w-9 h-9 rounded-md bg-transparent text-[var(--dim)] hover:text-[#2c1e16] hover:bg-[#f9ecd7] transition-colors disabled:opacity-50 disabled:pointer-events-none";
// The smaller row-action size (28px box, 16px glyph) used by the Sales
// and Packaging tables/cards — their edit/delete/duplicate actions read
// as oversized at the shared btnIcon size. shrink-0 keeps the buttons
// from being squeezed (and clipped) in a pinned actions column.
export const btnIconSmall =
  "inline-flex shrink-0 items-center justify-center w-7 h-7 rounded-md bg-transparent text-[var(--dim)] hover:text-[#2c1e16] hover:bg-[#f9ecd7] transition-colors disabled:opacity-50 disabled:pointer-events-none [&_svg]:w-4 [&_svg]:h-4";
export const btnDanger =
  "inline-flex items-center justify-center gap-2 bg-[#a63c3c] text-white hover:bg-[#8f3232] rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none";
export const inputCls =
  "w-full bg-white border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)] outline-none transition-all focus:border-[#ae8a3e] focus:ring-2 focus:ring-[#ae8a3e]/20 disabled:opacity-60";
// The sale forms' field sizing (New/Edit/Duplicate sale and Record a
// Sale, which share the customers.tsx name fields and toggle): every
// box is exactly its column's width — never wider — and all boxes
// share one height and padding so the form reads proportional. The
// native date input additionally needs the .sale-date-input rules in
// theme.css: its intrinsic minimum width otherwise pushes it past
// the form's right edge on phones.
export const saleInputCls = `${inputCls} h-11 min-w-0 max-w-full box-border`;
export const cardCls =
  "bg-[var(--surface)] border border-[var(--border)] rounded-lg";
export const labelCls =
  "block text-xs font-bold uppercase tracking-[0.05em] text-[var(--dim)] mb-1.5";
export const microLabel =
  "text-xs font-bold uppercase tracking-[0.2em] text-[var(--dim)]";
export const monoNum = "font-mono tracking-tight text-[#2c1e16]";

// ---------- sortable table headers ----------

export type SortDir = "asc" | "desc";

/**
 * A table header that sorts its column: click to sort, click again to
 * reverse. The active column shows a direction arrow and carries
 * aria-sort so the order is announced, not just visible.
 */
export function SortTh({
  label,
  active,
  dir,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onSort: () => void;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
      className={`px-4 py-3 text-xs font-bold uppercase tracking-wider ${
        active ? "text-[#2c1e16]" : "text-[var(--dim)]"
      } ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      <button
        type="button"
        onClick={onSort}
        aria-label={`Sort by ${label}${
          active
            ? dir === "asc"
              ? " (currently ascending)"
              : " (currently descending)"
            : ""
        }`}
        className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider hover:text-[#2c1e16] ${
          align === "right" ? "flex-row-reverse" : ""
        }`}
      >
        {label}
        <span
          aria-hidden="true"
          className={`text-[10px] leading-none ${active ? "" : "opacity-40"}`}
        >
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <p role="alert" className="text-sm text-[#a63c3c] bg-[#a63c3c]/10 border border-[#a63c3c]/20 rounded-md px-3 py-2">
      {msg}
    </p>
  );
}

// ---------- toast ----------
interface Toast {
  id: number;
  text: string;
  kind: "success" | "error";
}
const ToastCtx = createContext<(text: string, kind?: "success" | "error") => void>(
  () => {},
);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback((text: string, kind: "success" | "error" = "success") => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, text, kind }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed inset-x-0 bottom-20 lg:bottom-6 z-[70] flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto max-w-md w-full sm:w-auto text-sm font-medium rounded-md px-4 py-2.5 text-white shadow-lg ${
              t.kind === "success" ? "bg-[#2c1e16]" : "bg-[#a63c3c]"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// The action row (Cancel / Save) at the foot of a modal form. On
// phones it is a bar pinned to the bottom of the sheet — sticky
// within the modal's scroll area, bled out to the sheet's edges over
// the content padding — so Save is always in reach on a long form.
// On desktop it is the plain right-aligned row it always was.
export const formActionsCls =
  "flex gap-3 justify-end sticky bottom-0 z-10 -mx-4 -mb-4 border-t border-[var(--border)] bg-[var(--surface)] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pt-2 sm:pb-0";

// ---------- modal ----------
export function Modal({
  title,
  onClose,
  children,
  wide,
  sheet = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** Full-screen sheet on phones (the default for forms and content
   *  dialogs). Small confirms pass false and keep the compact
   *  bottom-sheet look. Desktop is a centered modal either way. */
  sheet?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-[var(--surface)] w-full overflow-y-auto border-[var(--border)] ${
          sheet
            ? "h-dvh max-h-dvh rounded-none border-0 sm:h-auto sm:max-h-[92dvh] sm:rounded-lg sm:border"
            : "max-h-[92dvh] rounded-t-xl border sm:rounded-lg"
        } ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[var(--surface)] flex items-center justify-between px-4 sm:px-6 py-4 border-b border-[var(--border)] z-10">
          <h2 className="font-heading text-lg font-medium text-[#2c1e16]">{title}</h2>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="w-9 h-9 inline-flex items-center justify-center rounded-md text-[var(--dim)] hover:bg-[#f9ecd7] hover:text-[#2c1e16]"
          >
            <IconX />
          </button>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel} sheet={false}>
      <p className="text-sm text-[var(--dim)] leading-relaxed">{message}</p>
      <div className="mt-6 flex gap-3 justify-end">
        <button type="button" className={btnSecondary} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={btnDanger}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function EmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className={`${cardCls} px-6 py-10 text-center`}>
      <img
        src={mascotUrl}
        alt=""
        className="mx-auto mb-4 h-28 w-auto mix-blend-multiply"
      />
      <h3 className="font-heading text-xl font-medium text-[#2c1e16]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--dim)] max-w-md mx-auto leading-relaxed">
        {body}
      </p>
      {children ? (
        <div className="mt-5 flex flex-wrap gap-3 justify-center">{children}</div>
      ) : null}
    </div>
  );
}

export function Loading() {
  return (
    <div className="py-16 text-center text-sm text-[var(--dim)]">Loading…</div>
  );
}

// ---------- icons (inline, stroke style) ----------
function base(path: ReactNode) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}
export const IconDashboard = () =>
  base(
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>,
  );
export const IconBook = () =>
  base(
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>,
  );
export const IconScale = () =>
  base(
    <>
      <path d="M12 3v3" />
      <path d="M5 6h14" />
      <path d="M5 6l-2.5 6a3.5 3.5 0 0 0 5 0L5 6z" />
      <path d="M19 6l-2.5 6a3.5 3.5 0 0 0 5 0L19 6z" />
      <path d="M8 21h8" />
      <path d="M12 6v15" />
    </>,
  );
export const IconMilkBottle = () =>
  base(
    <>
      <rect x="9.5" y="2" width="5" height="2.5" rx="0.6" />
      <path d="M10 4.5v2.2c0 .9-.4 1.5-1.1 2.1C7.7 9.9 7 11 7 12.6V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-7.4c0-1.6-.7-2.7-1.9-3.8C14.4 8.2 14 7.6 14 6.7V4.5" />
      <path d="M7 15.5h10" />
    </>,
  );
export const IconReceipt = () =>
  base(
    <>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </>,
  );
export const IconTag = () =>
  base(
    <>
      <path d="M12.6 2.6 21.4 11.4a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0L2.6 12.6A2 2 0 0 1 2 11.2V4a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6z" />
      <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
    </>,
  );
export const IconDots = () =>
  base(
    <>
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </>,
  );
export const IconBox = () =>
  base(
    <>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.3 7 12 12l8.7-5" />
      <path d="M12 22V12" />
    </>,
  );
export const IconLayers = () =>
  base(
    <>
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </>,
  );
export const IconUpload = () =>
  base(
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </>,
  );
export const IconGear = () =>
  base(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>,
  );
export const IconPlus = () =>
  base(
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>,
  );
export const IconDownload = () =>
  base(
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </>,
  );
export const IconShare = () =>
  base(
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </>,
  );
export const IconTrash = () =>
  base(
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>,
  );
export const IconPencil = () =>
  base(
    <>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </>,
  );
export const IconX = () =>
  base(
    <>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </>,
  );
export const IconChevronRight = () =>
  base(<path d="M9 18l6-6-6-6" />);
export const IconBack = () =>
  base(
    <>
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </>,
  );
export const IconClock = () =>
  base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
  );
export const IconCopy = () =>
  base(
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>,
  );
export const IconCamera = () =>
  base(
    <>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </>,
  );
